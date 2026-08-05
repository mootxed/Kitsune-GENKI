/* ui/plan.js — экран плана обучения */

import { getAllPlanStudyDates, StudyPlan } from '../studyplan.js';
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
import { loadSupplementalPracticeData } from '../src/supplemental-practice.js';
import { commitState } from '../state/store.js';
import {
  pauseStudyPlanCommand,
  deleteStudyPlanCommand,
  updateStudyPlanCommand,
} from '../src/domain-commands.js';
import {
  canonicalLessonId,
  compareLessonIds,
  formatLessonLabel,
  sameLessonId,
} from '../src/courses/course-context.js';

let planCalendarMonth = new Date();
let planRuntimeDependencies = {};
let planEditorOpen = false;
let planSubmissionPending = false;
// Черновик формы: форма работает с ним, state мутирует только при commit
export let planDraft = null;
// AbortController для удаления старых обработчиков формы при повторном рендеринге
let formListenersController = null;
// Debounce-таймер для предварительного просмотра
let previewDebounceTimer = null;

export function openPlanEditor(state) {
  planEditorOpen = true;
  // Создаём черновик из текущих настроек — изолируем state от формы
  planDraft = {
    priorKnowledgeChapterIds: [...(state?.priorKnowledgeChapterIds || [])],
    workbookSettings: { ...(state?.workbookSettings || {}) },
    dailyCapacityMinutes: state?.dailyCapacityMinutes || 30,
  };
  populateForm(state?.studyPlan, state);
  renderPlanView(state);
  updateLivePreview(state);
}

export function closePlanEditor(state) {
  planEditorOpen = false;
  planDraft = null;
  clearPlanWarning();
  renderPlanView(state);
}

