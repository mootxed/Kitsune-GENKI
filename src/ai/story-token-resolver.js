/* src/ai/story-token-resolver.js — Story Token Resolver with Local Lookup & AI Fallback */
import {
  normalizeLegacyStoryToken,
  TokenOccurrenceSchema,
} from '../dictionary/token-occurrence.js';
import { canonicalHiragana } from '../dictionary/dictionary-id.js';
import { LexicalEnrichmentItemSchema, AmbiguityResolutionResponseSchema } from './schemas.js';

export const AI_DISAMBIGUATION_MIN_CONFIDENCE = 0.75;

export function isTokenCompatibleWithEntry(occ, entry) {
  if (!occ || !entry) return false;

  const normSurface = (occ.surface || '').normalize('NFKC').trim();
  if (!normSurface) return false;

  const normReading = (occ.reading || '').normalize('NFKC').trim();

  const entryForm = (entry.dictionaryForm || '').normalize('NFKC').trim();
  const entryReading = (entry.reading || '').normalize('NFKC').trim();
  const entryForms = [
    entryForm,
    ...(entry.tokenForms || []).map((f) => f.normalize('NFKC').trim()),
    ...(entry.altForms || []).map((f) => f.normalize('NFKC').trim()),
    (entry.writing || '').normalize('NFKC').trim(),
  ].filter(Boolean);

  const hasKanji = /[\u4e00-\u9faf\u3400-\u4dbf]/u.test(normSurface);

  if (hasKanji) {
    // If surface contains kanji, surface MUST match entry dictionaryForm or tokenForms/altForms
    return entryForms.includes(normSurface);
  } else {
    // Kana-only surface
    if (entryForms.includes(normSurface)) return true;
    const canonicalSurface = canonicalHiragana(normSurface);
    const canonicalEntryReading = canonicalHiragana(entryReading);
    if (canonicalSurface && canonicalSurface === canonicalEntryReading) return true;
    if (normReading && canonicalHiragana(normReading) === canonicalEntryReading) return true;

    return false;
  }
}

