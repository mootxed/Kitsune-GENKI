/* src/minigame-word-rotation.js — Word rotation and selection logic for minigames */

import { normalizeKana } from './word-search-generator.js';

/**
 * Helper to normalize item key for deduplication and matching
 */
export function getWordKey(word) {
  if (!word) return '';
  const itemId = word.id || word.itemId || word.word || '';
  const kana = normalizeKana(word.kana || word.writing || word.reading || '');
  return `${itemId}::${kana}`;
}

/**
 * Gets candidate history list for a game from state or history option.
 */
function getRecentSessions(historyOrState, gameId) {
  if (!historyOrState) return [];
  const source = historyOrState.miniGameWordHistory || historyOrState;
  const gameHist = source[gameId] || source.miniGameWordHistory?.[gameId];
  const sessions = gameHist?.recentSessions || [];
  return Array.isArray(sessions) ? sessions : [];
}

/**
 * Pure function to select minigame words without frequent repetitions.
 *
 * @param {Array} candidates - Candidate words (with id/kana/translation/priorityScore)
 * @param {Object} options
 * @param {string} options.gameId - 'wordSearch' or 'crossword'
 * @param {number} options.count - Target number of words
 * @param {Object} [options.history] - State or history object containing miniGameWordHistory
 * @param {Function} [options.randomFn] - Random number generator (defaults to Math.random)
 * @returns {Array} Selected candidate words
 */
export function selectMiniGameWords(candidates, options = {}) {
  const { gameId = 'wordSearch', count = 6, history = null, randomFn = Math.random } = options;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  // 1. Deduplication by itemId and normalized kana
  const uniqueMap = new Map();
  for (const cand of candidates) {
    if (!cand) continue;
    const key = getWordKey(cand);
    if (key && !uniqueMap.has(key)) {
      uniqueMap.set(key, cand);
    }
  }
  const uniqueCandidates = Array.from(uniqueMap.values());
  if (uniqueCandidates.length <= count) {
    return uniqueCandidates;
  }

  // 2. Extract recent session history (up to 5)
  const recentSessions = getRecentSessions(history, gameId);
  const lastSession = recentSessions.length > 0 ? recentSessions[recentSessions.length - 1] : null;
  const lastSessionWordIds = new Set(lastSession?.wordIds || []);

  // Words in recent 3 sessions
  const recent3Sessions = recentSessions.slice(-3);
  const recent3WordCounts = new Map();
  recent3Sessions.forEach((sess) => {
    (sess.wordIds || []).forEach((wId) => {
      recent3WordCounts.set(wId, (recent3WordCounts.get(wId) || 0) + 1);
    });
  });

  // Calculate session age index for recency boost (0 = most recent, 5 = long ago / never)
  const lastSeenIndex = new Map();
  recentSessions.forEach((sess, sIdx) => {
    (sess.wordIds || []).forEach((wId) => {
      lastSeenIndex.set(wId, sIdx);
    });
  });

  // Calculate score for each candidate
  const scored = uniqueCandidates.map((cand) => {
    const wId = cand.id || cand.itemId || cand.word;
    const basePriority = typeof cand.priorityScore === 'number' ? cand.priorityScore : 10;

    let penalty = 0;
    // Immediate previous session penalty
    if (lastSessionWordIds.has(wId)) {
      penalty += 200;
    }
    // Frequency in last 3 sessions penalty
    const freq3 = recent3WordCounts.get(wId) || 0;
    penalty += freq3 * 80;

    let boost = 0;
    if (!lastSeenIndex.has(wId)) {
      boost += 50; // Never seen in recent history
    } else {
      const sessIdx = lastSeenIndex.get(wId);
      // Older session -> higher boost
      boost += (recentSessions.length - 1 - sessIdx) * 15;
    }

    // Jitter added after base calculations
    const jitter = (randomFn() - 0.5) * 5;

    const finalScore = basePriority + boost - penalty + jitter;

    return {
      candidate: cand,
      score: finalScore,
      inLastSession: lastSessionWordIds.has(wId),
    };
  });

  // Sort descending by finalScore
  scored.sort((a, b) => b.score - a.score);

  // Pick candidates trying to satisfy freshness
  const selected = [];
  const selectedKeys = new Set();

  // First pass: pick fresh words (not in last session) up to count
  for (const item of scored) {
    if (selected.length >= count) break;
    const key = getWordKey(item.candidate);
    if (selectedKeys.has(key)) continue;

    if (!item.inLastSession) {
      selected.push(item.candidate);
      selectedKeys.add(key);
    }
  }

  // Second pass: if we couldn't get enough fresh words, fill remaining slots with prev session words
  if (selected.length < count) {
    for (const item of scored) {
      if (selected.length >= count) break;
      const key = getWordKey(item.candidate);
      if (!selectedKeys.has(key)) {
        selected.push(item.candidate);
        selectedKeys.add(key);
      }
    }
  }

  return selected;
}

/**
 * Idempotently records a completed/placed minigame session history.
 *
 * @param {Object} state - App global state
 * @param {string} gameId - 'wordSearch' or 'crossword'
 * @param {Array<string>} wordIds - Array of placed word IDs
 */
export function recordGameSession(state, gameId, wordIds) {
  if (!state || !gameId || !Array.isArray(wordIds) || wordIds.length === 0) {
    return;
  }

  if (!state.miniGameWordHistory || typeof state.miniGameWordHistory !== 'object') {
    state.miniGameWordHistory = {
      wordSearch: { recentSessions: [] },
      crossword: { recentSessions: [] },
    };
  }

  if (!state.miniGameWordHistory[gameId]) {
    state.miniGameWordHistory[gameId] = { recentSessions: [] };
  }

  const sessions = state.miniGameWordHistory[gameId].recentSessions || [];

  const newEntry = {
    startedAt: Date.now(),
    wordIds: [...wordIds],
  };

  sessions.push(newEntry);
  if (sessions.length > 5) {
    state.miniGameWordHistory[gameId].recentSessions = sessions.slice(-5);
  } else {
    state.miniGameWordHistory[gameId].recentSessions = sessions;
  }
}
