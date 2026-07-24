/* src/word-search-generator.js — Pure generator module for Word Search game */

export const DIRECTIONS = Object.freeze([
  { name: 'horizontal', dx: 1, dy: 0 },
  { name: 'vertical', dx: 0, dy: 1 },
  { name: 'diagonal-down-right', dx: 1, dy: 1 },
  { name: 'diagonal-down-left', dx: -1, dy: 1 },
]);

const HIRAGANA_CHARACTERS =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'.split(
    ''
  );
const KATAKANA_CHARACTERS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split(
    ''
  );

// Regex for valid Kana reading (Hiragana, Katakana, prolonged sound mark ー, small kana)
const KANA_ONLY_REGEX = /^[\u3040-\u309F\u30A0-\u30FFー]+$/;

/**
 * Checks whether a word is valid for Word Search mini-game.
 */
export function isValidWordForSearch(word) {
  if (!word || typeof word !== 'object') return false;
  const translation = word.translation || word.russian || word.meaning;
  const kana = word.kana || word.writing || word.reading;

  if (!translation || typeof translation !== 'string') return false;
  if (!kana || typeof kana !== 'string') return false;

  const trimmedKana = kana.trim();
  const trimmedTranslation = translation.trim();

  if (!trimmedKana || !trimmedTranslation) return false;

  // Filter out expressions with brackets () or slashes / or undefined
  if (/[()（）/]/u.test(trimmedTranslation) || /[()（）/]/u.test(trimmedKana)) {
    return false;
  }
  if (trimmedTranslation.includes('undefined') || trimmedKana.includes('undefined')) {
    return false;
  }

  // Length limits: 2 to 8 characters
  if (trimmedKana.length < 2 || trimmedKana.length > 8) return false;

  // Must consist purely of Kana and prolonged sound marks (no kanji, no spaces, no punctuation)
  if (!KANA_ONLY_REGEX.test(trimmedKana)) return false;

  return true;
}

/**
 * Normalizes reading format, ensuring clean string with original script (Hiragana or Katakana).
 */
export function normalizeKana(reading) {
  if (typeof reading !== 'string') return '';
  return reading.trim();
}

/**
 * Determines script mix ('hiragana', 'katakana', or 'both') across target words.
 */
export function determineScriptMix(words) {
  let hasHiragana = false;
  let hasKatakana = false;

  for (const w of words) {
    const text = w.kana || w.writing || '';
    for (const char of text) {
      if (/[\u3040-\u309F]/.test(char)) hasHiragana = true;
      if (/[\u30A0-\u30FF]/.test(char)) hasKatakana = true;
    }
  }

  if (hasHiragana && hasKatakana) return 'both';
  if (hasKatakana) return 'katakana';
  return 'hiragana';
}

/**
 * Generates a random filler character matching the batch script composition.
 */
export function getRandomKana(scriptMix = 'hiragana', randomFn = Math.random) {
  if (scriptMix === 'katakana') {
    const idx = Math.floor(randomFn() * KATAKANA_CHARACTERS.length);
    return KATAKANA_CHARACTERS[idx];
  }
  if (scriptMix === 'hiragana') {
    const idx = Math.floor(randomFn() * HIRAGANA_CHARACTERS.length);
    return HIRAGANA_CHARACTERS[idx];
  }
  // 'both': ~50% Katakana, 50% Hiragana to seamlessly blend background
  const useKatakana = randomFn() < 0.5;
  const chars = useKatakana ? KATAKANA_CHARACTERS : HIRAGANA_CHARACTERS;
  const idx = Math.floor(randomFn() * chars.length);
  return chars[idx];
}

/**
 * Deduplicates candidate words by normalized Kana reading.
 */
export function deduplicateCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const word of candidates) {
    const kana = normalizeKana(word.kana || word.writing || word.reading);
    if (kana && !seen.has(kana)) {
      seen.add(kana);
      result.push({
        ...word,
        kana,
        translation: word.translation || word.russian || word.meaning,
      });
    }
  }
  return result;
}

/**
 * Attempts to generate a word search grid.
 */
