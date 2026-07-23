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
import { completeChapter, setChapterSection } from '../src/chapter-progress.js';

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
  $('#chapter-title').textContent = `Глава ${id}: ${l.title}`;
  $('#chapter-jp').textContent = l.jp || '';

  const body = $('#chapter-body');
  const items = CHECK_ITEMS.length;
  const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
  const total = allCards(state.srs, id).length;
  const due = countAvailableCardsForSession(dueCards(state.srs, id), state.srs);

  const startBlock = cs.started
    ? `<div class="card srs-mini">
         <div class="m"><b>${total}</b><span>карточек</span></div>
         <div class="m due"><b>${due}</b><span>к повтору</span></div>
         <button class="btn-study-sm" id="ch-study" ${due === 0 ? 'disabled' : ''} data-testid="chapter-study-btn">Учить →</button>
       </div>`
    : `<button class="btn-primary" id="ch-start" data-testid="start-chapter-btn">▶ Начать главу</button>
       <p class="muted" style="text-align:center;margin:10px 0 18px;font-size:13px">Слова и грамматика заблокированы до старта главы 🔒</p>`;

  body.innerHTML = `
    <div class="card">
      <div class="row-between"><span class="card-h" style="margin:0">Прогресс</span><b style="color:var(--orange)">${done}/${items}</b></div>
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
        const locked = !cs.started;
        const checked = !!cs.checklist[c[0]];
        return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''}" data-check="${c[0]}" data-testid="check-${c[0]}">
          <div class="checkbox">${checked ? '✓' : ''}</div>
          <span class="check-label">${c[1]}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <h3 class="card-h">Ключевые темы</h3>
      <div class="tag-row">${[...new Set(l.words.map((w) => w.category))]
        .slice(0, 8)
        .map((c) => `<span class="tag">${c}</span>`)
        .join('')}</div>
    </div>`;

  if (cs.started) {
    $('#ch-study').onclick = () => {
      // Запускаем карточки для этой главы
      const chapterDue = dueCards(state.srs, id);
      if (chapterDue.length === 0) {
        toast('Нет карточек к повторению');
        return;
      }

      // Используем nav для перехода к экрану карточек с контекстом главы
      if (dependencies?.startChapterFlashcards) {
        dependencies.startChapterFlashcards(id, chapterDue);
      } else if (window.nav) {
        // Fallback: переходим на экран SRS
        window.nav('srs');
      }
    };
  } else {
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

      // Автоматически начинаем главу при первой отметке чек-листа
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
