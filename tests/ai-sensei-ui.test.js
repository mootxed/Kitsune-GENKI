import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSensei, sendChat, setChatHistory, setSenseiTab } from '../ui/chat.js';

function baseState(history = []) {
  return {
    chatHistory: history,
    savedNotes: [],
    settings: {
      openrouterKey: 'sk-or-v1-1234567890123456789012345678901234567890',
      aiPrivacyAccepted: true,
    },
    srs: {},
    chapters: {},
    streak: { count: 3 },
    masteryArchive: {},
    xp: 42,
  };
}

function explanation() {
  return JSON.stringify({
    type: 'explanation',
    message: '猫 означает «кошка».',
    examples: [],
    quiz: {
      questions: [
        {
          id: 'q1',
          type: 'translation',
          prompt: 'Что значит 猫?',
          topic: '猫',
          options: [
            { text: 'кошка', isCorrect: true },
            { text: 'собака', isCorrect: false },
          ],
          explanation: '猫 — кошка.',
        },
      ],
    },
  });
}

describe('AI Sensei UI integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="sensei-body"></div>';
    setChatHistory([]);
    setSenseiTab('chat');
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('shows starter cards only while history is empty', () => {
    const state = baseState();
    renderSensei(state, { save: vi.fn() });
    expect(document.querySelector('[data-testid="sensei-starter"]')).not.toBeNull();
    state.chatHistory = [{ role: 'user', content: 'Привет' }];
    renderSensei(state, { save: vi.fn() });
    expect(document.querySelector('[data-testid="sensei-starter"]')).toBeNull();
  });

  it('explicit action skips router and renders an inline quiz', async () => {
    const state = baseState();
    const request = vi.fn().mockResolvedValue(explanation());
    renderSensei(state, { save: vi.fn(), aiRequest: request });
    document.querySelector('[data-sensei-action="explain_word"]').click();
    document.getElementById('chat-input').value = '猫';
    await sendChat(state, { save: vi.fn(), aiRequest: request });
    expect(request).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="sensei-inline-quiz"]')).not.toBeNull();
  });

  it('free text calls router and handler', async () => {
    const state = baseState();
    const request = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ intent: 'explain_word', word: '猫' }))
      .mockResolvedValueOnce(explanation());
    renderSensei(state, { save: vi.fn(), aiRequest: request });
    document.getElementById('chat-input').value = 'Объясни 猫';
    await sendChat(state, { save: vi.fn(), aiRequest: request });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('restores the selected quiz answer after re-render without changing learning state', () => {
    const history = [
      {
        id: 'ai-message:quiz',
        role: 'assistant',
        type: 'explanation',
        text: 'Квиз',
        intent: 'explain_word',
        createdAt: new Date().toISOString(),
        artifact: {
          type: 'explanation',
          message: 'Квиз',
          examples: [],
          quiz: {
            questions: [
              {
                id: 'q1',
                type: 'translation',
                prompt: 'Что значит 猫?',
                topic: '猫',
                options: [
                  { text: 'кошка', isCorrect: true },
                  { text: 'собака', isCorrect: false },
                ],
                explanation: '猫 — кошка.',
                selectedIndex: 0,
                answeredCorrectly: true,
              },
            ],
          },
        },
      },
    ];
    const state = baseState(history);
    const learningSnapshot = JSON.stringify({
      srs: state.srs,
      xp: state.xp,
      streak: state.streak,
      masteryArchive: state.masteryArchive,
    });
    renderSensei(state, { save: vi.fn() });
    expect(document.body.textContent).toContain('✓ Правильно');
    expect(
      JSON.stringify({
        srs: state.srs,
        xp: state.xp,
        streak: state.streak,
        masteryArchive: state.masteryArchive,
      })
    ).toBe(learningSnapshot);
  });

  it('opens an interactive card for a story token', () => {
    const state = baseState([
      {
        id: 'ai-message:story',
        role: 'assistant',
        type: 'story',
        text: 'История',
        intent: 'create_story',
        createdAt: new Date().toISOString(),
        artifact: {
          type: 'story',
          message: 'История',
          story: [
            {
              sentence_id: 1,
              speaker: 'Рассказчик',
              tokens: [
                {
                  kanji: '始めました',
                  writing: 'はじめました',
                  translation: 'начал',
                  type: 'Verb',
                  dictionaryForm: '始める',
                  dictionaryReading: 'はじめる',
                  dictionaryMeaning: 'начинать',
                },
              ],
              translation: 'Я начал.',
            },
          ],
        },
      },
    ]);
    renderSensei(state, { save: vi.fn() });
    document.querySelector('.sensei-token').click();
    expect(document.querySelector('.sensei-token-popover').textContent).toContain('始める');
    expect(document.querySelector('.sensei-token-popover').textContent).toContain(
      'Добавить в словарь'
    );
  });

  it('keeps the legacy AI story tool available', () => {
    const state = baseState();
    setSenseiTab('tools');
    renderSensei(state, { save: vi.fn(), nav: vi.fn() });
    expect(document.body.textContent).toContain('AI-история');
    expect(document.querySelector('[data-nav="ai-story"]')).not.toBeNull();
  });
});
