/**
 * src/kanji-loader.js
 *
 * Локальный charDataLoader для HanziWriter.
 * Данные символов загружаются посимвольно из bundled файлов public/data/kanji/<char>.json,
 * собранных скриптом scripts/build-kanji-data.js.
 *
 * Возвращает Promise, совместимый с HanziWriter charDataLoader API:
 *   - resolve(data)  — символ найден
 *   - reject(error)  — символ отсутствует (HanziWriter вызовет onLoadCharDataError)
 *
 * Ошибка одного символа не прерывает работу карточки:
 * onLoadCharDataError в flashcards.js переключает на multiple-choice.
 */

function getKanjiCharUrl(char) {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? import.meta.env.BASE_URL
      : './';
  const encoded = encodeURIComponent(char);
  const relPath = base.endsWith('/')
    ? `${base}data/kanji/${encoded}.json`
    : `${base}/data/kanji/${encoded}.json`;

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

/** @type {Map<string, object>} */
const _charCache = new Map();
/** @type {Map<string, Promise<object>>} */
const _pendingPromises = new Map();

/**
 * charDataLoader для HanziWriter.create(target, char, { charDataLoader }).
 *
 * @param {string} char — символ кандзи (один Unicode-кодпоинт)
 * @returns {Promise<object>} — данные для HanziWriter (strokes + medians)
 */
export function localCharDataLoader(char) {
  if (_charCache.has(char)) {
    return Promise.resolve(_charCache.get(char));
  }
  if (_pendingPromises.has(char)) {
    return _pendingPromises.get(char);
  }

  const url = getKanjiCharUrl(char);
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`No local stroke data for "${char}"`);
      return res.json();
    })
    .then((data) => {
      _charCache.set(char, data);
      _pendingPromises.delete(char);
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
          const filePath = path.join(process.cwd(), 'public', 'data', 'kanji', `${char}.json`);
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          _charCache.set(char, data);
          _pendingPromises.delete(char);
          return data;
        } catch {
          // Игнорируем ошибку чтения файла
        }
      }
      _pendingPromises.delete(char);
      throw new Error(`No local stroke data for "${char}"`);
    });

  _pendingPromises.set(char, promise);
  return promise;
}

/**
 * Сбрасывает внутренний кэш (используется в тестах).
 */
export function _resetKanjiCache() {
  _charCache.clear();
  _pendingPromises.clear();
}
