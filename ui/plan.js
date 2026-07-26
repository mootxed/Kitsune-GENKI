/* ui/plan.js — экран плана обучения */

import { StudyPlan } from '../studyplan.js';
import { $ } from '../src/utils.js';
import { CONTENT_INDEX, ensureLesson, getLesson, renderHomeTodayCard } from './home.js';
import { nav } from './router.js';
import { getTodayDateKey, parseDateKey } from '../src/local-date.js';
import {
  ensureActiveChapterId,
  getActualCompletedChapterIds,
  getChapterProgress,
  getCompletedChapterIds,
} from '../src/chapter-progress.js';
import { reconcilePriorKnowledgeVocabulary } from '../src/chapter-vocabulary.js';
import {
  ensureTodayVocabularyBatch,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';
import { getOrGenerateDailyPlan } from '../src/daily-plan.js';
import {
  buildStudyPlanContentCatalog,
  previewStudyPlanFromPreferences,
  commitStudyPlanFromPreferences,
} from '../src/study-plan-creation.js';
import { loadWorkbookPracticeData } from '../src/workbook-practice.js';

let planCalendarMonth = new Date();
let planRuntimeDependencies = {};

export function renderPlan(state, dependencies) {
  planRuntimeDependencies = dependencies || planRuntimeDependencies;
  const { save } = dependencies;
  if (state.studyPlan) state.studyPlan = StudyPlan.normalizePlan(state.studyPlan);
  $('[data-testid="plan-back-btn"]')?.addEventListener('click', () => nav('home'), {
    once: true,
  });

  const startDateInput = $('#plan-start-date');
  if (startDateInput && !startDateInput.value) startDateInput.value = getTodayDateKey();
  renderCompletedChaptersList(state);
  bindDeadlineMode();
  bindWeekdays();

  const generateButton = $('#plan-generate-btn');
  if (generateButton) {
    generateButton.onclick = async () => {
      const workbookData = await loadWorkbookPracticeData();
      const preferences = collectPlanPreferences(state);
      if (!preferences) return;

      const catalog = buildStudyPlanContentCatalog(
        CONTENT_INDEX,
        workbookData,
        preferences.workbookSettings
      );

      const preview = previewStudyPlanFromPreferences(preferences, catalog);

      if (!preview.valid) {
        showPlanWarning(preview.errors?.join(', ') || 'Ошибка при генерации плана');
        return;
      }

      const result = commitStudyPlanFromPreferences(state, preferences, preview, {
        source: 'plan-settings',
        preserveHistory: true,
      });

      if (!result.success) {
        showPlanWarning(result.error || 'Не удалось создать план');
        return;
      }

      let reconcileResult = null;
      if (
        Array.isArray(state.priorKnowledgeChapterIds) &&
        state.priorKnowledgeChapterIds.length > 0
      ) {
        reconcileResult = await reconcilePriorKnowledgeVocabulary(state, ensureLesson);
      }

      save();
      renderPlanView(state);

      if (reconcileResult && !reconcileResult.success) {
        showPlanWarning(
          `План создан, но не удалось подгрузить слова из глав: ${reconcileResult.failedChapters.join(
            ', '
          )}. Они будут добавлены при загрузке.`
        );
        toast('План создан с предупреждениями');
      } else if (reconcileResult && reconcileResult.addedCards > 0) {
        toast('План создан. Слова из ранее изученных глав добавлены в SRS');
      } else {
        toast('План обучения создан');
      }
    };
  }

  const editButton = $('#plan-edit-btn');
  if (editButton) {
    editButton.onclick = () => {
      populateForm(state.studyPlan, state);
      $('#plan-form-container')?.classList.toggle('hidden');
    };
  }

  const recalcButton = $('#plan-recalc-btn');
  if (recalcButton) {
    recalcButton.onclick = async () => {
      if (!state.studyPlan) return;
      const workbookData = await loadWorkbookPracticeData();
      const catalog = buildStudyPlanContentCatalog(
        CONTENT_INDEX,
        workbookData,
        state.workbookSettings
      );

      const completed = getCompletedChapterIds(state, catalog.chapters);
      const result = StudyPlan.recalcPlan(state.studyPlan, catalog.chapters, completed, {
        vocabularyUnlocks: state.vocabularyUnlocks || {},
      });
      if (result.deadlineExpired) {
        showDeadlineExpiredDialog(result, state, save, catalog.chapters);
        return;
      }
      if (result.error) {
        showPlanWarning(result.error);
        return;
      }
      state.studyPlan = result;
      ensureActiveChapterId(state, catalog.chapters);

      save();
      renderPlanView(state);
      toast('Будущая часть плана пересчитана');
    };
  }

  const pauseButton = $('#plan-pause-btn');
  if (pauseButton) {
    pauseButton.onclick = () => {
      if (!state.studyPlan) return;
      state.studyPlan.paused = !state.studyPlan.paused;
      ensureActiveChapterId(state, CONTENT_INDEX);

      save();
      renderPlanView(state);
      toast(state.studyPlan.paused ? 'План приостановлен' : 'План возобновлён');
    };
  }

  const deleteButton = $('#plan-delete-btn');
  if (deleteButton) {
    deleteButton.onclick = () => {
      if (!confirm('Удалить текущий план? История обучения и FSRS-карточки сохранятся.')) return;
      state.studyPlan = null;
      ensureActiveChapterId(state, CONTENT_INDEX);
      save();
      renderPlanView(state);
      toast('План удалён; прогресс курса сохранён');
    };
  }

  renderPlanView(state);
}

function bindDeadlineMode() {
  const toggles = document.querySelectorAll('.plan-deadline-toggle .toggle-btn');
  toggles.forEach((button) => {
    button.onclick = () => {
      toggles.forEach((entry) => entry.classList.toggle('active', entry === button));
      const useDays = button.dataset.mode === 'days';
      $('#plan-days-input')?.classList.toggle('hidden', !useDays);
      $('#plan-deadline-input')?.classList.toggle('hidden', useDays);
    };
  });
}

function bindWeekdays() {
  document.querySelectorAll('.weekday-btn').forEach((button) => {
    button.onclick = () => button.classList.toggle('active');
  });
}

function renderCompletedChaptersList(state) {
  const container = $('#completed-chapters-list');
  if (!container) return;
  if (CONTENT_INDEX.length === 0) {
    container.innerHTML = '<p class="muted">Каталог глав загружается…</p>';
    return;
  }
  const actualCompleted = new Set(getActualCompletedChapterIds(state, CONTENT_INDEX));
  const effectiveCompleted = new Set(getCompletedChapterIds(state, CONTENT_INDEX));

  container.innerHTML = CONTENT_INDEX.map((chapter) => {
    const isActual = actualCompleted.has(chapter.id);
    const isEffective = effectiveCompleted.has(chapter.id);
    const checkedAttr = isEffective ? 'checked' : '';
    const disabledAttr = isActual ? 'disabled' : '';
    const tag = isActual ? ' (пройдена в приложении)' : isEffective ? ' (изучена ранее)' : '';

    return `
      <label class="chapter-checkbox-item ${isActual ? 'disabled-item' : ''}">
        <input type="checkbox" class="chapter-checkbox" data-chapter-id="${chapter.id}" ${checkedAttr} ${disabledAttr}>
        <span class="chapter-checkbox-label">Глава ${chapter.id}: ${chapter.title}${tag}</span>
      </label>`;
  }).join('');
  updateManualProgress();
  container.querySelectorAll('.chapter-checkbox:not([disabled])').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      syncPriorKnowledgeFromForm(state);
      updateManualProgress();
    });
  });
}

