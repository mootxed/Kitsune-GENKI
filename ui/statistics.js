/* ui/statistics.js — Statistics screen rendering and component management */

import { $ } from '../src/utils.js';
import { buildStatisticsViewModel } from '../src/statistics/statistics-view-model.js';

const LS_PERIOD_KEY = 'kitsune_stats_period';

/**
 * Рендерит экран статистики
 * @param {Object} appState - глобальное состояние приложения
 */
export function renderStatistics(appState) {
  const container = $('#screen-statistics');
  if (!container) return;

  const savedPeriod = localStorage.getItem(LS_PERIOD_KEY);
  const timeRangeDays = savedPeriod === 'all' ? 'all' : Number(savedPeriod) || 30;

  const viewModel = buildStatisticsViewModel(appState, {
    timeRangeDays,
  });

  container.innerHTML = `
    <div class="stats-screen-container">
      <!-- Шапка экрана -->
      <div class="stats-header">
        <div class="stats-title-group">
          <h1 class="stats-title">📊 Статистика обучения</h1>
          <p class="stats-subtitle">Retention, Lapses, нагрузка и динамика освоения</p>
        </div>

        <!-- Переключатель периода -->
        <div class="stats-period-selector" role="tablist" aria-label="Выбор периода статистики">
          <button class="stats-period-btn ${viewModel.selectedPeriod === 7 ? 'active' : ''}" data-period="7" role="tab" aria-selected="${viewModel.selectedPeriod === 7}">7 дней</button>
          <button class="stats-period-btn ${viewModel.selectedPeriod === 30 ? 'active' : ''}" data-period="30" role="tab" aria-selected="${viewModel.selectedPeriod === 30}">30 дней</button>
          <button class="stats-period-btn ${viewModel.selectedPeriod === 90 ? 'active' : ''}" data-period="90" role="tab" aria-selected="${viewModel.selectedPeriod === 90}">90 дней</button>
          <button class="stats-period-btn ${viewModel.selectedPeriod === 'all' ? 'active' : ''}" data-period="all" role="tab" aria-selected="${viewModel.selectedPeriod === 'all'}">Всё время</button>
        </div>
      </div>

      <!-- 1. Карточки общего обзора (General Overview) -->
      ${renderOverviewCards(viewModel.overview)}

      <!-- 2. Секция Retention -->
      ${renderRetentionSection(viewModel.retention)}

      <!-- 3. Секция Lapses и Проблемные карточки -->
      ${renderLapsesSection(viewModel.lapses)}

      <!-- 4. Секция Учебная нагрузка и Календарь активности -->
      ${renderWorkloadSection(viewModel.workload)}

      <!-- 5. Секция Прогноз повторений -->
      ${renderForecastSection(viewModel.forecast)}

      <!-- 6. Секция Статистика по навыкам -->
      ${renderSkillsSection(viewModel.skills)}

      <!-- 7. Секция Mastery (Освоение знаний) -->
      ${renderMasterySection(viewModel.mastery)}
    </div>
  `;

  // Навешивание обработчиков клика по кнопкам периода
  container.querySelectorAll('.stats-period-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const period = e.currentTarget.dataset.period;
      localStorage.setItem(LS_PERIOD_KEY, period);
      renderStatistics(appState);
    });
  });
}

function renderOverviewCards(ov) {
  return `
    <div class="stats-overview-grid">
      <div class="stats-card">
        <div class="stats-card-val">${ov.reviewsToday}</div>
        <div class="stats-card-label">Повторений сегодня</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${ov.firstAttemptCorrectToday}</div>
        <div class="stats-card-label">Правильных 1-х попыток</div>
      </div>
      <div class="stats-card highlight">
        <div class="stats-card-val">${ov.retentionFormatted}</div>
        <div class="stats-card-label">Retention за период</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${ov.lapsesIsInsufficient ? '—' : ov.lapsesCount}</div>
        <div class="stats-card-label">Lapses за период</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${ov.dueTomorrowCards}</div>
        <div class="stats-card-label">К повторению завтра</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${ov.forecastTomorrowTimeFormatted}</div>
        <div class="stats-card-label">Прогноз времени завтра</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${ov.activeCardsCount}</div>
        <div class="stats-card-label">Активных карточек</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-val">${ov.learnedItemsCount} / ${ov.totalItemsCount}</div>
        <div class="stats-card-label">Изученных элементов</div>
      </div>
    </div>
  `;
}

