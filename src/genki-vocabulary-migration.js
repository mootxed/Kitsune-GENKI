import {
  GENKI_RETIRED_VOCABULARY_IDS,
  GENKI_VOCABULARY_ID_ALIASES,
} from './genki-vocabulary-id-map.js';

const CARD_SEPARATOR = '::';
const retiredIds = new Set(GENKI_RETIRED_VOCABULARY_IDS);

export function canonicalGenkiVocabularyId(itemId) {
  let current = String(itemId || '');
  const visited = new Set();
  while (GENKI_VOCABULARY_ID_ALIASES[current] && !visited.has(current)) {
    visited.add(current);
    current = GENKI_VOCABULARY_ID_ALIASES[current];
  }
  return current;
}

function cardIdentity(cardId, card = null) {
  const rawCardId = String(cardId || card?.id || '');
  const separatorIndex = rawCardId.lastIndexOf(CARD_SEPARATOR);
  const suffix = separatorIndex >= 0 ? rawCardId.slice(separatorIndex) : '';
  const itemId = String(
    card?.itemId || (separatorIndex >= 0 ? rawCardId.slice(0, separatorIndex) : rawCardId)
  );
  const canonicalItemId = canonicalGenkiVocabularyId(itemId);
  return {
    itemId,
    canonicalItemId,
    cardId: rawCardId,
    canonicalCardId: `${canonicalItemId}${suffix}`,
  };
}

function evidenceScore(card) {
  const lastReview = Number(card?.lastReview) || 0;
  const reps = Number(card?.reps) || 0;
  const stability = Number(card?.stability) || 0;
  return [lastReview, reps, stability];
}

function chooseEvidenceCard(left, right) {
  const leftScore = evidenceScore(left);
  const rightScore = evidenceScore(right);
  for (let index = 0; index < leftScore.length; index++) {
    if (leftScore[index] !== rightScore[index]) {
      return leftScore[index] > rightScore[index] ? left : right;
    }
  }
  return left;
}

function mergeMastery(left, right) {
  if (!left) return right;
  if (!right) return left;
  const result = {
    ...left,
    ...right,
    evidenceCount: (Number(left.evidenceCount) || 0) + (Number(right.evidenceCount) || 0),
    recentLapseAt:
      Math.max(Number(left.recentLapseAt) || 0, Number(right.recentLapseAt) || 0) || null,
    successfulSkills: {},
    successfulDays: {},
    successfulCount: {},
    recentOutcomes: {},
  };
  const skillKeys = new Set(
    ['successfulSkills', 'successfulDays', 'successfulCount', 'recentOutcomes'].flatMap((field) => [
      ...Object.keys(left[field] || {}),
      ...Object.keys(right[field] || {}),
    ])
  );
  for (const skill of skillKeys) {
    result.successfulSkills[skill] =
      left.successfulSkills?.[skill] === true || right.successfulSkills?.[skill] === true;
    result.successfulDays[skill] = [
      ...new Set([
        ...(left.successfulDays?.[skill] || []),
        ...(right.successfulDays?.[skill] || []),
      ]),
    ].sort();
    result.successfulCount[skill] =
      (Number(left.successfulCount?.[skill]) || 0) + (Number(right.successfulCount?.[skill]) || 0);
    result.recentOutcomes[skill] = [
      ...(left.recentOutcomes?.[skill] || []),
      ...(right.recentOutcomes?.[skill] || []),
    ].sort((a, b) => (Number(a.reviewedAt) || 0) - (Number(b.reviewedAt) || 0));
  }
  return result;
}

function mapCardReference(cardId) {
  const identity = cardIdentity(cardId);
  return identity.canonicalCardId;
}

