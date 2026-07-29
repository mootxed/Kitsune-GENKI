import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAndValidateAIStory } from '../src/ai-story-parser.js';
import { API } from '../services.js';
import { renderAIStory } from '../ui/ai-story.js';
import { setOpenRouterKey } from '../src/openrouter-key.js';

describe('AI Story Zod Schema & Parser', () => {
  const validStoryData = {
    story: [
      {
        sentence_id: 1,
        speaker: '店員',
        tokens: [
          {
            kanji: 'いらっしゃいませ',
            writing: 'いらっしゃいませ',
            translation: 'Добро пожаловать',
            type: 'Expression',
          },
        ],
        translation: 'Добро пожаловать!',
      },
      {
        sentence_id: 2,
        speaker: '私',
        tokens: [
          { kanji: 'お茶', writing: 'おちゃ', translation: 'чай', type: 'Noun' },
          { kanji: 'を', writing: 'を', translation: '(в.п.)', type: 'Particle' },
          { kanji: 'ください', writing: 'ください', translation: 'пожалуйста', type: 'Verb' },
        ],
        translation: 'Чай, пожалуйста.',
      },
      {
        sentence_id: 3,
        speaker: '店員',
        tokens: [
          { kanji: 'はい', writing: 'はい', translation: 'да', type: 'Interjection' },
          { kanji: 'どうぞ', writing: 'どうぞ', translation: 'пожалуйста', type: 'Expression' },
        ],
        translation: 'Да, вот, пожалуйста.',
      },
    ],
  };

  it('1. valid response passes schema', () => {
    const res = parseAndValidateAIStory(JSON.stringify(validStoryData));
    expect(res.success).toBe(true);
    expect(res.data.story).toHaveLength(3);
  });

  it('2. JSON inside ```json fences is correctly handled', () => {
    const raw = '```json\n' + JSON.stringify(validStoryData) + '\n```';
    const res = parseAndValidateAIStory(raw);
    expect(res.success).toBe(true);
    expect(res.data.story[0].speaker).toBe('店員');
  });

  it('3. JSON inside plain ``` fences is correctly handled', () => {
    const raw = '```\n' + JSON.stringify(validStoryData) + '\n```';
    const res = parseAndValidateAIStory(raw);
    expect(res.success).toBe(true);
  });

  it('4. small text before/after JSON is safely handled', () => {
    const raw =
      'Вот ваша история:\n' + JSON.stringify(validStoryData) + '\nНадеюсь, вам понравилось!';
    const res = parseAndValidateAIStory(raw);
    expect(res.success).toBe(true);
  });

  it('5. empty response rejected', () => {
    const res = parseAndValidateAIStory('');
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('EMPTY');
  });

  it('6. syntactically broken JSON returns JSON_PARSE', () => {
    const res = parseAndValidateAIStory('{"story": [ {broken json...} ]}');
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('JSON_PARSE');
  });

  it('7. missing story array rejected', () => {
    const res = parseAndValidateAIStory(JSON.stringify({ not_story: [] }));
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('SCHEMA_VALIDATION');
  });

  it('8. empty story array rejected (<3 sentences)', () => {
    const res = parseAndValidateAIStory(JSON.stringify({ story: [] }));
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('SCHEMA_VALIDATION');
  });

  it('9. too long story rejected (>15 sentences)', () => {
    const longStory = Array.from({ length: 16 }, (_, i) => ({
      sentence_id: i + 1,
      speaker: 'Speaker',
      tokens: [{ kanji: 'テスト', writing: 'てすと', translation: 'тест', type: 'Noun' }],
      translation: `Предложение ${i + 1}`,
    }));
    const res = parseAndValidateAIStory(JSON.stringify({ story: longStory }));
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('SCHEMA_VALIDATION');
  });

  it('10. string instead of token object rejected', () => {
    const badData = {
      story: [
        { sentence_id: 1, speaker: 'A', tokens: ['invalid_token_string'], translation: 'T' },
        {
          sentence_id: 2,
          speaker: 'B',
          tokens: [{ kanji: 'a', writing: 'a', translation: 'a', type: 'Noun' }],
          translation: 'T',
        },
        {
          sentence_id: 3,
          speaker: 'C',
          tokens: [{ kanji: 'b', writing: 'b', translation: 'b', type: 'Noun' }],
          translation: 'T',
        },
      ],
    };
    const res = parseAndValidateAIStory(JSON.stringify(badData));
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('SCHEMA_VALIDATION');
  });

  it('11. token without kanji and writing rejected', () => {
    const badData = {
      story: [
        {
          sentence_id: 1,
          speaker: 'A',
          tokens: [{ kanji: '', writing: '  ', translation: 'T', type: 'Noun' }],
          translation: 'T',
        },
        {
          sentence_id: 2,
          speaker: 'B',
          tokens: [{ kanji: 'a', writing: 'a', translation: 'a', type: 'Noun' }],
          translation: 'T',
        },
        {
          sentence_id: 3,
          speaker: 'C',
          tokens: [{ kanji: 'b', writing: 'b', translation: 'b', type: 'Noun' }],
          translation: 'T',
        },
      ],
    };
    const res = parseAndValidateAIStory(JSON.stringify(badData));
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('SCHEMA_VALIDATION');
  });

  it('12. missing speaker rejected', () => {
    const badData = {
      story: [
        {
          sentence_id: 1,
          speaker: '',
          tokens: [{ kanji: 'a', writing: 'a', translation: 'a', type: 'Noun' }],
          translation: 'T',
        },
        {
          sentence_id: 2,
          speaker: 'B',
          tokens: [{ kanji: 'b', writing: 'b', translation: 'b', type: 'Noun' }],
          translation: 'T',
        },
        {
          sentence_id: 3,
          speaker: 'C',
          tokens: [{ kanji: 'c', writing: 'c', translation: 'c', type: 'Noun' }],
          translation: 'T',
        },
      ],
    };
    const res = parseAndValidateAIStory(JSON.stringify(badData));
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('SCHEMA_VALIDATION');
  });

  it('13. string sentence_id correctly coerced if valid', () => {
    const data = {
      story: [
        {
          sentence_id: '1',
          speaker: 'A',
          tokens: [{ kanji: 'a', writing: 'a', translation: 'a', type: 'Noun' }],
          translation: 'T1',
        },
        {
          sentence_id: '2',
          speaker: 'B',
          tokens: [{ kanji: 'b', writing: 'b', translation: 'b', type: 'Noun' }],
          translation: 'T2',
        },
        {
          sentence_id: '3',
          speaker: 'C',
          tokens: [{ kanji: 'c', writing: 'c', translation: 'c', type: 'Noun' }],
          translation: 'T3',
        },
      ],
    };
    const res = parseAndValidateAIStory(JSON.stringify(data));
    expect(res.success).toBe(true);
    expect(res.data.story[0].sentence_id).toBe(1);
    expect(res.data.story[1].sentence_id).toBe(2);
  });

  it('14. duplicate or unordered sentence_ids are normalized to 1...N', () => {
    const data = {
      story: [
        {
          sentence_id: 5,
          speaker: 'A',
          tokens: [{ kanji: 'a', writing: 'a', translation: 'a', type: 'Noun' }],
          translation: 'T1',
        },
        {
          sentence_id: 5,
          speaker: 'B',
          tokens: [{ kanji: 'b', writing: 'b', translation: 'b', type: 'Noun' }],
          translation: 'T2',
        },
        {
          sentence_id: 10,
          speaker: 'C',
          tokens: [{ kanji: 'c', writing: 'c', translation: 'c', type: 'Noun' }],
          translation: 'T3',
        },
      ],
    };
    const res = parseAndValidateAIStory(JSON.stringify(data));
    expect(res.success).toBe(true);
    expect(res.data.story[0].sentence_id).toBe(1);
    expect(res.data.story[1].sentence_id).toBe(2);
    expect(res.data.story[2].sentence_id).toBe(3);
  });

  it('accepts optional dictionary fields while keeping old tokens compatible', () => {
    const enriched = JSON.parse(JSON.stringify(validStoryData));
    enriched.story[1].tokens[2] = {
      ...enriched.story[1].tokens[2],
      kanji: '始めました',
      writing: 'はじめました',
      translation: 'начал',
      type: 'Verb',
      dictionaryForm: '始める',
      dictionaryReading: 'はじめる',
      dictionaryMeaning: 'начинать',
    };
    const result = parseAndValidateAIStory(JSON.stringify(enriched));
    expect(result.success).toBe(true);
    expect(result.data.story[1].tokens[2]).toMatchObject({
      dictionaryForm: '始める',
      dictionaryReading: 'はじめる',
      dictionaryMeaning: 'начинать',
    });

    const legacy = parseAndValidateAIStory(JSON.stringify(validStoryData));
    expect(legacy.success).toBe(true);
    expect(legacy.data.story[0].tokens[0].dictionaryForm).toBeNull();
  });
});

