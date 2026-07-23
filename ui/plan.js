/* ui/plan.js — Экран плана обучения */

import { StudyPlan } from '../studyplan.js';
import { $ } from '../src/utils.js';
import { LESSONS, CONTENT_INDEX, ensureLesson } from './home.js';
import { nav } from './router.js';
import { localDateKey, parseDateKey } from '../src/local-date.js';

/**
 * Инициализация и рендеринг экрана плана обучения
 * @param {Object} state - Глобальное состояние приложения
 * @param {Object} dependencies - Зависимости (save функция и т.д.)
 */
export function renderPlan(state, dependencies) {
  const { save } = dependencies;

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

  // Кнопка "Изменить"
  const editBtn = $('#plan-edit-btn');
  if (editBtn) {
    editBtn.onclick = () => {
      const formContainer = $('#plan-form-container');
      if (formContainer) {
        const isHidden = formContainer.classList.contains('hidden');
        if (isHidden) {
          formContainer.classList.remove('hidden');
          // Заполняем форму текущими параметрами плана
          if (state.studyPlan) {
            const plan = state.studyPlan;
            const startDateInput = $('#plan-start-date');
            if (startDateInput && plan.startDate) {
              startDateInput.value = plan.startDate;
            }

            const totalDaysInput = $('#plan-total-days');
            const deadlineDateInput = $('#plan-deadline-date');
            const deadlineToggles = document.querySelectorAll('.plan-deadline-toggle .toggle-btn');
            const daysInputContainer = $('#plan-days-input');
            const deadlineInputContainer = $('#plan-deadline-input');

            if (plan.deadline) {
              deadlineToggles.forEach((b) =>
                b.classList.toggle('active', b.dataset.mode === 'date')
              );
              daysInputContainer?.classList.add('hidden');
              deadlineInputContainer?.classList.remove('hidden');
              if (deadlineDateInput) deadlineDateInput.value = plan.deadline;
            } else if (plan.totalDays) {
              deadlineToggles.forEach((b) =>
                b.classList.toggle('active', b.dataset.mode === 'days')
              );
              daysInputContainer?.classList.remove('hidden');
              deadlineInputContainer?.classList.add('hidden');
              if (totalDaysInput) totalDaysInput.value = plan.totalDays;
            }

            // Дни недели
            const weekdayBtns = document.querySelectorAll('.weekday-btn');
            weekdayBtns.forEach((btn) => {
              const day = parseInt(btn.dataset.day);
              btn.classList.toggle('active', plan.studyDaysOfWeek?.includes(day));
            });

            // Изученные главы (чекбоксы)
            const checkboxes = document.querySelectorAll('.chapter-checkbox');
            checkboxes.forEach((cb) => {
              const chId = parseInt(cb.dataset.chapterId);
              cb.checked = plan.completedChapters?.includes(chId) || false;
            });

            // Обновим виджет прогресса сразу
            const totalChaptersCount = checkboxes.length;
            const checkedCount = document.querySelectorAll('.chapter-checkbox:checked').length;
            const pct =
              totalChaptersCount > 0 ? Math.round((checkedCount / totalChaptersCount) * 100) : 0;
            const progressBarFill = $('#plan-progress-bar-fill');
            const progressText = $('#plan-progress-text');
            if (progressBarFill) progressBarFill.style.width = `${pct}%`;
            if (progressText) {
              progressText.textContent = `Изучено: ${checkedCount} из ${totalChaptersCount} глав (${pct}%)`;
            }
          }
        } else {
          formContainer.classList.add('hidden');
        }
      }
    };
  }

  // Кнопка "Пересчитать план"
  const recalcBtn = $('#plan-recalc-btn');
  if (recalcBtn) {
    recalcBtn.onclick = () => {
      if (!state.studyPlan) return;

      const completedChapters = getCompletedChapters();
      const recalculated = StudyPlan.recalcPlan(state.studyPlan, CONTENT_INDEX, completedChapters);

      // Дедлайн истёк — показываем диалог выбора
      if (recalculated.deadlineExpired) {
        showDeadlineExpiredDialog(recalculated, state, save, completedChapters);
        return;
      }

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

  // Кнопка "Приостановить"
  const pauseBtn = $('#plan-pause-btn');
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      if (!state.studyPlan) return;
      state.studyPlan.paused = !state.studyPlan.paused;
      save();
      pauseBtn.innerHTML = state.studyPlan.paused ? '▶️ Возобновить' : '⏸️ Приостановить';
      const viewContainer = $('#plan-view-container');
      if (viewContainer) {
        viewContainer.classList.toggle('plan-paused', state.studyPlan.paused);
      }
      toast(state.studyPlan.paused ? 'План приостановлен ⏸️' : 'План возобновлен ▶️', {
        duration: 3000,
      });
    };
  }

  // Кнопка "Удалить"
  const deleteBtn = $('#plan-delete-btn');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm('Вы действительно хотите удалить текущий план обучения?')) return;
      state.studyPlan = null;
      save();
      renderPlan(state, dependencies);
      toast('План обучения удален 🗑️', { duration: 3000 });
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

  if (!container) {
    return;
  }

  const chapters = CONTENT_INDEX.length > 0 ? CONTENT_INDEX : LESSONS;

  if (!chapters || chapters.length === 0) {
    container.innerHTML =
      '<p style="color: var(--text-muted); font-size: 14px;">Загрузка глав...</p>';
    setTimeout(() => {
      if ((LESSONS.length > 0 || CONTENT_INDEX.length > 0) && container) {
        renderCompletedChaptersList(state);
      }
    }, 500);
    return;
  }

  const totalChaptersCount = chapters.length;
  let completedChaptersCount = 0;

  const html = chapters
    .map((chapter) => {
      const chapterData = state.chapters?.[chapter.id];
      let isCompleted = false;

      if (chapterData?.items) {
        const itemsArray = Object.values(chapterData.items);
        isCompleted = itemsArray.length > 0 && itemsArray.every((done) => done === true);
      }

      if (isCompleted) {
        completedChaptersCount++;
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

  container.innerHTML = html;

  // Обновляем компактный виджет прогресса
  const percentage =
    totalChaptersCount > 0 ? Math.round((completedChaptersCount / totalChaptersCount) * 100) : 0;
  const progressBarFill = $('#plan-progress-bar-fill');
  const progressText = $('#plan-progress-text');
  if (progressBarFill) {
    progressBarFill.style.width = `${percentage}%`;
  }
  if (progressText) {
    progressText.textContent = `Изучено автоматически: ${completedChaptersCount} из ${totalChaptersCount} глав (${percentage}%)`;
  }

  // При изменении чекбоксов (ручной выбор) динамически обновляем процент
  container.querySelectorAll('.chapter-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checkedCount = container.querySelectorAll('.chapter-checkbox:checked').length;
      const pct =
        totalChaptersCount > 0 ? Math.round((checkedCount / totalChaptersCount) * 100) : 0;
      if (progressBarFill) progressBarFill.style.width = `${pct}%`;
      if (progressText) {
        progressText.textContent = `Изучено: ${checkedCount} из ${totalChaptersCount} глав (${pct}%)`;
      }
    });
  });
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

  // CONTENT_INDEX гарантированно заполнен после loadLessons().
  // Полные данные (LESSONS) используются только в getHeuristicAdvice (через ensureLesson).
  const chaptersSource = CONTENT_INDEX;
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
 * Показывает диалог выбора при истёкшем дедлайне.
 * Предлагает два варианта: сдвинуть дедлайн или повысить нагрузку.
 *
 * @param {Object} expiredResult - результат recalcPlan с deadlineExpired: true
 * @param {Object} state         - глобальное состояние
 * @param {Function} save        - функция сохранения
 * @param {number[]} completedChapters
 */