export async function resolveStoryTokens(options = {}) {
  const {
    story: rawStory,
    selectedWordRefs = {},
    sentenceContext = {},
    dictionaryStore,
    userDictionaryRepository = null,
    aiLexicalProvider = null,
    activeCourseId = null,
    storyId = `story-${Date.now()}`,
    signal = null,
  } = options;

  if (!dictionaryStore) {
    throw new Error('[StoryTokenResolver] dictionaryStore is required');
  }

  await dictionaryStore.ensureLoaded();

  const isStoryObject = rawStory && typeof rawStory === 'object' && Array.isArray(rawStory.story);
  const isContentObject =
    rawStory && typeof rawStory === 'object' && Array.isArray(rawStory.content);
  const sentences = isStoryObject
    ? rawStory.story
    : isContentObject
      ? rawStory.content
      : Array.isArray(rawStory)
        ? rawStory
        : [];

  const statistics = {
    totalLexicalTokens: 0,
    explicitReferenceHits: 0,
    builtinHits: 0,
    userAiHits: 0,
    aiContextHits: 0,
    ambiguousTokens: 0,
    generatedEntries: 0,
    unresolvedTokens: 0,
    lexicalAiCalls: 0,
  };

  const resolvedSentences = [];
  const missingLexemeMap = new Map(); // tokenKey -> { tokenKey, surface, reading, lemmaHint, sentence, sentenceTranslation, tokenForms, occReferences }

  for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
    const s = sentences[sIdx];
    const sentenceId = s.sentence_id || sIdx + 1;
    const sentenceText = (s.tokens || [])
      .map((t) => t.kanji || t.writing || t.surface || '')
      .join('');
    const sentenceTranslation = s.translation || '';

    const tokens = s.tokens || [];
    const resolvedTokens = [];

    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const rawToken = tokens[tIdx];
      let occ = normalizeLegacyStoryToken(rawToken, {
        storyId,
        sentenceId,
        tokenIndex: tIdx,
        dictionaryStore,
      });

      if (occ.resolution.status === 'non-lexical') {
        resolvedTokens.push(occ);
        continue;
      }

      statistics.totalLexicalTokens++;

      // Step 1: Explicit Reference (dictionaryRef: W1)
      const refKey = rawToken.dictionaryRef || rawToken.sourceToken || rawToken.ref;
      if (refKey && selectedWordRefs[refKey]) {
        const explicitId = selectedWordRefs[refKey];
        const entry = dictionaryStore.getDictionaryEntry(explicitId);
        if (entry && isTokenCompatibleWithEntry(occ, entry)) {
          occ = TokenOccurrenceSchema.parse({
            ...occ,
            dictionaryId: entry.id,
            resolution: {
              status: 'resolved',
              source: 'explicit-reference',
              confidence: 1,
            },
          });
          statistics.explicitReferenceHits++;
          resolvedTokens.push(occ);
          continue;
        }
      }

      // Step 2: Direct dictionaryId check (with validation & compatibility check)
      if (occ.dictionaryId) {
        const resolvedId = dictionaryStore.resolveAlias(occ.dictionaryId);
        const entry = dictionaryStore.getDictionaryEntry(resolvedId);

        if (entry && isTokenCompatibleWithEntry(occ, entry)) {
          const isUser = entry.source === 'ai' || entry.id.startsWith('user-word:');
          occ = TokenOccurrenceSchema.parse({
            ...occ,
            dictionaryId: entry.id,
            resolution: {
              status: 'resolved',
              source: isUser ? 'user-ai' : 'builtin',
              confidence: 1,
            },
          });
          if (isUser) statistics.userAiHits++;
          else statistics.builtinHits++;
          resolvedTokens.push(occ);
          continue;
        } else {
          // Cleared corrupted/unmatched dictionaryId
          occ = TokenOccurrenceSchema.parse({
            ...occ,
            dictionaryId: null,
            resolution: {
              status: 'missing',
              source: 'none',
              confidence: 1,
            },
          });
        }
      }

      // Step 3 & 4: Lookup in DictionaryStore (curated + user AI cache)
      const lookup = dictionaryStore.findDictionaryCandidatesByToken(occ.surface);
      let candidates = lookup.candidates || [];

      if (candidates.length === 0 && occ.reading && occ.reading !== occ.surface) {
        const readingLookup = dictionaryStore.findDictionaryCandidatesByReading(occ.reading);
        candidates = readingLookup.candidates || [];
      }

      if (candidates.length === 1) {
        const entryId = candidates[0];
        const entry = dictionaryStore.getDictionaryEntry(entryId);
        if (entry && isTokenCompatibleWithEntry(occ, entry)) {
          const isUser = entry.source === 'ai' || entry.id.startsWith('user-word:');
          occ = TokenOccurrenceSchema.parse({
            ...occ,
            dictionaryId: entryId,
            resolution: {
              status: 'resolved',
              source: isUser ? 'user-ai' : 'builtin',
              confidence: 1,
            },
          });
          if (isUser) statistics.userAiHits++;
          else statistics.builtinHits++;
          resolvedTokens.push(occ);
          continue;
        }
      }

      // Step 5: Ambiguity resolution
      if (candidates.length > 1) {
        const candidateEntries = candidates
          .map((id) => dictionaryStore.getDictionaryEntry(id))
          .filter((e) => e && isTokenCompatibleWithEntry(occ, e));

        if (candidateEntries.length === 1) {
          const entry = candidateEntries[0];
          const isUser = entry.source === 'ai' || entry.id.startsWith('user-word:');
          occ = TokenOccurrenceSchema.parse({
            ...occ,
            dictionaryId: entry.id,
            resolution: {
              status: 'resolved',
              source: isUser ? 'user-ai' : 'builtin',
              confidence: 1,
            },
          });
          if (isUser) statistics.userAiHits++;
          else statistics.builtinHits++;
          resolvedTokens.push(occ);
          continue;
        }

        if (candidateEntries.length > 1) {
          // Local ranking score
          const scored = candidateEntries.map((entry) => {
            let score = 0;
            if (entry.dictionaryForm === occ.surface) score += 3;
            if (entry.reading === occ.reading) score += 2;
            if ((entry.tokenForms || []).includes(occ.surface)) score += 1;
            if (activeCourseId && dictionaryStore.getIntroducedLesson(entry.id, activeCourseId)) {
              score += 0.5; // active course ranking boost
            }
            return { entry, score };
          });

          scored.sort((a, b) => b.score - a.score);

          const topScore = scored[0].score;
          const runnerUpScore = scored[1] ? scored[1].score : 0;

          if (topScore >= 3 && topScore - runnerUpScore >= 1.5) {
            const entry = scored[0].entry;
            const isUser = entry.source === 'ai' || entry.id.startsWith('user-word:');
            occ = TokenOccurrenceSchema.parse({
              ...occ,
              dictionaryId: entry.id,
              resolution: {
                status: 'resolved',
                source: isUser ? 'user-ai' : 'builtin',
                confidence: 0.9,
              },
            });
            if (isUser) statistics.userAiHits++;
            else statistics.builtinHits++;
            resolvedTokens.push(occ);
            continue;
          }

          // If context AI call is supported on provider
          if (aiLexicalProvider && typeof aiLexicalProvider.resolveAmbiguousToken === 'function') {
            try {
              statistics.lexicalAiCalls++;
              const aiRes = await aiLexicalProvider.resolveAmbiguousToken(
                {
                  surface: occ.surface,
                  sentence: sentenceText,
                  sentenceTranslation,
                  candidateIds: candidateEntries.map((e) => e.id),
                  candidatesSummary: candidateEntries.map((e) => ({
                    id: e.id,
                    meaning: e.meanings.join(', '),
                  })),
                },
                { signal }
              );

              const parsed = AmbiguityResolutionResponseSchema.safeParse(aiRes);
              if (
                parsed.success &&
                candidateEntries.some((e) => e.id === parsed.data.selectedDictionaryId) &&
                parsed.data.confidence >= AI_DISAMBIGUATION_MIN_CONFIDENCE
              ) {
                const selectedEntry = dictionaryStore.getDictionaryEntry(
                  parsed.data.selectedDictionaryId
                );
                if (selectedEntry && isTokenCompatibleWithEntry(occ, selectedEntry)) {
                  occ = TokenOccurrenceSchema.parse({
                    ...occ,
                    dictionaryId: selectedEntry.id,
                    resolution: {
                      status: 'resolved',
                      source: 'ai-context',
                      confidence: parsed.data.confidence,
                    },
                  });
                  statistics.aiContextHits++;
                  resolvedTokens.push(occ);
                  continue;
                }
              }
            } catch (err) {
              console.warn('[StoryTokenResolver] Ambiguity resolution AI call failed:', err);
            }
          }
        }

        // Leave as ambiguous if unresolved
        occ = TokenOccurrenceSchema.parse({
          ...occ,
          dictionaryId: null,
          resolution: {
            status: 'ambiguous',
            source: 'none',
            confidence: 0,
          },
        });
        statistics.ambiguousTokens++;
        resolvedTokens.push(occ);
        continue;
      }

      // Step 6: Missing lexeme -> Add to batch enrichment map (with NFKC & canonical hiragana normalization)
      const lemmaHint = (
        rawToken.dictionaryForm ||
        rawToken.lemmaHint ||
        rawToken.lemma ||
        occ.surface
      )
        .normalize('NFKC')
        .trim();
      const readingHint = canonicalHiragana(
        rawToken.dictionaryReading || occ.reading || occ.surface
      );
      const normKey = `${lemmaHint}:${readingHint}`;

      if (!missingLexemeMap.has(normKey)) {
        missingLexemeMap.set(normKey, {
          tokenKey: `unknown-${missingLexemeMap.size + 1}`,
          surface: occ.surface,
          reading: occ.reading,
          lemmaHint,
          sentence: sentenceText,
          sentenceTranslation,
          tokenForms: [occ.surface],
          occReferences: [],
        });
      } else {
        const existing = missingLexemeMap.get(normKey);
        if (!existing.tokenForms.includes(occ.surface)) {
          existing.tokenForms.push(occ.surface);
        }
      }

      missingLexemeMap.get(normKey).occReferences.push({ sIdx, tIdx: resolvedTokens.length, occ });
      resolvedTokens.push(occ);
    }

    resolvedSentences.push({
      ...s,
      tokens: resolvedTokens,
    });
  }

  // Step 6 (batch fallback): Enrich unknown lexemes via AI call
  if (
    missingLexemeMap.size > 0 &&
    aiLexicalProvider &&
    typeof aiLexicalProvider.enrichUnknownLexemes === 'function'
  ) {
    const unknownBatch = Array.from(missingLexemeMap.values()).map((item) => ({
      tokenKey: item.tokenKey,
      surface: item.surface,
      reading: item.reading,
      sentence: item.sentence,
      sentenceTranslation: item.sentenceTranslation,
    }));

    try {
      statistics.lexicalAiCalls++;
      const rawAiResponse = await aiLexicalProvider.enrichUnknownLexemes(unknownBatch, { signal });
      const rawEntries = Array.isArray(rawAiResponse?.entries) ? rawAiResponse.entries : [];

      for (const rawEntry of rawEntries) {
        try {
          const parsedItem = LexicalEnrichmentItemSchema.safeParse(rawEntry);
          if (!parsedItem.success) continue;
          const item = parsedItem.data;

          const matchingLexeme = Array.from(missingLexemeMap.values()).find(
            (m) => m.tokenKey === item.tokenKey
          );

          if (!matchingLexeme) continue;

          // Separate candidates by builtin vs user-ai
          const curatedCheck = dictionaryStore.findDictionaryCandidatesByToken(item.dictionaryForm);
          const allCandidates = curatedCheck.candidates || [];
          const builtinCandidates = [];
          const userAiCandidates = [];

          for (const cid of allCandidates) {
            const centry = dictionaryStore.getDictionaryEntry(cid);
            if (centry) {
              if (centry.source === 'ai' || centry.id.startsWith('user-word:')) {
                userAiCandidates.push(cid);
              } else {
                builtinCandidates.push(cid);
              }
            }
          }

          const normReading = canonicalHiragana(item.reading);
          const filterMatching = (cids) =>
            cids.filter((cid) => {
              const e = dictionaryStore.getDictionaryEntry(cid);
              return (
                e &&
                e.dictionaryForm === item.dictionaryForm &&
                canonicalHiragana(e.reading) === normReading
              );
            });

          const matchingBuiltins = filterMatching(builtinCandidates);
          const matchingUserAi = filterMatching(userAiCandidates);

          let assignedId = null;
          let source = 'user-ai';

          if (matchingBuiltins.length === 1) {
            assignedId = matchingBuiltins[0];
            source = 'builtin';
          } else if (matchingBuiltins.length === 0 && matchingUserAi.length === 1) {
            assignedId = matchingUserAi[0];
            source = 'user-ai';
          } else if (matchingBuiltins.length > 1 || matchingUserAi.length > 1) {
            const candidateSet = matchingBuiltins.length > 1 ? matchingBuiltins : matchingUserAi;
            if (
              aiLexicalProvider &&
              typeof aiLexicalProvider.resolveAmbiguousToken === 'function'
            ) {
              try {
                const ambRes = await aiLexicalProvider.resolveAmbiguousToken(
                  {
                    surface: matchingLexeme.surface,
                    sentence: matchingLexeme.sentence,
                    sentenceTranslation: matchingLexeme.sentenceTranslation,
                    candidateIds: candidateSet,
                    candidatesSummary: candidateSet.map((id) => {
                      const e = dictionaryStore.getDictionaryEntry(id);
                      return { id, meaning: e ? e.meanings.join(', ') : '' };
                    }),
                  },
                  { signal }
                );
                const parsedAmb = AmbiguityResolutionResponseSchema.safeParse(ambRes);
                if (
                  parsedAmb.success &&
                  candidateSet.includes(parsedAmb.data.selectedDictionaryId) &&
                  parsedAmb.data.confidence >= AI_DISAMBIGUATION_MIN_CONFIDENCE
                ) {
                  assignedId = parsedAmb.data.selectedDictionaryId;
                  source = 'ai-context';
                }
              } catch (ambErr) {
                console.warn('[StoryTokenResolver] Batch ambiguity call failed:', ambErr);
              }
            }
          }

          if (!assignedId) {
            // Register new user dictionary entry
            const allForms = [
              ...new Set([
                matchingLexeme.surface,
                ...(matchingLexeme.tokenForms || []),
                ...(item.tokenForms || []),
              ]),
            ];

            const regResult = await dictionaryStore.registerUserDictionaryEntry({
              dictionaryForm: item.dictionaryForm,
              reading: item.reading,
              meanings: item.meanings,
              partOfSpeech: item.partOfSpeech,
              verbClass: item.verbClass,
              adjectiveClass: item.adjectiveClass,
              tokenForms: allForms,
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
              verified: false,
              targetDictionaryId: 'user-dict:ai-cache',
              provenance: {
                sourceType: 'ai-story-token',
                sourceId: String(storyId),
              },
            });

            assignedId = regResult.entry.id;
            if (regResult.created) statistics.generatedEntries++;
          }

          // Update occurrence tokens
          const conf = typeof item.confidence === 'number' ? item.confidence : 0.8;
          for (const ref of matchingLexeme.occReferences) {
            const currentToken = resolvedSentences[ref.sIdx].tokens[ref.tIdx];
            const assignedEntry = dictionaryStore.getDictionaryEntry(assignedId);

            if (assignedEntry && isTokenCompatibleWithEntry(currentToken, assignedEntry)) {
              resolvedSentences[ref.sIdx].tokens[ref.tIdx] = TokenOccurrenceSchema.parse({
                ...currentToken,
                dictionaryId: assignedId,
                resolution: {
                  status: 'resolved',
                  source,
                  confidence: conf,
                },
              });
              if (source === 'builtin') statistics.builtinHits++;
              else if (source === 'user-ai') statistics.userAiHits++;
              else if (source === 'ai-context') statistics.aiContextHits++;
            }
          }
        } catch (itemErr) {
          console.warn('[StoryTokenResolver] Item registration warning:', itemErr);
        }
      }
    } catch (err) {
      console.warn('[StoryTokenResolver] Batch AI enrichment failed:', err);
    }
  }

  // Count final unresolved tokens
  for (const sentence of resolvedSentences) {
    for (const token of sentence.tokens) {
      if (token.resolution.status === 'missing' || token.resolution.status === 'ambiguous') {
        statistics.unresolvedTokens++;
      }
    }
  }

  console.info('[StoryTokenResolver]', statistics);

  const updatedStory = isStoryObject
    ? { ...rawStory, story: resolvedSentences }
    : isContentObject
      ? { ...rawStory, content: resolvedSentences }
      : resolvedSentences;

  return {
    story: updatedStory,
    statistics,
  };
}
