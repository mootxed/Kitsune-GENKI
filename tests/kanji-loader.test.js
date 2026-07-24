import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetKanjiCache, localCharDataLoader } from '../src/kanji-loader.js';

describe('Local Kanji Loader (kanji-loader.js)', () => {
  beforeEach(() => {
    _resetKanjiCache();
    vi.restoreAllMocks();
  });

  it('загружает штрихи для кандзи "一"', async () => {
    const rawData = await readFile('public/data/kanji-data.json', 'utf8');
    const mockMap = JSON.parse(rawData);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMap,
    });

    const charData = await localCharDataLoader('一');
    expect(charData).toBeDefined();
    expect(Array.isArray(charData.strokes)).toBe(true);
    expect(Array.isArray(charData.medians)).toBe(true);
    expect(charData.strokes.length).toBeGreaterThan(0);
  });

  it('возвращает reject для отсутствующего символа', async () => {
    const rawData = await readFile('public/data/kanji-data.json', 'utf8');
    const mockMap = JSON.parse(rawData);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMap,
    });

    await expect(localCharDataLoader('👽')).rejects.toThrow('No local stroke data for "👽"');
  });

  it('кэширует карту кандзи и не делает повторных fetch запросов', async () => {
    const rawData = await readFile('public/data/kanji-data.json', 'utf8');
    const mockMap = JSON.parse(rawData);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMap,
    });
    global.fetch = fetchMock;

    await localCharDataLoader('一');
    await localCharDataLoader('日');
    await localCharDataLoader('本');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('публичный датасет kanji-data.json существует и содержит кандзи из уроков', async () => {
    const rawData = await readFile('public/data/kanji-data.json', 'utf8');
    const data = JSON.parse(rawData);

    expect(data).toHaveProperty('一');
    expect(data).toHaveProperty('日');
    expect(data).toHaveProperty('本');
    expect(Object.keys(data).length).toBeGreaterThanOrEqual(250);
  });
});