function syncPriorKnowledgeFromForm(state) {
  const actualCompleted = new Set(getActualCompletedChapterIds(state, CONTENT_INDEX));
  const checked = [...document.querySelectorAll('.chapter-checkbox:checked')]
    .map((checkbox) => Number(checkbox.dataset.chapterId))
    .filter((id) => Number.isInteger(id) && id > 0);

  state.priorKnowledgeChapterIds = checked
    .filter((id) => !actualCompleted.has(id))
    .sort((a, b) => a - b);
}

function updateManualProgress() {
  const all = document.querySelectorAll('.chapter-checkbox');
  const checked = document.querySelectorAll('.chapter-checkbox:checked');
  const percentage = all.length > 0 ? Math.round((checked.length / all.length) * 100) : 0;
  const fill = $('#plan-progress-bar-fill');
  const label = $('#plan-progress-text');
  if (fill) fill.style.width = `${percentage}%`;
  if (label) label.textContent = `Завершено: ${checked.length} из ${all.length} глав`;
}

function selectedCompletedChapters(state) {
  syncPriorKnowledgeFromForm(state);
  return getCompletedChapterIds(state, CONTENT_INDEX);
}

function collectPlanPreferences(state) {
  syncPriorKnowledgeFromForm(state);
  const startDate = $('#plan-start-date')?.value || getTodayDateKey();
  const studyDays = [...document.querySelectorAll('.weekday-btn.active')].map((button) =>
    Number(button.dataset.day)
  );
  const dailyCapacityMinutes = Number($('#plan-capacity-minutes')?.value || 30);
  const includeRW = $('#plan-workbook-reading-writing')?.checked !== false;

  const workbookSettings = {
    enabled: state?.workbookSettings?.enabled !== false,
    includeConversationGrammar: state?.workbookSettings?.includeConversationGrammar !== false,
    includeReadingWriting: includeRW,
  };

  const mode = document.querySelector('.plan-deadline-toggle .toggle-btn.active')?.dataset.mode;
  const targetType = mode === 'days' ? 'days' : 'deadline';
  const targetValue =
    mode === 'days' ? Number($('#plan-total-days')?.value) : $('#plan-deadline-date')?.value;

  return {
    startDate,
    studyDays,
    dailyCapacityMinutes,
    workbookSettings,
    priorKnowledgeChapterIds: state.priorKnowledgeChapterIds || [],
    targetType,
    targetValue,
    acceptRecommendedDeadline: true,
    allowPastDate: true,
  };
}

