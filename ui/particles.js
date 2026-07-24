/* ui/particles.js — Интерфейс словаря частиц */

import { $, $$ } from '../src/utils.js';
import { speakJapanese } from '../src/audio-helper.js';
import { ExamplesDB } from '../src/examples-db.js';

/**
 * Отображает список частиц в компактном виде
 */
export async function renderParticlesList(dependencies) {
  const { toast } = dependencies;
  const body = $('#srs-body');
  if (!body) return;

  body.innerHTML = '<div class="loader-spinner" style="margin: 40px auto;"></div>';

  try {
    const response = await fetch('data/particles-dictionary.json');
    if (!response.ok) throw new Error('Не удалось загрузить словарь частиц');

    const dictionary = await response.json();
    ExamplesDB.registerParticlesDictionary(dictionary);
    ExamplesDB.rebuildIndex();

    const particles = Object.values(dictionary.particles);

    particles.sort((a, b) => a.introduced_in_lesson - b.introduced_in_lesson);

    const cardsHTML = particles
      .map(
        (p) => `
      <div class="particle-card-compact" data-particle="${p.particle}">
        <div class="particle-compact-header">
          <span class="particle-char-large">${p.particle}</span>
          <div class="particle-compact-info">
            <span class="particle-romaji-compact">${p.romaji}</span>
            <span class="particle-badge-small">Урок ${p.introduced_in_lesson}</span>
          </div>
        </div>
        <div class="particle-function-compact">${p.function}</div>
        <div class="particle-arrow">→</div>
      </div>
    `
      )
      .join('');

    body.innerHTML = `
      <div class="particles-list-container">
        <div class="particles-list-header">
          <h2>Словарь японских частиц</h2>
          <p class="particles-subtitle">Полный справочник частиц уровня N5</p>
        </div>
        <div class="particles-grid">
          ${cardsHTML}
        </div>
      </div>
    `;

    $$('.particle-card-compact').forEach((card) => {
      card.onclick = () => {
        const particleChar = card.dataset.particle;
        const particle = particles.find((p) => p.particle === particleChar);
        if (particle) {
          openParticleDetail(particle, particles, dependencies);
        }
      };
    });
  } catch (error) {
    console.error('Ошибка загрузки словаря частиц:', error);
    body.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <p style="font-size: 48px; margin-bottom: 16px;">😔</p>
        <p style="color: var(--text-secondary);">Не удалось загрузить словарь частиц</p>
        <button class="btn-primary" onclick="location.reload()" style="margin-top: 20px;">
          Попробовать снова
        </button>
      </div>
    `;
  }
}

/**
 * Открывает детальное окно частицы
 */
function openParticleDetail(particle, allParticles, dependencies) {
  const { nav } = dependencies;
  const body = $('#srs-body');
  if (!body) return;

  const currentIndex = allParticles.findIndex((p) => p.particle === particle.particle);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allParticles.length - 1;

  const examplesHTML = particle.usage_examples
    .map((ex) => `<div class="particle-example-item">${ex}</div>`)
    .join('');

  body.innerHTML = `
    <div class="particle-detail-modal">
      <div class="particle-detail-header">
        <button class="btn-ghost" id="particle-detail-close">← Назад</button>
        <h2 class="particle-detail-title">${particle.particle}</h2>
        <button class="particle-detail-speak" id="particle-detail-speak" aria-label="Озвучить">🔊</button>
      </div>
      
      <div class="particle-detail-content">
        <div class="particle-detail-info">
          <div class="particle-detail-romaji">${particle.romaji}</div>
          <div class="particle-detail-badge">Урок ${particle.introduced_in_lesson} • ${particle.level}</div>
        </div>

        <div class="particle-detail-section">
          <h3 class="particle-detail-section-title">Функция</h3>
          <p class="particle-detail-function">${particle.function}</p>
        </div>

        <div class="particle-detail-section">
          <h3 class="particle-detail-section-title">Описание</h3>
          <p class="particle-detail-description">${particle.description}</p>
        </div>

        <div class="particle-detail-section">
          <h3 class="particle-detail-section-title">Примеры использования</h3>
          <div class="particle-detail-examples">
            ${examplesHTML}
          </div>
        </div>

        ${
          particle.grammar_note
            ? `
          <div class="particle-detail-section particle-note-section">
            <h3 class="particle-detail-section-title">📝 Грамматическая заметка</h3>
            <p class="particle-detail-note">${particle.grammar_note}</p>
          </div>
        `
            : ''
        }

        ${
          particle.common_mistakes
            ? `
          <div class="particle-detail-section particle-mistakes-section">
            <h3 class="particle-detail-section-title">⚠️ Частые ошибки</h3>
            <p class="particle-detail-mistakes">${particle.common_mistakes}</p>
          </div>
        `
            : ''
        }
      </div>

      <div class="particle-detail-navigation">
        <button 
          class="btn-secondary particle-nav-btn" 
          id="particle-nav-prev"
          ${!hasPrev ? 'disabled' : ''}
        >
          ← Предыдущая
        </button>
        <button 
          class="btn-secondary particle-nav-btn" 
          id="particle-nav-next"
          ${!hasNext ? 'disabled' : ''}
        >
          Следующая →
        </button>
      </div>
    </div>
  `;

  const closeBtn = $('#particle-detail-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      renderParticlesList(dependencies);
    };
  }

  const speakBtn = $('#particle-detail-speak');
  if (speakBtn) {
    speakBtn.onclick = (e) => {
      e.stopPropagation();
      speakJapanese(particle.particle);
    };
  }

  const prevBtn = $('#particle-nav-prev');
  if (prevBtn && hasPrev) {
    prevBtn.onclick = () => {
      openParticleDetail(allParticles[currentIndex - 1], allParticles, dependencies);
    };
  }

  const nextBtn = $('#particle-nav-next');
  if (nextBtn && hasNext) {
    nextBtn.onclick = () => {
      openParticleDetail(allParticles[currentIndex + 1], allParticles, dependencies);
    };
  }
}
