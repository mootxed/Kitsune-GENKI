import { describe, expect, it, vi } from 'vitest';
import { AI_INTENTS } from '../src/ai/intents.js';
import { routeIntent } from '../src/ai/router.js';
import { runSenseiPipeline } from '../src/ai/pipeline.js';

describe('AI Sensei intent router', () => {
  it.each([
    ['explain_word', { intent: 'explain_word', word: '始める' }],
    ['explain_grammar', { intent: 'explain_grammar', grammar: '〜ている', complexity: 'normal' }],
    [
      'compare_items',
      {
        intent: 'compare_items',
        itemType: 'grammar',
        targets: ['は', 'が'],
        complexity: 'complex',
      },
    ],
    [
      'create_story',
      {
        intent: 'create_story',
        topic: 'магазин',
        tone: 'funny',
        length: 'short',
        wordSource: 'mixed',
        explicitWords: [],
      },
    ],
    ['clarify_request', { intent: 'clarify_request', missing: ['activityType'] }],
  ])('accepts valid %s', async (_name, response) => {
    const request = vi.fn().mockResolvedValue(JSON.stringify(response));
    const result = await routeIntent('test', { request });
    expect(result.intent).toBe(response.intent);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('repairs invalid JSON exactly once', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(JSON.stringify({ intent: 'explain_word', word: '猫' }));
    const result = await routeIntent('Объясни 猫', { request });
    expect(result.intent).toBe(AI_INTENTS.EXPLAIN_WORD);
    expect(result.meta.repaired).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not start an infinite retry after a failed repair', async () => {
    const request = vi.fn().mockResolvedValue('still invalid');
    const result = await routeIntent('слова', { request });
    expect(result.intent).toBe(AI_INTENTS.CLARIFY_REQUEST);
    expect(result.meta.attempts).toBe(2);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('explicit Sensei actions', () => {
  const explanation = {
    type: 'explanation',
    message: '猫 — кошка.',
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
          explanation: '猫 означает «кошка».',
        },
      ],
    },
  };

  it('bypasses the router for an explicit action', async () => {
    const request = vi.fn().mockResolvedValue(JSON.stringify(explanation));
    const result = await runSenseiPipeline({
      text: '猫',
      explicitIntent: AI_INTENTS.EXPLAIN_WORD,
      state: { settings: {}, chatHistory: [], srs: {}, chapters: {} },
      request,
    });
    expect(result.status).toBe('success');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0][0].content).toContain('указанное японское слово');
  });

  it('uses the router only for free text', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ intent: 'explain_word', word: '猫' }))
      .mockResolvedValueOnce(JSON.stringify(explanation));
    const result = await runSenseiPipeline({
      text: 'Объясни 猫',
      state: { settings: {}, chatHistory: [], srs: {}, chapters: {} },
      request,
    });
    expect(result.status).toBe('success');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