function populateForm(plan, state) {
  if (state) {
    renderCompletedChaptersList(state);
  }
  if (!plan) return;
  const start = $('#plan-start-date');
  const deadline = $('#plan-deadline-date');
  const days = $('#plan-total-days');
  const capacity = $('#plan-capacity-minutes');

  if (start) start.value = plan.recalculatedFrom || plan.startDate || getTodayDateKey();
  if (deadline) deadline.value = plan.deadline || '';
  if (days) days.value = plan.totalDays || 90;
  if (capacity) capacity.value = plan.capacityMinutes || state?.dailyCapacityMinutes || 30;
  const readingWriting = $('#plan-workbook-reading-writing');
  if (readingWriting) {
    readingWriting.checked = state?.workbookSettings?.includeReadingWriting !== false;
  }

  document.querySelectorAll('.weekday-btn').forEach((button) => {
    button.classList.toggle('active', plan.studyDaysOfWeek?.includes(Number(button.dataset.day)));
  });
}

function renderPlanView(state) {
  const plan = state.studyPlan;
  const form = $('#plan-form-container');
  const view = $('#plan-view-container');
  const controls = $('#plan-controls');
  if (!plan || plan.error) {
    form?.classList.remove('hidden');
    view?.classList.add('hidden');
    controls?.classList.add('hidden');
    return;
  }

  form?.classList.add('hidden');
  view?.classList.remove('hidden');
  controls?.classList.remove('hidden');
  view?.classList.toggle('plan-paused', plan.paused === true);
  const pause = $('#plan-pause-btn');
  if (pause) pause.textContent = plan.paused ? '▶️ Возобновить' : '⏸️ Приостановить';
  renderPlanSummary(plan, state);
}

