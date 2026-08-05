import { nav } from './router.js';
import { setSafeHTML } from '../src/security-helpers.js';
import { $, $$, escapeHtml } from '../src/utils.js';
import { save } from '../state/store.js';
import { getOnboardingDraft, updateOnboardingDraft } from '../src/onboarding-state.js';
import {
  buildStudyPlanContentCatalog,
  previewStudyPlanFromPreferences,
  commitStudyPlanFromPreferences,
} from '../src/study-plan-creation.js';
import { CONTENT_INDEX } from './home.js';
import { loadSupplementalPracticeData } from '../src/supplemental-practice.js';
import { addLocalDays, getTodayDateKey } from '../src/local-date.js';
import {
  canonicalLessonId,
  compareLessonIds,
  formatLessonLabel,
  sameLessonId,
} from '../src/courses/course-context.js';

export function setAppChromeVisibility({ tabbar = true, header = true } = {}) {
  const tabbarEl = document.querySelector('.tabbar');
  if (tabbarEl) {
    tabbarEl.style.display = tabbar ? '' : 'none';
  }
  const headerEl = document.querySelector('.app-header');
  if (headerEl) {
    headerEl.style.display = header ? '' : 'none';
  }
}

const TOTAL_STEPS = 7;
const WEEKDAY_LABELS = [
  { id: 1, label: 'Пн' },
  { id: 2, label: 'Вт' },
  { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' },
  { id: 5, label: 'Пт' },
  { id: 6, label: 'Сб' },
  { id: 0, label: 'Вс' },
];

export async function renderOnboarding(state, dependencies = {}) {
  setAppChromeVisibility({ tabbar: false, header: false });

  const container = $('#onboarding-container') || $('#app');
  if (!container) return;

  let currentStep = state?.onboarding?.currentStep || 1;
  if (currentStep < 1 || currentStep > TOTAL_STEPS) currentStep = 1;

  const courseLessons = CONTENT_INDEX.filter((lesson) => lesson?.id);
  const entryLessonId = courseLessons[0]?.id || null;
  const defaultDraft = {
    startChapterId: entryLessonId,
    priorKnowledgeChapterIds: [],
    startDate: getTodayDateKey(),
    studyDays: [1, 2, 3, 4, 5, 6, 0],
    targetType: 'pace',
    targetValue: null,
    dailyCapacityMinutes: 30,
    workbookSettings: {
      enabled: true,
      includeConversationGrammar: true,
      includeReadingWriting: true,
    },
  };

  const draft = { ...defaultDraft, ...(getOnboardingDraft(state) || {}) };

  let workbookData = null;
  try {
    workbookData = await loadSupplementalPracticeData();
  } catch (e) {
    console.warn('[Onboarding] Ошибка загрузки Workbook metadata:', e);
  }

  function renderStep() {
    const progressPercent = Math.round((currentStep / TOTAL_STEPS) * 100);

    let stepHtml = '';

    if (currentStep === 1) {
      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 1 из 7</div>
          <h2 class="onboarding-title">Добро пожаловать в KotoKitsu 🦊</h2>
          <p class="onboarding-desc">
            Приложение поможет пройти курс японского языка постепенно и эффективно:
          </p>
          <ul class="onboarding-features-list">
            <li>✨ Новые слова небольшими порциями</li>
            <li>🧠 Повторения по алгоритму FSRS</li>
            <li>📚 Грамматика строго по порядку</li>
            <li>📝 Дополнительная грамматическая практика</li>
          </ul>
          <p class="onboarding-subtext">Давайте настроим ваш персональный учебный план.</p>
          <div class="onboarding-actions">
            <button class="btn-primary btn-lg" id="ob-next" data-testid="onboarding-start-btn">Начать настройку →</button>
          </div>
        </div>
      `;
    } else if (currentStep === 2) {
      const isCustom = draft.priorKnowledgeMode === 'custom';
      const sortedPriorIds = [...(draft.priorKnowledgeChapterIds || [])].sort(compareLessonIds);
      const lastPriorId = sortedPriorIds.at(-1) || '';

      let selectOptionsHtml = `<option value="" ${!lastPriorId ? 'selected' : ''}>Начинаю с первого урока</option>`;
      courseLessons.forEach((lesson) => {
        const selected = sameLessonId(lastPriorId, lesson.id) ? 'selected' : '';
        selectOptionsHtml += `<option value="${lesson.id}" ${selected}>До «${lesson.title || formatLessonLabel(lesson.id)}» включительно</option>`;
      });

      let manualCheckboxesHtml = '';
      for (const lesson of courseLessons) {
        const checked = draft.priorKnowledgeChapterIds.some((id) => sameLessonId(id, lesson.id))
          ? 'checked'
          : '';
        manualCheckboxesHtml += `
          <label class="checkbox-option-inline">
            <input type="checkbox" class="manual-ch-cb" value="${lesson.id}" ${checked} />
            <span>${lesson.title || formatLessonLabel(lesson.id)}</span>
          </label>
        `;
      }

      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 2 из 7</div>
          <h2 class="onboarding-title">С какой главы вы начинаете?</h2>
          <p class="onboarding-desc">Отметьте уже изученный ранее материал (он не будет входить в план создания новых тем).</p>

          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label" style="display:block;margin-bottom:8px;font-weight:600;">Исходный уровень:</label>
            <select id="ob-prior-preset" class="form-control" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border,#ccc);">
              ${selectOptionsHtml}
            </select>
          </div>

          <details ${isCustom ? 'open' : ''} style="margin-top:12px;margin-bottom:16px;">
            <summary style="cursor:pointer;color:var(--orange,#ff9800);font-weight:500;">Расширенный выбор глав вручную</summary>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px;">
              ${manualCheckboxesHtml}
            </div>
          </details>

          <div class="onboarding-actions row-between">
            <button class="btn-secondary" id="ob-back">← Назад</button>
            <button class="btn-primary" id="ob-next">Далее →</button>
          </div>
        </div>
      `;
    } else if (currentStep === 3) {
      const today = getTodayDateKey();
      const tomorrow = addLocalDays(today, 1);
      const selDate = draft.startDate || today;

      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 3 из 7</div>
          <h2 class="onboarding-title">Когда начать обучение?</h2>
          <p class="onboarding-desc">Выберите дату первого учебного дня.</p>

          <div class="radio-group-vertical" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
            <label class="radio-card ${selDate === today ? 'active' : ''}">
              <input type="radio" name="start_date_type" value="${today}" ${selDate === today ? 'checked' : ''} />
              <div>
                <b>Сегодня</b> (${today})
              </div>
            </label>

            <label class="radio-card ${selDate === tomorrow ? 'active' : ''}">
              <input type="radio" name="start_date_type" value="${tomorrow}" ${selDate === tomorrow ? 'checked' : ''} />
              <div>
                <b>Завтра</b> (${tomorrow})
              </div>
            </label>

            <label class="radio-card ${selDate !== today && selDate !== tomorrow ? 'active' : ''}">
              <input type="radio" name="start_date_type" value="custom" ${selDate !== today && selDate !== tomorrow ? 'checked' : ''} />
              <div>
                <b>Выбрать другую дату:</b>
                <input type="date" id="ob-custom-date" value="${selDate}" min="${today}" style="margin-top:4px;padding:6px;border-radius:6px;border:1px solid #ccc;width:100%;" />
              </div>
            </label>
          </div>

          <div class="onboarding-actions row-between">
            <button class="btn-secondary" id="ob-back">← Назад</button>
            <button class="btn-primary" id="ob-next">Далее →</button>
          </div>
        </div>
      `;
    } else if (currentStep === 4) {
      const selectedDays = new Set(draft.studyDays || []);

      let weekdaysHtml = '';
      for (const day of WEEKDAY_LABELS) {
        const checked = selectedDays.has(day.id) ? 'checked' : '';
        weekdaysHtml += `
          <label class="day-toggle-pill ${checked ? 'active' : ''}">
            <input type="checkbox" class="ob-day-cb" value="${day.id}" ${checked} />
            <span>${day.label}</span>
          </label>
        `;
      }

      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 4 из 7</div>
          <h2 class="onboarding-title">В какие дни вы будете заниматься?</h2>
          <p class="onboarding-desc">Выберите удобное расписание занятий.</p>

          <div class="preset-buttons-row" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
            <button class="btn-sm btn-outline" id="preset-all">Каждый день</button>
            <button class="btn-sm btn-outline" id="preset-weekdays">По будням</button>
            <button class="btn-sm btn-outline" id="preset-3x">3 раза в неделю</button>
          </div>

          <div class="weekdays-selector-grid" style="display:flex;gap:8px;justify-content:space-between;margin-bottom:16px;">
            ${weekdaysHtml}
          </div>

          <div id="ob-days-error" style="color:var(--red,#e53935);font-size:13px;margin-bottom:10px;display:none;">Выберите хотя бы один день!</div>

          <div class="onboarding-actions row-between">
            <button class="btn-secondary" id="ob-back">← Назад</button>
            <button class="btn-primary" id="ob-next">Далее →</button>
          </div>
        </div>
      `;
    } else if (currentStep === 5) {
      const targetType = draft.targetType || 'pace';
      const targetVal = draft.targetValue || '';

      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 5 из 7</div>
          <h2 class="onboarding-title">Как определить длительность курса?</h2>
          <p class="onboarding-desc">Выберите подходящий ориентир по времени.</p>

          <div class="radio-group-vertical" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
            <label class="radio-card ${targetType === 'pace' ? 'active' : ''}">
              <input type="radio" name="target_type" value="pace" ${targetType === 'pace' ? 'checked' : ''} />
              <div>
                <b>Рекомендуемый темп</b>
                <p class="muted" style="font-size:12px;margin:2px 0 0;">Приложение само вычислит оптимальный срок на основе объёма курса.</p>
              </div>
            </label>

            <label class="radio-card ${targetType === 'deadline' ? 'active' : ''}">
              <input type="radio" name="target_type" value="deadline" ${targetType === 'deadline' ? 'checked' : ''} />
              <div>
                <b>Закончить к определённой дате</b>
                <input type="date" id="ob-target-date" value="${targetType === 'deadline' ? targetVal : ''}" min="${getTodayDateKey()}" style="margin-top:6px;padding:6px;border-radius:6px;border:1px solid #ccc;width:100%;" />
              </div>
            </label>

            <label class="radio-card ${targetType === 'days' ? 'active' : ''}">
              <input type="radio" name="target_type" value="days" ${targetType === 'days' ? 'checked' : ''} />
              <div>
                <b>Определённое число учебных дней</b>
                <input type="number" id="ob-target-days" value="${targetType === 'days' ? targetVal : ''}" min="10" max="365" placeholder="Например: 60" style="margin-top:6px;padding:6px;border-radius:6px;border:1px solid #ccc;width:100%;" />
              </div>
            </label>
          </div>

          <div class="onboarding-actions row-between">
            <button class="btn-secondary" id="ob-back">← Назад</button>
            <button class="btn-primary" id="ob-next">Далее →</button>
          </div>
        </div>
      `;
    } else if (currentStep === 6) {
      const cap = draft.dailyCapacityMinutes || 30;
      const wb = draft.workbookSettings || {
        enabled: true,
        includeConversationGrammar: true,
        includeReadingWriting: true,
      };

      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 6 из 7</div>
          <h2 class="onboarding-title">Сколько времени вы готовы заниматься?</h2>
          <p class="onboarding-desc">Укажите желаемое дневное время на новый материал и практику.</p>

          <div class="capacity-buttons-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
            <button class="btn-capacity ${cap === 15 ? 'active' : ''}" data-val="15">15 мин</button>
            <button class="btn-capacity ${cap === 30 ? 'active' : ''}" data-val="30">30 мин ⭐</button>
            <button class="btn-capacity ${cap === 45 ? 'active' : ''}" data-val="45">45 мин</button>
            <button class="btn-capacity ${cap === 60 ? 'active' : ''}" data-val="60">60 мин</button>
          </div>

          <div class="card-nested" style="padding:12px;background:rgba(0,0,0,0.03);border-radius:10px;margin-bottom:16px;">
            <h4 style="margin:0 0 8px;font-size:14px;">Интеграция дополнительной практики:</h4>

            <label class="checkbox-option-block" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <input type="checkbox" id="wb-enabled" ${wb.enabled !== false ? 'checked' : ''} />
              <b>Включить дополнительную практику</b>
            </label>

            <div id="wb-sub-options" style="margin-left:24px;display:${wb.enabled !== false ? 'block' : 'none'};">
              <label class="checkbox-option-block" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;">
                <input type="checkbox" id="wb-cg" ${wb.includeConversationGrammar !== false ? 'checked' : ''} />
                <span>Грамматические задания</span>
              </label>

              <label class="checkbox-option-block" style="display:flex;align-items:center;gap:8px;font-size:13px;">
                <input type="checkbox" id="wb-rw" ${wb.includeReadingWriting !== false ? 'checked' : ''} />
                <span>Чтение и письмо</span>
              </label>
            </div>
            <p class="muted" style="font-size:11px;margin:8px 0 0;">Дополнительная практика включает расширенные грамматические упражнения по темам.</p>
          </div>

          <div class="onboarding-actions row-between">
            <button class="btn-secondary" id="ob-back">← Назад</button>
            <button class="btn-primary" id="ob-next">Далее →</button>
          </div>
        </div>
      `;
    } else if (currentStep === 7) {
      const catalog = buildStudyPlanContentCatalog(
        CONTENT_INDEX,
        workbookData,
        draft.workbookSettings
      );
      const preview = previewStudyPlanFromPreferences(draft, catalog, { state });

      let summaryHtml = '';
      if (!preview.valid) {
        summaryHtml = `<div class="card-warning" style="padding:12px;color:var(--red);margin-bottom:14px;">Ошибка параметров: ${escapeHtml((preview.errors || []).join(', '))}</div>`;
      } else {
        const studyDaysText = (draft.studyDays || [])
          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
          .map((id) => WEEKDAY_LABELS.find((w) => w.id === id)?.label)
          .join(', ');

        const wbStatusText =
          draft.workbookSettings?.enabled === false
            ? 'Отключена'
            : draft.workbookSettings?.includeReadingWriting !== false
              ? 'Включена (Грамматика, Чтение, Письмо)'
              : 'Включена (Грамматические задания)';

        let warningBanner = '';
        if (preview.warnings?.length > 0) {
          let recsHtml = '';
          for (const rec of preview.recommendations || []) {
            recsHtml += `<button class="btn-sm btn-outline rec-btn" data-rec-type="${escapeHtml(rec.type)}" style="margin:4px 4px 0 0;">${escapeHtml(rec.label)}</button>`;
          }

          const safeWarnings = (preview.warnings || []).map((w) => escapeHtml(w)).join('<br>');
          warningBanner = `
            <div class="card-warning" style="padding:12px;background:rgba(255,152,0,0.1);border-left:3px solid var(--orange);border-radius:8px;margin-bottom:14px;font-size:13px;">
              <b>⚠️ Обратите внимание:</b>
              <p style="margin:4px 0 8px;">${safeWarnings}</p>
              ${recsHtml ? `<div><b>Рекомендуемые решения:</b><br>${recsHtml}</div>` : ''}
              ${
                preview.isTight
                  ? `
                <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" id="ob-accept-deadline" ${draft.acceptRecommendedDeadline ? 'checked' : ''} data-testid="accept-recommended-deadline-checkbox">
                  <span>Я согласен использовать рекомендуемый реалистичный срок — ${escapeHtml(preview.recommendedTargetDate)}</span>
                </label>
              `
                  : ''
              }
            </div>
          `;
        }

        summaryHtml = `
          <div class="plan-summary-box" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
            <div class="row-between"><span>Начало обучения:</span><b>${escapeHtml(draft.startDate)}</b></div>
            <div class="row-between"><span>Учебные дни:</span><b>${escapeHtml(studyDaysText || 'Не выбраны')}</b></div>
            <div class="row-between"><span>Дневная нагрузка:</span><b>${escapeHtml(draft.dailyCapacityMinutes)} минут</b></div>
            <div class="row-between"><span>Стартовый урок:</span><b>${escapeHtml(formatLessonLabel(draft.startChapterId || entryLessonId))}</b></div>
            <div class="row-between"><span>Дополнительная практика:</span><b>${escapeHtml(wbStatusText)}</b></div>
            <div class="row-between"><span>Количество учебных дней:</span><b>${escapeHtml(preview.requiredStudyDays)} дней</b></div>
            <div class="row-between" style="border-top:1px dashed #ccc;padding-top:6px;margin-top:2px;">
              <span style="font-weight:600;">Примерное завершение:</span>
              <b style="color:var(--orange,#ff9800);font-size:15px;">${escapeHtml(preview.estimatedCompletionDate)}</b>
            </div>
          </div>
          ${warningBanner}
        `;
      }

      stepHtml = `
        <div class="onboarding-card card">
          <div class="onboarding-badge">Шаг 7 из 7</div>
          <h2 class="onboarding-title">Проверка Учебного Плана</h2>
          <p class="onboarding-desc">Проверьте сводку вашего учебного плана перед его созданием.</p>

          ${summaryHtml}

          <div class="onboarding-actions row-between">
            <button class="btn-secondary" id="ob-back">← Назад</button>
            <button class="btn-primary btn-lg" id="ob-commit" ${!preview.valid ? 'disabled' : ''} data-testid="create-plan-btn">Создать план ✨</button>
          </div>
        </div>
      `;
    }

    setSafeHTML(
      container,
      `
      <div class="onboarding-wrapper" style="max-width:480px;margin:0 auto;padding:16px 12px;">
        <div class="onboarding-header-nav" style="margin-bottom:12px;">
          <div class="progress-bar-wrap" style="height:6px;background:rgba(0,0,0,0.1);border-radius:3px;overflow:hidden;">
            <div class="progress-bar-fill" style="width:${progressPercent}%;height:100%;background:var(--orange,#ff9800);transition:width 0.3s ease;"></div>
          </div>
        </div>
        ${stepHtml}
      </div>
    `
    );

    bindEvents();
  }

  function bindEvents() {
    const btnNext = $('#ob-next');
    const btnBack = $('#ob-back');
    const btnCommit = $('#ob-commit');

    if (btnBack) {
      btnBack.onclick = () => {
        if (currentStep > 1) {
          currentStep -= 1;
          updateOnboardingDraft(state, draft, currentStep);
          save(true);
          renderStep();
        }
      };
    }

    if (btnNext) {
      btnNext.onclick = () => {
        if (validateStep(currentStep)) {
          if (currentStep < TOTAL_STEPS) {
            currentStep += 1;
            updateOnboardingDraft(state, draft, currentStep);
            save(true);
            renderStep();
          }
        }
      };
    }

    if (btnCommit) {
      btnCommit.onclick = async () => {
        btnCommit.disabled = true;
        const catalog = buildStudyPlanContentCatalog(
          CONTENT_INDEX,
          workbookData,
          draft.workbookSettings
        );
        const preview = previewStudyPlanFromPreferences(draft, catalog, { state });
        if (preview.valid) {
          const res = commitStudyPlanFromPreferences(state, draft, preview);
          if (res.success) {
            await save(true);
            setAppChromeVisibility({ tabbar: true, header: true });
            nav('home');
          }
        }
      };
    }

    if (currentStep === 2) {
      const presetSel = $('#ob-prior-preset');
      if (presetSel) {
        presetSel.onchange = (e) => {
          const upTo = canonicalLessonId(e.target.value);
          const boundary = courseLessons.findIndex((lesson) => sameLessonId(lesson.id, upTo));
          const priors =
            boundary >= 0 ? courseLessons.slice(0, boundary + 1).map((item) => item.id) : [];
          draft.priorKnowledgeChapterIds = priors;
          draft.startChapterId = courseLessons[boundary + 1]?.id || entryLessonId;
          $$('.manual-ch-cb').forEach((cb) => {
            cb.checked = priors.some((id) => sameLessonId(id, cb.value));
          });
          updateOnboardingDraft(state, draft, currentStep);
        };
      }

      $$('.manual-ch-cb').forEach((cb) => {
        cb.onchange = () => {
          const priors = [];
          $$('.manual-ch-cb:checked').forEach((c) => priors.push(c.value));
          draft.priorKnowledgeChapterIds = priors.sort(compareLessonIds);
          const last = draft.priorKnowledgeChapterIds.at(-1);
          const boundary = courseLessons.findIndex((lesson) => sameLessonId(lesson.id, last));
          draft.startChapterId = courseLessons[boundary + 1]?.id || entryLessonId;
          draft.priorKnowledgeMode = 'custom';
          updateOnboardingDraft(state, draft, currentStep);
        };
      });
    } else if (currentStep === 3) {
      $$('input[name="start_date_type"]').forEach((radio) => {
        radio.onchange = (e) => {
          const val = e.target.value;
          if (val !== 'custom') {
            draft.startDate = val;
          } else {
            const customVal = $('#ob-custom-date')?.value || getTodayDateKey();
            draft.startDate = customVal;
          }
          updateOnboardingDraft(state, draft, currentStep);
        };
      });

      const customDateInput = $('#ob-custom-date');
      if (customDateInput) {
        customDateInput.onchange = (e) => {
          draft.startDate = e.target.value;
          updateOnboardingDraft(state, draft, currentStep);
        };
      }
    } else if (currentStep === 4) {
      $('#preset-all')?.addEventListener('click', () => {
        draft.studyDays = [1, 2, 3, 4, 5, 6, 0];
        updateOnboardingDraft(state, draft, currentStep);
        renderStep();
      });

      $('#preset-weekdays')?.addEventListener('click', () => {
        draft.studyDays = [1, 2, 3, 4, 5];
        updateOnboardingDraft(state, draft, currentStep);
        renderStep();
      });

      $('#preset-3x')?.addEventListener('click', () => {
        draft.studyDays = [1, 3, 5];
        updateOnboardingDraft(state, draft, currentStep);
        renderStep();
      });

      $$('.ob-day-cb').forEach((cb) => {
        cb.onchange = () => {
          const selected = [];
          $$('.ob-day-cb:checked').forEach((c) => selected.push(Number(c.value)));
          draft.studyDays = selected;
          updateOnboardingDraft(state, draft, currentStep);
        };
      });
    } else if (currentStep === 5) {
      $$('input[name="target_type"]').forEach((radio) => {
        radio.onchange = (e) => {
          draft.targetType = e.target.value;
          if (draft.targetType === 'deadline') {
            draft.targetValue = $('#ob-target-date')?.value || null;
          } else if (draft.targetType === 'days') {
            draft.targetValue = Number($('#ob-target-days')?.value) || 60;
          } else {
            draft.targetValue = null;
          }
          updateOnboardingDraft(state, draft, currentStep);
        };
      });

      $('#ob-target-date')?.addEventListener('change', (e) => {
        draft.targetValue = e.target.value;
        updateOnboardingDraft(state, draft, currentStep);
      });

      $('#ob-target-days')?.addEventListener('input', (e) => {
        draft.targetValue = Number(e.target.value) || null;
        updateOnboardingDraft(state, draft, currentStep);
      });
    } else if (currentStep === 6) {
      $$('.btn-capacity').forEach((btn) => {
        btn.onclick = () => {
          draft.dailyCapacityMinutes = Number(btn.dataset.val);
          updateOnboardingDraft(state, draft, currentStep);
          renderStep();
        };
      });

      const wbEnabled = $('#wb-enabled');
      const wbCG = $('#wb-cg');
      const wbRW = $('#wb-rw');

      if (wbEnabled) {
        wbEnabled.onchange = (e) => {
          draft.workbookSettings.enabled = e.target.checked;
          const sub = $('#wb-sub-options');
          if (sub) sub.style.display = e.target.checked ? 'block' : 'none';
          updateOnboardingDraft(state, draft, currentStep);
        };
      }

      if (wbCG) {
        wbCG.onchange = (e) => {
          draft.workbookSettings.includeConversationGrammar = e.target.checked;
          updateOnboardingDraft(state, draft, currentStep);
        };
      }

      if (wbRW) {
        wbRW.onchange = (e) => {
          draft.workbookSettings.includeReadingWriting = e.target.checked;
          updateOnboardingDraft(state, draft, currentStep);
        };
      }
    } else if (currentStep === 7) {
      const acceptCb = $('#ob-accept-deadline');
      if (acceptCb) {
        acceptCb.onchange = (e) => {
          draft.acceptRecommendedDeadline = e.target.checked;
          updateOnboardingDraft(state, draft, currentStep);
          renderStep();
        };
      }

      $$('.rec-btn').forEach((btn) => {
        btn.onclick = () => {
          const type = btn.dataset.recType;
          const catalog = buildStudyPlanContentCatalog(
            CONTENT_INDEX,
            workbookData,
            draft.workbookSettings
          );
          const preview = previewStudyPlanFromPreferences(draft, catalog, { state });
          const rec = preview.recommendations?.find((r) => r.type === type);
          if (rec) {
            if (rec.recommendedDate) {
              draft.targetType = 'deadline';
              draft.targetValue = rec.recommendedDate;
            } else if (rec.studyDays) {
              draft.studyDays = rec.studyDays;
            } else if (rec.dailyCapacityMinutes) {
              draft.dailyCapacityMinutes = rec.dailyCapacityMinutes;
            } else if (rec.workbookSettings) {
              draft.workbookSettings = rec.workbookSettings;
            }
            updateOnboardingDraft(state, draft, currentStep);
            renderStep();
          }
        };
      });
    }
  }

  function validateStep(step) {
    if (step === 4) {
      if (!draft.studyDays || draft.studyDays.length === 0) {
        const errEl = $('#ob-days-error');
        if (errEl) errEl.style.display = 'block';
        return false;
      }
    }
    return true;
  }

  renderStep();
}