function showDeadlineExpiredDialog(expiredResult, state, save, completedChapters) {
  const warning = $('#plan-warning');
  if (!warning) return;

  warning.innerHTML = `
    <div class="deadline-expired-dialog">
      <p class="deadline-expired-title">⏰ Дедлайн <strong>${expiredResult.expiredDeadline}</strong> истёк!</p>
      <p class="deadline-expired-subtitle">Выберите, как продолжить:</p>
      <div class="deadline-expired-options">
        ${expiredResult.options
          .map(
            (opt) => `
          <button
            class="deadline-option-btn"
            data-option-type="${opt.type}"
            data-params='${JSON.stringify(opt.params)}'
          >${opt.label}</button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
  warning.classList.remove('hidden');

  // Обработчики кнопок выбора
  warning.querySelectorAll('.deadline-option-btn').forEach((btn) => {
    btn.onclick = () => {
      const params = JSON.parse(btn.dataset.params);
      const newPlan = StudyPlan.generatePlan(params, CONTENT_INDEX, completedChapters);

      if (newPlan.error) {
        showPlanWarning(newPlan.error);
        return;
      }

      newPlan.completedChapters = completedChapters;
      state.studyPlan = newPlan;
      save();
      warning.classList.add('hidden');
      renderPlanView(state);
      toast('План пересчитан! 🔄', { duration: 3000 });
    };
  });

  // Автоскрытие через 30 сек
  setTimeout(() => {
    warning.classList.add('hidden');
  }, 30000);
}

