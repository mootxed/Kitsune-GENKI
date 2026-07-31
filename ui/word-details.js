/**
 * ui/word-details.js — Full word page
 *
 * Renders a comprehensive word/dictionary entry page when user navigates to
 * screen-word-details, opened via nav('word-details', { dictionaryId, tokenId, ... }).
 *
 * Sections:
 *   1. Header (dictionary form, reading, source badge)
 *   2. Core entry (meanings, POS, tags)
 *   3. Current form context (if opened from a TokenOccurrence)
 *   4. Learning progress (FSRS read-only)
 *   5. Conjugations
 *   6. Grammar topics
 *   7. Examples
 *   8. Lessons
 *   9. Story occurrences
 *
 * This page NEVER mutates FSRS state.
 */

import { dictionaryStore } from '../src/dictionary/dictionary-store.js';
import { getDictionaryDetails } from '../src/dictionary/dictionary-details-service.js';
import { dictionaryRelationsIndex } from '../src/dictionary/dictionary-relations-index.js';
import {
  storyOccurrenceIndex,
  savedNotesToStoryDescriptors,
  builtinStoryToDescriptor,
} from '../src/dictionary/story-occurrence-index.js';
import { loadContentIndex, loadChapterData } from '../src/content-loader.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';
import {
  formatConfidence,
  formatRetrievability,
} from '../src/dictionary/dictionary-fsrs-service.js';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function skillLabel(skill) {
  const labels = {
    recognition: 'Узнавание',
    recall: 'Вспоминание',
    'reading-writing': 'Написание',
    'context-production': 'Производство',
  };
  return labels[skill] || skill;
}

