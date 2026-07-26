import { formatDateKey, getTodayDateKey } from './local-date.js';
import { getChapterVocabularyProgress } from './vocabulary-unlock-plan.js';
import {
  getNormalizedChapterPracticeTasks,
  isPracticeTaskEnabled,
  isPracticeTaskRequired,
  getRequiredChapterPracticeTasks,
} from './practice-tasks.js';
import { getGrammarTopicStatus } from './grammar-plan.js';
import {
  canUnlockPracticeTask,
  completePracticeTask as domainCompletePracticeTask,
  undoPracticeTask as domainUndoPracticeTask,
} from './practice-plan.js';
import {
  normalizedChapterId,
  getChapterGrammarTopics,
  getChapterPracticeTasks,
} from './chapter-content-model.js';
import {
  isPriorKnowledge,
  isGrammarTopicCompleted,
  isPracticeItemCompleted,
  isBasicVocabularyEvidencePresent,
} from './chapter-evidence.js';

export {
  normalizedChapterId,
  getChapterGrammarTopics,
  getChapterPracticeTasks,
  isPriorKnowledge,
  isGrammarTopicCompleted,
  isPracticeItemCompleted,
};

export const REQUIRED_CHAPTER_SECTIONS = Object.freeze([
  Object.freeze({ id: 'vocab', label: 'Лексика' }),
  Object.freeze({ id: 'grammar', label: 'Грамматика' }),
  Object.freeze({ id: 'dialog', label: 'Диалог' }),
  Object.freeze({ id: 'listening', label: 'Аудирование' }),
  Object.freeze({ id: 'reading', label: 'Чтение' }),
]);

export function isVocabularyBlockCompleted(appState, chapterId, chapterMeta = null) {
  const id = normalizedChapterId(chapterId);
  if (!id) return false;
  const chapterState = appState?.chapters?.[id];
  if (chapterState?.legacyVocabularyCompleted === true || chapterState?.checklist?.vocab === true)
    return true;
  if (isPriorKnowledge(appState, id)) return true;

  const words = chapterMeta?.words || chapterMeta?.vocabulary || null;
  if (words && Array.isArray(words) && words.length > 0) {
    return getChapterVocabularyProgress(appState, id, chapterMeta).isCompleted;
  }
  return true;
}

export function materializeLegacyChapterEvidence(chapterState, chapterMeta) {
  if (!chapterState || !chapterMeta) return { changed: false };
  let changed = false;

  if (
    chapterState.legacyCompletionEvidence?.grammar === true ||
    chapterState.checklist?.grammar === true
  ) {
    const topics = getChapterGrammarTopics(chapterMeta);
    chapterState.checklist ||= {};
    for (const topic of topics) {
      if (chapterState.checklist[topic.id] !== true) {
        chapterState.checklist[topic.id] = true;
        changed = true;
      }
    }
    if (chapterState.legacyCompletionEvidence?.grammar) {
      chapterState.legacyCompletionEvidence.grammar = false;
      changed = true;
    }
    if (chapterState.checklist.grammar !== undefined) {
      delete chapterState.checklist.grammar;
      changed = true;
    }
  }

  return { changed };
}

export function isGrammarBlockCompleted(chapterState, chapterMeta) {
  if (
    chapterState?.legacyCompletionEvidence?.grammar === true ||
    chapterState?.checklist?.grammar === true
  ) {
    return true;
  }
  const topics = getChapterGrammarTopics(chapterMeta);
  if (topics.length === 0) return true;
  return topics.every((topic) => isGrammarTopicCompleted(chapterState, topic.id));
}

export function isPracticeBlockCompleted(chapterState, chapterMeta, appState = null) {
  const requiredTasks = getRequiredChapterPracticeTasks(chapterMeta, appState?.workbookSettings);
  if (requiredTasks.length === 0) return true;
  return requiredTasks.every((task) => isPracticeItemCompleted(chapterState, task.id));
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

  const grammarTopics = getChapterGrammarTopics(chapterMeta);
  const practiceTasks = getChapterPracticeTasks(chapterMeta);

  const sections = [];
  sections.push({ id: 'vocab', label: 'Новые слова', type: 'vocabulary' });

  if (grammarTopics.length > 0) {
    for (const g of grammarTopics) {
      sections.push({ id: g.id, label: g.title, type: 'grammar', topic: g });
    }
  } else {
    sections.push({ id: 'grammar', label: 'Грамматика', type: 'grammar' });
  }

  for (const p of practiceTasks) {
    sections.push({ id: p.id, label: p.title, type: 'practice', task: p });
  }

  return sections;
}

