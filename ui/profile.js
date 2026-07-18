/* ui/profile.js — Profile screen rendering and management */

import { $, $$, monthLabel } from '../src/utils.js';
import { getUserRankData } from '../src/xp-system.js';

// Глобальные переменные профиля
let heatmapMonth = null;
let chartEndOffsetDays = 0;
let achievementsExpanded = false;

/**
 * Рендерит экран профиля пользователя
 * @param {Object} state - Глобальное состояние приложения
 * @param {Object} dependencies - Зависимости (AchievementSystem, QuestsManager, toast, save и т.д.)
 */
export function renderProfile(state, dependencies) {
  const { toast, save, showCompletionScreen, refreshStreakDisplay, XP_PER_LEVEL, COINS_PER_LEVEL } = dependencies;
  
  if (!heatmapMonth) {
    const now = new Date();
    heatmapMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  
  // Вычисляем longest streak из истории
  let longestStreak = 0;
  let currentRun = 0;
  const sortedDates = Object.keys(state.history).sort();
  
  for (let i = 0; i < sortedDates.length; i++) {
    if (state.history[sortedDates[i]] > 0) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
      
      // Проверяем, что следующий день идёт подряд
      if (i < sortedDates.length - 1) {
        const currentDate = new Date(sortedDates[i]);
        const nextDate = new Date(sortedDates[i + 1]);
        const diffDays = Math.floor((nextDate - currentDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) currentRun = 0;
      }
    } else {
      currentRun = 0;
    }
  }
  
  // Получаем данные о ранге пользователя
  const rankData = getUserRankData(state.level);
  
  const body = $("#profile-body");
  
  // Вычисляем прогресс XP (от 0 до 99)
  const currentXP = state.xp;
  const maxXP = 99;
  const xpPercent = Math.min((currentXP / maxXP) * 100, 100);
  
  body.innerHTML = `
    <div class="profile-header">
    <div class="profile-avatar" id="profile-avatar-display">${state.currentAvatar || "🦊"}</div>
    <h2 class="profile-name">Kitsune Genki</h2>
    <div class="profile-title" id="profile-title">${state.currentTitle || "Новичок"}</div>
    
      <!-- Капсула: иконка ранга перекрывает белую плашку -->
      <div class="profile-level-bar-container">
        <img src="rank/${rankData.icon}" class="profile-rank-icon" alt="${rankData.name}" />
        <div class="profile-level-bar-wrap">
          <div class="profile-level-bar-content">
            <div class="profile-level-bar-track">
              <div class="profile-level-bar-fill" style="width: ${xpPercent}%"></div>
            </div>
            <div class="profile-level-bar-text">${currentXP} / ${maxXP} XP</div>
          </div>
        </div>
      </div>
  </div>
      <div class="profile-stats">
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.level}</div>
          <div class="profile-stat-label">Уровень</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-label">${rankData.name}</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.coins}</div>
          <div class="profile-stat-label">🪙 Монет</div>
        </div>
      </div>
      <div class="achievements-section">
        <h3 class="section-title">ДОСТИЖЕНИЯ</h3>
        <div class="achievements-progress" id="achievements-toggle">
          <div class="achievements-progress-text">
            <p class="achievements-progress-title">ПРОГРЕСС</p>
            <p class="achievements-progress-stats" id="achievements-stats">0 / 0</p>
          </div>
          <div class="achievements-progress-circle" id="achievements-circle"></div>
          <button class="achievements-toggle-btn" id="achievements-expand-btn">
            <span class="achievements-toggle-icon">🏆</span>
            <span class="achievements-toggle-text">Показать все</span>
          </button>
        </div>
        <div class="achievements-grid ${achievementsExpanded ? '' : 'collapsed'}" id="achievements-grid"></div>
      </div>
      <div class="profile-heatmap-wrap">
        <div class="heatmap-streak-card-modern">
          <div class="streak-modern-fire-wrap">
            <span class="streak-modern-emoji">🔥</span>
            <span class="streak-modern-num">${state.streak.count}</span>
          </div>
          <div class="streak-modern-info">
            <div class="streak-modern-title">Текущий стрик</div>
            <div class="streak-modern-record">Рекорд: ${longestStreak} дней</div>
          </div>
        </div>
        <div class="heatmap-calendar-card">
          <div class="heatmap-nav">
            <button class="heatmap-nav-btn" id="heatmap-prev">←</button>
            <span class="heatmap-month-label" id="heatmap-month-label">${monthLabel(heatmapMonth)}</span>
            <button class="heatmap-nav-btn" id="heatmap-next">→</button>
          </div>
          <div class="heatmap-legend" id="heatmap-legend"></div>
          <div class="heatmap-weekdays">
            <div class="heatmap-weekday">Su</div>
            <div class="heatmap-weekday">Mo</div>
            <div class="heatmap-weekday">Tu</div>
            <div class="heatmap-weekday">We</div>
            <div class="heatmap-weekday">Th</div>
            <div class="heatmap-weekday">Fr</div>
            <div class="heatmap-weekday">Sa</div>
          </div>
          <div class="heatmap-grid" id="heatmap-grid"></div>
        </div>
  </div>

    <!-- График активности повторений -->
    <div class="card chart-card" style="position: relative;">
      <div class="chart-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <h3 style="margin:0; font-size:18px;">Активность повторений</h3>
          <p class="muted" style="margin:4px 0 0; font-size:12px;">Количество карточек, повторенных за день.</p>
        </div>
        <div class="chart-nav" style="display:flex; gap:8px;">
          <button class="heatmap-nav-btn" id="chart-prev">←</button>
          <button class="heatmap-nav-btn" id="chart-next">→</button>
        </div>
      </div>
      <div class="chart-svg-container" style="width:100%; overflow-x:auto;"></div>
    </div>

    <!-- Тултип для графика и календаря -->
    <div id="chart-tooltip" class="chart-tooltip hidden"></div>
  `;

  renderAchievements(state, dependencies);
  renderHeatmap(state);
  renderActivityChart(state);
    
  // Обработчик кнопки разворачивания достижений
  const expandBtn = $("#achievements-expand-btn");
  if (expandBtn) {
    // Установить начальное состояние кнопки
    const icon = expandBtn.querySelector(".achievements-toggle-icon");
    const text = expandBtn.querySelector(".achievements-toggle-text");
    if (achievementsExpanded) {
      text.textContent = "Скрыть";
      icon.textContent = "🔽";
    } else {
      text.textContent = "Показать все";
      icon.textContent = "🏆";
    }
    
    expandBtn.onclick = () => {
      const grid = $("#achievements-grid");
      
      if (grid.classList.contains("collapsed")) {
        grid.classList.remove("collapsed");
        achievementsExpanded = true;
        text.textContent = "Скрыть";
        icon.textContent = "🔽";
      } else {
        grid.classList.add("collapsed");
        achievementsExpanded = false;
        text.textContent = "Показать все";
        icon.textContent = "🏆";
      }
    };
  }
  
  $("#heatmap-prev").onclick = () => {
    heatmapMonth.setMonth(heatmapMonth.getMonth() - 1);
    renderProfile(state, dependencies);
  };
  $("#heatmap-next").onclick = () => {
    heatmapMonth.setMonth(heatmapMonth.getMonth() + 1);
    renderProfile(state, dependencies);
  };
  
  // Обработчики навигации графика активности
  $("#chart-prev").onclick = () => {
    chartEndOffsetDays += 7;
    renderActivityChart(state);
  };
  $("#chart-next").onclick = () => {
    chartEndOffsetDays = Math.max(0, chartEndOffsetDays - 7);
    renderActivityChart(state);
  };
  
  syncAvatars(state);
}

/**
 * Рендерит список достижений
 */
function renderAchievements(state, dependencies) {
  if (!window.Achievements) return;
  
  const { claimAchievementReward } = dependencies;
  const progress = window.Achievements.getProgress(state);
  const allAchievements = window.Achievements.getAll();
  
  const statsEl = $("#achievements-stats");
  if (statsEl) statsEl.textContent = `${progress.unlocked} / ${progress.total}`;
  
  const circleEl = $("#achievements-circle");
  if (circleEl) {
    const deg = Math.round((progress.percent / 100) * 360);
    circleEl.style.background = `conic-gradient(var(--orange) 0deg ${deg}deg, var(--border) ${deg}deg 360deg)`;
    circleEl.textContent = `${progress.percent}%`;
  }
  
  const gridEl = $("#achievements-grid");
  if (!gridEl) return;
  
  gridEl.innerHTML = allAchievements.map(ach => {
    const unlocked = state.unlockedAchievements.includes(ach.id);
    const claimed = state.claimedAchievements.includes(ach.id);
    const canClaim = unlocked && !claimed && ach.rewards;
    
    return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
      ${unlocked ? '<span class="achievement-badge">✓</span>' : ''}
      <div class="achievement-emoji">${ach.emoji}</div>
      <h4 class="achievement-title">${ach.title}</h4>
      <p class="achievement-desc">${ach.desc}</p>
      ${canClaim ? `
        <button class="btn-claim-achievement" data-achievement-id="${ach.id}">
          Забрать награду
        </button>
      ` : ''}
      ${claimed ? '<span class="achievement-claimed-badge">Награда получена</span>' : ''}
    </div>`;
  }).join('');
  
  // Добавляем обработчики для кнопок "Забрать награду"
  $$(".btn-claim-achievement").forEach(btn => {
    btn.onclick = () => claimAchievementReward(btn.dataset.achievementId, state, dependencies);
  });
}

/**
 * Рендерит квесты (используется как на экране квестов, так и в профиле)
 */
export function renderQuests(state, dependencies) {
  if (!window.QuestsManager || !state.quests) return;

  const { claimQuest } = dependencies;
  
  // Получаем оба контейнера (на экране квестов и в профиле)
  const questsContainer = $("#quests-container");
  const profileQuestsContainer = $("#profile-quests-container");
  
  // Если ни один контейнер не найден, выходим
  if (!questsContainer && !profileQuestsContainer) return;
  
  const timeLeft = window.QuestsManager.getTimeUntilReset();
  
  // Рендерим Weekly Challenges
  const weeklyHtml = state.quests.weekly.map(challenge => {
    const progress = Math.min((challenge.current / challenge.target) * 100, 100);
    const canClaim = challenge.completed && !challenge.claimed;
    const claimed = challenge.claimed;
    
    return `
      <div class="quest-card weekly ${claimed ? 'claimed' : ''}">
        <div class="quest-icon-wrap">${challenge.icon}</div>
        <div class="quest-main">
          <div class="quest-header">
            <h4 class="quest-title">${challenge.title}</h4>
            <div class="quest-reward-pill">
              <span>${challenge.reward.xp} XP</span>
              <span>${challenge.reward.coins} 🪙</span>
            </div>
          </div>
          <p class="quest-desc">${challenge.desc}</p>
          <div class="quest-progress-row">
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="quest-counter">${challenge.current}/${challenge.target}</span>
          </div>
        </div>
        <div class="quest-action">
          ${canClaim ? 
            `<button class="btn-claim" data-quest-id="${challenge.id}">Забрать</button>` :
            claimed ? 
              `<button class="btn-claim claimed" disabled>✓</button>` :
              `<button class="btn-claim" disabled>Забрать</button>`
          }
        </div>
      </div>
    `;
  }).join('');
    
  // Рендерим Daily Quests
  const dailyQuestsHtml = state.quests.daily.map(quest => {
    const progress = Math.min((quest.current / quest.target) * 100, 100);
    const canClaim = quest.completed && !quest.claimed;
    const claimed = quest.claimed;
    
    return `
      <div class="quest-card daily ${claimed ? 'claimed' : ''}">
        <div class="quest-icon-wrap">${quest.icon}</div>
        <div class="quest-main">
          <div class="quest-header">
            <h4 class="quest-title">${quest.title}</h4>
            <div class="quest-reward-pill">
              <span>${quest.reward.xp} XP</span>
              <span>${quest.reward.coins} 🪙</span>
            </div>
          </div>
          <p class="quest-desc">${quest.desc}</p>
          <div class="quest-progress-row">
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="quest-counter">${quest.current}/${quest.target}</span>
          </div>
        </div>
        <div class="quest-action">
          ${canClaim ? 
            `<button class="btn-claim" data-quest-id="${quest.id}">Забрать</button>` :
            claimed ? 
              `<button class="btn-claim claimed" disabled>✓</button>` :
              `<button class="btn-claim" disabled>Забрать</button>`
          }
        </div>
      </div>
    `;
  }).join('');
    
  const dailyHtml = `
    <div class="daily-header">
      <span class="daily-label">DAILY QUESTS</span>
      <span class="daily-timer">⏰ ${timeLeft}</span>
    </div>
  ` + dailyQuestsHtml;
  
  const fullHtml = weeklyHtml + dailyHtml;
  
  // Рендерим в оба контейнера, если они существуют
  if (questsContainer) {
    questsContainer.innerHTML = fullHtml;
  }
  if (profileQuestsContainer) {
    profileQuestsContainer.innerHTML = fullHtml;
  }
  
  // Добавляем обработчики для кнопок Claim в обоих контейнерах
  $$(".btn-claim:not([disabled])").forEach(btn => {
    btn.onclick = () => claimQuest(btn.dataset.questId, state, dependencies);
  });
}

/**
 * Обрабатывает получение награды за квест
 */
export function claimQuest(questId, state, dependencies) {
  if (!window.QuestsManager || !questId) return;
  
  const { toast, save, refreshStreakDisplay, renderProfile, XP_PER_LEVEL, COINS_PER_LEVEL } = dependencies;
  
  const reward = window.QuestsManager.claimQuestReward(state, questId);
  if (!reward) return;
  
  // Начисляем награды
  state.xp += reward.xp;
  state.coins += reward.coins;
  
  // Проверяем повышение уровня
  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;
    state.coins += COINS_PER_LEVEL;
    toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
  }
  
  save();
  toast(`🎉 Получено: +${reward.xp} XP, +${reward.coins} 🪙`);
  
  // Обновляем отображение
  renderProfile(state, dependencies);
  refreshStreakDisplay();
}

/**
 * Обрабатывает получение награды за достижение
 */
export function claimAchievementReward(achievementId, state, dependencies) {
  if (!window.Achievements || !achievementId) return;
  
  const { toast, save, showCompletionScreen, refreshStreakDisplay, renderProfile, XP_PER_LEVEL, COINS_PER_LEVEL } = dependencies;
  
  // Проверяем, не забрали ли награду уже
  if (state.claimedAchievements.includes(achievementId)) {
    toast("Награда уже получена");
    return;
  }
  
  // Находим достижение
  const achievement = window.Achievements.getAll().find(a => a.id === achievementId);
  if (!achievement || !achievement.rewards) {
    toast("Достижение не найдено");
    return;
  }
  
  // Проверяем, разблокировано ли достижение
  if (!state.unlockedAchievements.includes(achievementId)) {
    toast("Достижение еще не разблокировано");
    return;
  }
  
  // Начисляем награды
  const { xp, coins } = achievement.rewards;
  state.xp += xp;
  state.coins += coins;
  
  // Проверяем повышение уровня
  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;
    state.coins += COINS_PER_LEVEL;
    toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
  }
  
  // Отмечаем награду как полученную
  state.claimedAchievements.push(achievementId);
  save();
  
  // Показываем экран успеха
  showCompletionScreen({
    title: "おめでとう!",
    subtitle: achievement.title,
    desc: achievement.desc,
    theme: "success",
    rewards: [
      { icon: "🏆", label: "Достижение разблокировано!" },
      { icon: "⭐", label: `+${xp} XP` },
      { icon: "🪙", label: `+${coins} монет` }
    ],
    onContinue: () => {
      renderProfile(state, dependencies);
      refreshStreakDisplay();
    }
  });
}

/**
 * Рендерит тепловую карту активности
 */
function renderHeatmap(state) {
  const grid = $("#heatmap-grid");
  const legend = $("#heatmap-legend");
  if (!grid) return;
  grid.innerHTML = "";
  
  const year = heatmapMonth.getFullYear();
  const month = heatmapMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayDate = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  
  // Подсчитываем статистику для легенды
  let practiceCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const key = `${year}-${mm}-${dd}`;
    if (state.history[key] && state.history[key] > 0) {
      practiceCount++;
    }
  }
  
  // Обновляем легенду
  if (legend) {
    legend.innerHTML = `
      <div class="heatmap-legend-item">
        <div class="heatmap-legend-dot practice"></div>
        <span>${practiceCount} day${practiceCount !== 1 ? 's' : ''} practiced</span>
      </div>
      <div class="heatmap-legend-item">
        <div class="heatmap-legend-dot restore"></div>
        <span>0 restores used</span>
      </div>
    `;
  }
  
  // Первый день месяца: 0=Вс, 1=Пн, ...
  const firstDay = new Date(year, month, 1).getDay();
  
  // Пустые ячейки до первого дня
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "heatmap-day heatmap-empty";
    grid.appendChild(empty);
  }
  
  // Заполняем дни месяца
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const key = `${year}-${mm}-${dd}`;
    const count = state.history[key] || 0;
    
    const cell = document.createElement("div");
    cell.className = "heatmap-day";
    
    // Проверяем, является ли этот день сегодняшним
    const isToday = day === todayDate && month === todayMonth && year === todayYear;
    
    // Проверяем, является ли день будущим
    const cellDate = new Date(year, month, day);
    const isFuture = cellDate > today;
    
    if (isToday) {
      cell.classList.add("today");
    } else if (isFuture) {
      cell.classList.add("future");
    } else if (count > 0) {
      cell.classList.add("practiced");
    }
    
    cell.textContent = day;
    cell.title = count > 0 ? `${key}: ${count} карточек` : key;
    cell.onclick = (e) => {
      e.stopPropagation();
      const tooltip = $("#chart-tooltip");
      if (!tooltip) return;

      const d = new Date(key + "T00:00:00");
      const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
      
      tooltip.innerHTML = count > 0 
        ? `<b>${count} карточек</b><br><span style="font-size:12px; opacity:0.7;">${d.getDate()} ${months[d.getMonth()]}</span>`
        : `<b>0 карточек</b><br><span style="font-size:12px; opacity:0.7;">${d.getDate()} ${months[d.getMonth()]}</span>`;

      const rect = cell.getBoundingClientRect();
      const bodyEl = $("#profile-body");
      const bodyRect = bodyEl.getBoundingClientRect();

      tooltip.style.left = `${rect.left - bodyRect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.bottom - bodyRect.top + bodyEl.scrollTop + 8}px`;
      tooltip.classList.remove("hidden");
    };
    
    grid.appendChild(cell);
  }
}

/**
 * Генерирует SVG-график активности
 */
function generateActivityChartSVG(dates, counts) {
  const viewBoxWidth = 500;
  const viewBoxHeight = 340;
  const padding = { top: 30, right: 30, bottom: 60, left: 40 };
  const chartWidth = viewBoxWidth - padding.left - padding.right;
  const chartHeight = viewBoxHeight - padding.top - padding.bottom;
  
  // Минимальный лимит для maxCount
  const maxCount = Math.max(10, Math.max(...counts));
  
  // Координаты точек
  const points = dates.map((date, i) => {
    const x = padding.left + (i / (dates.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (counts[i] / maxCount) * chartHeight;
    return { x, y, count: counts[i] };
  });
  
  // Линия (прямые отрезки)
  const linePath = points.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`
  ).join(' ');
  
  // Заливка под линией
  const areaPath = `M ${padding.left},${padding.top + chartHeight} ` +
    points.map(p => `L ${p.x},${p.y}`).join(' ') +
    ` L ${padding.left + chartWidth},${padding.top + chartHeight} Z`;
  
  // Точки-кружочки
  const circles = points.map((p, i) => 
    `<circle cx="${p.x}" cy="${p.y}" r="6" fill="var(--orange-dark)" class="chart-point" data-count="${p.count}" data-date="${dates[i]}" />`
  ).join('');
  
  // Ось X
  const axisY = padding.top + chartHeight;
  
  // Подписи дат (повернутые на -45 градусов)
  const monthNames = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const dateLabels = dates.map((dateStr, i) => {
    const d = new Date(dateStr + "T00:00:00");
    const label = `${d.getDate()} ${monthNames[d.getMonth()]}`;
    const x = points[i].x;
    const y = axisY + 10;
    return `<text x="${x}" y="${y}" transform="rotate(-45, ${x}, ${y})" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="inherit">${label}</text>`;
  }).join('');
  
  return `
    <svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
      <!-- Заливка -->
      <path d="${areaPath}" fill="var(--orange)" opacity="0.15" />
      
      <!-- Линия -->
      <path d="${linePath}" stroke="var(--orange)" stroke-width="4" fill="none" />
      
      <!-- Ось X -->
      <line x1="${padding.left}" y1="${axisY}" x2="${padding.left + chartWidth}" y2="${axisY}" stroke="var(--border)" stroke-width="1" />
      
      <!-- Точки -->
      ${circles}
      
      <!-- Подписи дат -->
      ${dateLabels}
    </svg>
  `;
}

/**
 * Рендерит график активности повторений
 */
function renderActivityChart(state) {
  const container = $(".chart-svg-container");
  if (!container) return;
  
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - chartEndOffsetDays);
  
  const dates = [];
  const counts = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dates.push(dateStr);
    counts.push(state.history[dateStr] || 0);
  }
  
  container.innerHTML = generateActivityChartSVG(dates, counts);
  
  // Обработчики для тултипа
  $$(".chart-point").forEach(point => {
    point.onclick = (e) => {
      e.stopPropagation();
      const count = point.dataset.count;
      const dateStr = point.dataset.date;
      const d = new Date(dateStr + "T00:00:00");
      const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
      
      const tooltip = $("#chart-tooltip");
      tooltip.innerHTML = `<b>${count} карточек</b><br><span style="font-size:12px; opacity:0.7;">${d.getDate()} ${months[d.getMonth()]}</span>`;
      
      const rect = point.getBoundingClientRect();
      const bodyEl = $("#profile-body");
      const bodyRect = bodyEl.getBoundingClientRect();
      
      tooltip.style.left = `${rect.left - bodyRect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.bottom - bodyRect.top + bodyEl.scrollTop + 8}px`;
      tooltip.classList.remove("hidden");
    };
  });
  
  // Скрытие тултипа при клике вне графика
  document.addEventListener("click", () => {
    const t = $("#chart-tooltip");
    if (t) t.classList.add("hidden");
  });
}

/**
 * Синхронизирует аватары на всех логотипах
 */
function syncAvatars(state) {
  const all = document.querySelectorAll(".logo-fox");
  all.forEach((el) => {
    el.textContent = state.currentAvatar || "🦊";
  });
}
