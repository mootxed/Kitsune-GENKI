/* ui/plan.js — Экран плана обучения */

import { StudyPlan } from '../studyplan.js';
import { $ } from '../src/utils.js';
import { LESSONS, CONTENT_INDEX } from './home.js';
import { nav } from './router.js';

/**
 * Инициализация и рендеринг экрана плана обучения
 * @param {Object} state - Глобальное состояние приложения
 * @param {Object} dependencies - Зависимости (save функция и т.д.)
 */
export function renderPlan(state, dependencies) {
  const { save } = dependencies;

  console.log('[Plan] renderPlan called');
  console.log('[Plan] LESSONS:', LESSONS);
  console.log('[Plan] LESSONS length:', LESSONS?.length);

  // Кнопка "Назад"
  const backBtn = $('[data-testid="plan-back-btn"]');
  if (backBtn) {
    backBtn.onclick = () => nav('home');
  }

  // Инициализация начальной даты
  const startDateInput = $('#plan-start-date');
  if (startDateInput && !startDateInput.value) {
    const today = new Date();
    startDateInput.value = today.toISOString().split('T')[0];
  }

  // Генерация списка чекбоксов глав - используем setTimeout для гарантии готовности DOM
  setTimeout(() => {
    console.log('[Plan] Rendering completed chapters list');
    renderCompletedChaptersList(state);
  }, 0);

  // Переключатель режима дедлайна
  const deadlineToggles = document.querySelectorAll('.plan-deadline-toggle .toggle-btn');
  deadlineToggles.forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      deadlineToggles.forEach((b) => b.classList.toggle('active', b === btn));

      const daysInput = $('#plan-days-input');
      const deadlineInput = $('#plan-deadline-input');

      if (mode === 'days') {
        daysInput?.classList.remove('hidden');
        deadlineInput?.classList.add('hidden');
      } else {
        daysInput?.classList.add('hidden');
        deadlineInput?.classList.remove('hidden');
      }
    };
  });

  // Селектор дней недели
  const weekdayBtns = document.querySelectorAll('.weekday-btn');
  weekdayBtns.forEach((btn) => {
    btn.onclick = () => {
      btn.classList.toggle('active');
    };
  });

  // Кнопка "Создать план"
  const generateBtn = $('#plan-generate-btn');
  if (generateBtn) {
    generateBtn.onclick = () => {
      const plan = collectPlanParams(state);
      if (plan) {
        state.studyPlan = plan;
        save();
        renderPlanView(state);
        toast('План обучения создан! 📅', { duration: 3000 });
      }
    };
  }

  // Кнопка "Пересчитать план"
  const recalcBtn = $('#plan-recalc-btn');
  if (recalcBtn) {
    recalcBtn.onclick = () => {
      if (!state.studyPlan) return;

      const completedChapters = getCompletedChapters();
      // ИСПРАВЛЕНИЕ: используем CONTENT_INDEX если LESSONS пуст
      const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
      const recalculated = StudyPlan.recalcPlan(state.studyPlan, chaptersSource, completedChapters);

      if (recalculated.error) {
        showPlanWarning(recalculated.error);
        return;
      }

      state.studyPlan = recalculated;
      save();
      renderPlanView(state);
      toast('План пересчитан! 🔄', { duration: 3000 });
    };
  }

  // Если план уже существует, показываем его
  if (state.studyPlan && !state.studyPlan.error) {
    renderPlanView(state);
  }
}

/**
 * Генерация списка чекбоксов для выбора изученных глав
 * @param {Object} state - Глобальное состояние приложения
 */
