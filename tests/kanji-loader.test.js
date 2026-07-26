import { readdir, readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetKanjiCache, localCharDataLoader } from '../src/kanji-loader.js';

describe('Local Kanji Loader (kanji-loader.js)', () => {
  beforeEach(() => {
    _resetKanjiCache();
    vi.restoreAllMocks();
  });

  it('загружает штрихи для кандзи "一"', async () => {
    const mockCharData = {
      strokes: ['M 0 0 L 10 10'],
      medians: [
        [
          [0, 0],
          [10, 10],
        ],
      ],
    };

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes(encodeURIComponent('一'))) {
        return Promise.resolve({
          ok: true,
          json: async () => mockCharData,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const charData = await localCharDataLoader('一');
    expect(charData).toEqual(mockCharData);
    expect(Array.isArray(charData.strokes)).toBe(true);
    expect(Array.isArray(charData.medians)).toBe(true);
  });

  it('возвращает reject для отсутствующего символа', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(localCharDataLoader('👽')).rejects.toThrow('No local stroke data for "👽"');
  });

  it('кэширует данные символов и не делает повторных fetch запросов для одного кандзи', async () => {
    const mockCharData = { strokes: ['M 0 0 L 10 10'], medians: [] };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCharData,
    });
    global.fetch = fetchMock;

    await localCharDataLoader('一');
    await localCharDataLoader('一');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await localCharDataLoader('日');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('публичные датасеты public/data/kanji/*.json существуют и содержат кандзи из уроков', async () => {
    const files = await readdir('public/data/kanji');
    expect(files.length).toBeGreaterThanOrEqual(250);

    const char1 = JSON.parse(await readFile('public/data/kanji/一.json', 'utf8'));
    const char2 = JSON.parse(await readFile('public/data/kanji/日.json', 'utf8'));
    const char3 = JSON.parse(await readFile('public/data/kanji/本.json', 'utf8'));

    expect(char1).toHaveProperty('strokes');
    expect(char2).toHaveProperty('strokes');
    expect(char3).toHaveProperty('strokes');
  });
});
