/**
 * src/kanji-loader.js
 *
 * Локальный charDataLoader для HanziWriter.
 * Данные символов загружаются из bundled файла public/data/kanji-data.json,
 * собранного скриптом scripts/build-kanji-data.js.
 *
 * Возвращает Promise, совместимый с HanziWriter charDataLoader API:
 *   - resolve(data)  — символ найден
 *   - reject(error)  — символ отсутствует (HanziWriter вызовет onLoadCharDataError)
 *
 * Ошибка одного символа не прерывает работу карточки:
 * onLoadCharDataError в flashcards.js переключает на multiple-choice.
 */

function getKanjiDataUrl() {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? import.meta.env.BASE_URL
      : './';
  const relPath = base.endsWith('/')
    ? `${base}data/kanji-data.json`
    : `${base}/data/kanji-data.json`;

  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.href &&
    window.location.href !== 'about:blank'
  ) {
    try {
      return new URL(relPath, window.location.href).href;
    } catch {
      // fallback
    }
  }
  return relPath;
}

/** @type {Record<string, object> | null} */
let _cache = null;
/** @type {Promise<Record<string, object>> | null} */
let _loadPromise = null;

/**
 * Загружает (и кэширует) всю карту данных кандзи.
 * @returns {Promise<Record<string, object>>}
 */
function loadKanjiMap() {
  if (_cache) return Promise.resolve(_cache);
  if (_loadPromise) return _loadPromise;

  const url = getKanjiDataUrl();
  _loadPromise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch kanji-data.json: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      _cache = data;
      return data;
    })
    .catch(async (err) => {
      // Поддержка запуска в окружении Node.js/Vitest без HTTP-сервера
      if (
        typeof window === 'undefined' &&
        typeof process !== 'undefined' &&
        process.versions?.node
      ) {
        try {
          const dynamicImport = new Function('mod', 'return import(mod)');
          const fs = await dynamicImport('node:fs');
          const path = await dynamicImport('node:path');
          const raw = fs.readFileSync(
            path.join(process.cwd(), 'public', 'data', 'kanji-data.json'),
            'utf8'
          );
          _cache = JSON.parse(raw);
          return _cache;
        } catch {
          // Игнорируем ошибку чтения файла
        }
      }
      _loadPromise = null;
      throw err;
    });

  return _loadPromise;
}

/**
 * charDataLoader для HanziWriter.create(target, char, { charDataLoader }).
 *
 * @param {string} char — символ кандзи (один Unicode-кодпоинт)
 * @returns {Promise<object>} — данные для HanziWriter (strokes + medians)
 */
export function localCharDataLoader(char) {
  return loadKanjiMap().then((map) => {
    const data = map[char];
    if (!data) {
      return Promise.reject(new Error(`No local stroke data for "${char}"`));
    }
    return data;
  });
}

/**
 * Сбрасывает внутренний кэш (используется в тестах).
 */
export function _resetKanjiCache() {
  _cache = null;
  _loadPromise = null;
}