function renderCompletedChaptersList(state) {
  const container = $('#completed-chapters-list');

  console.log('[Plan] renderCompletedChaptersList called');
  console.log('[Plan] Container:', container);
  console.log('[Plan] LESSONS:', LESSONS);
  console.log('[Plan] CONTENT_INDEX:', CONTENT_INDEX);
  console.log('[Plan] CONTENT_INDEX length:', CONTENT_INDEX?.length);

  if (!container) {
    console.error('[Plan] Container #completed-chapters-list not found!');
    return;
  }

  // Используем CONTENT_INDEX если LESSONS ещё не загружен
  const chapters = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;

  if (!chapters || chapters.length === 0) {
    console.error('[Plan] Both LESSONS and CONTENT_INDEX are empty!');
    container.innerHTML =
      '<p style="color: var(--text-muted); font-size: 14px;">Загрузка глав...</p>';
    // ИСПРАВЛЕНИЕ: Повторяем попытку через 500ms если данные ещё не загружены
    setTimeout(() => {
      if ((LESSONS.length > 0 || CONTENT_INDEX.length > 0) && container) {
        renderCompletedChaptersList(state);
      }
    }, 500);
    return;
  }

  // Проверяем реальный прогресс из state.chapters
  console.log('[Plan] state.chapters:', state.chapters);
  console.log('[Plan] Using chapters source:', LESSONS.length > 0 ? 'LESSONS' : 'CONTENT_INDEX');

  const html = chapters
    .map((chapter) => {
      // Проверяем, завершена ли глава (все чек-итемы выполнены)
      const chapterData = state.chapters?.[chapter.id];
      let isCompleted = false;

      if (chapterData?.items) {
        // Глава считается завершённой, если все чек-итемы выполнены
        const itemsArray = Object.values(chapterData.items);
        isCompleted = itemsArray.length > 0 && itemsArray.every((done) => done === true);
      }

      return `
      <label class="chapter-checkbox-item">
        <input 
          type="checkbox" 
          class="chapter-checkbox" 
          data-chapter-id="${chapter.id}"
          ${isCompleted ? 'checked' : ''}
        />
        <span class="chapter-checkbox-label">Глава ${chapter.id}: ${chapter.title}</span>
      </label>
    `;
    })
    .join('');

  console.log('[Plan] Generated HTML length:', html.length);
  container.innerHTML = html;
  console.log('[Plan] Checkboxes rendered successfully');
}

/**
 * Получить список ID изученных глав из чекбоксов
 * @returns {number[]} Массив ID изученных глав
 */
function getCompletedChapters() {
  const checkboxes = document.querySelectorAll('.chapter-checkbox:checked');
  return Array.from(checkboxes).map((cb) => parseInt(cb.dataset.chapterId));
}

/**
 * Собрать параметры для генерации плана из формы
 * @param {Object} state - Глобальное состояние приложения
 * @returns {Object|null} Объект плана или null при ошибке
 */
function collectPlanParams(state) {
  const startDateInput = $('#plan-start-date');
  const totalDaysInput = $('#plan-total-days');
  const deadlineDateInput = $('#plan-deadline-date');
  const activeMode = document.querySelector('.plan-deadline-toggle .toggle-btn.active');

  if (!startDateInput?.value) {
    showPlanWarning('Укажите дату начала обучения');
    return null;
  }

  const startDate = startDateInput.value;
  const studyDaysOfWeek = Array.from(document.querySelectorAll('.weekday-btn.active')).map((btn) =>
    parseInt(btn.dataset.day)
  );

  if (studyDaysOfWeek.length === 0) {
    showPlanWarning('Выберите хотя бы один день недели для занятий');
    return null;
  }

  const completedChapters = getCompletedChapters();

  const params = {
    startDate,
    studyDaysOfWeek,
  };

  if (activeMode?.dataset.mode === 'days') {
    params.totalDays = parseInt(totalDaysInput?.value || 90);
  } else {
    if (!deadlineDateInput?.value) {
      showPlanWarning('Укажите дату дедлайна');
      return null;
    }
    params.deadline = deadlineDateInput.value;
  }

  // ИСПРАВЛЕНИЕ: используем CONTENT_INDEX если LESSONS пуст
  const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
  const plan = StudyPlan.generatePlan(params, chaptersSource, completedChapters);

  if (plan.error) {
    showPlanWarning(plan.error);
    return null;
  }

  // Сохраняем completedChapters в план для будущих пересчётов
  plan.completedChapters = completedChapters;

  return plan;
}

