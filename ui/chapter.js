/* ui/chapter.js — Chapter screen */
import { state, save, chState } from '../state/store.js';
import { refreshStreakDisplay } from './shared.js';
import { $, $$, toast } from '../src/utils.js';
import { allCards, dueCards } from '../srs.js';
import { XP_CHECK, XP_CHAPTER_FULL, appAddXP } from '../src/xp-system.js';
import { CHECK_ITEMS, getLesson, startChapter, markActivity } from './home.js';

// ---------- Render: Chapter ----------
export function renderChapter(id) {
  const l = getLesson(id);
  if (!l) { 
    toast("Глава не найдена"); 
    window.nav("home"); 
    return; 
  }
  
  const cs = chState(id);
  $("#chapter-title").textContent = `Глава ${id}: ${l.title}`;
  $("#chapter-jp").textContent = l.jp || "";
  
  const body = $("#chapter-body");
  const items = CHECK_ITEMS.length;
  const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
  const total = allCards(state.srs, id).length;
  const due = dueCards(state.srs, id).length;

  const startBlock = cs.started
    ? `<div class="card srs-mini">
         <div class="m"><b>${total}</b><span>карточек</span></div>
         <div class="m due"><b>${due}</b><span>к повтору</span></div>
         <button class="btn-study-sm" id="ch-study" ${due === 0 ? "disabled" : ""} data-testid="chapter-study-btn">Учить →</button>
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
        return `<div class="check-item ${checked ? "done" : ""} ${locked ? "locked" : ""}" data-check="${c[0]}" data-testid="check-${c[0]}">
          <div class="checkbox">${checked ? "✓" : ""}</div>
          <span class="check-label">${c[1]}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="card">
      <h3 class="card-h">Ключевые темы</h3>
      <div class="tag-row">${[...new Set(l.words.map((w) => w.category))].slice(0, 8).map((c) => `<span class="tag">${c}</span>`).join("")}</div>
    </div>`;

  if (cs.started) {
    $("#ch-study").onclick = () => {
      if (window.startFlash) {
        window.startFlash(id);
      }
    };
  } else {
    $("#ch-start").onclick = () => { 
      startChapter(id); 
      renderChapter(id); 
      if (window.renderHome) window.renderHome();
    };
  }
  
  $$("#chapter-body .check-item").forEach((el) => {
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Автоматически начинаем главу при первой отметке чек-листа
      if (!cs.started) {
        startChapter(id);
      }
      
      const k = el.dataset.check;
      
      // Исправлено: теперь можно снимать галочки
      if (cs.checklist[k]) {
        // Снимаем галочку
        cs.checklist[k] = false;
        state.xp = Math.max(0, state.xp - XP_CHECK);
        toast(`❌ Отметка снята, -${XP_CHECK} XP`);
        save(true); 
        markActivity();
        el.classList.remove("done");
        const cb = el.querySelector(".checkbox");
        if (cb) cb.textContent = "";
        const items = CHECK_ITEMS.length;
        const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
        $$("#chapter-body .prog-dash .segment").forEach((seg, idx) => {
          seg.classList.toggle("active", idx < done);
        });
        const progText = $("#chapter-body .row-between b");
        if (progText) progText.textContent = `${done}/${items}`;
        refreshStreakDisplay();
        return;
      }
      
      // Ставим галочку
      cs.checklist[k] = true;
      
      // XP награды за чек-лист
      appAddXP(XP_CHECK);
      toast(`+${XP_CHECK} XP за чек-лист!`);
      
      const doneCount = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
      if (doneCount === CHECK_ITEMS.length) {
        appAddXP(XP_CHAPTER_FULL);
        toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
      }
      
      save(true); 
      markActivity();
      el.classList.add("done");
      const cb = el.querySelector(".checkbox");
      if (cb) cb.textContent = "✓";
      const items = CHECK_ITEMS.length;
      const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
      $$("#chapter-body .prog-dash .segment").forEach((seg, idx) => {
        seg.classList.toggle("active", idx < done);
      });
      const progText = $("#chapter-body .row-between b");
      if (progText) progText.textContent = `${done}/${items}`;
    };
  });
}