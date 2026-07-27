import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API } from '../services.js';

describe('OpenRouter Services API', () => {
  const validSettings = {
    openrouterKey: 'sk-or-v1-1234567890123456789012345678901234567890 ', // trailing space
    model: 'deepseek/deepseek-v4-flash',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('askSensei API key trimming', () => {
    it('sends trimmed key in Authorization header', async () => {
      let capturedHeaders;
      globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Konnichiwa!' } }],
          }),
        };
      });

      const reply = await API.askSensei([{ role: 'user', content: 'Привет' }], validSettings);

      expect(reply).toBe('Konnichiwa!');
      expect(capturedHeaders.Authorization).toBe(
        'Bearer sk-or-v1-1234567890123456789012345678901234567890'
      );
      expect(capturedHeaders.Authorization).not.toMatch(/\s$/);
    });

    it('throws error if key is missing or invalid', async () => {
      await expect(API.askSensei([], {})).rejects.toThrow('Не задан API-ключ OpenRouter');
      await expect(API.askSensei([], { openrouterKey: 'invalid-prefix' })).rejects.toThrow(
        'Неверный формат API-ключа'
      );
      await expect(API.askSensei([], { openrouterKey: 'sk-or-v1-short' })).rejects.toThrow(
        'API-ключ слишком короткий'
      );
    });
  });

  describe('Timeout and AbortController handling', () => {
    it('askSensei times out when request exceeds timeoutMs', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve) => {
          // hanging fetch request
        });
      });

      await expect(
        API.askSensei([{ role: 'user', content: 'Тест' }], validSettings, { timeoutMs: 50 })
      ).rejects.toThrow('Превышено время ожидания ответа от API');
    });

    it('generateAIStory times out when request exceeds timeoutMs', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise(() => {});
      });

      await expect(
        API.generateAIStory('Тест промпт', [], validSettings, { timeoutMs: 50 })
      ).rejects.toThrow('Превышено время ожидания ответа от API');
    });

    it('askSensei respects external AbortSignal', async () => {
      const controller = new AbortController();

      globalThis.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = API.askSensei([{ role: 'user', content: 'Тест' }], validSettings, {
        signal: controller.signal,
      });

      controller.abort();

      await expect(promise).rejects.toThrow();
    });
  });

  describe('Privacy and Provider Routing', () => {
    it('sends PRIVATE_PROVIDER_ROUTING with zdr:true and data_collection:deny on askSensei', async () => {
      let capturedBody;
      globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'Konnichiwa!' } }] }),
        };
      });

      await API.askSensei([{ role: 'user', content: 'Hi' }], validSettings);

      expect(capturedBody.provider).toEqual({
        data_collection: 'deny',
        zdr: true,
      });
    });

    it('sends PRIVATE_PROVIDER_ROUTING on both initial and repair generateAIStory requests', async () => {
      const capturedBodies = [];
      let calls = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
        capturedBodies.push(JSON.parse(options.body));
        calls++;
        if (calls === 1) {
          // Invalid response to trigger repair
          return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'invalid json' } }] }),
          };
        }
        // Valid response on repair
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    story: [
                      {
                        sentence_id: 1,
                        speaker: 'Рассказчик',
                        tokens: [
                          { kanji: '私', writing: 'わたし', translation: 'я', type: 'Pronoun' },
                        ],
                        translation: 'Я.',
                      },
                      {
                        sentence_id: 2,
                        speaker: 'Рассказчик',
                        tokens: [
                          { kanji: '本', writing: 'ほん', translation: 'книга', type: 'Noun' },
                        ],
                        translation: 'Книга.',
                      },
                      {
                        sentence_id: 3,
                        speaker: 'Рассказчик',
                        tokens: [
                          { kanji: '読む', writing: 'よむ', translation: 'читать', type: 'Verb' },
                        ],
                        translation: 'Читаю.',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        };
      });

      const res = await API.generateAIStory('Story prompt', [], validSettings);
      expect(res.meta.repaired).toBe(true);
      expect(capturedBodies.length).toBe(2);
      expect(capturedBodies[0].provider).toEqual({ data_collection: 'deny', zdr: true });
      expect(capturedBodies[1].provider).toEqual({ data_collection: 'deny', zdr: true });
    });
  });
});
