/* global process */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRS } from '../srs.js';
import {
  SKILLS,
  makeCardId,
  modeCanSchedule,
  vocabularySkills,
  vocabularySkillsReadyForIntroduction,
} from '../src/knowledge-model.js';
import { SessionBatcher } from '../src/session-batcher.js';
import { calculateMastery, MASTERY_LEVELS } from '../src/mastery.js';
import {
  MAX_TYPING_UNIQUE_CHARS,
  normalizeKanaAnswer,
  typingCapability,
} from '../src/typing-capability.js';
import { CARD_MODES } from '../ui/flashcards.js';

function catalogueWords() {
  const projectRoot = process.cwd();
  return Array.from({ length: 12 }, (_, index) => {
    const lesson = String(index + 1).padStart(2, '0');
    const data = JSON.parse(
      readFileSync(join(projectRoot, `public/data/lessons/lesson-${lesson}.json`), 'utf8')
    );
    return data.lesson.vocabulary;
  }).flat();
}

describe('typing capability across the lesson catalogue', () => {
  it('нормализует катакану и допускает оба алфавита как один ответ', () => {
    const capability = typingCapability({ writing: 'アメリカ' });
    expect(capability).toMatchObject({ canType: true, acceptedAnswers: ['あめりか'] });
    expect(normalizeKanaAnswer('アメリカ')).toBe('あめりか');
    expect(normalizeKanaAnswer('あめりか')).toBe('あめりか');
  });

  it('явно разворачивает факультативные части ответа', () => {
    expect(typingCapability({ writing: 'すき（な）' }).acceptedAnswers).toEqual(['すき', 'すきな']);
    expect(typingCapability({ writing: '（めがねを）かける' }).acceptedAnswers).toEqual([
      'かける',
      'めがねをかける',
    ]);
  });

  it('создаёт проходимый recall, но не синтетический production для 674 слов', () => {
    const words = catalogueWords();
    expect(words).toHaveLength(674);

    for (const word of words) {
      const capability = typingCapability(word);
      expect(capability.canType, `${word.id}: ${word.writing} (${capability.reason})`).toBe(true);
      expect(capability.acceptedAnswers.length).toBeGreaterThan(0);
      expect(capability.keyboardCharacters.length).toBeLessThanOrEqual(MAX_TYPING_UNIQUE_CHARS);
      expect(vocabularySkills(word)).toContain(SKILLS.RECALL);
      expect(vocabularySkills(word)).not.toContain(SKILLS.CONTEXT_PRODUCTION);
    }
  });

  it('batcher выбирает проходимый typing mode из той же capability', () => {
    const words = catalogueWords();
    const cards = words.flatMap((word) => {
      const productionWord = {
        ...word,
        contextProduction: {
          prompt: `ID ${word.id}: [ _ ]`,
          meaningCue: word.translation,
          acceptedAnswers: typingCapability(word).acceptedAnswers,
          requiredForm: 'dictionary',
        },
      };
      return [SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION].map((skill) => ({
        ...SRS.newCard(makeCardId(word.id, skill), { itemId: word.id, skill }),
        word: productionWord,
      }));
    });
    const organized = new SessionBatcher(cards, cards.length).organizeBatchInto4Blocks(cards);

    for (const card of organized) {
      const expectedMode =
        card.skill === SKILLS.RECALL ? CARD_MODES.TYPING : CARD_MODES.CONTEXT_PRODUCTION;
      expect(card.forcedMode, card.id).toBe(expectedMode);
      expect(modeCanSchedule(card, card.forcedMode), card.id).toBe(true);
    }
  });

  it('открывает recall и production только в следующий день после prerequisite', () => {
    const now = new Date(2026, 6, 22, 12).getTime();
    const word = {
      id: 'staged-word',
      writing: 'がっこう',
      contextProduction: {
        prompt: '毎日 [ _ ] へ行きます。',
        meaningCue: 'школа',
        acceptedAnswers: ['がっこう'],
        requiredForm: 'dictionary',
      },
    };
    const success = (skill, reviewedAt) => ({
      eventType: 'review',
      itemId: word.id,
      skill,
      mode: skill === SKILLS.RECOGNITION ? CARD_MODES.REVERSE_MULTIPLE_CHOICE : CARD_MODES.TYPING,
      firstAttemptCorrect: true,
      effectiveRating: SRS.Quality.Good,
      reviewedAt,
      undoneAt: null,
    });

    expect(vocabularySkillsReadyForIntroduction(word, [], null, now)).toEqual([SKILLS.RECOGNITION]);
    expect(
      vocabularySkillsReadyForIntroduction(word, [success(SKILLS.RECOGNITION, now)], null, now)
    ).toEqual([SKILLS.RECOGNITION]);
    expect(
      vocabularySkillsReadyForIntroduction(
        word,
        [success(SKILLS.RECOGNITION, now - SRS.DAY)],
        null,
        now
      )
    ).toEqual([SKILLS.RECOGNITION, SKILLS.RECALL]);
    expect(
      vocabularySkillsReadyForIntroduction(
        word,
        [success(SKILLS.RECOGNITION, now - 2 * SRS.DAY), success(SKILLS.RECALL, now - SRS.DAY)],
        null,
        now
      )
    ).toEqual([SKILLS.RECOGNITION, SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION]);
  });

  it('текущий каталог ограничен уровнем Уверенно без production', () => {
    const now = new Date(2026, 6, 22, 12).getTime();
    const day = 86_400_000;

    for (const word of catalogueWords()) {
      const applicableSkills = vocabularySkills(word);
      const cards = applicableSkills.map((skill) => ({
        ...SRS.newCard(makeCardId(word.id, skill), { itemId: word.id, skill }),
        stability: 95,
        reps: 5,
        state: SRS.State.Review,
        due: now + day,
      }));
      const reviewEvent = (skill, reviewedAt) => ({
        eventId: `${word.id}-${skill}-${reviewedAt}`,
        eventType: 'review',
        itemId: word.id,
        cardId: makeCardId(word.id, skill),
        skill,
        mode:
          skill === SKILLS.RECOGNITION
            ? CARD_MODES.REVERSE_MULTIPLE_CHOICE
            : skill === SKILLS.RECALL
              ? CARD_MODES.TYPING
              : skill === SKILLS.READING_WRITING
                ? CARD_MODES.DRAWING
                : CARD_MODES.CONTEXT_PRODUCTION,
        firstAttemptCorrect: true,
        effectiveRating: SRS.Quality.Good,
        reviewedAt,
        undoneAt: null,
      });
      const events = [
        reviewEvent(SKILLS.RECOGNITION, now - 5 * day),
        reviewEvent(SKILLS.RECALL, now - 4 * day),
        reviewEvent(SKILLS.RECALL, now - 3 * day),
      ];
      const result = calculateMastery({
        itemId: word.id,
        cards,
        events,
        applicableSkills,
        now,
        getRetrievability: () => 0.95,
      });

      expect(result.level, word.id).toBe(MASTERY_LEVELS.CONFIDENT);
      expect(result.productionSkill, word.id).toBeNull();
    }
  });
});
