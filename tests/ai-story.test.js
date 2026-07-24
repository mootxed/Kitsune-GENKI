import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderAIStory } from '../ui/ai-story.js';
import { API } from '../services.js';

describe('AI-Story UI Renderer', () => {
  let state;
  let dependencies;
  let container;

  beforeEach(() => {
    document.body.innerHTML = `
      <section class="screen hidden" id="screen-ai-story">
        <header class="app-header">
          <button class="icon-btn back-btn" data-nav="sensei" data-testid="ai-story-back-btn">‹</button>
        </header>
        <div id="ai-story-body"></div>
      </section>
    `;
    container = document.getElementById('ai-story-body');

    state = {
      settings: {
        openrouterKey: 'sk-or-v1-mock-key',
      },
      srs: {},
      savedNotes: [],
    };

    dependencies = {
      nav: vi.fn(),
      toast: vi.fn(),
      speakJapanese: vi.fn(),
      save: vi.fn(),
      todayStr: () => '2026-07-24',
      LESSONS: [],
    };

    vi.restoreAllMocks();
  });

  it('1. Переход на ai-story заполняет #ai-story-body', () => {
    expect(container.innerHTML).toBe('');
    renderAIStory(state, dependencies);
    expect(container.innerHTML).not.toBe('');
  });

  it('2. Без API-ключа показывается переход в настройки, а не пустота', () => {
    state.settings.openrouterKey = '';
    renderAIStory(state, dependencies);

    const noKeyCard = container.querySelector('[data-testid="ai-story-no-key"]');
    expect(noKeyCard).not.toBeNull();
    expect(container.textContent).toContain('Требуется API-ключ OpenRouter');

    const settingsBtn = container.querySelector('#ai-story-go-settings');
    expect(settingsBtn).not.toBeNull();
    settingsBtn.click();
    expect(dependencies.nav).toHaveBeenCalledWith('settings');
  });

  it('3. С ключом отображается форма генерации', () => {
    renderAIStory(state, dependencies);

    expect(container.querySelector('[data-testid="ai-story-form"]')).not.toBeNull();
    expect(container.querySelector('#ai-story-prompt')).not.toBeNull();
    expect(container.querySelector('#ai-story-style')).not.toBeNull();
    expect(container.querySelector('#ai-story-length')).not.toBeNull();
    expect(container.querySelector('#use-weak-words')).not.toBeNull();
    expect(container.querySelector('#generate-story-btn')).not.toBeNull();
  });

  it('4. Loading state блокирует повторную отправку', async () => {
    renderAIStory(state, dependencies);

    const promptInput = container.querySelector('#ai-story-prompt');
    promptInput.value = 'Поход в магазин';

    let resolveApi;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });

    vi.spyOn(API, 'generateAIStory').mockImplementation(() => apiPromise);

    const generateBtn = container.querySelector('#generate-story-btn');
    generateBtn.click();

    expect(generateBtn.disabled).toBe(true);
    expect(generateBtn.textContent).toContain('Генерация');
    expect(container.querySelector('[data-testid="ai-story-loading"]')).not.toBeNull();

    // Cleaning up pending promise
    resolveApi(JSON.stringify({ story: [] }));
  });

  it('5. Валидный JSON корректно рендерится', async () => {
    renderAIStory(state, dependencies);

    const validResponse = JSON.stringify({
      story: [
        {
          sentence_id: 1,
          speaker: '店員',
          tokens: [
            {
              kanji: 'いらっしゃいませ',
              writing: 'いらっしゃいませ',
              translation: 'Добро пожаловать',
            },
          ],
          translation: 'Добро пожаловать!',
        },
        {
          sentence_id: 2,
          speaker: '私',
          tokens: [{ kanji: 'お茶', writing: 'おちゃ', translation: 'чай', type: 'Noun' }],
          translation: 'Чай, пожалуйста.',
        },
        {
          sentence_id: 3,
          speaker: '店員',
          tokens: [{ kanji: 'はい', writing: 'はい', translation: 'да', type: 'Interjection' }],
          translation: 'Вот, пожалуйста.',
        },
      ],
    });

    vi.spyOn(API, 'generateAIStory').mockResolvedValue(validResponse);

    const promptInput = container.querySelector('#ai-story-prompt');
    promptInput.value = 'В магазине';

    const generateBtn = container.querySelector('#generate-story-btn');
    generateBtn.click();

    await new Promise(process.nextTick);

    expect(container.querySelector('[data-testid="ai-story-output"]')).not.toBeNull();
    expect(container.textContent).toContain('店員');
    expect(container.textContent).toContain('いらっしゃいませ');
    expect(container.textContent).toContain('Добро пожаловать!');
  });

  it('6. JSON в markdown fences (```json ... ```) корректно разбирается', async () => {
    renderAIStory(state, dependencies);

    const fencedResponse = `\`\`\`json
    {
      "story": [
        {
          "sentence_id": 1,
          "speaker": "私",
          "tokens": [{"kanji": "こんにちは", "writing": "こんにちは", "translation": "Здравствуйте"}],
          "translation": "Здравствуйте!"
        },
        {
          "sentence_id": 2,
          "speaker": "店員",
          "tokens": [{"kanji": "いらっしゃいませ", "writing": "いらっしゃいませ", "translation": "Добро пожаловать"}],
          "translation": "Добро пожаловать!"
        },
        {
          "sentence_id": 3,
          "speaker": "私",
          "tokens": [{"kanji": "ありがとう", "writing": "ありがとう", "translation": "Спасибо"}],
          "translation": "Спасибо!"
        }
      ]
    }
    \`\`\``;

    vi.spyOn(API, 'generateAIStory').mockResolvedValue(fencedResponse);

    container.querySelector('#ai-story-prompt').value = 'Приветствие';
    container.querySelector('#generate-story-btn').click();

    await new Promise(process.nextTick);

    expect(container.querySelector('[data-testid="ai-story-output"]')).not.toBeNull();
    expect(container.textContent).toContain('こんにちは');
  });

  it('7. Невалидный JSON показывает ошибку', async () => {
    renderAIStory(state, dependencies);

    vi.spyOn(API, 'generateAIStory').mockResolvedValue('{ invalid json content ...');

    container.querySelector('#ai-story-prompt').value = 'Тест ошибки';
    container.querySelector('#generate-story-btn').click();

    await new Promise(process.nextTick);

    expect(container.querySelector('[data-testid="ai-story-error"]')).not.toBeNull();
    expect(container.textContent).toContain('Ошибка генерации');
  });

  it('8. Ошибка API не очищает форму и остаётся на экране с кнопкой повтора', async () => {
    renderAIStory(state, dependencies);

    vi.spyOn(API, 'generateAIStory').mockRejectedValue(new Error('OpenRouter error 500'));

    const promptInput = container.querySelector('#ai-story-prompt');
    promptInput.value = 'Важный промпт';

    container.querySelector('#generate-story-btn').click();

    await new Promise(process.nextTick);

    // Form element is preserved
    expect(container.querySelector('[data-testid="ai-story-form"]')).not.toBeNull();
    expect(promptInput.value).toBe('Важный промпт');
    // Error card rendered
    expect(container.querySelector('[data-testid="ai-story-error"]')).not.toBeNull();
    expect(container.querySelector('#ai-story-retry-btn')).not.toBeNull();
  });

  it('9. Кнопка "Назад" в header имеет data-nav="sensei"', () => {
    const backBtn = document.querySelector('[data-testid="ai-story-back-btn"]');
    expect(backBtn.getAttribute('data-nav')).toBe('sensei');
  });
});