export function generateWordSearchGrid(candidateWords, options = {}) {
  const {
    baseSize = 9,
    maxSize = 10,
    targetCount = 6,
    minCount = 4,
    randomFn = Math.random,
    maxRetries = 20,
  } = options;

  // 1. Filter valid candidates
  const validCandidates = (candidateWords || []).filter(isValidWordForSearch);

  // 2. Deduplicate candidates by normalized Kana reading
  const uniqueCandidates = deduplicateCandidates(validCandidates);

  if (uniqueCandidates.length < minCount) {
    return {
      success: false,
      error: 'INSUFFICIENT_WORDS',
      words: [],
      grid: [],
      gridSize: baseSize,
    };
  }

  // Pick target words (up to targetCount)
  const pool = [...uniqueCandidates];
  const selectedWords = pool.slice(0, targetCount);

  // Determine script mix for filler characters
  const scriptMix = determineScriptMix(selectedWords);

  // Sort selected words from longest to shortest
  const sortedWords = [...selectedWords].sort((a, b) => b.kana.length - a.kana.length);

  // Try placing words in grid, increasing grid size if needed
  const sizesToTry = [baseSize, maxSize];

  for (const gridSize of sizesToTry) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Create empty grid
      const grid = Array(gridSize)
        .fill(null)
        .map((_, r) =>
          Array(gridSize)
            .fill(null)
            .map((_, c) => ({
              char: null,
              wordIds: [],
              row: r,
              col: c,
            }))
        );

      const placedWords = [];

      for (const word of sortedWords) {
        const kana = word.kana;
        const len = kana.length;

        // Try placing word in random valid positions & directions
        const directionsToTry = [...DIRECTIONS];
        directionsToTry.sort(() => randomFn() - 0.5);

        // Make up to 100 random placement attempts for this word
        for (let tryCount = 0; tryCount < 100; tryCount++) {
          const dir = directionsToTry[Math.floor(randomFn() * directionsToTry.length)];
          const startRow = Math.floor(randomFn() * gridSize);
          const startCol = Math.floor(randomFn() * gridSize);

          const endRow = startRow + dir.dy * (len - 1);
          const endCol = startCol + dir.dx * (len - 1);

          // Boundary check
          if (
            startRow < 0 ||
            startRow >= gridSize ||
            startCol < 0 ||
            startCol >= gridSize ||
            endRow < 0 ||
            endRow >= gridSize ||
            endCol < 0 ||
            endCol >= gridSize
          ) {
            continue;
          }

          // Conflict check
          let canPlace = true;
          for (let i = 0; i < len; i++) {
            const r = startRow + dir.dy * i;
            const c = startCol + dir.dx * i;
            const cellChar = grid[r][c].char;

            if (cellChar !== null && cellChar !== kana[i]) {
              canPlace = false;
              break;
            }
          }

          if (canPlace) {
            const cells = [];
            for (let i = 0; i < len; i++) {
              const r = startRow + dir.dy * i;
              const c = startCol + dir.dx * i;
              grid[r][c].char = kana[i];
              grid[r][c].wordIds.push(word.id);
              cells.push({ row: r, col: c });
            }

            placedWords.push({
              id: word.id,
              word: word.id,
              kana: word.kana,
              kanji: word.kanji || word.kana,
              translation: word.translation,
              originalWord: word,
              startRow,
              startCol,
              endRow,
              endCol,
              dx: dir.dx,
              dy: dir.dy,
              directionName: dir.name,
              cells,
            });

            break;
          }
        }
      }

      // Check if we placed at least minCount words
      if (placedWords.length >= minCount) {
        // Fill empty cells with random Kana matching scriptMix
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            if (grid[r][c].char === null) {
              grid[r][c].char = getRandomKana(scriptMix, randomFn);
            }
          }
        }

        return {
          success: true,
          grid,
          placedWords,
          words: placedWords,
          gridSize,
          scriptMix,
        };
      }
    }
  }

  return {
    success: false,
    error: 'PLACEMENT_FAILED',
    words: [],
    grid: [],
    gridSize: baseSize,
  };
}