export function setPlanSubmissionPending(pending, state = null) {
  planSubmissionPending = pending;
  const generateBtn = $('#plan-generate-btn');
  if (generateBtn) {
    generateBtn.disabled = pending;
    generateBtn.textContent = pending
      ? 'Сохранение...'
      : state?.studyPlan
        ? 'Сохранить изменения'
        : 'Создать план';
  }
}

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
  bindWorkbookToggles(state);
  bindFormLiveInputs(state);

  const generateButton = $('#plan-generate-btn');
  if (generateButton) {
    generateButton.onclick = async () => {
      setPlanSubmissionPending(true, state);
      // Фиксируем факт редактирования ДО commit — чтобы toast был правильным
      const wasEditing = Boolean(state.studyPlan);
      try {
        const workbookData = await loadSupplementalPracticeData();
        const preferences = collectPlanPreferences(state);
        if (!preferences) return;

        const catalog = buildStudyPlanContentCatalog(
          CONTENT_INDEX,
          workbookData,
          preferences.workbookSettings
        );

        const preview = previewStudyPlanFromPreferences(preferences, catalog, { state });

        if (!preview.valid) {
          showPlanWarning(formatPlanError(preview.errors?.[0] || 'invalid-preview'));
          return;
        }

        const isTightAndNotAccepted =
          preview.isTight && !preview.feasible && !preferences.acceptRecommendedDeadline;
        if (isTightAndNotAccepted) {
          showPlanWarning(formatPlanError('target-deadline-too-tight'));
          updateLivePreview(state);
          return;
        }

        const result = commitStudyPlanFromPreferences(state, preferences, preview, {
          source: 'plan-settings',
          preserveHistory: true,
        });

        if (!result.success) {
          showPlanWarning(formatPlanError(result.error || 'commit-failed'));
          return;
        }

        planEditorOpen = false;
        planDraft = null;
        clearPlanWarning();
        await save(true);
        renderPlanView(state);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Правильный toast: зафиксировано ДО commit
        toast(wasEditing ? 'План обучения сохранён' : 'План обучения создан');

        if (
          Array.isArray(state.priorKnowledgeChapterIds) &&
          state.priorKnowledgeChapterIds.length > 0
        ) {
          void reconcilePriorKnowledgeVocabulary(state, ensureLesson)
            .then((reconcileResult) => {
              if (reconcileResult && !reconcileResult.success) {
                toast('Часть слов загрузится при изучении соответствующих глав');
              } else if (reconcileResult && reconcileResult.addedCards > 0) {
                toast('Слова ранее изученных глав добавили в SRS');
              }
            })
            .catch((err) => console.warn('[Plan] Reconcile error:', err));
        }
      } catch (err) {
        console.error('[Plan] Error committing plan:', err);
        showPlanWarning(err.message || 'Ошибка при сохранении плана');
      } finally {
        setPlanSubmissionPending(false, state);
      }
    };
  }

  const cancelButton = $('#plan-cancel-btn');
  if (cancelButton) {
    cancelButton.onclick = () => closePlanEditor(state);
  }

  const editButton = $('#plan-edit-btn');
  if (editButton) {
    editButton.onclick = () => {
      openPlanEditor(state);
    };
  }

  const recalcButton = $('#plan-recalc-btn');
  if (recalcButton) {
    recalcButton.onclick = async () => {
      if (!state.studyPlan) return;
      const workbookData = await loadSupplementalPracticeData();
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
        // Показываем ошибку в view-warning, видимом даже когда форма скрыта
        showViewWarning(result.error);
        return;
      }
      const cmdResult = updateStudyPlanCommand(state, result);
      await commitState(cmdResult.events);
      ensureActiveChapterId(state, catalog.chapters);

      renderPlanView(state);
      toast('Будущая часть плана пересчитана');
    };
  }

  const pauseButton = $('#plan-pause-btn');
  if (pauseButton) {
    pauseButton.onclick = async () => {
      const result = pauseStudyPlanCommand(state);
      if (result.changed) {
        await commitState(result.events);
        ensureActiveChapterId(state, CONTENT_INDEX);

        renderPlanView(state);
        toast(result.paused ? 'План приостановлен' : 'План возобновлён');
      }
    };
  }

  const deleteButton = $('#plan-delete-btn');
  if (deleteButton) {
    deleteButton.onclick = async () => {
      if (!confirm('Удалить текущий план? История обучения и FSRS-карточки сохранятся.')) return;
      const result = deleteStudyPlanCommand(state);
      if (result.changed) {
        await commitState(result.events);
        planEditorOpen = false;
        ensureActiveChapterId(state, CONTENT_INDEX);
        renderPlanView(state);
        toast('План удалён; прогресс курса сохранён');
      }
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

function bindWorkbookToggles(state) {
  const enabledCb = $('#plan-workbook-enabled');
  const subOptions = $('#plan-workbook-sub-options');
  if (enabledCb && subOptions) {
    const updateVisibility = () => {
      subOptions.style.display = enabledCb.checked ? 'block' : 'none';
    };
    // Используем onchange вместо addEventListener — не накапливаются дубли
    enabledCb.onchange = () => {
      updateVisibility();
      scheduleLivePreview(state);
    };
    updateVisibility();
  }
  const cgCb = $('#plan-workbook-conversation-grammar');
  const rwCb = $('#plan-workbook-reading-writing');
  if (cgCb) cgCb.onchange = () => scheduleLivePreview(state);
  if (rwCb) rwCb.onchange = () => scheduleLivePreview(state);
}

function scheduleLivePreview(state) {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => updateLivePreview(state), 200);
}

function bindFormLiveInputs(state) {
  // Сбрасываем старые обработчики перед привязкой новых — предотвращаем накопление
  formListenersController?.abort();
  formListenersController = new AbortController();
  const sig = { signal: formListenersController.signal };

  const inputs = [
    '#plan-start-date',
    '#plan-total-days',
    '#plan-deadline-date',
    '#plan-capacity-minutes',
  ];
  inputs.forEach((selector) => {
    $(selector)?.addEventListener('change', () => scheduleLivePreview(state), sig);
    $(selector)?.addEventListener('input', () => scheduleLivePreview(state), sig);
  });

  document.querySelectorAll('.weekday-btn').forEach((button) => {
    button.addEventListener('click', () => scheduleLivePreview(state), sig);
  });

  document.querySelectorAll('.plan-deadline-toggle .toggle-btn').forEach((button) => {
    button.addEventListener('click', () => scheduleLivePreview(state), sig);
  });
}

async function updateLivePreview(state) {
  const container = $('#plan-preview-container');
  if (!container) return;

  const preferences = collectPlanPreferences(state);
  if (!preferences) return;

  const workbookData = await loadSupplementalPracticeData();
  const catalog = buildStudyPlanContentCatalog(
    CONTENT_INDEX,
    workbookData,
    preferences.workbookSettings
  );

  const preview = previewStudyPlanFromPreferences(preferences, catalog, { state });

  if (!preview.valid) {
    container.classList.add('hidden');
    return;
  }

  const estDateFormatted = formatPlanDate(preview.estimatedCompletionDate);
  const recDateFormatted = formatPlanDate(preview.recommendedTargetDate);

  // P1: Правильная подпись для режима дедлайна (дата) и режима дней (число)
  const targetLabel =
    preferences.targetType === 'deadline'
      ? `до ${formatPlanDate(preferences.targetValue)} (${preview.availableStudyDays} уч. дн. доступно)`
      : `${preferences.targetValue || 0} учебных дней`;

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'plan-preview-summary';

  const summaryTitle = document.createElement('strong');
  summaryTitle.textContent = 'Ваш будущий график:';
  summaryDiv.append(summaryTitle, document.createElement('br'));

  const chapterCount =
    preview.previewPlan?.segments?.filter((s) => s.type === 'chapter').length || 12;

  summaryDiv.append(`• Глав для изучения: ${chapterCount}`, document.createElement('br'));
  summaryDiv.append(
    `• Учебных дней: ${preview.requiredStudyDays} (по ${preferences.dailyCapacityMinutes} мин/день)`,
    document.createElement('br')
  );
  summaryDiv.append(
    `• Общее время нового материала: ~${preview.totalRequiredMinutes} минут`,
    document.createElement('br')
  );

  const estBold = document.createElement('b');
  estBold.textContent = estDateFormatted;
  summaryDiv.append('• Прогноз завершения: ', estBold);

  const childrenToReplace = [summaryDiv];

  if (preview.isTight) {
    const isChecked = preferences.acceptRecommendedDeadline;
    const warningDiv = document.createElement('div');
    warningDiv.className = 'plan-preview-warning';

    const targetStrong = document.createElement('strong');
    targetStrong.textContent = `• Выбранный срок: ${targetLabel}`;
    warningDiv.append(targetStrong, document.createElement('br'));

    warningDiv.append(
      `• Минимально требуется: ${preview.requiredStudyDays} уч. дней`,
      document.createElement('br')
    );

    const recBold = document.createElement('b');
    recBold.textContent = recDateFormatted;
    warningDiv.append('• Рекомендуемое завершение: ', recBold);

    const recsDiv = document.createElement('div');
    recsDiv.className = 'plan-recommendations';

    if (Array.isArray(preview.recommendations)) {
      preview.recommendations.forEach((r) => {
        const btn = document.createElement('button');
        btn.className = 'btn-sm btn-outline plan-rec-btn';
        btn.dataset.recType = r.type || '';
        btn.dataset.recDate = r.recommendedDate || '';
        btn.dataset.recDays = r.dailyCapacityMinutes || '';
        btn.textContent = r.label || '';
        btn.onclick = () => applyRecommendation(btn.dataset, state);
        recsDiv.append(btn);
      });
    }
    warningDiv.append(recsDiv);

    const labelItem = document.createElement('label');
    labelItem.className = 'chapter-checkbox-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'plan-accept-deadline';
    checkbox.dataset.testid = 'plan-accept-deadline';
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', () => {
      scheduleLivePreview(state);
    });

    const spanLabel = document.createElement('span');
    spanLabel.className = 'chapter-checkbox-label';
    spanLabel.style.fontWeight = '600';
    spanLabel.textContent = `Использовать рекомендуемый срок (${recDateFormatted})`;

    labelItem.append(checkbox, spanLabel);
    warningDiv.append(labelItem);

    childrenToReplace.push(warningDiv);
  }

  container.replaceChildren(...childrenToReplace);
  container.classList.remove('hidden');
}

