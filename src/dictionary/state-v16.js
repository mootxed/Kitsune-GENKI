import { resolveGeneratedDictionaryAlias } from './generated-dictionary-aliases.js';

export const DICTIONARY_STATE_VERSION = 16;

const CARD_SEPARATOR = '::';
const ITEM_ID_FIELDS = new Set([
  'itemId',
  'wordId',
  'focusItemId',
  'targetWordId',
  'knowledgeItemId',
  'dictionaryId',
]);
const ITEM_ID_ARRAY_FIELDS = new Set([
  'itemIds',
  'wordIds',
  'focusItemIds',
  'targetWordIds',
  'knowledgeItemIds',
  'dictionaryIds',
  'hardestItemIds',
]);
const CARD_ID_ARRAY_FIELDS = new Set(['cardIds', 'hardestCardIds', 'activeCardIds']);

function clone(value) {
  if (value == null) return value;
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function migrateDictionaryItemId(value) {
  if (value == null || value === '') return value;
  const raw = String(value);
  const direct = resolveGeneratedDictionaryAlias(raw);
  if (direct !== raw) return direct;
  if (!raw.includes(':') && /^L\d+_V\d+$/i.test(raw)) {
    return resolveGeneratedDictionaryAlias(`genki-1:vocabulary:${raw}`);
  }
  return raw;
}

export function migrateDictionaryCardId(value) {
  const raw = String(value || '');
  const separatorIndex = raw.lastIndexOf(CARD_SEPARATOR);
  const suffix = separatorIndex >= 0 ? raw.slice(separatorIndex) : '';
  const itemId = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  const migratedItemId = migrateDictionaryItemId(itemId);
  return `${migratedItemId}${suffix}`;
}

function migrateReferences(value) {
  if (Array.isArray(value)) return value.map(migrateReferences);
  if (!value || typeof value !== 'object') return value;

  const isCardLike =
    typeof value.id === 'string' &&
    (typeof value.itemId === 'string' ||
      typeof value.skill === 'string' ||
      typeof value.knowledgeType === 'string');
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (ITEM_ID_FIELDS.has(key) && typeof entry === 'string') {
      result[key] = migrateDictionaryItemId(entry);
    } else if (key === 'cardId' && typeof entry === 'string') {
      result[key] = migrateDictionaryCardId(entry);
    } else if (key === 'id' && isCardLike) {
      result[key] = migrateDictionaryCardId(entry);
    } else if (ITEM_ID_ARRAY_FIELDS.has(key) && Array.isArray(entry)) {
      result[key] = entry.map((itemId) =>
        typeof itemId === 'string' ? migrateDictionaryItemId(itemId) : itemId
      );
    } else if (CARD_ID_ARRAY_FIELDS.has(key) && Array.isArray(entry)) {
      result[key] = entry.map((cardId) =>
        typeof cardId === 'string' ? migrateDictionaryCardId(cardId) : cardId
      );
    } else {
      result[key] = migrateReferences(entry);
    }
  }
  return result;
}

function timestamp(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardRank(card, sourceCardId) {
  return [
    timestamp(card?.lastReview ?? card?.last_review),
    Number(card?.reps) || 0,
    Number(card?.stability) || 0,
    String(sourceCardId),
  ];
}

function compareCardCandidates(left, right) {
  const leftRank = cardRank(left.card, left.sourceCardId);
  const rightRank = cardRank(right.card, right.sourceCardId);
  for (let index = 0; index < leftRank.length - 1; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] - rightRank[index];
  }
  return leftRank[3].localeCompare(rightRank[3]);
}

