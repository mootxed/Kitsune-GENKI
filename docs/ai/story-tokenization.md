# Hybrid Story Word Tokenization & Resolution

This document details the hybrid word tokenization architecture in **KotoKitsu**, connecting interactive stories with the global dictionary (`DictionaryStore`) and user AI cache.

## Overview

The hybrid tokenization pipeline processes all interactive stories (curated and AI-generated) through a strict resolution sequence:

```text
AI story / Curated story
        ↓
normalizeLegacyStoryToken / TokenOccurrence
        ↓
StoryTokenResolver:
  1. Explicit prompt reference (dictionaryRef W1..WN → dictionaryId)
  2. Direct dictionaryId validation & alias resolution
  3. Curated builtin lookup (DictionaryStore token index)
  4. User AI cache lookup (user-dict:ai-cache in IndexedDB)
  5. Context ambiguity resolution (local heuristic ranking → optional AI context call)
  6. Batch AI fallback for missing unknown lexemes (enrichUnknownLexemes)
        ↓
Save new AI entries to IndexedDB & register in runtime DictionaryStore
        ↓
Assign dictionaryId & resolution metadata to story tokens
        ↓
renderInteractiveStory (renders canonical TokenOccurrences)
        ↓
openWordBottomSheet (queries live DictionaryEntry from DictionaryStore)
```

## Contracts & Schemas

### `TokenOccurrence` (Canonical Token Contract)

Each token in a sentence is stored as a `TokenOccurrence`:

```json
{
  "schemaVersion": 1,
  "id": "story-42:sentence-3:token-5",
  "surface": "食べました",
  "reading": "たべました",
  "dictionaryId": "jp-word:食べる:たべる",
  "form": {
    "tense": "past",
    "politeness": "polite",
    "polarity": "affirmative",
    "conjugation": "masu-past"
  },
  "contextMeaning": "поел",
  "resolution": {
    "status": "resolved",
    "source": "builtin",
    "confidence": 1
  }
}
```

#### Statuses:
- `resolved`: Successfully matched to a `DictionaryEntry`.
- `ambiguous`: Multiple candidate dictionary entries matched without a confident resolution.
- `missing`: Unknown word without dictionary candidate.
- `non-lexical`: Punctuation, symbols, or formatting tokens without dictionary entries.

#### Sources:
- `builtin`: Curated dictionary entry.
- `user-ai`: User AI cache entry (`user-dict:ai-cache`).
- `ai-context`: Ambiguity resolved via AI context call.
- `explicit-reference`: Reference passed via prompt (`W1`).
- `legacy`: Legacy format converted via adapter.
- `none`: Unresolved or non-lexical token.

---

## Resolution Order

1. **Explicit Reference (`W1`)**:
   If prompt specifies `dictionaryRef: "W1"`, map `W1` to the prompt target `dictionaryId`.
2. **Direct `dictionaryId`**:
   Verify entry exists and surface/reading match.
3. **Builtin Curated Lookup**:
   Search `DictionaryStore` token index for exact builtin matches.
4. **User AI Cache Lookup**:
   Search user entries (`user-dict:ai-cache`) loaded in `DictionaryStore`.
5. **Ambiguity Resolution**:
   Rank candidates by matching surface, reading, dictionary form, POS, and active course boost (+0.5). If unresolved, invoke single AI context disambiguation call (`confidence >= 0.75`).
6. **Batch AI Fallback**:
   Aggregate all `missing` unknown words, deduplicate by (`surface + reading + lemmaHint`), and perform a single batch call to `enrichUnknownLexemes`.

---

## Persistence & Cache Reuse

- **Hidden System Dictionary**: AI fallback entries are saved into `user-dict:ai-cache` (`kind: 'ai-cache'`, `hidden: true`, `sourceType: 'ai'`).
- **Instant Availability**: Saved entries are registered in runtime `DictionaryStore` immediately without page reloads.
- **Offline Fallback**: Offline mode resolves built-in and cached AI entries locally. Missing tokens display gracefully with context translation.
- **Course Switch Preservation**: Global lookup is independent of the active course. Course switches do not clear or filter user AI entries.