export function hasCompletedChecklist(
  chapterState,
  requiredSections = null,
  appState = null,
  chapterMeta = null
) {
  const checklist = chapterState?.checklist;
  if (!checklist || typeof checklist !== 'object') return false;

  const sections =
    Array.isArray(requiredSections) && requiredSections.length > 0
      ? requiredSections
      : getRequiredChapterSections(chapterMeta);

  if (!sections || sections.length === 0) return false;

  return sections.every((sec) => {
    const secId = typeof sec === 'string' ? sec : sec.id;
    if (secId === 'vocab') {
      return (
        chapterState.legacyVocabularyCompleted === true ||
        chapterState.checklist?.vocab === true ||
        isVocabularyBlockCompleted(appState, chapterState.id || chapterMeta?.id, chapterMeta)
      );
    }
    if (secId === 'grammar') {
      return isGrammarBlockCompleted(chapterState, chapterMeta);
    }
    if (sec.type === 'grammar' || (typeof secId === 'string' && secId.includes('_g'))) {
      return isGrammarTopicCompleted(chapterState, secId);
    }
    if (sec.type === 'practice') {
      if (sec.task?.required === false) return true;
      if (
        sec.task?.section === 'reading-writing' &&
        appState?.workbookSettings?.includeReadingWriting === false
      ) {
        return true;
      }
      if (
        sec.task?.section !== 'reading-writing' &&
        sec.task?.requiredForChapterCompletion === false
      ) {
        return true;
      }
    }
    return checklist[secId] === true;
  });
}

export function isChapterCompleted(chapterState, chapterMeta = null, appState = null) {
  if (!chapterState) return false;
  const isPrior = appState && isPriorKnowledge(appState, chapterState.id || chapterMeta?.id);
  if (isPrior) return true;

  const checklistComplete = hasCompletedChecklist(
    chapterState,
    getRequiredChapterSections(chapterMeta),
    appState,
    chapterMeta
  );

  if (chapterState.completedAt && checklistComplete) return true;
  return checklistComplete;
}

export function shouldChapterHaveVocabularyCards(appState, chapterId) {
  const id = normalizedChapterId(chapterId);
  if (!id) return false;
  const chapter = appState?.chapters?.[id];
  if (chapter?.started === true || Boolean(chapter?.completedAt)) return true;
  if (isPriorKnowledge(appState, id)) return true;
  return false;
}

export function isEffectivelyCompleted(appState, chapterOrId) {
  if (!chapterOrId) return false;
  const chapterId = typeof chapterOrId === 'object' ? chapterOrId.id : chapterOrId;
  const meta = typeof chapterOrId === 'object' ? chapterOrId : null;
  const id = normalizedChapterId(chapterId);
  if (!id) return false;
  if (isChapterCompleted(appState?.chapters?.[id], meta, appState)) return true;
  if (isPriorKnowledge(appState, id)) return true;
  if (appState?.studyPlan?.completedChapters?.includes(id)) return true;
  return false;
}

export function getChapterProgress(appState, chapterId, chapterMeta = null) {
  const id = normalizedChapterId(chapterId);
  const chapter = appState?.chapters?.[id] || { started: false, checklist: {} };
  const sections = getRequiredChapterSections(chapterMeta);

  const actualCompleted = isChapterCompleted(chapter, chapterMeta, appState);
  const prior = isPriorKnowledge(appState, id);

  let completionSource = null;
  if (actualCompleted) {
    completionSource = 'app';
  } else if (prior) {
    completionSource = 'prior-knowledge';
  }

  const previouslyStudied = completionSource === 'prior-knowledge';
  const isCompleted = completionSource !== null;

  const grammarTopics = getChapterGrammarTopics(chapterMeta);
  const practiceTasks = getChapterPracticeTasks(chapterMeta);

  const completedSections = isCompleted
    ? sections
    : sections.filter((section) => {
        if (section.id === 'vocab') {
          return isVocabularyBlockCompleted(appState, id, chapterMeta);
        }
        if (
          section.type === 'grammar' ||
          (typeof section.id === 'string' && section.id.includes('_g')) ||
          section.id === 'grammar'
        ) {
          return isGrammarTopicCompleted(chapter, section.id);
        }
        return isPracticeItemCompleted(chapter, section.id);
      });

  const completedCount = isCompleted ? sections.length : completedSections.length;
  const ratio = sections.length > 0 ? completedCount / sections.length : 0;
  const nextSection = isCompleted
    ? null
    : sections.find((section) => !completedSections.some((c) => c.id === section.id)) || null;

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
    grammarTopics,
    practiceTasks,
  };
}

