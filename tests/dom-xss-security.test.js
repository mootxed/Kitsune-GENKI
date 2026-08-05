import { describe, it, expect, beforeEach } from 'vitest';
import { initializeDB } from '../src/db.js';
import { defaultState } from '../state/store.js';
import { renderPlan } from '../ui/plan.js';
import { renderOnboarding } from '../ui/onboarding.js';
import { renderSentenceBuilding } from '../ui/flashcards/card-modes.js';
import { renderUserDictionaries } from '../ui/user-dictionaries.js';
import { renderSensei } from '../ui/chat.js';

describe('DOM XSS Security Boundaries & Sentinel Verification', () => {
  const SENTINEL_STRING = '<img src="x" data-security-sentinel="true" onerror="void(0)">';

  beforeEach(async () => {
    await initializeDB();
    document.body.innerHTML = '';
  });

  it('1. User Dictionary: rendering dictionary with sentinel payload does not inject DOM element', async () => {
    document.body.innerHTML = '<div id="user-dictionaries-body"></div>';
    const stateMock = defaultState();
    const maliciousDict = {
      id: 'dict-xss',
      title: `Dictionary ${SENTINEL_STRING}`,
      description: `Description ${SENTINEL_STRING}`,
      entries: [
        {
          id: 'entry-1',
          writing: SENTINEL_STRING,
          reading: SENTINEL_STRING,
          meaning: SENTINEL_STRING,
        },
      ],
    };

    renderUserDictionaries(stateMock, { userDictionaries: [maliciousDict] });

    const sentinelEl = document.querySelector('[data-security-sentinel="true"]');
    expect(sentinelEl).toBeNull();
  });

  it('2. Study Plan Data: rendering plan view with sentinel title does not inject DOM element', async () => {
    document.body.innerHTML = `
      <div id="plan-body"></div>
      <div id="completed-chapters-list"></div>
      <div id="plan-view-summary"></div>
    `;
    const stateMock = defaultState();
    stateMock.studyPlan = {
      targetDate: SENTINEL_STRING,
      dailyCapacityMinutes: 20,
    };

    await renderPlan(stateMock, { chState: () => ({}) });

    const sentinelEl = document.querySelector('[data-security-sentinel="true"]');
    expect(sentinelEl).toBeNull();
  });

  it('3. AI Response: rendering Sensei chat message with sentinel payload does not create sentinel element', () => {
    document.body.innerHTML = `
      <div id="app-body"></div>
      <div id="chat-body"></div>
      <div id="chat-messages"></div>
    `;
    const stateMock = defaultState();
    stateMock.chatHistory = [{ role: 'assistant', content: `AI output ${SENTINEL_STRING}` }];

    renderSensei(stateMock, { chState: () => ({}) });

    const sentinelEl = document.querySelector('[data-security-sentinel="true"]');
    expect(sentinelEl).toBeNull();
  });

  it('4. Onboarding Summary: rendering onboarding with sentinel preferences does not inject DOM element', async () => {
    document.body.innerHTML = '<div id="app-body"></div>';
    const stateMock = defaultState();

    stateMock.onboarding = {
      step: 7,
      draft: {
        startDate: SENTINEL_STRING,
        studyDays: [1, 2, 3],
        dailyCapacityMinutes: 30,
        startChapterId: '1',
      },
    };

    await renderOnboarding(stateMock, {
      save: () => {},
      nav: () => {},
    });

    const sentinelEl = document.querySelector('[data-security-sentinel="true"]');
    expect(sentinelEl).toBeNull();
  });

  it('5. Sentence Composition Words: rendering sentence building card mode with sentinel word chips does not inject DOM element', async () => {
    document.body.innerHTML = `
      <div id="flashcard-body"></div>
      <div id="sentence-user-area"></div>
      <div id="sentence-word-pool"></div>
      <div id="sentence-feedback"></div>
    `;
    const stateMock = defaultState();

    const mockCard = {
      id: 'card-sentinel',
      type: 'sentence_builder',
      lessonId: '1',
      question: 'Test',
    };

    const mockLessonData = {
      particles: [
        {
          sentence: `Item [ _ ] ${SENTINEL_STRING}`,
          particle: 'は',
          translation: 'Test translation',
        },
      ],
    };

    await renderSentenceBuilding(
      mockCard,
      stateMock,
      {
        LESSONS: [
          {
            id: '1',
            particles: [
              {
                sentence: `Item [ _ ] ${SENTINEL_STRING}`,
                particle: 'は',
                translation: 'Test translation',
              },
            ],
          },
        ],
        loadChapterData: async () => ({ lesson: mockLessonData }),
        toast: () => {},
        chState: () => ({}),
      },
      () => {}
    );

    const sentinelEl = document.querySelector('[data-security-sentinel="true"]');
    expect(sentinelEl).toBeNull();
  });
});
