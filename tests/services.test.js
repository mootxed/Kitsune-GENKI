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
});
