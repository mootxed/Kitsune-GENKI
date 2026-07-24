/* ui/chapter.js — Chapter screen */
import { save, chState } from '../state/store.js';
import { refreshStreakDisplay } from './shared.js';
import { $, $$ } from '../src/utils.js';
import { allCards, dueCards } from '../src/srs-helpers.js';
import { XP_CHECK, XP_CHAPTER_FULL, addXP } from '../src/xp-system.js';
import {
  CHECK_ITEMS,
  CONTENT_INDEX,
  getLesson,
  ensureLesson,
  startChapter,
  markActivity,
} from './home.js';
import { countAvailableCardsForSession } from '../src/srs-limits.js';
import { StudyPlan } from '../studyplan.js';
import { completeChapter, getChapterProgress, setChapterSection } from '../src/chapter-progress.js';

// ---------- Render: Chapter ----------
export async function renderChapter(id, state, dependencies) {
  // Лениво подгружаем контент главы перед отображением
  try {
    await ensureLesson(id);
  } catch (e) {
    console.error('Не удалось загрузить главу:', e);
  }
  const l = getLesson(id);
  const toast = dependencies?.toast || window.toast || (() => {});
  if (!l) {
    toast('Глава не найдена');
    window.nav('home');
    return;
  }

  const cs = chState(id);
  const progress = getChapterProgress(state, id, l);

  $('#chapter-title').textContent = `Глава ${id}: ${l.title}`;
  $('#chapter-jp').textContent = l.jp || '';

  const body = $('#chapter-body');
  const items = progress.totalCount;
  const done = progress.completedCount;
  const total = allCards(state.srs, id).length;
  const due = countAvailableCardsForSession(dueCards(state.srs, id), state.srs);

  const isPriorKnowledge = progress.completionSource === 'prior-knowledge';

  let startBlock;
  if (cs.started || progress.completionSource === 'app') {
    startBlock = `<div class="card srs-mini">
         <div class="m"><b>${total}</b><span>карточек</span></div>
         <div class="m due"><b>${due}</b><span>к повтору</span></div>
         <button class="btn-study-sm" id="ch-study" ${due === 0 ? 'disabled' : ''} data-testid="chapter-study-btn">Учить →</button>
       </div>`;
  } else if (isPriorKnowledge) {
    const studyBtnText = due > 0 ? 'Повторять слова →' : 'Учить слова →';
    const hasCards = total > 0;
    startBlock = `<div class="card srs-mini prior-knowledge-banner">
         <div class="row-between" style="width:100%;margin-bottom:12px">
           <span class="badge prior-knowledge-badge" data-testid="prior-knowledge-badge" style="background:var(--accent-light, #e0e7ff);color:var(--accent-dark, #3730a3);padding:4px 8px;border-radius:6px;font-weight:600;font-size:13px">📚 Изучено ранее</span>
           <small class="muted">Вы отметили эту главу как изученную ранее</small>
         </div>
         <div class="row-between" style="width:100%;align-items:center">
           <div class="m"><b>${total}</b><span>карточек</span></div>
           <div class="m due"><b>${due}</b><span>доступно сейчас</span></div>
           ${
             hasCards
               ? `<button class="btn-study-sm" id="ch-study" data-testid="chapter-study-btn">${studyBtnText}</button>`
               : `<button class="btn-study-sm" id="ch-reconcile-srs" data-testid="reconcile-srs-btn">Добавить слова в SRS</button>`
           }
         </div>
       </div>`;
  } else {
    startBlock = `<button class="btn-primary" id="ch-start" data-testid="start-chapter-btn">▶ Начать главу</button>
       <p class="muted" style="text-align:center;margin:10px 0 18px;font-size:13px">Слова и грамматика заблокированы до старта главы 🔒</p>`;
  }

  const rawCategories = Array.isArray(l.words) ? l.words.map((w) => w?.category) : [];
  const validCategories = [
    ...new Set(rawCategories.filter((c) => Boolean(c) && c !== 'undefined')),
  ].slice(0, 8);
  const tagsHtml =
    validCategories.length > 0
      ? validCategories.map((c) => `<span class="tag">${c}</span>`).join('')
      : '<span class="muted" style="font-size:13px">Темы не указаны</span>';

  body.innerHTML = `
    <div class="card">
      <div class="row-between"><span class="card-h" style="margin:0">Прогресс</span><b style="color:var(--orange)" data-testid="chapter-progress-text">${done}/${items}</b></div>
      <div class="prog-dash">
        <i class="segment ${done >= 1 ? 'active' : ''}"></i>
        <i class="segment ${done >= 2 ? 'active' : ''}"></i>
        <i class="segment ${done >= 3 ? 'active' : ''}"></i>
        <i class="segment ${done >= 4 ? 'active' : ''}"></i>
        <i class="segment ${done >= 5 ? 'active' : ''}"></i>
      </div>
    </div>
    ${startBlock}
    <div class="card">
      <h3 class="card-h">Чек-лист главы</h3>
      ${CHECK_ITEMS.map((c) => {
        const checked = isPriorKnowledge || !!cs.checklist[c[0]];
        const locked = !cs.started && !progress.completed;
        return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''}" data-check="${c[0]}" data-testid="check-${c[0]}">
          <div class="checkbox">${checked ? '✓' : ''}</div>
          <span class="check-label">${c[1]}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <h3 class="card-h">Ключевые темы</h3>
      <div class="tag-row">${tagsHtml}</div>
    </div>`;

  if ($('#ch-study')) {
    $('#ch-study').onclick = () => {
      let chapterCards = dueCards(state.srs, id);
      if (chapterCards.length === 0) {
        chapterCards = allCards(state.srs, id);
      }
      if (chapterCards.length === 0) {
        toast('Нет карточек к повторению');
        return;
      }
      if (dependencies?.startChapterFlashcards) {
        dependencies.startChapterFlashcards(id, chapterCards);
      } else if (window.nav) {
        window.nav('srs');
      }
    };
  }

  if ($('#ch-reconcile-srs')) {
    $('#ch-reconcile-srs').onclick = async () => {
      try {
        const { ensureChapterVocabularyCards } = await import('../src/chapter-vocabulary.js');
        const entry = await ensureLesson(id);
        if (entry && entry.lesson) {
          ensureChapterVocabularyCards(state, entry.lesson);
          await save(true);
          toast('Слова главы добавлены в SRS');
        }
      } catch (err) {
        toast('Ошибка при загрузке карточек главы');
      }
      await renderChapter(id, state, dependencies);
    };
  }

  if ($('#ch-start')) {
    $('#ch-start').onclick = () => {
      startChapter(id, toast);
      renderChapter(id, state, dependencies);
      dependencies?.renderHome?.();
    };
  }

  $$('#chapter-body .check-item').forEach((el) => {
    el.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isPriorKnowledge) return;

      if (!cs.started) {
        startChapter(id, toast);
      }

      const k = el.dataset.check;
      const wasCompleted = cs.checklist[k] === true;
      const sectionResult = setChapterSection(state, id, k, !wasCompleted, {
        chapters: CONTENT_INDEX,
      });
      if (!sectionResult.changed) return;

      if (wasCompleted) {
        state.xp = Math.max(0, state.xp - XP_CHECK);
        toast(`❌ Отметка снята, -${XP_CHECK} XP`);
      } else {
        addXP(XP_CHECK, state);
        toast(`+${XP_CHECK} XP за чек-лист!`);

        if (sectionResult.completedNow) {
          const completion = completeChapter(state, id, {
            chapters: CONTENT_INDEX,
            recalculatePlan: StudyPlan.recalculateFuturePlan,
          });
          if (completion.rewardGranted) {
            addXP(XP_CHAPTER_FULL, state);
            toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
          }
        }
      }

      await save(true);
      markActivity(toast);
      refreshStreakDisplay();
      await renderChapter(id, state, dependencies);
      dependencies?.renderHome?.();
    };
  });
}