export function getChapterProgressSnapshot(appState, chapterId, chapterMeta = null) {
  const id = normalizedChapterId(chapterId);
  const chapterState = appState?.chapters?.[id] || { started: false, checklist: {} };

  const prior = isPriorKnowledge(appState, id);
  const isComp = prior || isChapterCompleted(chapterState, chapterMeta, appState);

  const words = chapterMeta?.words || chapterMeta?.vocabulary || [];
  const vocabTotal = words.length;

  let vocabCompleted = 0;
  let vocabUnlocked = 0;
  let vocabLocked = 0;

  if (prior || isComp) {
    vocabCompleted = vocabTotal;
    vocabUnlocked = vocabTotal;
    vocabLocked = 0;
  } else if (words.length > 0) {
    const vocabProg = getChapterVocabularyProgress(appState, id, chapterMeta);
    vocabCompleted = Number(vocabProg?.introducedWords) || 0;
    vocabUnlocked = Number(vocabProg?.unlockedWords) || 0;
    vocabLocked = Number(vocabProg?.lockedWords) || 0;
  }
  const vocabRatio = vocabTotal > 0 ? Math.min(1, vocabCompleted / vocabTotal) : 1;

  const topics = getChapterGrammarTopics(chapterMeta);
  const grammarTotal = topics.length;

  let grammarCompleted = 0;
  let grammarAvailable = 0;
  let grammarLocked = 0;

  if (prior || isComp) {
    grammarCompleted = grammarTotal;
    grammarAvailable = 0;
    grammarLocked = 0;
  } else {
    const statuses = topics.map((t) => getGrammarTopicStatus(appState, id, t.id, chapterMeta));
    grammarCompleted = statuses.filter((s) => s === 'completed').length;
    grammarAvailable = statuses.filter((s) => s === 'unlocked' || s === 'in_progress').length;
    grammarLocked = statuses.filter((s) => s === 'locked').length;
  }
  const grammarRatio = grammarTotal > 0 ? grammarCompleted / grammarTotal : 1;

  const practiceTasks = getChapterPracticeTasks(chapterMeta);
  const requiredPracticeTasks = getRequiredChapterPracticeTasks(
    chapterMeta,
    appState?.workbookSettings
  );

  const practiceTotal = practiceTasks.length;
  const practiceRequired = requiredPracticeTasks.length;

  let practiceCompleted = 0;
  let practiceAvailable = 0;
  let practiceLocked = 0;

  if (prior || isComp) {
    practiceCompleted = practiceRequired;
    practiceAvailable = 0;
    practiceLocked = 0;
  } else {
    practiceCompleted = requiredPracticeTasks.filter((t) =>
      isPracticeItemCompleted(chapterState, t.id)
    ).length;
    practiceAvailable = requiredPracticeTasks.filter((t) => {
      if (isPracticeItemCompleted(chapterState, t.id)) return false;
      return canUnlockPracticeTask(appState, id, t, chapterMeta).canUnlock;
    }).length;
    practiceLocked = requiredPracticeTasks.filter((t) => {
      if (isPracticeItemCompleted(chapterState, t.id)) return false;
      return !canUnlockPracticeTask(appState, id, t, chapterMeta).canUnlock;
    }).length;
  }
  const practiceRatio = practiceRequired > 0 ? practiceCompleted / practiceRequired : 1;

  const vocabMinutes = vocabTotal * 1;
  const grammarMinutes = grammarTotal * 10;
  const requiredPracticeMinutes = requiredPracticeTasks.reduce(
    (sum, t) => sum + Number(t.estimatedMinutes || 10),
    0
  );

  const requiredTotalMinutes = Math.max(1, vocabMinutes + grammarMinutes + requiredPracticeMinutes);

  const completedVocabMinutes = (prior || isComp ? vocabTotal : vocabCompleted) * 1;
  const completedGrammarMinutes = grammarCompleted * 10;
  const completedPracticeMinutes = (
    prior || isComp
      ? requiredPracticeTasks
      : requiredPracticeTasks.filter((t) => isPracticeItemCompleted(chapterState, t.id))
  ).reduce((sum, t) => sum + Number(t.estimatedMinutes || 10), 0);

  const completedRequiredMinutes =
    prior || isComp
      ? requiredTotalMinutes
      : completedVocabMinutes + completedGrammarMinutes + completedPracticeMinutes;

  const overallRatio = isComp
    ? 1
    : Math.min(1, Math.max(0, completedRequiredMinutes / requiredTotalMinutes));

  return {
    chapterId: id,
    vocabulary: {
      total: vocabTotal,
      completed: vocabCompleted,
      unlocked: vocabUnlocked,
      locked: vocabLocked,
      ratio: vocabRatio,
    },
    grammar: {
      total: grammarTotal,
      completed: grammarCompleted,
      available: grammarAvailable,
      locked: grammarLocked,
      ratio: grammarRatio,
    },
    practice: {
      total: practiceTotal,
      required: practiceRequired,
      completed: practiceCompleted,
      available: practiceAvailable,
      locked: practiceLocked,
      ratio: practiceRatio,
    },
    completedRequiredMinutes,
    requiredTotalMinutes,
    overallRatio,
    requiredCompleted: vocabCompleted + grammarCompleted + practiceCompleted,
    requiredTotal: vocabTotal + grammarTotal + practiceRequired,
    isCompleted: isComp,
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
  if (!hasCompletedChecklist(chapter, getRequiredChapterSections(meta), appState, meta)) {
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
        vocabularyUnlocks: appState.vocabularyUnlocks || {},
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

export function evaluateChapterCompletion(appState, chapterId, context = {}) {
  const id = normalizedChapterId(chapterId);
  if (!id) return { changed: false, reason: 'invalid-chapter' };

  if (isPriorKnowledge(appState, id)) {
    return {
      changed: false,
      isCompleted: true,
      reason: 'prior-knowledge',
      activeChapterId: ensureActiveChapterId(appState, context.chapters || []),
    };
  }

  appState.chapters ||= {};
  const chapter = (appState.chapters[id] ||= { started: false, checklist: {} });
  const meta = (context.chapters || []).find((entry) => entry.id === id);
  const now = context.now || Date.now();
  const dateKey = formatDateKey(now);

  const checklistComplete = hasCompletedChecklist(
    chapter,
    getRequiredChapterSections(meta),
    appState,
    meta
  );

  if (checklistComplete && !chapter.completedAt) {
    return completeChapter(appState, id, context);
  }

  if (!checklistComplete && chapter.completedAt) {
    chapter.completedAt = null;
    chapter.requiredSectionsCompletedAt = null;

    if (appState.studyPlan) {
      const plan = appState.studyPlan;
      if (Array.isArray(plan.completedChapters)) {
        plan.completedChapters = plan.completedChapters.filter((ch) => ch !== id);
      }
      const segment = plan.segments?.find(
        (entry) => entry.type === 'chapter' && entry.chapterId === id
      );
      if (segment && segment.status === 'completed') {
        segment.status = 'planned';
        segment.completedAt = null;
      }
    }

    appendLearningEvent(appState, {
      eventId: `chapter-reopened:${id}:${now}`,
      eventType: 'chapter-reopened',
      chapterId: id,
      occurredAt: now,
      dateKey,
    });

    const activeChapterId = ensureActiveChapterId(appState, context.chapters || [], dateKey);
    return { changed: true, reopened: true, isCompleted: false, activeChapterId };
  }

  return {
    changed: false,
    alreadyCompleted: Boolean(checklistComplete && chapter.completedAt),
    isCompleted: checklistComplete,
    activeChapterId: ensureActiveChapterId(appState, context.chapters || []),
  };
}

export const evaluateAndCompleteChapter = evaluateChapterCompletion;

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

export function completePracticeTask(appState, chapterId, taskId, options = {}) {
  return domainCompletePracticeTask(appState, chapterId, taskId, {
    ...options,
    evaluateAndCompleteChapter,
  });
}

export function undoPracticeTask(appState, chapterId, taskId, options = {}) {
  return domainUndoPracticeTask(appState, chapterId, taskId, {
    ...options,
    evaluateAndCompleteChapter,
  });
}