function renderPlanSummary(plan, state) {
  const activeChapterId = ensureActiveChapterId(state, CONTENT_INDEX);
  const activeChapter = getLesson(activeChapterId);
  if (activeChapterId && !activeChapter) {
    const todayCard = $('#plan-today-card');
    if (todayCard) {
      todayCard.innerHTML =
        '<div class="today-plan-empty"><p>Задачи дня загружаются вместе с главой…</p></div>';
      todayCard.classList.remove('hidden');
    }
    ensureLesson(activeChapterId)
      .then(() => renderPlanView(state))
      .catch((error) => console.warn('[Plan] Не удалось загрузить активную главу:', error));
    return;
  }
  let dailyPlan = getOrGenerateDailyPlan(state, {
    dateKey: getTodayDateKey(),
    activeChapterId,
    chapterMeta: activeChapter?.words ? activeChapter : null,
  });
  const vocabularyTask = dailyPlan?.tasks.find(
    (task) => task.type === 'vocabulary' && task.batchDateKey === getTodayDateKey()
  );
  if (
    vocabularyTask &&
    activeChapter?.words &&
    !state.vocabularyUnlocks?.[activeChapterId]?.[getTodayDateKey()]
  ) {
    const result = ensureTodayVocabularyBatch(state, activeChapterId, {
      plan,
      dateKey: getTodayDateKey(),
      words: activeChapter.words,
      limit: vocabularyTask.count,
    });
    if (result.created) {
      planRuntimeDependencies.save?.();
      dailyPlan = getOrGenerateDailyPlan(state, {
        dateKey: getTodayDateKey(),
        activeChapterId,
        chapterMeta: activeChapter,
        forceRefresh: true,
      });
    }
  }

  const todayCard = $('#plan-today-card');
  if (todayCard) {
    todayCard.innerHTML = renderHomeTodayCard(state, dailyPlan);
    todayCard.classList.remove('hidden');
    todayCard.querySelectorAll('[data-task-id]').forEach((element) => {
      element.addEventListener('click', (event) => {
        if (event.currentTarget !== element) return;
        event.stopPropagation();
        const task = dailyPlan?.tasks.find((entry) => entry.id === element.dataset.taskId);
        executePlanDailyTask(task, activeChapterId, state);
      });
    });
  }

  const timeline = $('#plan-timeline');
  if (timeline) {
    timeline.innerHTML = renderTimeline(plan, state, activeChapterId);
    timeline.querySelectorAll('[data-chapter-id]').forEach((card) => {
      card.addEventListener('click', () => nav('chapter', Number(card.dataset.chapterId)));
    });
  }

  $('#plan-advice-container')?.classList.add('hidden');
  renderPlanCalendar(plan, state);
  bindCalendarToggle();
}

function executePlanDailyTask(task, activeChapterId, state) {
  if (!task) return;
  if (task.type === 'start-chapter') {
    const chId = task.action?.chapterId || activeChapterId;
    planRuntimeDependencies.startChapter?.(chId, toast);
    nav('chapter', chId);
    return;
  }
  if (task.type === 'review') {
    nav('srs');
    return;
  }
  if (task.type === 'vocabulary') {
    startVocabularyBatchSession({
      state,
      chapterId: task.action?.chapterId || activeChapterId,
      dateKey: task.batchDateKey || task.action?.batchDateKey,
      startSession: planRuntimeDependencies.startChapterFlashcards,
      toast,
    });
    return;
  }
  nav('chapter', task.action?.chapterId || activeChapterId);
}

export function renderTodayPlan(dailyPlan, state = { studyPlan: {} }) {
  return renderHomeTodayCard(state, dailyPlan);
}

function renderTimeline(plan, state, activeChapterId) {
  const completed = new Set(plan.completedChapters || []);
  const chapterSegments = (plan.segments || []).filter((segment) => segment.type === 'chapter');
  const active = chapterSegments.find((segment) => segment.chapterId === activeChapterId);
  const next = chapterSegments
    .filter((segment) => !completed.has(segment.chapterId) && segment !== active)
    .slice(0, 4);
  const plannedDates = chapterSegments.flatMap((segment) => segment.assignedDates || []);
  const futureDates = plannedDates.filter((dateKey) => dateKey >= getTodayDateKey());
  const weeklyMinutes = next
    .slice(0, 2)
    .reduce((sum, segment) => sum + Number(segment.estimatedMinutes || 0), 0);

  return `
    <section class="plan-section">
      <span class="today-eyebrow">ТЕКУЩИЙ АКТИВНЫЙ СЕГМЕНТ</span>
      ${active ? segmentCard(active, state, true) : '<div class="card muted">Активный сегмент не найден.</div>'}
    </section>
    <section class="plan-section">
      <span class="today-eyebrow">СЛЕДУЮЩИЕ ГЛАВЫ</span>
      <div class="plan-next-list">${next.length ? next.map((segment) => segmentCard(segment, state)).join('') : '<div class="card muted">Будущих глав нет.</div>'}</div>
    </section>
    <section class="plan-forecast card">
      <span class="today-eyebrow">КРАТКИЙ ПРОГНОЗ</span>
      <strong>${futureDates.length} учебных дат до ${formatPlanDate(plan.deadline)}</strong>
      <small>${weeklyMinutes > 0 ? `Ближайшие главы: примерно ${weeklyMinutes} минут` : 'Нагрузка уточняется по метаданным глав'}</small>
    </section>`;
}