function migrateSrs(source, migrationArchive) {
  const candidates = new Map();
  for (const [storedCardId, sourceCard] of Object.entries(source || {})) {
    const sourceItemId =
      typeof sourceCard?.itemId === 'string'
        ? sourceCard.itemId
        : storedCardId.split(CARD_SEPARATOR)[0];
    const migratedItemId = migrateDictionaryItemId(sourceItemId);
    const migratedCardId = migrateDictionaryCardId(storedCardId);
    const candidate = {
      sourceCardId: storedCardId,
      card: {
        ...clone(sourceCard),
        id: migratedCardId,
        itemId: migratedItemId,
        ...(migratedItemId !== sourceItemId ? { dictionaryId: migratedItemId } : {}),
      },
    };
    if (migratedCardId !== storedCardId) {
      migrationArchive.aliases[storedCardId] = migratedCardId;
    }
    if (!candidates.has(migratedCardId)) candidates.set(migratedCardId, []);
    candidates.get(migratedCardId).push(candidate);
  }

  const result = {};
  for (const [cardId, group] of candidates) {
    const sorted = [...group].sort(compareCardCandidates);
    const winner = sorted.at(-1);
    const sourceCardIds = sorted.map((candidate) => candidate.sourceCardId);
    result[cardId] = {
      ...winner.card,
      ...(sourceCardIds.length > 1 ? { mergedFromCardIds: sourceCardIds } : {}),
    };
    if (sourceCardIds.length > 1) {
      migrationArchive.mergedCards[cardId] = {
        winnerCardId: winner.sourceCardId,
        sourceCardIds,
        discardedCards: sorted
          .filter((candidate) => candidate !== winner)
          .map((candidate) => clone(candidate.card)),
      };
    }
  }
  return result;
}

function mergeMasteryValues(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return [...new Set([...left, ...right])];
  }
  if (
    left &&
    right &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const result = { ...clone(left) };
    for (const [key, value] of Object.entries(right)) {
      result[key] = Object.hasOwn(result, key)
        ? mergeMasteryValues(result[key], value)
        : clone(value);
    }
    return result;
  }
  if (typeof left === 'number' && typeof right === 'number') return Math.max(left, right);
  return right ?? left;
}

function migrateMasteryArchive(source, migrationArchive) {
  const result = {};
  for (const [sourceItemId, mastery] of Object.entries(source || {})) {
    const migratedItemId = migrateDictionaryItemId(sourceItemId);
    if (migratedItemId !== sourceItemId) {
      migrationArchive.aliases[sourceItemId] = migratedItemId;
    }
    if (Object.hasOwn(result, migratedItemId)) {
      migrationArchive.mergedMastery[migratedItemId] ||= [];
      migrationArchive.mergedMastery[migratedItemId].push({
        sourceItemId,
        value: clone(mastery),
      });
      result[migratedItemId] = mergeMasteryValues(result[migratedItemId], mastery);
    } else {
      result[migratedItemId] = clone(mastery);
    }
  }
  return result;
}

export function migrateDictionaryStateV16(oldState) {
  if (oldState?.version >= DICTIONARY_STATE_VERSION) return clone(oldState);

  const previousArchive = oldState?.dictionaryMigrationArchive;
  const migrationArchive = {
    schemaVersion: 1,
    sourceStateVersion: Number(oldState?.version) || 15,
    aliases: { ...(previousArchive?.aliases || {}) },
    mergedCards: { ...(previousArchive?.mergedCards || {}) },
    mergedMastery: { ...(previousArchive?.mergedMastery || {}) },
  };
  const migrated = {};
  for (const [key, value] of Object.entries(oldState || {})) {
    if (['version', 'srs', 'masteryArchive', 'dictionaryMigrationArchive'].includes(key)) {
      continue;
    }
    migrated[key] = migrateReferences(value);
  }

  return {
    ...migrated,
    srs: migrateSrs(oldState?.srs, migrationArchive),
    masteryArchive: migrateMasteryArchive(oldState?.masteryArchive, migrationArchive),
    dictionaryMigrationArchive: migrationArchive,
    version: DICTIONARY_STATE_VERSION,
  };
}

export function migrateDictionaryReviewLogEntriesV16(entries) {
  return migrateReferences(Array.isArray(entries) ? entries : []);
}
