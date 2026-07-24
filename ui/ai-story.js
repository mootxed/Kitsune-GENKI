/* ui/ai-story.js — AI Story Generator UI module */
import { $ } from '../src/utils.js';
import { API } from '../services.js';
import { wordById } from '../src/srs-helpers.js';
import { parseAndValidateAIStory } from '../src/ai-story-parser.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

/**
  Extract weak words from SRS records based on lapses and low stability
 */
export function getWeakWords(state, limit = 10, lessons = []) {
  if (!state || !state.srs) return [];
  const cards = Object.values(state.srs);

  // Filter cards with lapses or low stability/learning states
  const weakCards = cards
    .filter((c) => (c.lapses && c.lapses > 0) || c.state === 1 || c.state === 3)
    .sort((a, b) => (b.lapses || 0) - (a.lapses || 0));

  const words = [];
  const seen = new Set();

  for (const c of weakCards) {
    if (words.length >= limit) break;
    const w = wordById(c.id, lessons);
    const text = w?.kanji || w?.kana || w?.word || c.id;
    if (text && !seen.has(text)) {
      seen.add(text);
      words.push(text);
    }
  }

  return words;
}

export function renderAIStory(state, dependencies) {
  const body = $('#ai-story-body');
  if (!body) return;

  const nav = dependencies?.nav || window.nav || (() => {});
  const toast = dependencies?.toast || window.toast || (() => {});

  // Check if OpenRouter key is configured
  const apiKey = state?.settings?.openrouterKey?.trim();
  if (!apiKey) {
    body.innerHTML = `
      <div class="card" style="text-align:center; padding: 24px;" data-testid="ai-story-no-key">
        <div style="font-size: 40px; margin-bottom: 12px;">🔑</div>
        <h3 style="margin: 0 0 8px;">Требуется API-ключ OpenRouter</h3>
        <p class="muted" style="margin-bottom: 16px; font-size: 14px; line-height: 1.5;">
          Для генерации интерактивных ИИ-историй необходимо указать ваш API-ключ OpenRouter в настройках.
        </p>
        <button class="btn-primary" id="ai-story-go-settings" data-testid="ai-story-settings-btn" style="width: 100%; max-width: 280px; margin: 0 auto;">
          ⚙️ Перейти в настройки
        </button>
      </div>
    `;

    const settingsBtn = $('#ai-story-go-settings');
    if (settingsBtn) {
      settingsBtn.onclick = () => nav('settings');
    }
    return;
  }

  // Render initial form
  body.innerHTML = `
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">
      <div class="card" data-testid="ai-story-form">
        <h3 style="margin: 0 0 12px; font-size: 18px;">✨ Генератор историй</h3>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 700; margin-bottom: 6px; font-size: 13px;">Тема или сюжет истории</label>
          <textarea
            id="ai-story-prompt"
            data-testid="ai-story-prompt-input"
            placeholder="Например: Поход в минимаркет (konbini) или разговор в кафе"
            style="width: 100%; min-height: 90px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; font-family: inherit; font-size: 14px; box-sizing: border-box; resize: vertical;"
          ></textarea>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-weight: 700; margin-bottom: 4px; font-size: 12px;">Стиль</label>
            <select id="ai-story-style" data-testid="ai-story-style-select" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--bg-card); color: var(--text);">
              <option value="narrative">Повествование</option>
              <option value="dialog">Диалог</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-weight: 700; margin-bottom: 4px; font-size: 12px;">Длина</label>
            <select id="ai-story-length" data-testid="ai-story-length-select" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--bg-card); color: var(--text);">
              <option value="short">Короткая (~5 предложений)</option>
              <option value="medium" selected>Средняя (~8 предложений)</option>
              <option value="long">Длинная (~12 предложений)</option>
            </select>
          </div>
        </div>

        <label style="display: flex; align-items: center; gap: 8px; margin: 12px 0 16px; cursor: pointer; font-size: 13px;">
          <input type="checkbox" id="use-weak-words" data-testid="use-weak-words-checkbox" style="width: 18px; height: 18px; cursor: pointer;" />
          <span>Использовать слова, в которых я часто ошибаюсь</span>
        </label>

        <button class="btn-primary" id="generate-story-btn" data-testid="generate-story-btn" style="width: 100%;">
          ✨ Сгенерировать историю
        </button>
      </div>

      <div id="ai-story-result" data-testid="ai-story-result"></div>
    </div>
  `;

  const generateBtn = $('#generate-story-btn');
  if (generateBtn) {
    generateBtn.onclick = () => generateAndRenderStory(state, dependencies);
  }

  async function generateAndRenderStory(st, deps) {
    const promptInput = $('#ai-story-prompt');
    const styleSelect = $('#ai-story-style');
    const lengthSelect = $('#ai-story-length');
    const useWeakWordsCheckbox = $('#use-weak-words');
    const resultContainer = $('#ai-story-result');
    const btn = $('#generate-story-btn');

    const promptText = promptInput ? promptInput.value.trim() : '';
    if (!promptText) {
      toast('⚠️ Введите промпт или тему для генерации');
      return;
    }

    const style = styleSelect ? styleSelect.value : 'narrative';
    const length = lengthSelect ? lengthSelect.value : 'medium';
    const lengthMap = { short: '5 предложений', medium: '8 предложений', long: '12 предложений' };

    let fullPrompt = `Тема: ${promptText}. Стиль: ${style === 'dialog' ? 'Диалог персонажей' : 'Повествование'}. Длина: примерно ${lengthMap[length] || '8 предложений'}.`;

    const weakWords = useWeakWordsCheckbox?.checked
      ? getWeakWords(st, 10, deps?.LESSONS || [])
      : [];

    btn.disabled = true;
    btn.textContent = '⏳ Генерация...';

    resultContainer.innerHTML = `
      <div class="card ai-loading-card" style="text-align: center; padding: 24px;" data-testid="ai-story-loading">
        <div style="font-size: 36px; margin-bottom: 8px;">🦊</div>
        <h3 style="margin: 0 0 8px;">AI генерирует историю...</h3>
        <p class="muted" style="font-size: 13px;">Это может занять 10-30 секунд</p>
      </div>
    `;

    try {
      const rawOrObject = await API.generateAIStory(fullPrompt, weakWords, st.settings);

      let storySentences = [];
      if (typeof rawOrObject === 'string') {
        const parsed = parseAndValidateAIStory(rawOrObject);
        if (!parsed.success) {
          const err = new Error(parsed.message);
          err.errorType = parsed.errorType;
          throw err;
        }
        storySentences = parsed.data.story;
      } else if (rawOrObject && Array.isArray(rawOrObject.story)) {
        storySentences = rawOrObject.story;
        if (rawOrObject.meta?.repaired) {
          console.log(
            '[AIStory] Отображаем историю, автоматически исправленную через repair-retry'
          );
        }
      } else if (Array.isArray(rawOrObject)) {
        storySentences = rawOrObject;
      } else {
        throw new Error('Некорректная структура данных в ответе ИИ.');
      }

      // Render valid story directly
      renderStoryContent(storySentences, resultContainer, st, deps);
      toast('✅ История успешно сгенерирована!');
    } catch (err) {
      console.error('[AIStory] Generation error:', err);

      let userMsg = err.message || 'Ошибка генерации истории.';
      if (err.errorType === 'EMPTY') {
        userMsg = 'Пустой ответ от ИИ. Попробуйте изменить запрос.';
      } else if (err.errorType === 'JSON_PARSE') {
        userMsg = 'ИИ вернул повреждённый JSON. Нажмите «Попробовать снова».';
      } else if (err.errorType === 'SCHEMA_VALIDATION') {
        userMsg =
          'Структура ответа ИИ не совпадает со схемой истории. Нажмите «Попробовать снова».';
      }

      resultContainer.innerHTML = `
        <div class="card" style="border-left: 4px solid var(--danger, #ef4444); padding: 16px;" data-testid="ai-story-error">
          <h3 style="margin: 0 0 8px; color: var(--danger, #ef4444);">⚠️ Ошибка генерации</h3>
          <p style="font-size: 14px; margin-bottom: 12px;">${escapeHtml(userMsg)}</p>
          <button class="btn-primary" id="ai-story-retry-btn" data-testid="ai-story-retry-btn" style="padding: 8px 16px; font-size: 13px;">
            🔄 Попробовать снова
          </button>
        </div>
      `;

      const retryBtn = $('#ai-story-retry-btn');
      if (retryBtn) {
        retryBtn.onclick = () => generateAndRenderStory(st, deps);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✨ Сгенерировать историю';
      }
    }
  }

  function renderStoryContent(sentences, container, st, deps) {
    const speakFn = deps?.speakJapanese || window.speakJapanese || (() => {});
    const saveFn = deps?.save || window.save || (() => {});

    let html = `
      <div class="card" data-testid="ai-story-output">
        <h3 style="margin: 0 0 16px;">📖 Сгенерированная история</h3>
        <div class="ai-story-sentences" style="display: flex; flex-direction: column; gap: 16px;">
    `;

    sentences.forEach((s, idx) => {
      const sentenceText = s.tokens.map((t) => t.kanji || t.writing || '').join('');
      const tokensHtml = s.tokens
        .map((t) => {
          const mainText = escapeHtml(t.kanji || t.writing || '');
          const subText =
            t.kanji && t.writing && t.kanji !== t.writing ? escapeHtml(t.writing) : '';
          const trans = escapeHtml(t.translation || '');

          return `<span class="ai-token" style="display: inline-flex; flex-direction: column; align-items: center; margin: 2px 4px; padding: 2px 4px; background: var(--bg-secondary, rgba(0,0,0,0.04)); border-radius: 4px; vertical-align: bottom;" title="${trans}">
            ${subText ? `<span style="font-size: 10px; color: var(--text-muted);">${subText}</span>` : ''}
            <span style="font-size: 16px; font-weight: 700;">${mainText}</span>
          </span>`;
        })
        .join('');

      html += `
        <div class="ai-sentence-block" data-sentence-idx="${idx}" style="padding: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span class="badge" style="background: var(--accent-light, #e0e7ff); color: var(--accent-dark, #3730a3); font-size: 12px; padding: 2px 8px; border-radius: 4px;">
              🗣️ ${escapeHtml(s.speaker)}
            </span>
            <button class="icon-btn speak-sentence-btn" data-text="${escapeHtml(sentenceText)}" aria-label="Озвучить" style="font-size: 14px;">🔊</button>
          </div>

          <div class="tokens-row" style="margin-bottom: 10px; line-height: 1.6;">
            ${tokensHtml}
          </div>

          <div class="translation-block" style="margin-top: 8px; font-size: 13px; color: var(--text-muted); border-top: 1px dashed var(--border); padding-top: 6px;">
            <div class="translation-text hidden" id="trans-${idx}" style="margin-bottom: 6px;">${escapeHtml(s.translation)}</div>
            <button class="btn-toggle-trans" data-target="trans-${idx}" style="background: none; border: none; color: var(--primary, #ff8a2b); cursor: pointer; font-size: 12px; font-weight: 700; padding: 0;">
              👁️ Показать перевод
            </button>
          </div>
        </div>
      `;
    });

    html += `
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;">
          <button class="btn-primary" id="ai-story-new-btn" data-testid="ai-story-new-btn" style="flex: 1; min-width: 140px;">
            🔄 Создать другую
          </button>
          <button class="btn-extra-review" id="ai-story-save-btn" data-testid="ai-story-save-btn" style="flex: 1; min-width: 140px;">
            💾 Сохранить в заметки
          </button>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach translation toggles
    container.querySelectorAll('.btn-toggle-trans').forEach((btn) => {
      btn.onclick = () => {
        const targetId = btn.dataset.target;
        const targetEl = container.querySelector('#' + targetId);
        if (targetEl) {
          const isHidden = targetEl.classList.contains('hidden');
          if (isHidden) {
            targetEl.classList.remove('hidden');
            btn.textContent = '🙈 Скрыть перевод';
          } else {
            targetEl.classList.add('hidden');
            btn.textContent = '👁️ Показать перевод';
          }
        }
      };
    });

    // Attach TTS listeners
    container.querySelectorAll('.speak-sentence-btn').forEach((btn) => {
      btn.onclick = () => {
        const text = btn.dataset.text;
        if (text) {
          speakFn(text);
        }
      };
    });

    // New story button
    const newBtn = container.querySelector('#ai-story-new-btn');
    if (newBtn) {
      newBtn.onclick = () => {
        container.innerHTML = '';
        const promptInput = $('#ai-story-prompt');
        if (promptInput) {
          promptInput.value = '';
          promptInput.focus();
        }
      };
    }

    // Save story to notes
    const saveBtn = container.querySelector('#ai-story-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        if (!st.savedNotes) st.savedNotes = [];
        const fullStoryText = sentences
          .map(
            (s) =>
              `${s.speaker}: ${s.tokens.map((t) => t.kanji || t.writing || '').join('')}\n(${s.translation})`
          )
          .join('\n\n');

        const title =
          sentences[0]?.tokens
            .map((t) => t.kanji || t.writing || '')
            .join('')
            .slice(0, 30) || 'ИИ-История';

        st.savedNotes.unshift({
          id: 'ai_story_' + Date.now(),
          title: `✨ AI-История: ${title}`,
          content: fullStoryText,
          date: deps?.todayStr ? deps.todayStr() : new Date().toISOString().split('T')[0],
        });

        saveFn();
        toast('Сохранено в заметки 📚');
        saveBtn.textContent = '✓ Сохранено';
        saveBtn.disabled = true;
      };
    }
  }
}