function segmentCard(segment, state, active = false) {
  const catalogEntry = CONTENT_INDEX.find((entry) => entry.id === segment.chapterId);
  const loadedChapter = getLesson(segment.chapterId);
  const chapterMeta = loadedChapter || catalogEntry;

  const isLoadedOrActive = Boolean(loadedChapter || active || segment.status === 'completed');
  const progress = chapterMeta ? getChapterProgress(state, chapterMeta.id, chapterMeta) : null;

  const statuses = (segment.assignedDates || []).map((dateKey) =>
    StudyPlan.getDateStatus(state.studyPlan, dateKey, {
      learningEvents: state.learningEvents || [],
      reviewEvents: state.reviewEvents || [],
    })
  );
  const overdue = statuses.filter((status) => status === 'overdue').length;
  const remainingDays = statuses.filter((status) =>
    ['planned', 'today', 'overdue', 'postponed'].includes(status)
  ).length;

  let statusText = '';
  if (overdue > 0) {
    statusText = `${overdue} просрочено`;
  } else if (isLoadedOrActive && progress) {
    statusText = `${progress.completedCount || 0} из ${progress.totalCount || 0} разделов`;
  } else {
    const daysCount = segment.assignedDates?.length || segment.days || 0;
    statusText = `запланировано ${daysCount} учебных ${pluralizeDays(daysCount)}`;
  }

  return `
    <button class="segment-card ${active ? 'in-progress' : ''}" data-chapter-id="${segment.chapterId}">
      <span class="segment-header">
        <strong>Глава ${segment.chapterId}: ${chapterMeta?.title || ''}</strong>
        <span class="segment-badge">${remainingDays} дн.</span>
      </span>
      <span class="segment-dates">${formatPlanDate(segment.startDate)} — ${formatPlanDate(segment.endDate)}</span>
      <span class="segment-status ${overdue ? 'overdue' : 'upcoming'}">${statusText}</span>
    </button>`;
}

function pluralizeDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

function bindCalendarToggle() {
  const timelineButton = document.querySelector('[data-view="timeline"]');
  const calendarButton = document.querySelector('[data-view="grid"]');
  const calendar = $('#plan-calendar-grid');
  const timeline = $('#plan-timeline');
  if (timelineButton) {
    timelineButton.textContent = '📋 Сводка';
    timelineButton.onclick = () => {
      timeline?.classList.remove('hidden');
      calendar?.classList.add('hidden');
      timelineButton.classList.add('active');
      calendarButton?.classList.remove('active');
    };
  }
  if (calendarButton) {
    calendarButton.textContent = '📅 Показать календарь';
    calendarButton.onclick = () => {
      calendar?.classList.toggle('hidden');
      calendarButton.classList.toggle('active', !calendar.classList.contains('hidden'));
      timelineButton?.classList.add('active');
    };
  }
  calendar?.classList.add('hidden');
}