/**
 * Показать предупреждение под формой
 * @param {string} message - Текст предупреждения
 */
function showPlanWarning(message) {
  const warning = $('#plan-warning');
  if (!warning) return;

  warning.textContent = message;
  warning.classList.remove('hidden');

  setTimeout(() => {
    warning.classList.add('hidden');
  }, 5000);
}

/**
 * Отобразить сгенерированный план
 * @param {Object} state - Глобальное состояние приложения
 */
function renderPlanView(state) {
  const formContainer = $('#plan-form-container');
  const viewContainer = $('#plan-view-container');
  const generateBtn = $('#plan-generate-btn');
  const recalcBtn = $('#plan-recalc-btn');

  if (!state.studyPlan || state.studyPlan.error) {
    // Если плана нет или есть ошибка, показываем форму
    if (formContainer) formContainer.classList.remove('hidden');
    if (viewContainer) viewContainer.classList.add('hidden');
    if (generateBtn) generateBtn.classList.remove('hidden');
    if (recalcBtn) recalcBtn.classList.add('hidden');
    return;
  }

  // Скрываем форму и кнопку "Создать"
  if (formContainer) formContainer.classList.add('hidden');
  if (generateBtn) generateBtn.classList.add('hidden');

  // Показываем "Пересчитать" и контейнер с планом
  if (recalcBtn) recalcBtn.classList.remove('hidden');
  if (viewContainer) viewContainer.classList.remove('hidden');

  // Рендерим содержимое плана
  renderPlanTimeline(state.studyPlan, viewContainer);
}

/**
 * Отобразить план обучения с виджетом "План на сегодня", таймлайном, календарём и советами
 * @param {Object} plan - Объект плана обучения
 * @param {HTMLElement} container - Контейнер для рендеринга
 */
