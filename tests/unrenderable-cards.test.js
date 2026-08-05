/* tests/unrenderable-cards.test.js — Integration tests for handling corrupted/unrenderable SRS cards */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateRenderableCard } from '../src/card-validator.js';
import { SessionManager } from '../session-manager.js';
import { SRS } from '../srs.js';
import { resetTechnicalSkipCounters } from '../ui/flashcards.js';

describe('Handling Unrenderable FSRS Cards', () => {
  let mockState;
  let mockDependencies;

  beforeEach(() => {
    resetTechnicalSkipCounters();

    mockState = {
      appVersion: '0.1.0-alpha',
      version: 15,
      activeCourseId: 'genki-1',
      srs: {
        'corrupted_word_card::recognition': {
          id: 'corrupted_word_card::recognition',
          type: 'word',
          due: 1000,
          stability: 2.5,
          difficulty: 5.0,
          reps: 1,
          lapses: 0,
          state: SRS.State.Review,
        },
        'valid_word_card::recognition': {
          id: 'genki1_l1_v1::recognition',
          type: 'word',
          due: 1000,
          stability: 2.5,
          difficulty: 5.0,
          reps: 1,
          lapses: 0,
          state: SRS.State.Review,
        },
      },
      lastErrors: [],
      reviewEvents: [],
    };

    mockDependencies = {
      save: vi.fn(),
      toast: vi.fn(),
      nav: vi.fn(),
      showCompletionScreen: vi.fn(),
      LESSONS: [
        {
          id: 'genki1_l1',
          words: [
            {
              id: 'genki1_l1_v1',
              kanji: '学生',
              reading: 'がくせい',
              meaning: 'student',
            },
          ],
        },
      ],
    };

    // DOM setup
    document.body.innerHTML = `
      <div id="screen-srs">
        <div class="app-header"></div>
        <div id="srs-tabs-container"></div>
        <div id="srs-body"></div>
      </div>
      <div class="tabbar"></div>
      <div id="completion-overlay" class="hidden">
        <div id="completion-title"></div>
        <div id="completion-subtitle"></div>
        <div id="completion-desc"></div>
        <div id="completion-rewards"></div>
        <button id="btn-completion-continue"></button>
      </div>
    `;
  });

  describe('validateRenderableCard', () => {
    it('validates a normal renderable card', () => {
      const card = { id: 'genki1_l1_v1::recognition' };
      const res = validateRenderableCard(card, {
        state: mockState,
        lessons: mockDependencies.LESSONS,
      });
      expect(res.valid).toBe(true);
      expect(res.code).toBeNull();
    });

    it('Scenario A: detects missing word data', () => {
      const card = { id: 'non_existent_word::recognition' };
      const res = validateRenderableCard(card, {
        state: mockState,
        lessons: mockDependencies.LESSONS,
      });
      expect(res.valid).toBe(false);
      expect(res.code).toBe('MISSING_WORD_DATA');
      expect(res.details.cardId).toBe('non_existent_word::recognition');
    });

    it('Scenario B: detects missing required dictionaryId', () => {
      const card = { id: 'custom_card_1', requiresDictionaryId: true };
      const res = validateRenderableCard(card, {
        state: mockState,
        lessons: mockDependencies.LESSONS,
      });
      expect(res.valid).toBe(false);
      expect(res.code).toBe('MISSING_DICTIONARY_ID');
    });

    it('Scenario C: detects missing DictionaryEntry when dictionaryId is provided', () => {
      const card = { id: 'custom_card_2', dictionaryId: 'missing_dict_entry_999' };
      const res = validateRenderableCard(card, {
        state: mockState,
        lessons: mockDependencies.LESSONS,
      });
      expect(res.valid).toBe(false);
      expect(res.code).toBe('MISSING_DICTIONARY_ENTRY');
      expect(res.details.dictionaryId).toBe('missing_dict_entry_999');
    });

    it('Scenario D: detects invalid card structure or missing knowledge item', () => {
      const resNull = validateRenderableCard(null);
      expect(resNull.valid).toBe(false);
      expect(resNull.code).toBe('INVALID_CARD_STRUCTURE');

      const resEmptyId = validateRenderableCard({ id: '   ' });
      expect(resEmptyId.valid).toBe(false);
      expect(resEmptyId.code).toBe('INVALID_CARD_ID');
    });
  });

  describe('Integration Scenarios', () => {
    it('Scenario A: missing word triggers skipCard without FSRS mutation or XP', () => {
      const brokenCard = { id: 'corrupted_word_card::recognition' };
      const validCard = { id: 'genki1_l1_v1::recognition' };

      const srsInitialState = JSON.parse(
        JSON.stringify(mockState.srs['corrupted_word_card::recognition'])
      );

      const manager = new SessionManager([brokenCard, validCard], { srs: SRS });

      // Simulate rendering via SessionManager
      const next1 = manager.getNextCard();
      expect(next1.id).toBe('corrupted_word_card::recognition');

      const validation = validateRenderableCard(next1, {
        state: mockState,
        lessons: mockDependencies.LESSONS,
      });
      expect(validation.valid).toBe(false);

      // Perform technical skip
      const skipped = manager.skipCard(next1.id);
      expect(skipped).toBe(true);

      // Assert FSRS state is untouched
      const cardAfter = mockState.srs['corrupted_word_card::recognition'];
      expect(cardAfter.due).toBe(srsInitialState.due);
      expect(cardAfter.stability).toBe(srsInitialState.stability);
      expect(cardAfter.difficulty).toBe(srsInitialState.difficulty);
      expect(cardAfter.reps).toBe(srsInitialState.reps);
      expect(cardAfter.lapses).toBe(srsInitialState.lapses);

      // Assert review log is untouched
      expect(mockState.reviewEvents).toHaveLength(0);

      // Assert stats
      const stats = manager.getStats();
      expect(stats.skipped).toBe(1);
      expect(stats.answered).toBe(0);
      expect(stats.perfect).toBe(0);

      // Next card is valid
      const next2 = manager.getNextCard();
      expect(next2.id).toBe('genki1_l1_v1::recognition');
    });

    it('Scenario E: session with only corrupted cards finishes cleanly without infinite loop', () => {
      const brokenCards = [{ id: 'corrupted_1::recognition' }, { id: 'corrupted_2::recall' }];

      const manager = new SessionManager(brokenCards, { srs: SRS });

      let card;
      let iterations = 0;
      while ((card = manager.getNextCard()) !== null && iterations < 10) {
        iterations++;
        const validation = validateRenderableCard(card, {
          state: mockState,
          lessons: mockDependencies.LESSONS,
        });
        expect(validation.valid).toBe(false);
        manager.skipCard(card.id);
      }

      expect(iterations).toBe(2);
      expect(manager.isSessionComplete()).toBe(true);

      const stats = manager.getStats();
      expect(stats.skipped).toBe(2);
      expect(stats.answered).toBe(0);
    });

    it('Scenario F: serializing and restoring state preserves technical skip', () => {
      const cards = [{ id: 'corrupted_1::recognition' }, { id: 'genki1_l1_v1::recognition' }];
      const manager = new SessionManager(cards, { srs: SRS });

      manager.skipCard('corrupted_1::recognition');

      const serialized = manager.toSerializableState();
      expect(serialized.queue[0].skipped).toBe(true);
      expect(serialized.queue[0].completed).toBe(true);

      const restoredManager = new SessionManager([], { srs: SRS });
      const restoredSuccess = restoredManager.restoreFromSerializableState(serialized, {
        'corrupted_1::recognition': { id: 'corrupted_1::recognition' },
        'genki1_l1_v1::recognition': { id: 'genki1_l1_v1::recognition' },
      });

      expect(restoredSuccess).toBe(true);
      const restoredStats = restoredManager.getStats();
      expect(restoredStats.skipped).toBe(1);
      expect(restoredManager.getNextCard().id).toBe('genki1_l1_v1::recognition');
    });
  });
});
