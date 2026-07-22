import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import {
  countAvailableCardsForSession,
  countNewCardsIntroducedOn,
  limitNewCardsForSession,
  studyDay,
} from '../src/srs-limits.js';

const DAY = '2026-07-22';

function card(id, state = State.New, introducedOn) {
  return { id, state, ...(introducedOn ? { introducedOn } : {}) };
}

describe('SRS new-card limits', () => {
  it('пропускает все повторения и ограничивает новые карточки сессионным лимитом', () => {
    const records = {
      review: card('review', State.Review),
      n1: card('n1'),
      n2: card('n2'),
      n3: card('n3'),
    };

    const selected = limitNewCardsForSession(Object.values(records), records, {
      day: DAY,
      config: { dailyNewCardsLimit: 15, sessionNewCardsLimit: 2 },
    });

    expect(selected.map(({ id }) => id)).toEqual(['review', 'n1', 'n2']);
    expect(records.n1.introducedOn).toBe(DAY);
    expect(records.n2.introducedOn).toBe(DAY);
    expect(records.n3.introducedOn).toBeUndefined();
  });

  it('не выдаёт новые карточки после исчерпания дневного лимита', () => {
    const records = {
      old1: card('old1', State.Learning, DAY),
      old2: card('old2', State.Review, DAY),
      fresh: card('fresh'),
    };

    const selected = limitNewCardsForSession([records.fresh], records, {
      day: DAY,
      config: { dailyNewCardsLimit: 2, sessionNewCardsLimit: 10 },
    });

    expect(selected).toEqual([]);
    expect(records.fresh.introducedOn).toBeUndefined();
  });

  it('продолжает ранее выданные новые карточки без расхода нового дневного слота', () => {
    const records = {
      earlier: card('earlier', State.New, '2026-07-21'),
      fresh: card('fresh'),
    };

    const selected = limitNewCardsForSession(Object.values(records), records, {
      day: DAY,
      config: { dailyNewCardsLimit: 1, sessionNewCardsLimit: 2 },
    });

    expect(selected.map(({ id }) => id)).toEqual(['earlier', 'fresh']);
    expect(records.fresh.introducedOn).toBe(DAY);
  });

  it('считает выдачу по календарному дню и формирует ISO-день', () => {
    const records = { a: card('a', State.Review, DAY) };
    expect(countNewCardsIntroducedOn(records, DAY)).toBe(1);
    expect(studyDay(Date.UTC(2026, 6, 22))).toBe(DAY);
  });

  it('переключает дневной лимит по локальной полуночи', () => {
    const beforeMidnight = new Date(2026, 6, 22, 23, 59, 59).getTime();
    const afterMidnight = new Date(2026, 6, 23, 0, 0, 1).getTime();
    expect(studyDay(beforeMidnight)).toBe('2026-07-22');
    expect(studyDay(afterMidnight)).toBe('2026-07-23');
  });

  it('счётчик совпадает с выдачей и не мутирует introducedOn', () => {
    const records = {
      review: card('review', State.Review),
      n1: card('n1'),
      n2: card('n2'),
    };
    const due = Object.values(records);
    const options = {
      day: DAY,
      config: { dailyNewCardsLimit: 1, sessionNewCardsLimit: 10 },
    };

    expect(countAvailableCardsForSession(due, records, options)).toBe(2);
    expect(records.n1.introducedOn).toBeUndefined();
    expect(limitNewCardsForSession(due, records, options)).toHaveLength(2);
  });
});