function renderRetentionSection(ret) {
  if (ret.isInsufficient) {
    return `
      <section class="stats-section">
        <h2 class="stats-section-title">🎯 Retention (Запоминание)</h2>
        <p class="stats-description">${ret.description}</p>
        <div class="stats-empty-state">
          <span class="empty-icon">📈</span>
          <p>Недостаточно данных для вычисления Retention</p>
        </div>
      </section>
    `;
  }

  // Построение SVG графика Retention over time
  const points = ret.timeSeries || [];
  const svgChart = renderLineChart(points);

  return `
    <section class="stats-section">
      <div class="stats-section-header">
        <h2 class="stats-section-title">🎯 Retention (Запоминание)</h2>
        <span class="stats-badge-retention">${ret.formattedOverall}</span>
      </div>
      <p class="stats-description">${ret.description}</p>

      <div class="stats-chart-card">
        <div class="stats-chart-header">
          <span class="chart-legend-item"><span class="legend-dot main"></span> Observed Retention</span>
          <span class="chart-legend-item"><span class="legend-dot ma"></span> Скользящая средняя</span>
          <span class="chart-legend-item"><span class="legend-dot target"></span> Целевой (${(ret.targetRetention * 100).toFixed(0)}%)</span>
        </div>
        ${svgChart}
      </div>

      <!-- Разбивка Retention по стадиям FSRS -->
      <div class="stats-subgrid">
        <div class="stats-subcard">
          <div class="subcard-title">По стадиям FSRS</div>
          <div class="subcard-metric-row">
            <span>Learning:</span>
            <strong>${ret.byFsrsState.learning.formattedRetention}</strong>
          </div>
          <div class="subcard-metric-row">
            <span>Review:</span>
            <strong>${ret.byFsrsState.review.formattedRetention}</strong>
          </div>
          <div class="subcard-metric-row">
            <span>Relearning:</span>
            <strong>${ret.byFsrsState.relearning.formattedRetention}</strong>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderLineChart(points) {
  const dataPoints = points.filter((p) => p.hasData);
  if (dataPoints.length === 0) {
    return `<div class="chart-empty">Нет данных за выбранный период</div>`;
  }

  const width = 600;
  const height = 180;
  const padding = 30;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const totalPoints = points.length;
  const stepX = totalPoints > 1 ? innerW / (totalPoints - 1) : innerW;

  let pathD = '';
  let maPathD = '';

  points.forEach((pt, idx) => {
    if (!pt.hasData) return;
    const x = padding + idx * stepX;
    const y = padding + innerH * (1 - pt.retention);

    if (!pathD) pathD = `M ${x} ${y}`;
    else pathD += ` L ${x} ${y}`;

    if (pt.movingAverage !== null) {
      const maY = padding + innerH * (1 - pt.movingAverage);
      if (!maPathD) maPathD = `M ${x} ${maY}`;
      else maPathD += ` L ${x} ${maY}`;
    }
  });

  const targetY = padding + innerH * (1 - 0.9);

  return `
    <div class="svg-chart-container">
      <svg class="stats-svg-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="График retention по дням">
        <!-- Сетка 0%, 50%, 100% -->
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="var(--border-color, #e0e0e0)" stroke-dasharray="2 2" />
        <line x1="${padding}" y1="${padding + innerH / 2}" x2="${width - padding}" y2="${padding + innerH / 2}" stroke="var(--border-color, #e0e0e0)" stroke-dasharray="2 2" />
        <line x1="${padding}" y1="${padding + innerH}" x2="${width - padding}" y2="${padding + innerH}" stroke="var(--border-color, #e0e0e0)" stroke-dasharray="2 2" />

        <!-- Линия целевого Retention -->
        <line x1="${padding}" y1="${targetY}" x2="${width - padding}" y2="${targetY}" stroke="#10b981" stroke-dasharray="4 4" stroke-width="1.5" />

        <!-- Линия основного Retention -->
        ${pathD ? `<path d="${pathD}" fill="none" stroke="var(--primary-color, #6366f1)" stroke-width="2.5" />` : ''}

        <!-- Линия скользящей средней -->
        ${maPathD ? `<path d="${maPathD}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3 3" />` : ''}
      </svg>
    </div>
  `;
}

function renderLapsesSection(lapses) {
  if (lapses.isInsufficient) {
    return `
      <section class="stats-section">
        <h2 class="stats-section-title">⚠️ Lapses и проблемы</h2>
        <div class="stats-empty-state">
          <p>Пока нет истории review lapses</p>
        </div>
      </section>
    `;
  }

  const problemRows = (lapses.problemCards || [])
    .slice(0, 10)
    .map(
      (card) => `
    <tr class="problem-card-row">
      <td class="col-word"><strong>${card.japanese}</strong></td>
      <td class="col-trans">${card.translation}</td>
      <td class="col-skill"><span class="skill-tag">${card.skill}</span></td>
      <td class="col-lapses"><span class="badge-lapses">${card.lapses}</span></td>
      <td class="col-stab">${card.stability} дн</td>
      <td class="col-diff">${card.difficulty}</td>
      <td class="col-risk"><span class="risk-score-pill">${card.riskScore}</span></td>
    </tr>
  `
    )
    .join('');

  return `
    <section class="stats-section">
      <h2 class="stats-section-title">⚠️ Lapses и проблемы</h2>

      <div class="stats-kpi-row">
        <div class="kpi-box">
          <span class="kpi-val">${lapses.totalLapses}</span>
          <span class="kpi-label">Всего lapses</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${lapses.formattedLapseRate}</span>
          <span class="kpi-label">Lapse Rate</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${lapses.cardsInRelearningCount}</span>
          <span class="kpi-label">В Relearning</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${lapses.leechCardsCount}</span>
          <span class="kpi-label">Leech карточек</span>
        </div>
      </div>

      <!-- Таблица проблемных карточек -->
      <div class="stats-table-wrapper">
        <h3 class="sub-heading">Проблемные карточки (Top Risk Score)</h3>
        ${
          problemRows
            ? `
            <table class="problem-cards-table">
              <thead>
                <tr>
                  <th>Слово</th>
                  <th>Перевод</th>
                  <th>Навык</th>
                  <th>Lapses</th>
                  <th>Stability</th>
                  <th>Difficulty</th>
                  <th>Risk Score</th>
                </tr>
              </thead>
              <tbody>
                ${problemRows}
              </tbody>
            </table>
          `
            : '<p class="stats-empty-text">Проблемных карточек не обнаружено! Отличный результат!</p>'
        }
      </div>
    </section>
  `;
}

function renderWorkloadSection(wl) {
  const heatmapCells = (wl.heatmap || [])
    .map(
      (cell) => `
    <div class="heatmap-cell level-${cell.level}" role="img" title="${cell.label}" aria-label="${cell.label}"></div>
  `
    )
    .join('');

  return `
    <section class="stats-section">
      <h2 class="stats-section-title">⏱️ Учебная нагрузка</h2>

      <div class="stats-kpi-row">
        <div class="kpi-box">
          <span class="kpi-val">${wl.totalEventsCount}</span>
          <span class="kpi-label">Всего review</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${wl.totalActiveMinutes} мин</span>
          <span class="kpi-label">Активного времени</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${wl.formattedGlobalMedian}</span>
          <span class="kpi-label">Медиана ответа</span>
        </div>
      </div>

      <!-- Календарь активности (Heatmap) -->
      <div class="heatmap-container">
        <h3 class="sub-heading">Календарь активности (последние 16 недель)</h3>
        <div class="heatmap-grid" role="region" aria-label="Матрица активности по дням">
          ${heatmapCells}
        </div>
      </div>
    </section>
  `;
}

function renderForecastSection(fc) {
  const daysList = (fc.byDay14 || [])
    .map(
      (d) => `
    <div class="forecast-day-item">
      <span class="day-date">${d.dateKey}</span>
      <span class="day-count">${d.reviewsCount} повторений</span>
      <span class="day-time">≈ ${d.formattedTime}</span>
    </div>
  `
    )
    .join('');

  return `
    <section class="stats-section">
      <h2 class="stats-section-title">🔮 Прогноз повторений</h2>
      <p class="stats-description">${fc.disclaimer}</p>

      <div class="stats-kpi-row">
        <div class="kpi-box highlight">
          <span class="kpi-val">${fc.dueTodayCount}</span>
          <span class="kpi-label">Due сегодня</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${fc.dueTomorrowCount}</span>
          <span class="kpi-label">Due завтра</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${fc.formattedTomorrowTime}</span>
          <span class="kpi-label">Время на завтра</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-val">${fc.plannedNewCardsCount}</span>
          <span class="kpi-label">Планируемых новых</span>
        </div>
      </div>

      <!-- Дневной расписание на 14 дней -->
      <div class="forecast-schedule">
        <h3 class="sub-heading">График повторений на 14 дней</h3>
        <div class="forecast-days-grid">
          ${daysList}
        </div>
      </div>
    </section>
  `;
}

function renderSkillsSection(skills) {
  const skillCards = Object.values(skills || {})
    .map(
      (sk) => `
    <div class="skill-stat-card">
      <div class="skill-card-header">
        <span class="skill-name">${sk.label}</span>
        <span class="skill-status-badge status-${sk.statusCode}">${sk.statusText}</span>
      </div>
      <div class="skill-metrics-grid">
        <div><span>Карточек:</span> <strong>${sk.nonSuspendedActiveCount}</strong></div>
        <div><span>Retention:</span> <strong>${sk.formattedRetention}</strong></div>
        <div><span>Lapses:</span> <strong>${sk.lapsesCount}</strong></div>
        <div><span>Медиана время:</span> <strong>${sk.formattedResponseTime}</strong></div>
        <div><span>Доступность:</span> <strong>${sk.formattedAvailabilityShare}</strong></div>
        <div><span>Evidence:</span> <strong>${sk.formattedEvidenceShare}</strong></div>
      </div>
    </div>
  `
    )
    .join('');

  return `
    <section class="stats-section">
      <h2 class="stats-section-title">🧠 Статистика по навыкам</h2>
      <div class="skills-grid">
        ${skillCards}
      </div>
    </section>
  `;
}

function renderMasterySection(mast) {
  const dist = mast.distribution || {};
  const total = mast.totalItemsCount || 1;

  const levels = [
    { name: 'Новое', val: dist['Новое'] || 0, color: '#9ca3af' },
    { name: 'Знакомо', val: dist['Знакомо'] || 0, color: '#60a5fa' },
    { name: 'Вспоминаю', val: dist['Вспоминаю'] || 0, color: '#f59e0b' },
    { name: 'Уверенно', val: dist['Уверенно'] || 0, color: '#10b981' },
    { name: 'Освоено', val: dist['Освоено'] || 0, color: '#8b5cf6' },
  ];

  const bars = levels
    .map((lvl) => {
      const pct = Math.round((lvl.val / total) * 100);
      return `
      <div class="mastery-bar-row">
        <span class="mastery-lbl">${lvl.name} (${lvl.val})</span>
        <div class="mastery-bar-track">
          <div class="mastery-bar-fill" style="width: ${pct}%; background-color: ${lvl.color};"></div>
        </div>
        <span class="mastery-pct">${pct}%</span>
      </div>
    `;
    })
    .join('');

  return `
    <section class="stats-section">
      <h2 class="stats-section-title">🏆 Распределение Mastery (Освоение)</h2>
      <div class="mastery-distribution-card">
        ${bars}
      </div>
      <div class="mastery-insights">
        <span class="insight-badge">⚠️ Lapsed caps: ${mast.recentLapseCappedCount}</span>
        <span class="insight-badge">🔒 Context-production capped: ${mast.missingProductionCappedCount}</span>
      </div>
    </section>
  `;
}