function applyRecommendation(dataset, state) {
  const type = dataset.recType;
  if (type === 'extend-deadline') {
    const dateInput = $('#plan-deadline-date');
    if (dateInput && dataset.recDate) {
      dateInput.value = dataset.recDate;
      // Переключаем в режим дедлайна
      const dateBtn = document.querySelector('.plan-deadline-toggle .toggle-btn[data-mode="date"]');
      const daysBtn = document.querySelector('.plan-deadline-toggle .toggle-btn[data-mode="days"]');
      if (dateBtn && daysBtn) {
        dateBtn.classList.add('active');
        daysBtn.classList.remove('active');
        $('#plan-days-input')?.classList.add('hidden');
        $('#plan-deadline-input')?.classList.remove('hidden');
      }
    }
  } else if (type === 'add-study-day') {
    // Активируем все дни недели
    document.querySelectorAll('.weekday-btn').forEach((b) => b.classList.add('active'));
  } else if (type === 'increase-time') {
    const cap = $('#plan-capacity-minutes');
    if (cap) cap.value = dataset.recDays || '45';
  } else if (type === 'disable-rw') {
    const rw = $('#plan-workbook-reading-writing');
    if (rw) rw.checked = false;
  } else if (type === 'disable-workbook') {
    const wb = $('#plan-workbook-enabled');
    if (wb) {
      wb.checked = false;
      wb.dispatchEvent(new window.Event('change'));
    }
  }
  scheduleLivePreview(state);
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

  container.replaceChildren();
  CONTENT_INDEX.forEach((chapter) => {
    const isActual = [...actualCompleted].some((id) => sameLessonId(id, chapter.id));
    const isEffective = [...effectiveCompleted].some((id) => sameLessonId(id, chapter.id));
    const tag = isActual ? ' (пройдена в приложении)' : isEffective ? ' (изучена ранее)' : '';

    const label = document.createElement('label');
    label.className = `chapter-checkbox-item ${isActual ? 'disabled-item' : ''}`;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'chapter-checkbox';
    input.dataset.chapterId = String(chapter.id);
    if (isEffective) input.checked = true;
    if (isActual) input.disabled = true;

    const span = document.createElement('span');
    span.className = 'chapter-checkbox-label';
    span.textContent = `${chapter.title || formatLessonLabel(chapter.id)}${tag}`;

    label.append(input, span);
    container.append(label);
  });
  updateManualProgress();
  container.querySelectorAll('.chapter-checkbox:not([disabled])').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      // Не мутируем state напрямую — черновик читается из формы при commit
      updateManualProgress();
      scheduleLivePreview(state);
    });
  });
}

