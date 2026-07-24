import { formatDateKey, getTodayDateKey } from './local-date.js';

export const REQUIRED_CHAPTER_SECTIONS = Object.freeze([
  Object.freeze({ id: 'vocab', label: 'Лексика' }),
  Object.freeze({ id: 'grammar', label: 'Грамматика' }),
  Object.freeze({ id: 'dialog', label: 'Диалог' }),
  Object.freeze({ id: 'listening', label: 'Аудирование' }),
  Object.freeze({ id: 'reading', label: 'Чтение' }),
]);

function normalizedChapterId(value) {
  const chapterId = Number(value);
  return Number.isInteger(chapterId) && chapterId > 0 ? chapterId : null;
}

export function getRequiredChapterSections(chapterMeta = null) {
  const configured = chapterMeta?.checklist;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured
      .map((entry) => {
        if (typeof entry === 'string') return { id: entry, label: entry };
        if (Array.isArray(entry) && entry[0]) return { id: entry[0], label: entry[1] || entry[0] };
        if (entry?.id || entry?.key) {
          const id = entry.id || entry.key;
          return { id, label: entry.label || entry.title || id };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (configured && typeof configured === 'object') {
    const sections = Object.entries(configured).map(([id, label]) => ({
      id,
      label: typeof label === 'string' ? label : id,
    }));
    if (sections.length > 0) return sections;
  }
  return REQUIRED_CHAPTER_SECTIONS;
}

export function hasCompletedChecklist(chapterState, requiredSections = null) {
  const checklist = chapterState?.checklist;
  if (!checklist || typeof checklist !== 'object') return false;
  const ids = requiredSections?.length
    ? requiredSections.map((section) => (typeof section === 'string' ? section : section.id))
    : Object.keys(checklist);
  return ids.length > 0 && ids.every((id) => checklist[id] === true);
}

export function isChapterCompleted(chapterState, chapterMeta = null) {
  if (chapterState?.completedAt) return true;
  return hasCompletedChecklist(chapterState, getRequiredChapterSections(chapterMeta));
}

export function isPriorKnowledge(appState, chapterId) {
  const id = normalizedChapterId(chapterId);
  if (!id || !Array.isArray(appState?.priorKnowledgeChapterIds)) return false;
  return appState.priorKnowledgeChapterIds.includes(id);
}

export function isEffectivelyCompleted(appState, chapterOrId) {
  if (!chapterOrId) return false;
  const chapterId = typeof chapterOrId === 'object' ? chapterOrId.id : chapterOrId;
  const meta = typeof chapterOrId === 'object' ? chapterOrId : null;
  const id = normalizedChapterId(chapterId);
  if (!id) return false;
  if (isChapterCompleted(appState?.chapters?.[id], meta)) return true;
  if (isPriorKnowledge(appState, id)) return true;
  if (appState?.studyPlan?.completedChapters?.includes(id)) return true;
  return false;
}

export function getChapterProgress(appState, chapterId, chapterMeta = null) {
  const id = normalizedChapterId(chapterId);
  const chapter = appState?.chapters?.[id] || { started: false, checklist: {} };
  const sections = getRequiredChapterSections(chapterMeta);

  const actualCompleted = isChapterCompleted(chapter, chapterMeta);
  const prior = isPriorKnowledge(appState, id);

  let completionSource = null;
  if (actualCompleted) {
    completionSource = 'app';
  } else if (prior) {
    completionSource = 'prior-knowledge';
  }

  const previouslyStudied = completionSource === 'prior-knowledge';
  const isCompleted = completionSource !== null;

  const completedSections = isCompleted
    ? sections
    : sections.filter((section) => chapter.checklist?.[section.id] === true);

  const nextSection = isCompleted
    ? null
    : sections.find((section) => chapter.checklist?.[section.id] !== true) || null;

  const completedCount = isCompleted ? sections.length : completedSections.length;
  const ratio = sections.length > 0 ? completedCount / sections.length : 0;

  return {
    chapterId: id,
    started: chapter.started === true || isCompleted,
    completed: isCompleted,
    completedAt: chapter.completedAt || null,
    completionSource,
    previouslyStudied,
    sections,
    completedSections,
    completedCount,
    totalCount: sections.length,
    nextSection,
    ratio,
  };
}

export function getCompletedChapterIds(appState, chapters = []) {
  if (Array.isArray(chapters) && chapters.length > 0) {
    return chapters
      .filter((chapter) => isEffectivelyCompleted(appState, chapter))
      .map((chapter) => chapter.id)
      .sort((a, b) => a - b);
  }
  const actual = Object.entries(appState?.chapters || {})
    .filter(([, chState]) => isChapterCompleted(chState))
    .map(([id]) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const prior = Array.isArray(appState?.priorKnowledgeChapterIds)
    ? appState.priorKnowledgeChapterIds
    : [];
  const planCompleted = Array.isArray(appState?.studyPlan?.completedChapters)
    ? appState.studyPlan.completedChapters
    : [];
  return [...new Set([...actual, ...prior, ...planCompleted])].sort((a, b) => a - b);
}

export function getActualCompletedChapterIds(appState, chapters = []) {
  if (Array.isArray(chapters) && chapters.length > 0) {
    return chapters
      .filter((chapter) => isChapterCompleted(appState?.chapters?.[chapter.id], chapter))
      .map((chapter) => chapter.id)
      .sort((a, b) => a - b);
  }
  return Object.entries(appState?.chapters || {})
    .filter(([, chState]) => isChapterCompleted(chState))
    .map(([id]) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
}

export function getPriorKnowledgeChapterIds(appState) {
  return Array.isArray(appState?.priorKnowledgeChapterIds)
    ? [...appState.priorKnowledgeChapterIds].sort((a, b) => a - b)
    : [];
}

export function isChapterAvailable(appState, chapters, chapterId) {
  const index = chapters.findIndex((chapter) => chapter.id === normalizedChapterId(chapterId));
  if (index < 0) return false;
  if (index === 0) return true;
  const previous = chapters[index - 1];
  return isEffectivelyCompleted(appState, previous);
}

function segmentIsCompleted(segment, appState, chapters) {
  if (!segment || segment.type !== 'chapter') return true;
  if (segment.status === 'completed' || segment.completedAt) return true;
  const meta = chapters.find((chapter) => chapter.id === segment.chapterId);
  return isEffectivelyCompleted(appState, meta);
}

export function getActivePlanSegment(appState, chapters, today = getTodayDateKey()) {
  const plan = appState?.studyPlan;
  if (!plan || plan.paused || !Array.isArray(plan.segments)) return null;
  const candidates = plan.segments.filter(
    (segment) => segment.type === 'chapter' && !segmentIsCompleted(segment, appState, chapters)
  );
  if (candidates.length === 0) return null;

  if (plan.activeSegmentId) {
    const explicit = candidates.find((segment) => segment.id === plan.activeSegmentId);
    if (explicit) return explicit;
  }

  const todaySegment = candidates.find((segment) => segment.assignedDates?.includes(today));
  if (todaySegment) return todaySegment;

  const startedSegment = candidates.find(
    (segment) =>
      appState?.chapters?.[segment.chapterId]?.started &&
      (segment.assignedDates || []).some((dateKey) => dateKey <= today)
  );
  if (startedSegment) return startedSegment;

  return candidates[0];
}

export function selectActiveChapterId(appState, chapters, today = getTodayDateKey()) {
  if (!appState || !Array.isArray(chapters) || chapters.length === 0) return null;

  const planSegment = getActivePlanSegment(appState, chapters, today);
  if (planSegment?.chapterId) return planSegment.chapterId;

  const started = chapters.find((chapter) => {
    const chapterState = appState.chapters?.[chapter.id];
    return chapterState?.started && !isEffectivelyCompleted(appState, chapter);
  });
  if (started) return started.id;

  const available = chapters.find(
    (chapter) =>
      !isEffectivelyCompleted(appState, chapter) &&
      isChapterAvailable(appState, chapters, chapter.id)
  );
  return available?.id ?? null;
}

export function ensureActiveChapterId(appState, chapters, today = getTodayDateKey()) {
  const selected = selectActiveChapterId(appState, chapters, today);
  appState.activeChapterId = selected;
  const segment = getActivePlanSegment(appState, chapters, today);
  if (appState.studyPlan) {
    appState.studyPlan.activeSegmentId = segment?.id || null;
  }
  return selected;
}

function appendLearningEvent(appState, event) {
  if (!Array.isArray(appState.learningEvents)) appState.learningEvents = [];
  if (appState.learningEvents.some((entry) => entry.eventId === event.eventId)) return false;
  appState.learningEvents.push(event);
  return true;
}

export function setChapterSection(
  appState,
  chapterId,
  sectionId,
  completed,
  { chapters = [], now = Date.now() } = {}
) {
  const id = normalizedChapterId(chapterId);
  if (!id || !sectionId) return { changed: false, completedNow: false };
  appState.chapters ||= {};
  const chapter = (appState.chapters[id] ||= { started: false, checklist: {} });
  chapter.checklist ||= {};
  const nextValue = completed === true;
  if (chapter.checklist[sectionId] === nextValue) {
    return { changed: false, completedNow: false, chapter };
  }

  chapter.started = true;
  chapter.checklist[sectionId] = nextValue;
  chapter.updatedAt = now;
  const dateKey = formatDateKey(now);
  const eventType = nextValue ? 'section-completed' : 'section-reopened';
  appendLearningEvent(appState, {
    eventId: `${eventType}:${id}:${sectionId}:${now}`,
    eventType,
    chapterId: id,
    sectionId,
    occurredAt: now,
    dateKey,
  });

  const meta = chapters.find((entry) => entry.id === id);
  const completedNow = !chapter.completedAt && isChapterCompleted(chapter, meta);
  return { changed: true, completedNow, chapter };
}

export function completeChapter(
  appState,
  chapterId,
  { chapters = [], now = Date.now(), recalculatePlan = null } = {}
) {
  const id = normalizedChapterId(chapterId);
  if (!id) return { changed: false, reason: 'invalid-chapter' };
  appState.chapters ||= {};
  const chapter = (appState.chapters[id] ||= { started: false, checklist: {} });
  const meta = chapters.find((entry) => entry.id === id);

  if (chapter.completedAt) {
    const activeChapterId = ensureActiveChapterId(appState, chapters);
    return { changed: false, alreadyCompleted: true, activeChapterId };
  }
  if (!hasCompletedChecklist(chapter, getRequiredChapterSections(meta))) {
    return { changed: false, reason: 'required-sections-incomplete' };
  }

  chapter.started = true;
  chapter.completedAt = now;
  chapter.requiredSectionsCompletedAt = now;
  const rewardGranted = !chapter.completionRewardedAt;
  if (rewardGranted) chapter.completionRewardedAt = now;

  const dateKey = formatDateKey(now);
  appendLearningEvent(appState, {
    eventId: `chapter-completed:${id}`,
    eventType: 'chapter-completed',
    chapterId: id,
    occurredAt: now,
    dateKey,
  });

  if (appState.studyPlan) {
    const plan = appState.studyPlan;
    plan.completedChapters = [...new Set([...(plan.completedChapters || []), id])].sort(
      (a, b) => a - b
    );
    const segment = plan.segments?.find(
      (entry) => entry.type === 'chapter' && entry.chapterId === id && !entry.completedAt
    );
    if (segment) {
      segment.status = 'completed';
      segment.completedAt = now;
      segment.dateStatuses ||= {};
      segment.dateStatuses[dateKey] = 'completed';
    }
    plan.history ||= [];
    if (!plan.history.some((entry) => entry.eventId === `chapter-completed:${id}`)) {
      plan.history.push({
        eventId: `chapter-completed:${id}`,
        eventType: 'chapter-completed',
        chapterId: id,
        occurredAt: now,
        dateKey,
      });
    }

    if (typeof recalculatePlan === 'function') {
      const recalculated = recalculatePlan(plan, chapters, plan.completedChapters, {
        today: dateKey,
      });
      if (recalculated && !recalculated.error && !recalculated.deadlineExpired) {
        appState.studyPlan = recalculated;
      } else if (recalculated?.deadlineExpired) {
        plan.deadlineState = recalculated;
      }
    }
  }

  const activeChapterId = ensureActiveChapterId(appState, chapters, dateKey);
  return { changed: true, rewardGranted, activeChapterId, completedAt: now };
}

/**
 * Вычислить канонический максимальный открытый урок на основе state.chapters
 * @param {object} appState
 * @param {Array|object} [contentIndex]
 * @returns {number} Номер максимального открытого урока (минимум 1)
 */
export function getCanonicalMaxUnlockedLesson(appState, contentIndex = null) {
  if (!appState) return 1;

  const chaptersList = Array.isArray(contentIndex)
    ? contentIndex
    : Array.isArray(contentIndex?.chapters)
      ? contentIndex.chapters
      : null;

  let maxUnlocked = 1;

  if (chaptersList && chaptersList.length > 0) {
    for (const ch of chaptersList) {
      const chId = Number(ch.id || ch.lesson_id);
      if (chId && isChapterAvailable(appState, chaptersList, chId)) {
        if (chId > maxUnlocked) maxUnlocked = chId;
      }
    }
  } else {
    const ids = [
      ...Object.keys(appState.chapters || {}),
      ...(appState.priorKnowledgeChapterIds || []),
    ];
    for (const key of ids) {
      const chId = Number(key);
      if (Number.isInteger(chId) && chId > 0) {
        if (isEffectivelyCompleted(appState, chId) || appState.chapters?.[chId]?.started) {
          if (chId > maxUnlocked) maxUnlocked = chId;
        }
      }
    }
  }

  if (Number.isInteger(appState.activeChapterId) && appState.activeChapterId > maxUnlocked) {
    const actId = appState.activeChapterId;
    if (
      chaptersList
        ? isChapterAvailable(appState, chaptersList, actId)
        : Boolean(appState.chapters?.[actId])
    ) {
      maxUnlocked = actId;
    }
  }

  return Math.max(1, maxUnlocked);
}
