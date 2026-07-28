import { describe, expect, it } from 'vitest';
import { runSenseiPipeline } from '../src/ai/pipeline.js';

describe('Sensei Pipeline User Dictionary Integration', () => {
  it('routes query "Создай историю по словарю Persona 5", resolves dictionary name, and uses words from that dictionary', async () => {
    const targetDictId = 'user-dict:persona5';
    const otherDictId = 'user-dict:other';

    const repository = {
      listDictionaries: async () => [
        { id: targetDictId, name: 'Persona 5' },
        { id: otherDictId, name: 'Basic N5' },
      ],
      listEntries: async (id) => {
        if (id === targetDictId) {
          return [
            {
              id: 'user-word:p1',
              writing: '怪盗',
              reading: 'かいとう',
              meanings: ['призрачный похититель'],
            },
            { id: 'user-word:p2', writing: 'ペルソナ', reading: 'ぺるそな', meanings: ['Персона'] },
          ];
        }
        return [{ id: 'user-word:o1', writing: '水', reading: 'みず', meanings: ['вода'] }];
      },
    };

    const mockRequest = async (messages) => {
      if (messages[0]?.content?.includes('классификатор')) {
        return JSON.stringify({
          intent: 'create_story',
          topic: 'история по словарю Persona 5',
          wordSource: 'user_dictionary',
          dictionaryName: 'Persona 5',
        });
      }
      return JSON.stringify({
        type: 'story',
        message: 'Вот ваша история',
        story: [
          {
            sentence_id: 1,
            speaker: 'Joker',
            translation: 'Мы призрачные похитители.',
            tokens: [
              {
                kanji: '怪盗',
                writing: 'かいとう',
                translation: 'похититель',
                type: 'Noun',
                sourceToken: 'W1',
              },
            ],
          },
          {
            sentence_id: 2,
            speaker: 'Joker',
            translation: 'Вызови Персону.',
            tokens: [{ writing: 'ペルソナ', translation: 'Персона', type: 'Noun' }],
          },
          {
            sentence_id: 3,
            speaker: 'Joker',
            translation: 'Погнали.',
            tokens: [{ writing: '行こう', translation: 'погнали', type: 'Verb' }],
          },
        ],
        unknownWords: [],
      });
    };

    const result = await runSenseiPipeline({
      text: 'Создай историю по словарю Persona 5',
      state: {},
      lessons: [],
      repository,
      request: mockRequest,
    });

    expect(result.status).toBe('success');
    expect(result.intentResult.dictionaryId).toBe(targetDictId);
    expect(result.context.words).toEqual([
      expect.objectContaining({ writing: '怪盗', reading: 'かいとう' }),
      expect.objectContaining({ writing: 'ペルソナ', reading: 'ぺるそな' }),
    ]);
  });
});
