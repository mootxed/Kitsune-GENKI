import { describe, expect, it } from 'vitest';
import {
  clearChatHistory,
  createAssistantChatMessage,
  normalizeChatHistory,
  selectRelevantMessages,
  updateQuizAnswer,
} from '../src/ai/chat-history.js';

describe('structured AI chat history', () => {
  it('migrates legacy role/content without losing text', () => {
    const history = normalizeChatHistory([{ role: 'user', content: '古い質問' }]);
    expect(history[0]).toMatchObject({ role: 'user', type: 'text', text: '古い質問' });
  });

  it('preserves story tokens and quiz answer state', () => {
    const message = createAssistantChatMessage({
      text: 'История',
      intent: 'create_story',
      artifact: {
        type: 'story',
        message: 'История',
        story: [
          {
            sentence_id: 1,
            speaker: 'Рассказчик',
            tokens: [{ kanji: '猫', writing: 'ねこ', translation: 'кошка', type: 'Noun' }],
            translation: 'Кошка.',
          },
        ],
      },
    });
    expect(normalizeChatHistory([message])[0].artifact.story[0].tokens[0].kanji).toBe('猫');

    const quizMessage = createAssistantChatMessage({
      text: 'Квиз',
      artifact: {
        type: 'quiz',
        message: 'Квиз',
        quiz: {
          questions: [
            {
              id: 'q1',
              options: [
                { text: '猫', isCorrect: true },
                { text: '犬', isCorrect: false },
              ],
            },
          ],
        },
      },
    });
    const updated = updateQuizAnswer([quizMessage], quizMessage.id, 'q1', 0);
    expect(updated[0].artifact.quiz.questions[0]).toMatchObject({
      selectedIndex: 0,
      answeredCorrectly: true,
    });
  });

  it('limits API history to the last 12 compact messages', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `message ${index}`,
    }));
    const selected = selectRelevantMessages(history, 99);
    expect(selected).toHaveLength(12);
    expect(selected[0].content).toBe('message 8');
    expect(selected.at(-1).content).toBe('message 19');
  });

  it('clears history without touching other state', () => {
    const state = { xp: 10, srs: { a: {} }, chatHistory: [{ role: 'user', content: 'x' }] };
    state.chatHistory = clearChatHistory();
    expect(state.chatHistory).toEqual([]);
    expect(state.xp).toBe(10);
    expect(state.srs).toEqual({ a: {} });
  });
});