describe('AI Story API Repair Retry & UI Integration', () => {
  const validStoryData = {
    story: [
      {
        sentence_id: 1,
        speaker: 'A',
        tokens: [{ kanji: 'あ', writing: 'あ', translation: 'a', type: 'Noun' }],
        translation: 'T1',
      },
      {
        sentence_id: 2,
        speaker: 'B',
        tokens: [{ kanji: 'い', writing: 'い', translation: 'i', type: 'Noun' }],
        translation: 'T2',
      },
      {
        sentence_id: 3,
        speaker: 'C',
        tokens: [{ kanji: 'う', writing: 'う', translation: 'u', type: 'Noun' }],
        translation: 'T3',
      },
    ],
  };

  const settings = {
    openrouterKey: 'sk-or-v1-1234567890123456789012345678901234567890',
    model: 'deepseek/deepseek-v4-flash',
    aiPrivacyAccepted: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('15. first invalid response triggers exactly one repair request', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call returns broken JSON
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'BROKEN_NOT_JSON' } }] }),
        };
      }
      // Second call returns valid JSON
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validStoryData) } }] }),
      };
    });

    const result = await API.generateAIStory('Тест промпт', [], settings);
    expect(callCount).toBe(2);
    expect(result.meta.repaired).toBe(true);
    expect(result.meta.attempts).toBe(2);
    expect(result.story).toHaveLength(3);
  });

  it('16. successful repair returns valid story', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ story: [] }) } }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validStoryData) } }] }),
      };
    });

    const res = await API.generateAIStory('Промпт', [], settings);
    expect(res.meta.repaired).toBe(true);
    expect(res.story[0].speaker).toBe('A');
  });

  it('17. second invalid response does not trigger a third request', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'BROKEN_NOT_JSON' } }] }),
      };
    });

    await expect(API.generateAIStory('Промпт', [], settings)).rejects.toThrow();
    expect(callCount).toBe(2);
  });

  it('18. API HTTP error does not trigger schema repair', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      };
    });

    await expect(API.generateAIStory('Промпт', [], settings)).rejects.toThrow(
      'OpenRouter error 401: Unauthorized'
    );
    expect(callCount).toBe(1);
  });

  it('19 & 20. UI uses API result without manual JSON.parse and displays user-friendly error with retry button', async () => {
    document.body.innerHTML = '<div id="ai-story-body"></div>';
    const state = { settings };

    // Mock API.generateAIStory to fail
    vi.spyOn(API, 'generateAIStory').mockRejectedValueOnce({
      message: 'Нарушение структуры схемы ответа ИИ после попытки исправления.',
      errorType: 'SCHEMA_VALIDATION',
    });

    await setOpenRouterKey('sk-or-v1-mock-key');
    renderAIStory(state, {});

    const promptInput = document.getElementById('ai-story-prompt');
    if (promptInput) promptInput.value = 'Поход в магазин';

    const generateBtn = document.getElementById('generate-story-btn');
    expect(generateBtn).not.toBeNull();
    generateBtn.click();

    // Wait for async execution
    await new Promise((r) => setTimeout(r, 50));

    const errBox = document.querySelector('[data-testid="ai-story-error"]');
    expect(errBox).not.toBeNull();
    expect(errBox.textContent).toContain('Структура ответа ИИ не совпадает со схемой истории');

    const retryBtn = document.getElementById('ai-story-retry-btn');
    expect(retryBtn).not.toBeNull();
  });
});
