/* ui/screen-templates.js — Dynamic HTML templates for lazy screens */

const TEMPLATES = {
  statistics: `
    <header class="app-header">
      <div class="app-header-left">
        <span class="logo-fox">📊</span>
        <h1 class="app-title">Статистика</h1>
      </div>
      <div class="app-header-right">
        <button class="icon-btn" data-nav="profile" aria-label="Профиль">👤</button>
      </div>
    </header>
    <div class="screen-scroll" id="statistics-body"></div>
  `,

  sensei: `
    <header class="sensei-header">
      <div class="sensei-header-title">
        <span class="sensei-avatar" aria-hidden="true">🦊</span>
        <h1>AI Сенсей</h1>
      </div>
      <div class="sensei-header-actions">
        <button class="icon-btn" data-nav="settings" aria-label="Настройки Сенсея" id="sensei-settings-btn">⚙️</button>
      </div>
    </header>
    <nav class="sensei-tabs" role="tablist" aria-label="Вкладки Сенсея">
      <button class="sensei-tab active" role="tab" aria-selected="true" data-senseitab="chat" data-testid="senseitab-chat">Чат</button>
      <button class="sensei-tab" role="tab" aria-selected="false" data-senseitab="tools" data-testid="senseitab-tools">Инструменты</button>
    </nav>
    <div class="sensei-main-container" id="sensei-body"></div>
  `,

  'ai-story': `
    <header class="app-header">
      <button class="icon-btn back-btn" data-nav="sensei" data-testid="ai-story-back-btn" aria-label="Назад">‹</button>
      <div>
        <h1 class="app-title">AI-история</h1>
        <p class="app-subtitle">Генератор персонализированных историй</p>
      </div>
    </header>
    <div class="screen-scroll" id="ai-story-body"></div>
  `,

  crossword: `
    <header class="app-header">
      <button class="icon-btn back-btn" data-nav="sensei" data-testid="crossword-back-btn" aria-label="Назад">‹</button>
      <div>
        <h1 class="app-title">🧩 Кроссворд</h1>
        <p class="app-subtitle">Закрепление изученных слов</p>
      </div>
    </header>
    <div class="screen-scroll" id="crossword-body"></div>
  `,

  'word-search': `
    <header class="app-header">
      <button class="icon-btn back-btn" data-nav="sensei" data-testid="word-search-back-btn" aria-label="Назад">‹</button>
      <div>
        <h1 class="app-title">🔍 Охота на слова</h1>
        <p class="app-subtitle">Найдите японские слова по русскому переводу</p>
      </div>
    </header>
    <div class="screen-scroll" id="word-search-body"></div>
  `,

  library: `
    <header class="app-header">
      <div class="app-header-left">
        <span class="logo-fox">📚</span>
        <h1 class="app-title">Мини-учебник</h1>
      </div>
      <div class="app-header-right">
        <button class="icon-btn" data-nav="shop" aria-label="Магазин">🛒</button>
        <button class="icon-btn" data-nav="settings" aria-label="Настройки">⚙️</button>
      </div>
    </header>
    <div class="lib-tabs">
      <button class="lib-tab active" data-libtab="grammar" data-testid="libtab-grammar">Грамматика</button>
      <button class="lib-tab" data-libtab="notes" data-testid="libtab-notes">Заметки</button>
      <button class="lib-tab" data-libtab="stories" data-testid="libtab-stories">Истории</button>
    </div>
    <div class="screen-scroll" id="library-body"></div>
  `,

  story: `
    <header class="app-header">
      <button class="icon-btn back-btn" data-nav="library" data-testid="story-back-btn" aria-label="Назад">‹</button>
      <div>
        <h1 class="app-title" id="story-title">История</h1>
        <p class="app-subtitle" id="story-title-jp"></p>
      </div>
    </header>
    <div class="screen-scroll" id="story-body"></div>
  `,

  settings: `
    <header class="app-header">
      <div class="app-header-left">
        <span class="logo-fox">⚙️</span>
        <h1 class="app-title">Настройки</h1>
      </div>
    </header>
    <div class="screen-scroll" id="settings-body"></div>
  `,

  'dev-tools': `
    <header class="app-header">
      <button class="icon-btn back-btn" data-nav="settings" data-testid="dev-tools-back-btn" aria-label="Назад">‹</button>
      <div>
        <h1 class="app-title">🛠️ Инструменты разработчика</h1>
        <p class="app-subtitle">Журнал логов и диагностика</p>
      </div>
    </header>
    <div class="screen-scroll" id="dev-tools-body"></div>
  `,

  'user-dictionaries': `
    <header class="app-header">
      <button class="icon-btn back-btn" data-nav="srs" aria-label="Назад">‹</button>
      <div>
        <h1 class="app-title">Мои словари</h1>
        <p class="app-subtitle">Личные слова отдельно от очереди обучения</p>
      </div>
    </header>
    <div class="screen-scroll">
      <div id="user-dictionaries-body"></div>
      <div class="bottom-pad"></div>
    </div>
  `,

  'word-details': `
    <header class="app-header">
      <button class="icon-btn back-btn" id="word-details-back-btn" data-testid="word-details-back-btn" aria-label="Назад" onclick="history.back()">‹</button>
      <div>
        <h1 class="app-title">Слово</h1>
      </div>
    </header>
    <div class="screen-scroll" id="word-details-body"></div>
  `,

  onboarding: `
    <div class="screen-scroll" id="onboarding-container"></div>
  `,

  profile: `
    <header class="app-header">
      <div class="app-header-left">
        <span class="logo-fox">🦊</span>
        <div><h1 class="app-title">Профиль</h1></div>
      </div>
      <div class="app-header-right">
        <button class="icon-btn" data-nav="shop" aria-label="Магазин">🛒</button>
        <button class="icon-btn" data-nav="settings" aria-label="Настройки">⚙️</button>
      </div>
    </header>
    <div class="screen-scroll" id="profile-body"></div>
  `,

  quests: `
    <header class="app-header">
      <div class="app-header-left">
        <span class="logo-fox">⚡</span>
        <div><h1 class="app-title">Квесты</h1></div>
      </div>
      <button class="icon-btn back-btn" data-nav="home" data-testid="quests-back-btn" aria-label="Назад">‹</button>
    </header>
    <div class="screen-scroll">
      <div id="quests-container"></div>
      <div class="bottom-pad"></div>
    </div>
  `,

  plan: `
    <div class="screen-scroll">
      <div class="screen-header">
        <button class="back-btn" data-testid="plan-back-btn">‹</button>
        <h1>План обучения</h1>
      </div>
      <div id="plan-warning" class="plan-warning hidden"></div>
      <div id="plan-form-container">
        <h3 id="plan-form-title">Создать новый план</h3>
        <div class="form-group">
          <label class="form-label" for="plan-start-date">Дата начала</label>
          <input type="date" id="plan-start-date" class="form-input" data-testid="plan-start-date" />
        </div>
        <div class="form-group">
          <label class="form-label">Способ выбора срока</label>
          <div class="plan-deadline-toggle">
            <button class="toggle-btn active" data-mode="days" data-testid="deadline-mode-days">Количество дней</button>
            <button class="toggle-btn" data-mode="date" data-testid="deadline-mode-date">Дата дедлайна</button>
          </div>
        </div>
        <div id="plan-days-input" class="form-group">
          <label class="form-label" for="plan-total-days">Количество учебных дней</label>
          <input type="number" id="plan-total-days" class="form-input" min="12" value="90" data-testid="plan-total-days" />
        </div>
        <div id="plan-deadline-input" class="form-group hidden">
          <label class="form-label" for="plan-deadline-date">Дата дедлайна</label>
          <input type="date" id="plan-deadline-date" class="form-input" data-testid="plan-deadline-date" />
        </div>
        <div class="form-group">
          <label class="form-label">Дни недели</label>
          <div class="weekday-selector">
            <button class="weekday-btn active" data-day="1" data-testid="weekday-1">Пн</button>
            <button class="weekday-btn active" data-day="2" data-testid="weekday-2">Вт</button>
            <button class="weekday-btn active" data-day="3" data-testid="weekday-3">Ср</button>
            <button class="weekday-btn active" data-day="4" data-testid="weekday-4">Чт</button>
            <button class="weekday-btn active" data-day="5" data-testid="weekday-5">Пт</button>
            <button class="weekday-btn" data-day="6" data-testid="weekday-6">Сб</button>
            <button class="weekday-btn" data-day="0" data-testid="weekday-0">Вс</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" id="label-plan-capacity-minutes" for="plan-capacity-minutes">Сколько времени вы готовы заниматься в учебный день?</label>
          <select id="plan-capacity-minutes" class="form-input" data-testid="plan-capacity-select" aria-labelledby="label-plan-capacity-minutes">
            <option value="15">15 минут</option>
            <option value="30" selected>30 минут</option>
            <option value="45">45 минут</option>
            <option value="60">60 минут</option>
          </select>
        </div>
        <div class="plan-progress-widget card">
          <span class="form-label">Уже изучено</span>
          <div class="plan-progress-bar-container">
            <div id="plan-progress-bar-fill" class="plan-progress-bar-fill" style="width: 0%"></div>
          </div>
          <span id="plan-progress-text" class="plan-progress-text">Загрузка прогресса...</span>
        </div>
        <details class="plan-advanced-details">
          <summary>Дополнительные настройки</summary>
          <div class="plan-advanced-content">
            <label class="chapter-checkbox-item">
              <input type="checkbox" id="plan-workbook-enabled" data-testid="plan-workbook-enabled" checked />
              <span class="chapter-checkbox-label">Включить дополнительную практику</span>
            </label>
            <div id="plan-workbook-sub-options" style="margin-left: 1.5rem; margin-top: 0.5rem">
              <label class="chapter-checkbox-item">
                <input type="checkbox" id="plan-workbook-conversation-grammar" data-testid="plan-workbook-conversation-grammar" checked />
                <span class="chapter-checkbox-label">Грамматические задания</span>
              </label>
              <label class="chapter-checkbox-item">
                <input type="checkbox" id="plan-workbook-reading-writing" data-testid="plan-workbook-reading-writing" checked />
                <span class="chapter-checkbox-label">Чтение и письмо</span>
              </label>
            </div>
            <p style="font-size: 0.875rem; color: #666; margin: 0.5rem 0 1rem">
              Настройки регулируют включение заданий дополнительной практики в главы и план.
            </p>
            <label class="form-label">Уже изученные главы (ручная корректировка)</label>
            <p style="font-size: 0.875rem; color: #666; margin-bottom: 1rem">
              Отметьте главы, которые вы уже изучили. Они не будут включены в план обучения.
            </p>
            <div id="completed-chapters-list" class="completed-chapters-list"></div>
          </div>
        </details>
        <div id="plan-preview-container" class="plan-preview-container card hidden"></div>
        <div class="plan-form-actions">
          <button class="btn btn-primary" id="plan-generate-btn" data-testid="plan-generate-btn">Создать план</button>
          <button class="btn btn-secondary" id="plan-cancel-btn" data-testid="plan-cancel-btn" style="display: none">Отмена</button>
        </div>
      </div>
      <div id="plan-view-container" class="hidden">
        <div id="plan-view-warning" class="plan-warning hidden"></div>
        <div id="plan-controls" class="plan-controls card hidden">
          <button class="btn btn-secondary" id="plan-edit-btn" data-testid="plan-edit-btn">✏️ Изменить</button>
          <button class="btn btn-secondary" id="plan-recalc-btn" data-testid="plan-recalc-btn">🔄 Пересчитать</button>
          <button class="btn btn-secondary" id="plan-pause-btn" data-testid="plan-pause-btn">⏸️ Приостановить</button>
          <button class="btn btn-danger" id="plan-delete-btn" data-testid="plan-delete-btn">🗑️ Удалить</button>
        </div>
        <div id="plan-today-card" class="plan-today-card hidden"></div>
        <div class="plan-view-toggle card">
          <button class="toggle-btn active" data-view="timeline" data-testid="view-timeline">📋 Таймлайн</button>
          <button class="toggle-btn" data-view="grid" data-testid="view-grid">📅 Календарь</button>
        </div>
        <div id="plan-timeline" class="plan-timeline"></div>
        <div id="plan-calendar-grid" class="heatmap-calendar-card hidden">
          <div class="heatmap-nav">
            <button class="heatmap-nav-btn" id="plan-heatmap-prev">←</button>
            <span class="heatmap-month-label" id="plan-heatmap-month-label">Месяц</span>
            <button class="heatmap-nav-btn" id="plan-heatmap-next">→</button>
          </div>
          <div class="heatmap-legend" id="plan-heatmap-legend"></div>
          <div class="heatmap-weekdays">
            <div class="heatmap-weekday">Пн</div>
            <div class="heatmap-weekday">Вт</div>
            <div class="heatmap-weekday">Ср</div>
            <div class="heatmap-weekday">Чт</div>
            <div class="heatmap-weekday">Пт</div>
            <div class="heatmap-weekday">Сб</div>
            <div class="heatmap-weekday">Вс</div>
          </div>
          <div class="heatmap-grid" id="plan-heatmap-grid"></div>
        </div>
        <div id="plan-advice-container" class="card hidden">
          <h3>Распределение времени</h3>
          <p class="advice-subtitle">Рекомендации оптимального баланса</p>
          <div id="plan-advice-bar" class="advice-bar hidden"></div>
          <div id="plan-advice-percentages" class="advice-percentages hidden"></div>
          <p id="plan-advice-tip" class="advice-tip"></p>
        </div>
      </div>
    </div>
  `,
};

/**
 * Creates or retrieves the DOM container for a screen on-demand.
 * @param {string} screenId
 * @returns {HTMLElement}
 */
export function getOrCreateScreenContainer(screenId) {
  const targetId = `screen-${screenId}`;
  let container = document.getElementById(targetId);
  if (container) {
    return container;
  }

  container = document.createElement('section');
  container.className = 'screen hidden';
  if (screenId === 'sensei') {
    container.className = 'screen sensei-screen-layout hidden';
  }
  container.id = targetId;
  container.setAttribute('data-testid', targetId);

  const innerHTML = TEMPLATES[screenId] || '';
  if (innerHTML) {
    container.innerHTML = innerHTML;
  }

  const appElem = document.getElementById('app');
  if (appElem) {
    const tabbar = appElem.querySelector('.tabbar');
    if (tabbar) {
      appElem.insertBefore(container, tabbar);
    } else {
      appElem.appendChild(container);
    }
  }

  return container;
}