/**
 * Отобразить сгенерированный план
 * @param {Object} state - Глобальное состояние приложения
 */
function renderPlanView(state) {
  const formContainer = $('#plan-form-container');
  const viewContainer = $('#plan-view-container');
  const generateBtn = $('#plan-generate-btn');
  const planControls = $('#plan-controls');

  if (!state.studyPlan || state.studyPlan.error) {
    if (formContainer) formContainer.classList.remove('hidden');
    if (viewContainer) viewContainer.classList.add('hidden');
    if (generateBtn) generateBtn.classList.remove('hidden');
    if (planControls) planControls.classList.add('hidden');
    return;
  }

  if (formContainer) formContainer.classList.add('hidden');
  if (generateBtn) generateBtn.classList.add('hidden');
  if (viewContainer) {
    viewContainer.classList.remove('hidden');
    viewContainer.classList.toggle('plan-paused', !!state.studyPlan.paused);
  }

  if (planControls) {
    planControls.classList.remove('hidden');
    const pauseBtn = $('#plan-pause-btn');
    if (pauseBtn) {
      pauseBtn.innerHTML = state.studyPlan.paused ? '▶️ Возобновить' : '⏸️ Приостановить';
    }
  }

  renderPlanTimeline(state.studyPlan, viewContainer, state);
}

/**
 * Отобразить план обучения с виджетом "План на сегодня", таймлайном, календарём и советами
 * @param {Object} plan - Объект плана обучения
 * @param {HTMLElement} container - Контейнер для рендеринга
 * @param {Object} [state] - Глобальное состояние (для FSRS + mastery в renderTodayPlan)
 */