function renderPlanTimeline(plan, container) {
  if (!plan || !plan.segments || plan.segments.length === 0) {
    container.innerHTML = '<p class="empty">План обучения пуст</p>';
    return;
  }

  // Находим все нужные элементы в DOM
  const todayCard = $('#plan-today-card');
  const timelineContainer = $('#plan-timeline');
  const calendarGrid = $('#plan-calendar-grid');
  const adviceContainer = $('#plan-advice-container');

  // 1. Показываем/скрываем и рендерим План на сегодня
  if (todayCard) {
    const todayWidget = renderTodayPlan(plan);
    if (todayWidget) {
      todayCard.innerHTML = todayWidget;
      todayCard.classList.remove('hidden');
    } else {
      todayCard.classList.add('hidden');
    }
  }

  // 2. Рендерим таймлайн сегментов
  if (timelineContainer) {
    timelineContainer.innerHTML = renderTimelineList(plan);

    // Добавляем интерактивность кликам на карточки таймлайна
    const timelineCards = timelineContainer.querySelectorAll('.segment-card');
    timelineCards.forEach((card) => {
      card.onclick = () => {
        const chapterId = parseInt(card.dataset.chapterId);
        if (!chapterId) return;
        const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
        const chapterData = chaptersSource.find((c) => c.id === chapterId);
        const segment = plan.segments.find((s) => s.chapterId === chapterId);
        if (chapterData && segment) {
          renderAdvice(chapterData, segment.days);
          $('#plan-advice-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
    });
  }

  // 3. Рендерим календарную сетку
  if (calendarGrid) {
    calendarGrid.innerHTML = renderPlanCalendar(plan);

    // Добавляем интерактивность кликам по дням календаря
    const calendarCells = calendarGrid.querySelectorAll('.calendar-cell');
    calendarCells.forEach((cell) => {
      cell.onclick = () => {
        const chapterInfo = cell.dataset.chapterInfo;
        if (!chapterInfo || chapterInfo === 'Повторение') return;
        const chapterId = parseInt(chapterInfo.replace('Глава ', ''));
        if (!chapterId) return;
        const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
        const chapterData = chaptersSource.find((c) => c.id === chapterId);
        const segment = plan.segments.find((s) => s.chapterId === chapterId);
        if (chapterData && segment) {
          renderAdvice(chapterData, segment.days);
          $('#plan-advice-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
    });
  }

  // 4. Переключатели вида
  const toggleButtons = document.querySelectorAll('.plan-view-toggle .toggle-btn');
  toggleButtons.forEach((btn) => {
    btn.onclick = () => {
      const view = btn.dataset.view;
      toggleButtons.forEach((b) => b.classList.toggle('active', b === btn));

      if (view === 'timeline') {
        timelineContainer?.classList.remove('hidden');
        calendarGrid?.classList.add('hidden');
      } else {
        timelineContainer?.classList.add('hidden');
        calendarGrid?.classList.remove('hidden');
      }
    };
  });

  // Установим начальное состояние отображения по умолчанию
  const activeToggle = document.querySelector('.plan-view-toggle .toggle-btn.active');
  if (activeToggle) {
    const view = activeToggle.dataset.view;
    if (view === 'timeline') {
      timelineContainer?.classList.remove('hidden');
      calendarGrid?.classList.add('hidden');
    } else {
      timelineContainer?.classList.add('hidden');
      calendarGrid?.classList.remove('hidden');
    }
  }

  // 5. Рендерим советы по умолчанию для первой незавершённой главы
  if (adviceContainer) {
    const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
    const activeSegment = plan.segments.find(
      (s) => s.type === 'chapter' && !plan.completedChapters?.includes(s.chapterId)
    );
    if (activeSegment) {
      const chapterData = chaptersSource.find((c) => c.id === activeSegment.chapterId);
      if (chapterData) {
        renderAdvice(chapterData, activeSegment.days);
      } else {
        adviceContainer.classList.add('hidden');
      }
    } else {
      // Если все главы пройдены, показываем финальный совет
      adviceContainer.classList.remove('hidden');
      const adviceBar = $('#plan-advice-bar');
      const advicePercentages = $('#plan-advice-percentages');
      const adviceTip = $('#plan-advice-tip');
      if (adviceBar) adviceBar.innerHTML = '';
      if (advicePercentages) advicePercentages.innerHTML = '';
      if (adviceTip)
        adviceTip.textContent = 'Все доступные главы пройдены! Вы большой молодец! 🎓✨';
    }
  }
}

/**
 * Рендер списка сегментов таймлайна
 * @param {Object} plan - Объект плана обучения
 * @returns {string} HTML список сегментов
 */
function renderTimelineList(plan) {
  const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return plan.segments
    .map((segment) => {
      const start = new Date(segment.startDate);
      const end = new Date(segment.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      let isDone = false;
      let isInProgress = today >= start && today <= end;
      let isUpcoming = start > today;
      let isOverdue = end < today;

      let segmentTitle = '';
      let segmentLabel = '';
      let badgeText = '';

      if (segment.type === 'chapter') {
        const chapterData = chaptersSource.find((c) => c.id === segment.chapterId);
        segmentTitle = chapterData
          ? `Глава ${chapterData.id}: ${chapterData.title}`
          : `Глава ${segment.chapterId}`;
        segmentLabel = 'Изучение новой темы';
        badgeText = `${segment.days} дн.`;

        if (plan.completedChapters?.includes(segment.chapterId)) {
          isDone = true;
          isOverdue = false;
        }
      } else {
        segmentTitle = 'Повторение';
        segmentLabel = 'Закрепление пройденного материала';
        badgeText = `${segment.days} дн.`;

        if (end < today) {
          isDone = true;
          isOverdue = false;
        }
      }

      let statusText = 'Предстоит';
      let statusClass = 'upcoming';
      let cardClass = '';

      if (isDone) {
        statusText = 'Завершено';
        statusClass = 'done';
        cardClass = 'done';
      } else if (isInProgress) {
        statusText = 'В процессе';
        statusClass = 'in-progress';
        cardClass = 'in-progress';
      } else if (isOverdue) {
        statusText = 'Просрочено';
        statusClass = 'overdue';
        cardClass = 'overdue';
      } else {
        cardClass = 'upcoming';
      }

      if (segment.type === 'review') {
        cardClass += ' review';
      }

      const startStr = formatDate(start);
      const endStr = formatDate(end);

      return `
      <div class="segment-card ${cardClass}" data-chapter-id="${segment.chapterId || ''}">
        <div class="segment-header">
          <h4 class="segment-title">${segmentTitle}</h4>
          <span class="segment-badge">${badgeText}</span>
        </div>
        <p class="segment-dates">📅 ${startStr} — ${endStr}</p>
        <span class="segment-status ${statusClass}">${statusText}</span>
      </div>
    `;
    })
    .join('');
}

/**
 * Рендер блока AI советов по распределению времени
 * @param {Object} chapter - Глава
 * @param {number} days - Количество дней
 */
function renderAdvice(chapter, days) {
  const adviceContainer = $('#plan-advice-container');
  const adviceBar = $('#plan-advice-bar');
  const advicePercentages = $('#plan-advice-percentages');
  const adviceTip = $('#plan-advice-tip');

  if (!adviceContainer || !adviceBar || !advicePercentages || !adviceTip) return;

  const advice = StudyPlan.getHeuristicAdvice(chapter, days);

  // Обновляем заголовок с названием главы
  const headerEl = adviceContainer.querySelector('h3');
  if (headerEl) {
    headerEl.innerHTML = `Рекомендации для Главы ${chapter.id}`;
  }

  // Заполняем цветную полоску
  adviceBar.innerHTML = `
    <div class="advice-segment words" style="flex: ${advice.words}" title="Слова">${advice.words}%</div>
    <div class="advice-segment grammar" style="flex: ${advice.grammar}" title="Грамматика">${advice.grammar}%</div>
    <div class="advice-segment reading" style="flex: ${advice.reading}" title="Чтение">${advice.reading}%</div>
    <div class="advice-segment listening" style="flex: ${advice.listening}" title="Аудирование">${advice.listening}%</div>
  `;

  // Заполняем процентные блоки
  advicePercentages.innerHTML = `
    <div class="advice-item">
      <span class="advice-dot words"></span>
      <span class="advice-label">Слова:</span>
      <span class="advice-percent">${advice.words}%</span>
    </div>
    <div class="advice-item">
      <span class="advice-dot grammar"></span>
      <span class="advice-label">Грамматика:</span>
      <span class="advice-percent">${advice.grammar}%</span>
    </div>
    <div class="advice-item">
      <span class="advice-dot reading"></span>
      <span class="advice-label">Чтение:</span>
      <span class="advice-percent">${advice.reading}%</span>
    </div>
    <div class="advice-item">
      <span class="advice-dot listening"></span>
      <span class="advice-label">Слушание:</span>
      <span class="advice-percent">${advice.listening}%</span>
    </div>
  `;

  // Текст подсказки
  adviceTip.textContent = advice.tip;

  // Показываем контейнер
  adviceContainer.classList.remove('hidden');
}

/**
 * Рендер виджета "План на сегодня"
 * @param {Object} plan - Объект плана обучения
 * @returns {string} HTML виджета
 */
function renderTodayPlan(plan) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Найти сегмент на сегодня
  const todaySegment = plan.segments.find((segment) => {
    const start = new Date(segment.startDate);
    const end = new Date(segment.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return today >= start && today <= end;
  });

  if (!todaySegment) {
    return ''; // Нет задания на сегодня
  }

  const chapterText =
    todaySegment.type === 'chapter' && todaySegment.chapterId
      ? `Глава ${todaySegment.chapterId}`
      : 'Повторение';

  const chapterSubtitle =
    todaySegment.type === 'chapter' && todaySegment.chapterId
      ? 'Изучение нового материала'
      : 'Закрепление пройденного';

  // Умный совет на основе типа задания
  const advice =
    todaySegment.type === 'chapter' && todaySegment.chapterId
      ? 'Сконцентрируйтесь на понимании грамматики и практике новых слов.'
      : 'Повторите карточки и пройдите квиз для закрепления материала.';

  return `
    <div class="plan-today-card">
      <div class="plan-today-header">
        <h3 class="plan-today-title">📅 План на сегодня</h3>
        <span class="plan-today-date">${formatDate(today)}</span>
      </div>
      <div class="plan-today-chapter">
        <h4 class="plan-today-chapter-title">${chapterText}</h4>
        <p class="plan-today-chapter-subtitle">${chapterSubtitle}</p>
      </div>
      <div class="plan-today-advice">
        <h5 class="plan-today-advice-title">💡 Совет</h5>
        <p class="plan-today-advice-tip">${advice}</p>
      </div>
    </div>
  `;
}

/**
 * Рендер календаря с планом обучения
 * @param {Object} plan - Объект плана обучения
 * @returns {string} HTML календаря
 */
function renderPlanCalendar(plan) {
  // Создаём карту дат -> главы
  const dateMap = new Map();
  plan.segments.forEach((segment) => {
    const start = new Date(segment.startDate);
    const end = new Date(segment.endDate);

    let d = new Date(start);
    while (d <= end) {
      const dateKey = d.toISOString().split('T')[0];
      const info = segment.type === 'chapter' ? `Глава ${segment.chapterId}` : 'Повторение';
      dateMap.set(dateKey, info);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  });

  // Определяем диапазон месяцев для отображения
  const startDate = new Date(plan.segments[0].startDate);
  const endDate = new Date(plan.segments[plan.segments.length - 1].endDate);

  let html = '<div class="plan-calendar-container">';

  // Генерируем календари для каждого месяца
  let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= lastMonth) {
    html += renderMonthCalendar(current, dateMap);
    current.setMonth(current.getMonth() + 1);
  }

  html += '</div>';
  return html;
}

/**
 * Рендер календаря одного месяца
 * @param {Date} month - Месяц для отображения
 * @param {Map} dateMap - Карта дат с информацией о главах
 * @returns {string} HTML календаря месяца
 */
function renderMonthCalendar(month, dateMap) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];

  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Понедельник = 0

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `
    <div class="calendar-month">
      <h3 class="calendar-month-header">${monthNames[monthIndex]} ${year}</h3>
      <div class="calendar-weekdays">
        <div class="calendar-weekday">Пн</div>
        <div class="calendar-weekday">Вт</div>
        <div class="calendar-weekday">Ср</div>
        <div class="calendar-weekday">Чт</div>
        <div class="calendar-weekday">Пт</div>
        <div class="calendar-weekday">Сб</div>
        <div class="calendar-weekday">Вс</div>
      </div>
      <div class="calendar-grid">
  `;

  // Пустые ячейки до первого дня месяца
  for (let i = 0; i < startDayOfWeek; i++) {
    html += '<div class="calendar-cell empty"></div>';
  }

  // Дни месяца
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    const dateKey = date.toISOString().split('T')[0];
    const chapters = dateMap.get(dateKey);

    let classes = 'calendar-cell';
    let content = day;
    let dataAttrs = '';

    if (chapters) {
      dataAttrs = `data-chapter-info="${chapters}"`;
      if (chapters === 'Повторение') {
        classes += ' review';
      } else {
        classes += ' chapter';
      }

      if (date.getTime() === today.getTime()) {
        classes += ' today';
      }

      if (date < today) {
        classes += ' done';
      }

      // Добавляем бейдж с информацией
      const badge = chapters === 'Повторение' ? '🔄' : `📖`;
      content = `${day}<span class="calendar-cell-badge">${badge}</span>`;
    } else {
      classes += ' empty';
    }

    html += `<div class="${classes}" ${dataAttrs}>${content}</div>`;
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Форматирование даты для отображения
 * @param {Date} date - Объект даты
 * @returns {string} Форматированная дата
 */
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

/**
 * Функция toast для уведомлений (должна быть определена глобально)
 */
function toast(message, options = {}) {
  const toastEl = $('#toast');
  if (!toastEl) {
    console.warn('Toast element not found');
    return;
  }

  toastEl.textContent = message;
  toastEl.classList.add('show');

  const duration = options.duration || 3000;
  if (duration > 0) {
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, duration);
  }
}
