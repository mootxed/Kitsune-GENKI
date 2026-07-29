/* tests/notification-time.test.js — Unit tests for notification time calculation (00:00, 00:30, 12:00, 23:59) */

import { describe, it, expect } from 'vitest';
import { calculateNextNotificationDate } from '../app.js';

describe('Notification Time Parsing & Scheduling', () => {
  const allDays = [0, 1, 2, 3, 4, 5, 6];

  it('correctly schedules midnight 00:00 notification for the next day when time has passed', () => {
    // Current time: 2026-07-29T10:00:00
    const now = new Date('2026-07-29T10:00:00');
    const target = calculateNextNotificationDate('00:00', allDays, now);

    expect(target).not.toBeNull();
    expect(target.getHours()).toBe(0);
    expect(target.getMinutes()).toBe(0);
    expect(target.getDate()).toBe(30); // Rollover to next day
  });

  it('correctly schedules midnight 00:30 notification without converting to 12:30', () => {
    // Current time: 2026-07-29T00:15:00
    const now = new Date('2026-07-29T00:15:00');
    const target = calculateNextNotificationDate('00:30', allDays, now);

    expect(target).not.toBeNull();
    expect(target.getHours()).toBe(0);
    expect(target.getMinutes()).toBe(30);
    expect(target.getDate()).toBe(29); // Same day, earlier than 00:30
  });

  it('correctly schedules noon 12:00 notification', () => {
    const now = new Date('2026-07-29T08:00:00');
    const target = calculateNextNotificationDate('12:00', allDays, now);

    expect(target).not.toBeNull();
    expect(target.getHours()).toBe(12);
    expect(target.getMinutes()).toBe(0);
    expect(target.getDate()).toBe(29);
  });

  it('correctly schedules late night 23:59 notification', () => {
    const now = new Date('2026-07-29T20:00:00');
    const target = calculateNextNotificationDate('23:59', allDays, now);

    expect(target).not.toBeNull();
    expect(target.getHours()).toBe(23);
    expect(target.getMinutes()).toBe(59);
    expect(target.getDate()).toBe(29);
  });

  it('correctly handles rollover to next day when current time is 23:59 and target is 00:30', () => {
    const now = new Date('2026-07-29T23:59:00');
    const target = calculateNextNotificationDate('00:30', allDays, now);

    expect(target).not.toBeNull();
    expect(target.getHours()).toBe(0);
    expect(target.getMinutes()).toBe(30);
    expect(target.getDate()).toBe(30);
  });
});
