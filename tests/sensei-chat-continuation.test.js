import { describe, it, expect } from 'vitest';
import { importReviewExplanationToChat, getChatHistory, setChatHistory } from '../ui/chat.js';

describe('Sensei Chat Continuation Bridge', () => {
  it('imports review explanation to chat history with correct structure', () => {
    setChatHistory([]);

    const artifact = {
      type: 'review_explanation',
      diagnosis: { category: 'wrong_reading', message: 'Неправильное чтение' },
      explanation: 'Объяснение ошибки чтения.',
      comparison: [],
      examples: [],
      quiz: { questions: [] },
    };

    const snapshot = {
      schemaVersion: 1,
      item: { writing: '日', reading: 'にち', meanings: ['день'] },
      result: { outcome: 'incorrect' },
    };

    importReviewExplanationToChat(artifact, snapshot);

    const history = getChatHistory();
    expect(history).toHaveLength(1);
    const msg = history[0];

    expect(msg.role).toBe('assistant');
    expect(msg.type).toBe('explanation');
    expect(msg.intent).toBe('explain_review_error');
    expect(msg.artifact._importedFromReviewPanel).toBe(true);
  });
});