function renderPlanCalendar(plan, state) {
  const grid = $('#plan-heatmap-grid');
  const label = $('#plan-heatmap-month-label');
  const legend = $('#plan-heatmap-legend');
  if (!grid || !label) return;
  const year = planCalendarMonth.getFullYear();
  const month = planCalendarMonth.getMonth();
  const today = getTodayDateKey();
  label.textContent = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(planCalendarMonth);
  grid.innerHTML = '';

  const dateMap = new Map();
  for (const segment of plan.segments || []) {
    for (const dateKey of segment.assignedDates || []) {
      dateMap.set(dateKey, {
        chapterId: segment.chapterId,
        status: StudyPlan.getDateStatus(plan, dateKey, {
          learningEvents: state.learningEvents || [],
          reviewEvents: state.reviewEvents || [],
        }),
      });
    }
  }
  if (legend) legend.textContent = `${dateMap.size} точных учебных дат`;

  let firstWeekday = new Date(year, month, 1).getDay();
  firstWeekday = firstWeekday === 0 ? 6 : firstWeekday - 1;
  for (let index = 0; index < firstWeekday; index++) {
    const spacer = document.createElement('span');
    spacer.className = 'heatmap-day heatmap-empty';
    grid.appendChild(spacer);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const item = dateMap.get(dateKey);
    const cell = document.createElement(item ? 'button' : 'span');
    cell.className = `heatmap-day ${item ? `plan-date ${item.status}` : 'rest-day'} ${dateKey === today ? 'today' : ''}`;
    cell.textContent = String(day);
    if (item) {
      cell.title = `Глава ${item.chapterId} · ${statusLabel(item.status)}`;
      cell.onclick = () => nav('chapter', item.chapterId);
    }
    grid.appendChild(cell);
  }

  const previous = $('#plan-heatmap-prev');
  const next = $('#plan-heatmap-next');
  if (previous) {
    previous.onclick = () => {
      planCalendarMonth = new Date(year, month - 1, 1);
      renderPlanCalendar(plan, state);
    };
  }
  if (next) {
    next.onclick = () => {
      planCalendarMonth = new Date(year, month + 1, 1);
      renderPlanCalendar(plan, state);
    };
  }
}

function showDeadlineExpiredDialog(result, state, save, chaptersList = CONTENT_INDEX) {
  const warning = $('#plan-warning');
  if (!warning) return;
  warning.innerHTML = `
    <div class="deadline-expired-dialog">
      <strong>Дедлайн ${result.expiredDeadline} истёк</strong>
      <p>История останется без изменений. Выберите действие только для будущей части.</p>
      <div class="deadline-expired-options">
        ${result.options.map((option) => `<button class="deadline-option-btn" data-option="${option.type}">${option.label}</button>`).join('')}
      </div>
    </div>`;
  warning.classList.remove('hidden');
  warning.querySelectorAll('[data-option]').forEach((button) => {
    button.onclick = () => {
      const option = result.options.find((entry) => entry.type === button.dataset.option);
      if (option.type === 'keep_overdue') {
        state.studyPlan.deadlineState = {
          deadlineExpired: true,
          expiredDeadline: result.expiredDeadline,
          keptOverdueAt: Date.now(),
        };
        save();
        warning.classList.add('hidden');
        renderPlanView(state);
        return;
      }
      const completed = getCompletedChapterIds(state, chaptersList);
      const replacement = StudyPlan.generatePlan(option.params, chaptersList, completed);
      if (replacement.error) {
        showPlanWarning(replacement.error);
        return;
      }
      const preserved = StudyPlan.recalculateFuturePlan(
        {
          ...state.studyPlan,
          deadline: replacement.deadline,
          totalDays: replacement.totalDays,
          studyDaysOfWeek: replacement.studyDaysOfWeek,
        },
        chaptersList,
        completed,
        { today: getTodayDateKey() }
      );
      if (preserved.error || preserved.deadlineExpired) {
        showPlanWarning(preserved.error || 'Не удалось распределить будущую часть плана');
        return;
      }
      state.studyPlan = preserved;
      ensureActiveChapterId(state, chaptersList);
      save();
      warning.classList.add('hidden');
      renderPlanView(state);
    };
  });
}

function showPlanWarning(message) {
  const warning = $('#plan-warning');
  if (!warning) return;
  warning.textContent = message;
  warning.classList.remove('hidden');
}

function formatPlanDate(dateKey) {
  if (!dateKey) return '—';
  const date = parseDateKey(dateKey);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
}

function statusLabel(status) {
  return (
    {
      planned: 'запланировано',
      today: 'сегодня',
      completed: 'выполнено',
      skipped: 'пропущено',
      overdue: 'просрочено',
      postponed: 'перенесено',
      'rest-day': 'день отдыха',
    }[status] || status
  );
}

function toast(message) {
  const toastElement = $('#toast');
  if (!toastElement) return;
  toastElement.textContent = message;
  toastElement.classList.add('show');
  setTimeout(() => toastElement.classList.remove('show'), 3000);
}
