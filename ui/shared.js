/* ui/shared.js — Shared UI utilities */
import { state, save } from '../state/store.js';
import { XP_PER_LEVEL, COINS_PER_LEVEL } from '../src/xp-system.js';
import { $, todayStr, pluralDays } from '../src/utils.js';

// ===== COMPLETION SCREEN (ЭКРАН УСПЕХА) =====
export function showCompletionScreen(options) {
  console.log('=== ВНУТРИ showCompletionScreen ===');
  console.log('Полученные опции:', options);

  const {
    title = 'おめでとう!',
    subtitle = 'Congratulations!',
    desc = 'You completed the session!',
    theme = 'success', // 'success' или 'levelup'
    rewards = [], // [{icon: "🪙", label: "+10 XP"}, ...]
    onContinue = null,
  } = options;

  const overlay = document.getElementById('completion-overlay');
  console.log('Overlay найден в DOM:', !!overlay);

  if (!overlay) {
    console.error('❌ Completion overlay не найден в DOM!');
    return;
  }

  console.log('Классы до показа:', overlay.className);
  console.log('Display до показа:', window.getComputedStyle(overlay).display);
  console.log('Opacity до показа:', window.getComputedStyle(overlay).opacity);

  // Заполнить контент
  document.getElementById('completion-title').textContent = title;
  document.getElementById('completion-subtitle').textContent = subtitle;
  document.getElementById('completion-desc').textContent = desc;

  // Установить тему (цвет фона)
  if (theme === 'levelup') {
    overlay.style.background = 'linear-gradient(135deg, #1a0a2e 0%, #2a1a4e 100%)';
  } else {
    overlay.style.background = 'linear-gradient(135deg, #1E3A2F 0%, #2E4A3F 100%)';
  }

  // Сгенерировать награды
  const rewardsContainer = document.getElementById('completion-rewards');
  rewardsContainer.innerHTML = rewards
    .map(
      (r) =>
        `<div class="reward-item">
      <span class="reward-icon">${r.icon}</span>
      <span class="reward-label">${r.label}</span>
    </div>`
    )
    .join('');

  // Показать оверлей
  overlay.classList.remove('hidden');

  console.log('Классы после показа:', overlay.className);
  console.log('Display после показа:', window.getComputedStyle(overlay).display);
  console.log('Opacity после показа:', window.getComputedStyle(overlay).opacity);
  console.log('Z-index после показа:', window.getComputedStyle(overlay).zIndex);
  console.log('✅ Оверлей должен быть видимым!');

  // Обработчик кнопки
  const btn = document.getElementById('btn-completion-continue');
  btn.onclick = () => {
    console.log('Клик по кнопке CONTINUE');
    overlay.classList.add('hidden');
    if (onContinue) onContinue();
  };
}

// ---------- Avatar Sync ----------
export function syncAvatars() {
  const all = document.querySelectorAll('.logo-fox');
  all.forEach((el) => {
    el.textContent = state.currentAvatar || '🦊';
  });
}

// ---------- Refresh Streak Display ----------
export function refreshStreakDisplay() {
  const s = state.streak;
  let shown = s.count;
  if (s.lastActive) {
    const diff = Math.round((new Date(todayStr()) - new Date(s.lastActive)) / 86400000);
    if (diff > 1) shown = 0;
  } else shown = 0;

  // Круговой прогресс стрика
  const dailyGoal = Math.min(state.dailyCards / 10, 1);
  const pct = Math.round(dailyGoal * 100);
  const cBar = $('#streak-circle-progress');
  if (cBar) {
    if (state.dailyCards >= 10) {
      cBar.style.background = `conic-gradient(var(--orange) 0deg 360deg)`;
    } else {
      cBar.style.background = `conic-gradient(var(--orange) 0deg ${pct * 3.6}deg, var(--border) ${pct * 3.6}deg 360deg)`;
    }
  }

  const circleInner = $('#streak-circle-inner');
  if (circleInner) {
    circleInner.textContent = state.dailyCards >= 10 ? '🔥' : `${state.dailyCards}/10`;
  }

  // Линейный прогресс XP
  const xpPct = Math.min((state.xp / XP_PER_LEVEL) * 100, 100);
  const xpBar = $('#xp-bar-fill');
  if (xpBar) xpBar.style.width = `${xpPct}%`;
  const xpText = $('#xp-bar-text');
  if (xpText) xpText.textContent = `${Math.round(state.xp)} / ${XP_PER_LEVEL} XP`;
  const levelText = $('#level-text');
  if (levelText) levelText.textContent = `Уровень ${state.level}`;

  // Монеты
  const coinsText = $('#coins-display');
  if (coinsText) coinsText.textContent = `🪙 ${state.coins}`;

  // Стрик текст
  const streakNum = $('#streak-num');
  if (streakNum) streakNum.textContent = shown;
  const daysEl = $('.streak-days');
  if (daysEl) daysEl.textContent = pluralDays(shown);
  const hintEl = $('#streak-hint');
  if (hintEl) {
    hintEl.textContent =
      shown > 0
        ? 'Отличная работа! Продолжайте в том же духе.'
        : 'Решите 10 карточек, чтобы продлить стрик!';
  }

  // Применяем скин карточки стрика
  applyStreakSkin();
}

// ---------- Apply Streak Skin ----------
export function applyStreakSkin() {
  const card = $('.streak-card');
  if (!card) return;
  const skin = state.currentStreakSkin || 'default';
  if (skin === 'default') {
    card.removeAttribute('data-skin');
  } else {
    card.setAttribute('data-skin', skin);
  }
}

// ---------- Apply Theme ----------
export function applyCustomTheme() {
  const theme = state.currentTheme || 'default';
  if (theme === 'default') {
    // Если кастомная тема не выбрана, применяем обычную тему (auto/light/dark)
    if (window.applyTheme) window.applyTheme();
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// ---------- Update SRS Badge ----------
export function updateSrsBadge() {
  if (!window.dueCards || !state.srs) return;
  const due = window.dueCards(state.srs).length;
  const badge = document.querySelector('.tab-badge[data-tab="srs"]');
  if (badge) {
    if (due > 0) {
      badge.textContent = due > 99 ? '99+' : due;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}
