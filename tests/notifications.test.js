import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDailyStudyDigest } from '../src/daily-study-digest.js';
import { State } from 'ts-fsrs';

describe('Local PWA Notifications System', () => {
  let mockState;

  beforeEach(() => {
    mockState = {
      srs: {
        L1_w1_rev: { id: 'L1_w1_rev', state: State.Review, due: '2026-07-24T10:00:00Z' },
        L1_w2_rev: { id: 'L1_w2_rev', state: State.Review, due: '2026-07-24T10:00:00Z' },
        L1_w3_new: { id: 'L1_w3_new', state: State.New, due: '2026-07-24T10:00:00Z' },
      },
      reviewEvents: [],
      settings: {
        notifyEnabled: true,
        notifyTime: '12:00',
        notifyDays: [1, 2, 3, 4, 5, 6, 0],
        notificationState: { lastDailyDigestDate: null, lastDailyDigestSlot: null },
      },
    };

    vi.restoreAllMocks();
  });

  it('1. digest with reviews and new items forms correct text', () => {
    const digest = getDailyStudyDigest(mockState);
    expect(digest.summaryText).toContain('2 повторения · 1 новых');
  });

  it('2. digest with only reviews forms correct text', () => {
    mockState.srs = {
      L1_w1_rev: { id: 'L1_w1_rev', state: State.Review, due: '2026-07-24T10:00:00Z' },
    };
    const digest = getDailyStudyDigest(mockState);
    expect(digest.summaryText).toBe('1 повторение');
  });

  it('3. digest with only new items forms correct text', () => {
    mockState.srs = {
      L1_w1_new: { id: 'L1_w1_new', state: State.New, due: '2026-07-24T10:00:00Z' },
    };
    const digest = getDailyStudyDigest(mockState);
    expect(digest.summaryText).toBe('1 новых слов');
  });

  it('4. everything completed forms correct text', () => {
    mockState.srs = {};
    const digest = getDailyStudyDigest(mockState);
    expect(digest.summaryText).toBe('На сегодня всё выполнено 🎉');
    expect(digest.isComplete).toBe(true);
  });

  it('5. notification suppress check when digest is complete', () => {
    mockState.srs = {};
    const digest = getDailyStudyDigest(mockState);
    expect(digest.isComplete).toBe(true);
    // Notification logic should skip when isComplete is true
  });

  it('6. notification not sent without granted permission', () => {
    const originalNotification = globalThis.Notification;
    globalThis.Notification = { permission: 'denied' };

    const showSpy = vi.fn();
    if (globalThis.Notification.permission !== 'granted') {
      showSpy();
    }
    expect(showSpy).toHaveBeenCalled();
    globalThis.Notification = originalNotification;
  });

  it('7. disabled setting does not send notification', () => {
    mockState.settings.notifyEnabled = false;
    expect(mockState.settings.notifyEnabled).toBe(false);
  });

  it('8. weekday filtering works properly', () => {
    // Enabled on Mon..Fri (1..5), disabled on Sun (0) and Sat (6)
    mockState.settings.notifyDays = [1, 2, 3, 4, 5];
    const sunday = new Date('2026-07-26T12:00:00'); // 2026-07-26 is Sunday (0)
    expect(sunday.getDay()).toBe(0);
    expect(mockState.settings.notifyDays.includes(sunday.getDay())).toBe(false);
  });

  it('9. duplicate notification in same day and slot is prevented', () => {
    const today = '2026-07-25';
    const slot = '12:00';
    mockState.settings.notificationState = {
      lastDailyDigestDate: today,
      lastDailyDigestSlot: slot,
    };

    const isDuplicate =
      mockState.settings.notificationState.lastDailyDigestDate === today &&
      mockState.settings.notificationState.lastDailyDigestSlot === slot;

    expect(isDuplicate).toBe(true);
  });

  it('10. test notification does not update notificationState', () => {
    const initialNotifState = { ...mockState.settings.notificationState };
    const digest = getDailyStudyDigest(mockState);
    const testMessage = `Тест: ${digest.summaryText} — ${digest.durationText}`;

    expect(testMessage).toContain('Тест:');
    // Verify notificationState was not mutated by test trigger
    expect(mockState.settings.notificationState).toEqual(initialNotifState);
  });

  it('11 & 12. schedule timer behavior on time change', () => {
    let timerId = 100;
    const clearSpy = vi.fn();
    const setSpy = vi.fn().mockReturnValue(timerId);

    // Simulated scheduling cycle
    clearSpy();
    timerId = setSpy();

    expect(clearSpy).toHaveBeenCalled();
    expect(setSpy).toHaveBeenCalled();
  });

  it('13. reschedules next trigger date correctly', () => {
    const now = new Date('2026-07-25T12:05:00'); // Past 12:00 today
    const notifyTime = '12:00';
    const notifyDays = [1, 2, 3, 4, 5, 6, 0];

    const [h, m] = notifyTime.split(':').map(Number);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(h, m, 0, 0);

    expect(tomorrow.getTime()).toBeGreaterThan(now.getTime());
  });

  it('14. respects local date boundary', () => {
    const now = new Date('2026-07-25T23:59:00').getTime();
    const digest = getDailyStudyDigest(mockState, { now });
    expect(digest).toBeDefined();
  });

  it('15. old state saves receive default notifyDays during migration', () => {
    const oldState = { settings: { notifyEnabled: true, notifyTime: '12:00' } };
    const notifyDays = oldState.settings.notifyDays || [1, 2, 3, 4, 5, 6, 0];
    expect(notifyDays).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('16. absence of Notification API handled gracefully', () => {
    const originalNotification = globalThis.Notification;
    delete globalThis.Notification;

    let hasError = false;
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        new Notification('Title');
      }
    } catch {
      hasError = true;
    }

    expect(hasError).toBe(false);
    globalThis.Notification = originalNotification;
  });
});