function masteryLevelIcon(level) {
  const icons = {
    Новое: '🌱',
    Знакомо: '📖',
    Вспоминаю: '🔄',
    Уверенно: '✅',
    Освоено: '⭐',
  };
  return icons[level] || '❓';
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderSourceBadge(source, confidence = null) {
  if (source === 'curated') {
    return `<span class="badge badge-curated" aria-label="Проверенная запись">✓ Проверенная запись KotoKitsu</span>`;
  }
  if (source === 'ai') {
    const confLabel = confidence != null ? escapeHtml(formatConfidence(confidence)) : '';
    return `<span class="badge badge-ai" aria-label="Создано AI">🤖 Создано AI${confLabel ? ' · ' + confLabel : ''}</span>`;
  }
  return '';
}

function renderHeader(entry, context) {
  const sourceBadge = renderSourceBadge(entry.source, entry.confidence);
  return `
    <div class="word-details-header">
      <div class="word-details-title-row">
        <div>
          <h1 class="word-details-form" lang="ja">${escapeHtml(entry.dictionaryForm)}</h1>
          <p class="word-details-reading" lang="ja">${escapeHtml(entry.reading)}</p>
        </div>
        <div class="word-details-badges">
          ${sourceBadge}
        </div>
      </div>
    </div>`;
}

function renderCoreEntry(entry) {
  const posLabels = {
    noun: 'Существительное',
    verb: 'Глагол',
    adjective: 'Прилагательное',
    adverb: 'Наречие',
    particle: 'Частица',
    expression: 'Выражение',
    other: 'Другое',
  };
  const verbClassLabels = {
    godan: 'Глагол годан (u-verb)',
    ichidan: 'Глагол ичидан (ru-verb)',
    irregular: 'Неправильный глагол',
  };
  const adjClassLabels = { i: 'い-прилагательное', na: 'な-прилагательное' };

  const meanings = entry.meanings || [];
  const mainMeaning = meanings[0] || '';
  const extraMeanings = meanings.slice(1);

  const pos = entry.partOfSpeech ? posLabels[entry.partOfSpeech] || entry.partOfSpeech : null;
  const verbClass = entry.verbClass ? verbClassLabels[entry.verbClass] || entry.verbClass : null;
  const adjClass = entry.adjectiveClass
    ? adjClassLabels[entry.adjectiveClass] || entry.adjectiveClass
    : null;
  const transitivity =
    entry.transitivity === 'transitive'
      ? 'Переходный'
      : entry.transitivity === 'intransitive'
        ? 'Непереходный'
        : null;
  const tags = (entry.semanticTags || []).filter(Boolean);

  return `
    <section class="word-details-section" aria-labelledby="wd-meaning-heading">
      <h2 id="wd-meaning-heading" class="word-details-section-title">📝 Основная информация</h2>
      <div class="word-details-card">
        <p class="word-details-main-meaning">${escapeHtml(mainMeaning)}</p>
        ${
          extraMeanings.length > 0
            ? `
          <ul class="word-details-meanings-list" aria-label="Дополнительные значения">
            ${extraMeanings.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}
          </ul>`
            : ''
        }
        <div class="word-details-meta">
          ${pos ? `<span class="word-meta-tag">${escapeHtml(pos)}</span>` : ''}
          ${verbClass ? `<span class="word-meta-tag">${escapeHtml(verbClass)}</span>` : ''}
          ${adjClass ? `<span class="word-meta-tag">${escapeHtml(adjClass)}</span>` : ''}
          ${transitivity ? `<span class="word-meta-tag">${escapeHtml(transitivity)}</span>` : ''}
          ${tags.map((t) => `<span class="word-meta-tag word-meta-tag--semantic">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    </section>`;
}

function renderContextForm(context) {
  if (!context || !context.surface) return '';

  const form = context.form || {};
  const formParts = [form.tense, form.politeness, form.polarity].filter(Boolean);
  const formLabel = formParts.join(' · ');

  return `
    <section class="word-details-section" aria-labelledby="wd-form-heading">
      <h2 id="wd-form-heading" class="word-details-section-title">📍 Форма в контексте</h2>
      <div class="word-details-card">
        <p class="word-context-surface" lang="ja">${escapeHtml(context.surface)}</p>
        ${context.reading && context.reading !== context.surface ? `<p class="word-context-reading" lang="ja">${escapeHtml(context.reading)}</p>` : ''}
        ${context.contextMeaning ? `<p class="word-context-meaning">${escapeHtml(context.contextMeaning)}</p>` : ''}
        ${formLabel ? `<p class="word-context-form-label"><span aria-hidden="true">📋</span> ${escapeHtml(formLabel)}</p>` : ''}
      </div>
    </section>`;
}

function renderFSRS(fsrs) {
  if (!fsrs || !fsrs.hasFSRS) {
    return `
      <section class="word-details-section" aria-labelledby="wd-fsrs-heading">
        <h2 id="wd-fsrs-heading" class="word-details-section-title">📊 Прогресс изучения</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Прогресс изучения ещё не создан</p>
        </div>
      </section>`;
  }

  const levelIcon = masteryLevelIcon(fsrs.masteryLevel);
  const retrievabilityStr = formatRetrievability(fsrs.retrievability);
  const nextReview = fsrs.nextReviewDate
    ? `Следующее повторение: ${escapeHtml(fsrs.nextReviewDate)}`
    : 'Нет запланированного повторения';

  const skillsHtml = Object.entries(fsrs.skills || {})
    .map(([skill, info]) => {
      const status = info.hasSuccess ? '✅' : info.hasCards ? '📖' : '—';
      return `<div class="word-fsrs-skill">
      <span class="word-fsrs-skill-name">${escapeHtml(skillLabel(skill))}</span>
      <span class="word-fsrs-skill-status" aria-label="${info.hasSuccess ? 'Освоено' : 'В процессе'}">${status}</span>
    </div>`;
    })
    .join('');

  return `
    <section class="word-details-section" aria-labelledby="wd-fsrs-heading">
      <h2 id="wd-fsrs-heading" class="word-details-section-title">📊 Прогресс изучения</h2>
      <div class="word-details-card">
        <div class="word-fsrs-level">
          <span class="word-fsrs-level-icon" aria-hidden="true">${levelIcon}</span>
          <span class="word-fsrs-level-label">${escapeHtml(fsrs.masteryLabel || fsrs.masteryLevel || '—')}</span>
          <span class="word-fsrs-retrievability" aria-label="Запоминаемость: ${retrievabilityStr}">${retrievabilityStr}</span>
        </div>
        ${skillsHtml ? `<div class="word-fsrs-skills" aria-label="Навыки">${skillsHtml}</div>` : ''}
        <p class="word-fsrs-next-review">${escapeHtml(nextReview)}</p>
        ${(fsrs.reps || 0) > 0 ? `<p class="word-fsrs-stats">Повторений: ${fsrs.reps} · Ошибок: ${fsrs.lapses || 0}</p>` : ''}
      </div>
    </section>`;
}

function renderConjugations(conjugations, entry) {
  if (!entry || (entry.partOfSpeech !== 'verb' && entry.partOfSpeech !== 'adjective')) return '';

  if (entry.partOfSpeech === 'verb' && !entry.verbClass) {
    return `
      <section class="word-details-section" aria-labelledby="wd-conj-heading">
        <h2 id="wd-conj-heading" class="word-details-section-title">🔄 Спряжения</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Недостаточно данных для построения спряжений<br><small>Тип глагола не известен</small></p>
        </div>
      </section>`;
  }

  if (entry.partOfSpeech === 'adjective' && !entry.adjectiveClass) {
    return `
      <section class="word-details-section" aria-labelledby="wd-conj-heading">
        <h2 id="wd-conj-heading" class="word-details-section-title">🔄 Спряжения</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Недостаточно данных для построения спряжений<br><small>Класс прилагательного не известен</small></p>
        </div>
      </section>`;
  }

  if (!conjugations || conjugations.length === 0) return '';

  const learnedForms = conjugations.filter(
    (f) => f.availability === 'learned' || f.availability === 'available'
  );
  const futureForms = conjugations.filter(
    (f) => f.availability === 'future' || f.availability === 'unknown'
  );

  const renderForm = (f) => `
    <div class="word-conj-form ${f.availability === 'future' ? 'word-conj-form--future' : ''}"
         aria-label="${escapeHtml(f.label)}">
      <span class="word-conj-form-kanji" lang="ja">${escapeHtml(f.kanji || f.kana)}</span>
      <span class="word-conj-form-kana" lang="ja">${f.kanji !== f.kana ? escapeHtml(f.kana) : ''}</span>
      <span class="word-conj-form-label">${escapeHtml(f.label)}</span>
      ${f.availability === 'future' ? '<span class="word-conj-future-badge" aria-label="Материал будущего урока">📅 Будущий урок</span>' : ''}
    </div>`;

  return `
    <section class="word-details-section" aria-labelledby="wd-conj-heading">
      <h2 id="wd-conj-heading" class="word-details-section-title">🔄 Спряжения</h2>
      <div class="word-details-card">
        <div class="word-conj-grid">
          ${learnedForms.map(renderForm).join('')}
        </div>
        ${
          futureForms.length > 0
            ? `
          <details class="word-conj-future-details">
            <summary>Формы будущих уроков (${futureForms.length})</summary>
            <div class="word-conj-grid word-conj-grid--future">
              ${futureForms.map(renderForm).join('')}
            </div>
          </details>`
            : ''
        }
      </div>
    </section>`;
}

function renderGrammarTopics(grammarTopics) {
  if (!grammarTopics || grammarTopics.length === 0) {
    return `
      <section class="word-details-section" aria-labelledby="wd-grammar-heading">
        <h2 id="wd-grammar-heading" class="word-details-section-title">📚 Связанная грамматика</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Нет связанных грамматических тем</p>
        </div>
      </section>`;
  }

  const topicsHtml = grammarTopics
    .map(
      (t) => `
    <button class="word-grammar-topic-btn btn-ghost"
      data-grammar-id="${escapeHtml(t.grammarId || t.id || '')}"
      data-chapter-id="${escapeHtml(t.chapterId || t.lessonId || '')}"
      aria-label="Открыть грамматику: ${escapeHtml(t.title || t.grammarId)}">
      <span class="word-grammar-topic-title">${escapeHtml(t.title || t.grammarId)}</span>
      ${t.reason ? `<span class="word-grammar-topic-reason">${escapeHtml(t.reason)}</span>` : ''}
    </button>`
    )
    .join('');

  return `
    <section class="word-details-section" aria-labelledby="wd-grammar-heading">
      <h2 id="wd-grammar-heading" class="word-details-section-title">📚 Связанная грамматика</h2>
      <div class="word-details-card">
        <div class="word-grammar-list">${topicsHtml}</div>
      </div>
    </section>`;
}

function renderExamples(examples) {
  if (!examples || examples.length === 0) {
    return `
      <section class="word-details-section" aria-labelledby="wd-examples-heading">
        <h2 id="wd-examples-heading" class="word-details-section-title">💬 Примеры</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Пока нет примеров</p>
        </div>
      </section>`;
  }

  const exHtml = examples
    .slice(0, 8)
    .map((ex) => {
      const isStory = ex.origin === 'story' || ex.source === 'story';
      const isCurated =
        !isStory &&
        (ex.trustLevel === 'curated' ||
          ex.normalizedSource === 'curated' ||
          ex.source === 'curated');
      const isAi = !isStory && !isCurated && (ex.trustLevel === 'ai' || ex.source === 'ai');
      const sourceLabel = isStory
        ? '📖 Из истории'
        : isCurated
          ? '✓ Проверенный пример'
          : isAi
            ? '🤖 AI'
            : '❓ Неизвестно';
      return `
    <div class="word-example">
      <p class="word-example-jp" lang="ja">${escapeHtml(ex.sentence)}</p>
      ${ex.translation ? `<p class="word-example-trans">${escapeHtml(ex.translation)}</p>` : ''}
      <span class="word-example-source">${sourceLabel}</span>
    </div>`;
    })
    .join('<hr class="word-example-divider">');

  return `
    <section class="word-details-section" aria-labelledby="wd-examples-heading">
      <h2 id="wd-examples-heading" class="word-details-section-title">💬 Примеры</h2>
      <div class="word-details-card">
        ${exHtml}
      </div>
    </section>`;
}

function renderLessons(lessons) {
  if (!lessons || lessons.length === 0) {
    return `
      <section class="word-details-section" aria-labelledby="wd-lessons-heading">
        <h2 id="wd-lessons-heading" class="word-details-section-title">🎓 Уроки</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Слово ещё не связано с уроками</p>
        </div>
      </section>`;
  }

  const lessonHtml = lessons
    .map(
      (l) => `
    <button class="word-lesson-item-btn btn-ghost ${l.isActiveCourse ? 'word-lesson-item--active' : ''}"
      data-lesson-id="${escapeHtml(l.lessonId || l.introducedIn || '')}"
      data-course-id="${escapeHtml(l.courseId || '')}">
      <span class="word-lesson-course">${escapeHtml(l.courseId)}</span>
      <span class="word-lesson-id">${escapeHtml(l.introduced ? `Впервые: ${l.introducedIn || l.lessonId}` : `Также встречается: урок ${l.lessonId}`)}</span>
      ${l.courseMeaning ? `<span class="word-lesson-meaning">${escapeHtml(l.courseMeaning)}</span>` : ''}
    </button>`
    )
    .join('');

  return `
    <section class="word-details-section" aria-labelledby="wd-lessons-heading">
      <h2 id="wd-lessons-heading" class="word-details-section-title">🎓 Уроки</h2>
      <div class="word-details-card">
        <div class="word-lessons-list">${lessonHtml}</div>
      </div>
    </section>`;
}

function renderStoryOccurrences(occurrences, nav) {
  if (!occurrences || occurrences.length === 0) {
    return `
      <section class="word-details-section" aria-labelledby="wd-stories-heading">
        <h2 id="wd-stories-heading" class="word-details-section-title">📖 В историях</h2>
        <div class="word-details-card">
          <p class="word-details-empty">Нет сохранённых историй с этим словом</p>
        </div>
      </section>`;
  }

  // Group by story
  const byStory = new Map();
  for (const occ of occurrences) {
    if (!byStory.has(occ.storyId)) {
      byStory.set(occ.storyId, { title: occ.storyTitle, source: occ.source, occurrences: [] });
    }
    byStory.get(occ.storyId).occurrences.push(occ);
  }

  const storyHtml = [...byStory.entries()]
    .map(
      ([storyId, group]) => `
    <div class="word-story-group">
      <div class="word-story-title-row">
        <span class="word-story-title">${escapeHtml(group.title)}</span>
        <span class="badge badge-${group.source === 'ai' ? 'ai' : 'curated'}">${group.source === 'ai' ? '🤖 AI' : '✓'}</span>
        <span class="word-story-count">${group.occurrences.length}×</span>
      </div>
      ${group.occurrences
        .slice(0, 3)
        .map(
          (occ) => `
        <div class="word-story-occurrence">
          <p class="word-story-sentence" lang="ja">${escapeHtml(occ.sentence)}</p>
          ${occ.translation ? `<p class="word-story-trans">${escapeHtml(occ.translation)}</p>` : ''}
          <button class="btn-ghost word-story-open-btn"
            data-story-id="${escapeHtml(occ.storyId)}"
            data-lesson-id="${escapeHtml(occ.lessonId || '')}"
            data-course-id="${escapeHtml(occ.courseId || '')}"
            data-sentence-id="${escapeHtml(String(occ.sentenceId))}"
            data-token-id="${escapeHtml(occ.tokenId)}"
            aria-label="Открыть в истории: ${escapeHtml(occ.storyTitle)}">
            📖 Открыть в истории
          </button>
        </div>`
        )
        .join('')}
    </div>`
    )
    .join('<hr class="word-story-divider">');

  return `
    <section class="word-details-section" aria-labelledby="wd-stories-heading">
      <h2 id="wd-stories-heading" class="word-details-section-title">📖 В историях</h2>
      <div class="word-details-card">
        ${storyHtml}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Skeleton and error states
// ---------------------------------------------------------------------------

function renderSkeleton() {
  return `
    <div class="word-details-skeleton" aria-busy="true" aria-label="Загрузка...">
      <div class="skeleton-block skeleton-title"></div>
      <div class="skeleton-block skeleton-text"></div>
      <div class="skeleton-block skeleton-text"></div>
    </div>`;
}

function renderNotFound(dictionaryId) {
  return `
    <div class="word-details-not-found" role="alert">
      <div class="word-details-not-found-icon" aria-hidden="true">❓</div>
      <h2>Запись не найдена</h2>
      <p>Словарная запись <code>${escapeHtml(dictionaryId || '—')}</code> не существует.</p>
    </div>`;
}

function renderError(message) {
  return `
    <div class="word-details-error" role="alert">
      <div aria-hidden="true">⚠️</div>
      <h2>Ошибка загрузки</h2>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Setup story navigation from word page
// ---------------------------------------------------------------------------

function setupStoryNavigation(container, nav) {
  container.querySelectorAll('.word-story-open-btn').forEach((btn) => {
    btn.onclick = () => {
      const storyId = btn.dataset.storyId;
      const lessonId = btn.dataset.lessonId || undefined;
      const courseId = btn.dataset.courseId || undefined;
      const sentenceId = btn.dataset.sentenceId;
      const tokenId = btn.dataset.tokenId;
      if (!storyId) return;
      // Navigate to story with highlight context
      nav('story', { storyId, lessonId, courseId, sentenceId, tokenId, highlight: true });
    };
  });
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render the word details screen.
 *
 * @param {object} state          — app state
 * @param {object} dependencies   — { nav, SRS, ... }
 * @param {object} options        — { dictionaryId, tokenId, storyId, sentenceId, surface, contextMeaning }
 */
export async function renderWordDetails(state, dependencies, options = {}, context = {}) {
  const body = document.getElementById('word-details-body');
  if (!body) return;

  const signal = context?.signal;
  const navFn = dependencies?.nav || window.nav || (() => {});
  const {
    dictionaryId,
    surface,
    reading: ctxReading,
    contextMeaning,
    storyId,
    sentenceId,
    tokenId,
  } = options || {};

  if (!dictionaryId) {
    body.innerHTML = renderNotFound(null);
    return;
  }

  // Show skeleton while loading
  body.innerHTML = renderSkeleton();

  const dictStore = dependencies?.dictionaryStore || dictionaryStore;

  try {
    await dictStore.ensureLoaded();
    if (signal?.aborted) return;

    // Build story occurrence index from saved notes and built-in stories (if not already built)
    if (!storyOccurrenceIndex.isBuilt) {
      const savedNotes = state?.savedNotes || [];
      const descriptors = savedNotesToStoryDescriptors(savedNotes);

      try {
        const activeCourseId = state?.activeCourseId || 'genki-1';
        const contentIndex = await loadContentIndex(activeCourseId);
        const chapters = contentIndex?.chapters || [];
        for (const chapter of chapters) {
          if (!chapter || (!chapter.story && !chapter.storyMeta)) continue;
          try {
            const lessonId = chapter.id;
            const { story } = await loadChapterData(lessonId, activeCourseId);
            if (story) {
              let storyToResolve = story;
              try {
                const resolved = await resolveStoryTokens({
                  story,
                  dictionaryStore: dictStore,
                  activeCourseId,
                  disableAiFallback: true,
                  aiLexicalProvider: null,
                });
                storyToResolve = resolved.story || story;
              } catch (resolveErr) {
                console.warn(
                  '[WordDetails] Failed resolving built-in story tokens for index:',
                  resolveErr
                );
              }
              descriptors.push(builtinStoryToDescriptor(storyToResolve, activeCourseId));
            }
          } catch {
            // ignore failure for single story
          }
        }
      } catch {
        // ignore failure if course content index unavailable
      }

      storyOccurrenceIndex.build(descriptors, { dictionaryStore: dictStore });
    }

    // Build TokenOccurrence context from options (if opened from a token click)
    let tokenOccurrence = null;
    if (surface) {
      tokenOccurrence = {
        id: tokenId || null,
        surface,
        reading: ctxReading || surface,
        contextMeaning: contextMeaning || null,
        storyId: storyId || null,
        sentenceId: sentenceId || null,
        form: options.form || {},
        resolution: { status: 'resolved' },
      };
    }

    // Gather all details
    const details = getDictionaryDetails({
      dictionaryId,
      tokenOccurrence,
      activeCourseId: state?.activeCourseId || null,
      state,
      dictionaryStore: dictStore,
      relationsIndex: dictionaryRelationsIndex,
      storyIndex: storyOccurrenceIndex,
      srs: dependencies?.SRS || null,
    });

    if (signal?.aborted) return;

    if (details.status === 'not-found') {
      body.innerHTML = renderNotFound(dictionaryId);
      return;
    }

    const {
      entry,
      context: tokenCtx,
      examples,
      conjugations,
      grammarTopics,
      lessons,
      storyOccurrences,
      fsrs,
    } = details;

    // Render all sections
    body.innerHTML = `
    <div class="word-details-page">
      ${renderHeader(entry, tokenCtx)}
      ${renderCoreEntry(entry)}
      ${renderContextForm(tokenCtx)}
      ${renderFSRS(fsrs)}
      ${renderConjugations(conjugations, entry)}
      ${renderGrammarTopics(grammarTopics)}
      ${renderExamples(examples)}
      ${renderLessons(lessons)}
      ${renderStoryOccurrences(storyOccurrences, navFn)}
    </div>`;

    // Wire up story navigation buttons
    setupStoryNavigation(body, navFn);

    // Wire up grammar buttons
    body.querySelectorAll('.word-grammar-topic-btn').forEach((btn) => {
      btn.onclick = () => {
        const chapterId = btn.dataset.chapterId;
        const grammarId = btn.dataset.grammarId;
        if (chapterId) {
          navFn('chapter', { chapterId, focusGrammarId: grammarId });
        }
      };
    });

    // Wire up lesson buttons
    body.querySelectorAll('.word-lesson-item-btn').forEach((btn) => {
      btn.onclick = () => {
        const lessonId = btn.dataset.lessonId;
        const courseId = btn.dataset.courseId;
        if (lessonId) {
          navFn('chapter', { courseId, chapterId: lessonId });
        }
      };
    });
  } catch (err) {
    if (signal?.aborted) return;
    console.error('[WordDetails] Error rendering details:', err);
    body.innerHTML = renderError(err.message || 'Не удалось загрузить словарь');
  }
}
