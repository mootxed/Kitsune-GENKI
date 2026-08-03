import { describe, it, expect } from 'vitest';
import { SessionManager } from '../session-manager.js';

describe('SessionManager skipCard & progress calculation', () => {
  it('increments reviewed count and reports 100% progress when last card is skipped', () => {
    const cards = [
      { id: 'card1', expression: '猫' },
      { id: 'card2', expression: '犬' },
    ];
    const manager = new SessionManager(cards);

    // Answer card1
    manager.answerCard('card1', 3, { card1: { id: 'card1' } });
    expect(manager.getProgress()).toBe(50);

    // Skip card2
    manager.skipCard('card2');

    expect(manager.isSessionComplete()).toBe(true);
    expect(manager.getStats().reviewed).toBe(2);
    expect(manager.getStats().skipped).toBe(1);
    expect(manager.getProgress()).toBe(100);
  });

  it('preserves 100% progress before and after state restoration', () => {
    const cards = [
      { id: 'card1', expression: '猫' },
      { id: 'card2', expression: '犬' },
    ];
    const manager = new SessionManager(cards);

    manager.answerCard('card1', 3, { card1: { id: 'card1' } });
    manager.skipCard('card2');

    const progressBefore = manager.getProgress();

    const serialized = manager.toSerializableState();
    const restoredManager = new SessionManager(cards);
    restoredManager.restoreFromSerializableState(serialized);

    const progressAfter = restoredManager.getProgress();

    expect(progressBefore).toBe(100);
    expect(progressAfter).toBe(100);
    expect(restoredManager.getStats().reviewed).toBe(2);
    expect(restoredManager.getStats().skipped).toBe(1);
  });
});
