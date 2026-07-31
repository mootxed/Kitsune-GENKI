import { beforeEach, describe, expect, it } from 'vitest';
import { ExamplesDB } from '../src/examples-db.js';

describe('ExamplesDB global indexing and story tokens', () => {
  beforeEach(() => {
    ExamplesDB.clear();
  });

  it('indexes global raw examples directly by dictionaryId independent of active course scope', () => {
    // Add global example targeting a word not present in active course vocabulary
    ExamplesDB.addRawSentence({
      id: 'ex-global-1',
      japanese: '富士山は高いです。',
      reading: 'ふじさんはたかいです。',
      translation: 'Гора Фудзи высокая.',
      source: 'global',
      scope: 'global',
      targetLexemeIds: ['jp-word:富士山:ふじさん'],
    });

    ExamplesDB.rebuildIndex();

    // Query examples for dictionaryId without active course vocabulary reference loaded
    const result = ExamplesDB.getExamplesForLexeme('jp-word:富士山:ふじさん');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('ex-global-1');
    expect(result[0].japanese).toBe('富士山は高いです。');

    // Simulate course switching: clear course scope and verify global example remains
    ExamplesDB.clearCourseScope();
    const resultAfterClear = ExamplesDB.getExamplesForLexeme('jp-word:富士山:ふじさん');
    expect(resultAfterClear.length).toBe(1);
    expect(resultAfterClear[0].id).toBe('ex-global-1');
  });

  it('handles story tokens with direct dictionaryId and legacy lexemeId', () => {
    const storyData = {
      id: 'story-1',
      lessonId: 'genki-1:lesson-1',
      content: [
        {
          translation: 'Студент читает книгу.',
          tokens: [
            { kanji: '学生', writing: 'がくせい', dictionaryId: 'jp-word:学生:がくせい' },
            { kanji: 'は', writing: 'は' },
            { kanji: '本', writing: 'ほん', lexemeId: 'ほん_本_noun_книга' },
            { kanji: 'を', writing: 'を' },
            { kanji: '読む', writing: 'よむ', dictionaryId: 'jp-word:読む:よむ' },
          ],
        },
      ],
    };

    ExamplesDB.registerStory(storyData);
    ExamplesDB.rebuildIndex();

    const gakuseiExamples = ExamplesDB.getExamplesForLexeme('jp-word:学生:がくせい');
    expect(gakuseiExamples.length).toBe(1);
    expect(gakuseiExamples[0].japanese).toBe('学生は本を読む');

    const readExamples = ExamplesDB.getExamplesForLexeme('jp-word:読む:よむ');
    expect(readExamples.length).toBe(1);
  });
});