function getPriorKnowledgeFromForm(state) {
  const actualCompleted = new Set(getActualCompletedChapterIds(state, CONTENT_INDEX));
  const checked = [...document.querySelectorAll('.chapter-checkbox:checked')]
    .map((checkbox) => canonicalLessonId(checkbox.dataset.chapterId))
    .filter(Boolean);

  return checked
    .filter((id) => ![...actualCompleted].some((actualId) => sameLessonId(actualId, id)))
    .sort(compareLessonIds);
}

export function syncPriorKnowledgeFromForm() {
  // Функция сохранена для обратной совместимости.
  // Форма использует черновик (planDraft); state мутирует только при commit.
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

function collectPlanPreferences(state) {
  const priorKnowledgeChapterIds = getPriorKnowledgeFromForm(state);
  const startDate = $('#plan-start-date')?.value || getTodayDateKey();
  const studyDays = [...document.querySelectorAll('.weekday-btn.active')].map((button) =>
    Number(button.dataset.day)
  );
  const dailyCapacityMinutes = Number($('#plan-capacity-minutes')?.value || 30);

  const wbEnabled = $('#plan-workbook-enabled')?.checked !== false;
  const includeCG = $('#plan-workbook-conversation-grammar')?.checked !== false;
  const includeRW = $('#plan-workbook-reading-writing')?.checked !== false;

  const workbookSettings = {
    enabled: wbEnabled,
    includeConversationGrammar: includeCG,
    includeReadingWriting: includeRW,
  };

  const mode = document.querySelector('.plan-deadline-toggle .toggle-btn.active')?.dataset.mode;
  const targetType = mode === 'days' ? 'days' : 'deadline';
  const targetValue =
    mode === 'days' ? Number($('#plan-total-days')?.value) : $('#plan-deadline-date')?.value;

  const acceptRecommendedDeadline = Boolean($('#plan-accept-deadline')?.checked);

  // P1: allowPastDate=true только при редактировании существующего плана.
  // При создании нового — прошлая дата запрещена.
  const allowPastDate = Boolean(state?.studyPlan);

  return {
    startDate,
    studyDays,
    dailyCapacityMinutes,
    workbookSettings,
    priorKnowledgeChapterIds,
    targetType,
    targetValue,
    acceptRecommendedDeadline,
    allowPastDate,
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

  const wbEnabled = $('#plan-workbook-enabled');
  if (wbEnabled) wbEnabled.checked = state?.workbookSettings?.enabled !== false;

  const cg = $('#plan-workbook-conversation-grammar');
  if (cg) cg.checked = state?.workbookSettings?.includeConversationGrammar !== false;

  const rw = $('#plan-workbook-reading-writing');
  if (rw) rw.checked = state?.workbookSettings?.includeReadingWriting !== false;

  const subOptions = $('#plan-workbook-sub-options');
  if (subOptions && wbEnabled) {
    subOptions.style.display = wbEnabled.checked ? 'block' : 'none';
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

  const title = $('#plan-form-title');
  const btn = $('#plan-generate-btn');
  const cancelBtn = $('#plan-cancel-btn');

  if (title) title.textContent = plan ? 'Редактировать план' : 'Создать новый план';
  if (btn && !planSubmissionPending) {
    btn.textContent = plan ? 'Сохранить изменения' : 'Создать план';
  }
  // Кнопку «Отмена» показываем только когда редактируем существующий план
  if (cancelBtn) cancelBtn.style.display = planEditorOpen && plan ? 'inline-flex' : 'none';

  if (!plan || plan.error) {
    form?.classList.remove('hidden');
    view?.classList.add('hidden');
    controls?.classList.add('hidden');
    return;
  }

  if (planEditorOpen) {
    form?.classList.remove('hidden');
    view?.classList.add('hidden');
    controls?.classList.add('hidden');
  } else {
    form?.classList.add('hidden');
    view?.classList.remove('hidden');
    controls?.classList.remove('hidden');
  }

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
      card.addEventListener('click', () => nav('chapter', card.dataset.chapterId));
    });
    timeline.querySelector('#status-recalc-btn')?.addEventListener('click', () => {
      $('#plan-recalc-btn')?.click();
    });
    timeline.querySelector('#status-edit-btn')?.addEventListener('click', () => {
      $('#plan-edit-btn')?.click();
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

function renderPlanStatusCard(plan, state) {
  const today = getTodayDateKey();
  const allDates = getAllPlanStudyDates(plan);
  const startDate = plan?.startDate || (allDates.length > 0 ? allDates[0] : today);
  const totalStudyDays = allDates.length || plan?.totalDays || 1;

  if (today < startDate) {
    const formattedStartDate = parseDateKey(startDate).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
    });
    return `
      <div class="card plan-status-card" style="margin-bottom:14px;border-left:4px solid var(--indigo,#1e224e);" data-testid="plan-status-card">
        <div class="row-between" style="margin-bottom:6px;">
          <strong style="font-size:14px;">План начнётся ${formattedStartDate}</strong>
          <span class="badge" style="background:rgba(30,34,78,0.15);color:var(--indigo,#1e224e);">Не начат</span>
        </div>
        <p style="margin:4px 0 6px;font-size:13px;">Всего запланировано <b>${totalStudyDays}</b> учебных дней</p>
        <div class="row-between" style="font-size:12px;color:var(--muted,#666);">
          <span>Прогноз завершения: <b style="color:var(--ink,#333);">${plan?.deadline || ''}</b></span>
        </div>
      </div>
    `;
  }

  // Строго прошлые даты (< today) — кандидаты на отставание.
  // Сегодня никогда не считается «просроченным»: пользователь ещё может выполнить задачи.
  const missedDates = allDates.filter((d) => d < today);
  const isStudyDayToday = allDates.includes(today);
  const elapsedStudyDays = missedDates.length + (isStudyDayToday ? 1 : 0);

  let completedMissedDays = 0;
  for (const d of missedDates) {
    const dateStatus = StudyPlan.getDateStatus(plan, d, {
      learningEvents: state?.learningEvents || [],
      reviewEvents: state?.reviewEvents || [],
    });
    if (dateStatus === 'completed') completedMissedDays++;
  }

  // Проверяем статус сегодняшнего дня отдельно
  const todayStatus = isStudyDayToday
    ? StudyPlan.getDateStatus(plan, today, {
        learningEvents: state?.learningEvents || [],
        reviewEvents: state?.reviewEvents || [],
      })
    : null;
  const completedStudyDays = completedMissedDays + (todayStatus === 'completed' ? 1 : 0);

  // Отставание — только по прошлым датам, сегодня не считается просроченным
  const daysBehind = Math.max(0, missedDates.length - completedMissedDays);
  const expectedProgress = Math.min(100, Math.round((elapsedStudyDays / totalStudyDays) * 100));
  const actualProgress = Math.min(100, Math.round((completedStudyDays / totalStudyDays) * 100));

  const totalChapters = CONTENT_INDEX.length || 12;
  const completedChaptersCount = (plan?.completedChapters || []).length;

  let status = 'on-track';
  if (
    completedChaptersCount >= totalChapters ||
    (allDates.length > 0 && completedStudyDays >= totalStudyDays)
  ) {
    status = 'completed';
  } else if (plan?.paused) {
    status = 'paused';
  } else if (daysBehind > 0) {
    status = 'behind';
  }

  let statusTitle = 'Вы идёте по плану 🟢';
  let badgeHtml =
    '<span class="badge" style="background:rgba(76,175,80,0.15);color:var(--green,#2e7d32);">По плану</span>';
  let borderColor = 'var(--green,#2e7d32)';

  if (status === 'completed') {
    statusTitle = 'План полностью завершён 🎉';
    badgeHtml =
      '<span class="badge" style="background:rgba(76,175,80,0.15);color:var(--green,#2e7d32);">Завершено</span>';
  } else if (status === 'paused') {
    statusTitle = 'План на паузе ⏸️';
    badgeHtml =
      '<span class="badge" style="background:rgba(158,158,158,0.15);color:#666;">На паузе</span>';
    borderColor = '#888';
  } else if (status === 'behind') {
    statusTitle = `Отставание на ${daysBehind} дн. ⚠️`;
    badgeHtml = `<span class="badge" style="background:rgba(244,67,54,0.15);color:var(--red,#d32f2f);">Отставание ${daysBehind} дн.</span>`;
    borderColor = 'var(--red,#d32f2f)';
  }

  const forecastStr = plan?.deadline || (allDates.length > 0 ? allDates.at(-1) : '');

  const actionsHtml =
    status === 'behind'
      ? `<div class="plan-status-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-sm btn-primary" id="status-recalc-btn" style="font-size:12px;">Пересчитать будущую часть</button>
          <button class="btn-sm btn-outline" id="status-edit-btn" style="font-size:12px;">Изменить настройки</button>
         </div>`
      : '';

  return `
    <div class="card plan-status-card" style="margin-bottom:14px;border-left:4px solid ${borderColor};" data-testid="plan-status-card">
      <div class="row-between" style="margin-bottom:6px;">
        <strong style="font-size:14px;">${statusTitle}</strong>
        ${badgeHtml}
      </div>
      <p style="margin:4px 0 6px;font-size:13px;">Пройдено <b>${completedStudyDays}</b> из <b>${totalStudyDays}</b> учебных дней (${actualProgress}%)</p>
      <div class="row-between" style="font-size:12px;color:var(--muted,#666);">
        <span>Прогноз завершения: <b style="color:var(--ink,#333);">${forecastStr}</b></span>
        <span>Ожидалось: ${expectedProgress}%</span>
      </div>
      ${actionsHtml}
    </div>
  `;
}

function renderTimeline(plan, state, activeChapterId) {
  const completed = plan.completedChapters || [];
  const chapterSegments = (plan.segments || []).filter((segment) => segment.type === 'chapter');
  const active = chapterSegments.find((segment) =>
    sameLessonId(segment.chapterId, activeChapterId)
  );
  const next = chapterSegments
    .filter(
      (segment) =>
        !completed.some((id) => sameLessonId(id, segment.chapterId)) && segment !== active
    )
    .slice(0, 4);
  const plannedDates = chapterSegments.flatMap((segment) => segment.assignedDates || []);
  const futureDates = plannedDates.filter((dateKey) => dateKey >= getTodayDateKey());
  const weeklyMinutes = next
    .slice(0, 2)
    .reduce((sum, segment) => sum + Number(segment.estimatedMinutes || 0), 0);

  const statusCardHtml = renderPlanStatusCard(plan, state);

  return `
    ${statusCardHtml}
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
  const catalogEntry = CONTENT_INDEX.find((entry) => sameLessonId(entry.id, segment.chapterId));
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

  let statusText;
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
        <strong>${chapterMeta?.title || formatLessonLabel(segment.chapterId)}</strong>
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

  // P2: Настоящее взаимоисключающее переключение — при выборе одного вида другой скрывается
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
    calendarButton.textContent = '📅 Календарь';
    calendarButton.onclick = () => {
      calendar?.classList.remove('hidden');
      timeline?.classList.add('hidden');
      calendarButton.classList.add('active');
      timelineButton?.classList.remove('active');
    };
  }
  // По умолчанию активен таймлайн
  calendar?.classList.add('hidden');
  timeline?.classList.remove('hidden');
  timelineButton?.classList.add('active');
  calendarButton?.classList.remove('active');
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
  // P0: Диалог показываем в plan-view-warning, который виден в режиме просмотра
  const warning = $('#plan-view-warning') || $('#plan-warning');
  if (!warning) return;
  warning.replaceChildren();
  const dialog = document.createElement('div');
  dialog.className = 'deadline-expired-dialog';

  const strong = document.createElement('strong');
  strong.textContent = `Дедлайн ${result.expiredDeadline || ''} истёк`;

  const p = document.createElement('p');
  p.textContent = 'История останется без изменений. Выберите действие только для будущей части.';

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'deadline-expired-options';

  (result.options || []).forEach((option) => {
    const btn = document.createElement('button');
    btn.className = 'deadline-option-btn';
    btn.dataset.option = option.type;
    btn.textContent = option.label;
    optionsDiv.append(btn);
  });

  dialog.append(strong, p, optionsDiv);
  warning.append(dialog);
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

function formatPlanError(code) {
  const map = {
    'target-deadline-too-tight':
      'Указанный срок слишком короткий. Отметьте согласие с рекомендуемым сроком или скорректируйте параметры.',
    'start-date-in-past': 'Дата начала не может быть в прошлом.',
    'no-study-days-selected': 'Выберите хотя бы один учебный день недели.',
    'invalid-daily-capacity': 'Укажите корректное дневное время обучения.',
    'all-chapters-marked-as-known': 'Все главы отмечены как изученные. Нечего планировать.',
    'invalid-preview-result': 'Ошибка параметров плана.',
  };
  return map[code] || code || 'Не удалось создать план обучения.';
}

function showPlanWarning(message) {
  const warning = $('#plan-warning');
  if (!warning) return;
  warning.textContent = message;
  warning.classList.remove('hidden');
}

// P0: Ошибки в режиме просмотра плана (форма скрыта)
function showViewWarning(message) {
  const viewWarn = $('#plan-view-warning');
  if (viewWarn) {
    viewWarn.textContent = message;
    viewWarn.classList.remove('hidden');
    return;
  }
  // Фоллбэк: если plan-view-warning нет — используем общий plan-warning
  showPlanWarning(message);
}

function clearPlanWarning() {
  const warning = $('#plan-warning');
  if (warning) {
    warning.textContent = '';
    warning.classList.add('hidden');
  }
  const viewWarn = $('#plan-view-warning');
  if (viewWarn) {
    viewWarn.textContent = '';
    viewWarn.classList.add('hidden');
  }
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