function migrateReferenceObject(value) {
  if (Array.isArray(value)) return value.map(migrateReferenceObject);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (['itemId', 'wordId', 'focusItemId', 'targetWordId'].includes(key)) {
      result[key] = typeof entry === 'string' ? canonicalGenkiVocabularyId(entry) : entry;
    } else if (key === 'cardId') {
      result[key] = typeof entry === 'string' ? mapCardReference(entry) : entry;
    } else if (['itemIds', 'wordIds'].includes(key) && Array.isArray(entry)) {
      result[key] = [
        ...new Set(
          entry.map((id) => canonicalGenkiVocabularyId(id)).filter((id) => !retiredIds.has(id))
        ),
      ];
    } else {
      result[key] = migrateReferenceObject(entry);
    }
  }
  return result;
}

export function migrateGenkiVocabularyState(oldState) {
  const archive = {
    schemaVersion: 1,
    mergedCards: { ...(oldState.vocabularyMigrationArchive?.mergedCards || {}) },
    retiredCards: { ...(oldState.vocabularyMigrationArchive?.retiredCards || {}) },
    retiredMastery: { ...(oldState.vocabularyMigrationArchive?.retiredMastery || {}) },
  };
  const srs = {};
  const sourceCardsByCanonicalId = new Map();

  for (const [storedCardId, sourceCard] of Object.entries(oldState.srs || {})) {
    const identity = cardIdentity(storedCardId, sourceCard);
    if (retiredIds.has(identity.itemId)) {
      archive.retiredCards[storedCardId] = sourceCard;
      continue;
    }
    const migratedCard = {
      ...sourceCard,
      id: identity.canonicalCardId,
      itemId: identity.canonicalItemId,
    };
    if (!srs[identity.canonicalCardId]) {
      srs[identity.canonicalCardId] = migratedCard;
      sourceCardsByCanonicalId.set(identity.canonicalCardId, [{ storedCardId, sourceCard }]);
      continue;
    }

    const existing = srs[identity.canonicalCardId];
    const sources = [
      ...(sourceCardsByCanonicalId.get(identity.canonicalCardId) || []),
      { storedCardId, sourceCard },
    ];
    const archivedSources = { ...(archive.mergedCards[identity.canonicalCardId] || {}) };
    for (const source of sources) archivedSources[source.storedCardId] = source.sourceCard;
    archive.mergedCards[identity.canonicalCardId] = archivedSources;
    sourceCardsByCanonicalId.set(identity.canonicalCardId, sources);
    const preferred = chooseEvidenceCard(existing, migratedCard);
    srs[identity.canonicalCardId] = {
      ...preferred,
      id: identity.canonicalCardId,
      itemId: identity.canonicalItemId,
      mergedFromCardIds: [
        ...new Set([
          ...(existing.mergedFromCardIds || []),
          ...(migratedCard.mergedFromCardIds || []),
          ...sources.map((source) => source.storedCardId),
        ]),
      ].sort(),
    };
  }

  const masteryArchive = {};
  for (const [itemId, mastery] of Object.entries(oldState.masteryArchive || {})) {
    if (retiredIds.has(itemId)) {
      archive.retiredMastery[itemId] = mastery;
      continue;
    }
    const canonicalId = canonicalGenkiVocabularyId(itemId);
    masteryArchive[canonicalId] = mergeMastery(masteryArchive[canonicalId], mastery);
  }

  const miniGameWordHistory = migrateReferenceObject(oldState.miniGameWordHistory || {});

  return {
    ...oldState,
    srs,
    reviewEvents: migrateReferenceObject(oldState.reviewEvents || []),
    pendingReviewLogs: migrateReferenceObject(oldState.pendingReviewLogs || []),
    masteryArchive,
    vocabularyUnlocks: migrateReferenceObject(oldState.vocabularyUnlocks || {}),
    learningEvents: migrateReferenceObject(oldState.learningEvents || []),
    activeSession: migrateReferenceObject(oldState.activeSession || null),
    miniGameWordHistory,
    // The plan is a projection over vocabulary IDs. Rebuild it from preserved
    // schedules/evidence instead of retaining stale task references.
    dailyPlan: null,
    dailyPlanHistory: migrateReferenceObject(oldState.dailyPlanHistory || []),
    vocabularyMigrationArchive: archive,
  };
}