function renderPlanTimeline(plan, container, state) {
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
    const todayWidget = renderTodayPlan(plan, state);
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
      // Ленивая подгрузка полного урока для получения words/grammar (getHeuristicAdvice)
      card.onclick = () => {
        const chapterId = parseInt(card.dataset.chapterId);
        if (!chapterId) return;
        const chaptersSource = CONTENT_INDEX;
        const segment = plan.segments.find((s) => s.chapterId === chapterId);
        if (segment) {
          ensureLesson(chapterId)
            .then(({ lesson }) => {
              renderAdvice(lesson, segment.days);
              $('#plan-advice-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            })
            .catch(() => {
              const chapterData = chaptersSource.find((c) => c.id === chapterId);
              if (chapterData) renderAdvice(chapterData, segment.days);
            });
        }
      };
    });
  }

  // 3. Рендерим календарную сетку
  if (calendarGrid) {
    renderPlanCalendar(plan);
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
    // CONTENT_INDEX гарантированно заполнен после loadLessons()
    const chaptersSource = CONTENT_INDEX.length > 0 ? CONTENT_INDEX : LESSONS;
    const activeSegment = plan.segments.find(
      (s) => s.type === 'chapter' && !plan.completedChapters?.includes(s.chapterId)
    );
    if (activeSegment) {
      const chapterData = chaptersSource.find((c) => c.id === activeSegment.chapterId);
      if (chapterData) {
        // Ленивая подгрузка полного урока для получения words/grammar
        ensureLesson(chapterData.id)
          .then(({ lesson }) => renderAdvice(lesson, activeSegment.days))
          .catch(() => renderAdvice(chapterData, activeSegment.days));
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
  const chaptersSource = CONTENT_INDEX.length > 0 ? CONTENT_INDEX : LESSONS;
  const today = parseDateKey(localDateKey()); // локальная полночь, без UTC-сдвига
  today.setHours(0, 0, 0, 0);

  return plan.segments
    .filter((segment) => segment.type === 'chapter')
    .map((segment) => {
      // parseDateKey: правильный локальный парсинг вместо new Date(string)
      const start = parseDateKey(segment.startDate);
      const end = parseDateKey(segment.endDate);
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

        // Проверяем сохранённый статус из dateStatuses, затем completedChapters
        const todayKey = localDateKey();
        const savedStatus = segment.dateStatuses?.[todayKey];
        if (savedStatus === 'done' || plan.completedChapters?.includes(segment.chapterId)) {
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

      // Сохранённый статус из dateStatuses переопределяет вычисленный
      const storedStatus = segment.dateStatuses?.[localDateKey()];
      let statusText = 'Предстоит';
      let statusClass = 'upcoming';
      let cardClass = '';

      if (storedStatus === 'skipped') {
        statusText = 'Пропущено';
        statusClass = 'skipped';
        cardClass = 'skipped';
      } else if (storedStatus === 'rescheduled') {
        statusText = 'Перенесено';
        statusClass = 'rescheduled';
        cardClass = 'rescheduled';
      } else if (isDone) {
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

      const startStr = formatDate(parseDateKey(segment.startDate));
      const endStr = formatDate(parseDateKey(segment.endDate));

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
 * Рендер виджета "План на сегодня" с FSRS-контекстом.
 * @param {Object} plan  - объект плана
 * @param {Object} state - глобальное состояние (для FSRS + mastery)
 * @returns {string} HTML виджета
 */
function renderTodayPlan(plan, state) {
  const today = localDateKey();
  const todayDate = parseDateKey(today);
  todayDate.setHours(0, 0, 0, 0);

  // FSRS-контекст: due-карточки + mastery + режим сессии
  const ctx = state
    ? StudyPlan.getDailyPlanContext(plan, state.srs || {}, state.masteryArchive || {})
    : null;

  // Найти сегмент на сегодня (assignedDates-формат или диапазон)
  const todaySegment =
    ctx?.activeSegment ||
    plan.segments.find((segment) => {
      if (segment.assignedDates) return segment.assignedDates.includes(today);
      const start = parseDateKey(segment.startDate);
      const end = parseDateKey(segment.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return todayDate >= start && todayDate <= end;
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

  // Основной совет на основе типа задания
  const advice =
    todaySegment.type === 'chapter' && todaySegment.chapterId
      ? 'Сконцентрируйтесь на понимании грамматики и практике новых слов.'
      : 'Повторите карточки и пройдите квиз для закрепления материала.';

  // FSRS-блоки: предупреждение о много дю и низком mastery
  const dueWarning =
    ctx && ctx.dueCount > 5
      ? `<p class="plan-due-warning">⚠️ ${ctx.dueCount} карточек к повторению — начните с них!</p>`
      : '';

  const masteryHint =
    ctx && ctx.shouldSlowDown
      ? `<p class="plan-mastery-hint">🐢 Mastery низкий (${Math.round(ctx.chapterMastery.avgScore)}%) — замедлитесь, закрепите текущий материал</p>`
      : '';

  return `
    <div class="plan-today-card">
      <div class="plan-today-header">
        <h3 class="plan-today-title">📅 План на сегодня</h3>
        <span class="plan-today-date">${formatDate(todayDate)}</span>
      </div>
      ${dueWarning}${masteryHint}
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

// Глобальное состояние месяца для календаря плана (выносим наружу чтобы сохранялось при перерендерах)
let planHeatmapMonth = new Date();

/**
 * Вспомогательная функция для форматирования месяца и года
 */
function monthLabel(date) {
  const months = [
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
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Рендер календаря с планом обучения в виде Heatmap
 * @param {Object} plan - Объект плана обучения
 */
function renderPlanCalendar(plan) {
  const grid = $('#plan-heatmap-grid');
  const label = $('#plan-heatmap-month-label');
  const legend = $('#plan-heatmap-legend');

  if (!grid || !label) return;
  grid.innerHTML = '';
  label.textContent = monthLabel(planHeatmapMonth);

  const year = planHeatmapMonth.getFullYear();
  const month = planHeatmapMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayDate = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  // Собираем карту дней из плана
  const dateMap = new Map();
  if (plan && plan.segments) {
    plan.segments
      .filter((segment) => segment.type === 'chapter')
      .forEach((segment) => {
        const dates = segment.assignedDates || getDateRange(segment.startDate, segment.endDate);
        dates.forEach((dateKey) => {
          const info = `Глава ${segment.chapterId}`;
          dateMap.set(dateKey, { dateKey, info, type: segment.type, chapterId: segment.chapterId });
        });
      });
  }

  // Подсчитываем статистику для легенды за выбранный месяц
  let chaptersCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const key = `${year}-${mm}-${dd}`;
    const planItem = dateMap.get(key);
    if (planItem && planItem.type === 'chapter') {
      chaptersCount++;
    }
  }

  // Обновляем легенду
  if (legend) {
    legend.innerHTML = `
      <div class="heatmap-legend-item">
        <div class="heatmap-legend-dot" style="background:var(--ok)"></div>
        <span>${chaptersCount} дн. изучения глав</span>
      </div>
    `;
  }

  // Первый день месяца (Пн = 0, Вт = 1, ..., Вс = 6)
  let firstDay = new Date(year, month, 1).getDay();
  firstDay = firstDay === 0 ? 6 : firstDay - 1;

  // Пустые ячейки до первого дня
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'heatmap-day heatmap-empty';
    grid.appendChild(empty);
  }

  // Заполняем дни месяца
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const key = `${year}-${mm}-${dd}`;
    const planItem = dateMap.get(key);

    const cell = document.createElement('div');
    cell.className = 'heatmap-day';
    cell.style.flexDirection = 'column'; // Чтобы текст был под цифрой
    cell.style.gap = '2px';

    const dayNumber = document.createElement('span');
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    // Проверяем, является ли этот день сегодняшним
    const isToday = day === todayDate && month === todayMonth && year === todayYear;

    if (isToday) {
      cell.classList.add('today');
    }

    if (planItem) {
      // Подсвечиваем цветом главы
      cell.style.backgroundColor = 'var(--ok)';
      cell.style.color = '#fff';
      cell.title = planItem.info;

      const infoText = document.createElement('span');
      infoText.style.fontSize = '8px';
      infoText.style.lineHeight = '1';
      infoText.style.fontWeight = '500';
      infoText.style.opacity = '0.9';
      infoText.textContent = `Гл. ${planItem.chapterId}`;
      cell.appendChild(infoText);

      // Клик по ячейке с планом
      cell.onclick = (e) => {
        e.stopPropagation();
        if (!planItem.chapterId) return;
        const chaptersSource = LESSONS.length > 0 ? LESSONS : CONTENT_INDEX;
        const chapterData = chaptersSource.find((c) => c.id === planItem.chapterId);
        const segment = plan.segments.find((s) => s.chapterId === planItem.chapterId);
        if (chapterData && segment) {
          renderAdvice(chapterData, segment.days);
          $('#plan-advice-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
    } else {
      cell.title = 'Нет занятий';
      // Если день в прошлом и не today, немного гасим (как в future)
      const cellDate = new Date(year, month, day);
      if (cellDate < today && !isToday) {
        cell.style.opacity = '0.5';
      } else if (cellDate > today) {
        cell.classList.add('future');
      }
    }

    grid.appendChild(cell);
  }

  // Обработчики кнопок навигации месяцев (навешиваем один раз, поэтому проверяем)
  const prevBtn = $('#plan-heatmap-prev');
  const nextBtn = $('#plan-heatmap-next');
  if (prevBtn && !prevBtn.onclick) {
    prevBtn.onclick = () => {
      planHeatmapMonth.setMonth(planHeatmapMonth.getMonth() - 1);
      renderPlanCalendar(plan);
    };
  }
  if (nextBtn && !nextBtn.onclick) {
    nextBtn.onclick = () => {
      planHeatmapMonth.setMonth(planHeatmapMonth.getMonth() + 1);
      renderPlanCalendar(plan);
    };
  }
}

/**
 * Вспомогательная функция для обратной совместимости со старыми планами (без assignedDates).
 * Использует parseDateKey — нет UTC-сдвига.
 */
function getDateRange(startDate, endDate) {
  const dates = [];
  const current = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  while (current <= end) {
    dates.push(localDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
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
