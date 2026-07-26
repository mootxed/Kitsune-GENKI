import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import {
  countAvailableCardsForSession,
  countNewCardsIntroducedOn,
  limitNewCardsForSession,
  markCardIntroduced,
  studyDay,
} from '../src/srs-limits.js';
import { SKILLS } from '../src/knowledge-model.js';

const DAY = '2026-07-22';

function card(id, state = State.New, introducedOn) {
  return { id, state, ...(introducedOn ? { introducedOn } : {}) };
}

describe('SRS new-card limits', () => {
  it('пропускает все повторения и ограничивает новые карточки сессионным лимитом без мутации introducedOn', () => {
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
    expect(records.n1.introducedOn).toBeUndefined();
    expect(records.n2.introducedOn).toBeUndefined();
    expect(records.n3.introducedOn).toBeUndefined();

    markCardIntroduced(records.n1, { day: DAY });
    expect(records.n1.introducedOn).toBe(DAY);
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
    expect(records.fresh.introducedOn).toBeUndefined();

    markCardIntroduced(records.fresh, { day: DAY });
    expect(records.fresh.introducedOn).toBe(DAY);
  });

  it('считает выдачу по календарному дню и формирует ISO-день', () => {
    const records = { a: card('a', State.Review, DAY) };
    expect(countNewCardsIntroducedOn(records, DAY)).toBe(1);
    expect(studyDay(new Date(2026, 6, 22, 12).getTime())).toBe(DAY);
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
    expect(records.n1.introducedOn).toBeUndefined();
  });

  it('считает дневной лимит по knowledge item и не выдаёт два skill одного item', () => {
    const records = {
      recognition: { ...card('word'), itemId: 'word', skill: SKILLS.RECOGNITION },
      recall: {
        ...card('word::recall'),
        itemId: 'word',
        skill: SKILLS.RECALL,
      },
      other: { ...card('other'), itemId: 'other', skill: SKILLS.RECOGNITION },
    };

    const first = limitNewCardsForSession(Object.values(records), records, {
      day: DAY,
      config: { dailyNewCardsLimit: 1, sessionNewCardsLimit: 10 },
    });

    expect(first.map((entry) => entry.id)).toEqual(['word']);
    expect(countNewCardsIntroducedOn(records, DAY)).toBe(0);

    markCardIntroduced(first[0], { day: DAY });
    expect(countNewCardsIntroducedOn(records, DAY)).toBe(1);
  });

  it('при 30 новых items одна сессия выдаёт 20 новых карточек с новыми лимитами по умолчанию', () => {
    const records = {};
    for (let i = 1; i <= 30; i++) {
      records[`item_${i}`] = card(`item_${i}`, State.New);
    }

    const selected = limitNewCardsForSession(Object.values(records), records, { day: DAY });
    expect(selected).toHaveLength(20);
  });

  it('вторая сессия в тот же день не превышает дневной лимит 20 при фактическом показе', () => {
    const records = {};
    for (let i = 1; i <= 30; i++) {
      records[`item_${i}`] = card(`item_${i}`, State.New);
    }

    // Первая сессия выдаёт 20 карточек
    const session1 = limitNewCardsForSession(Object.values(records), records, { day: DAY });
    expect(session1).toHaveLength(20);

    // До показа карточек introducedOn не установлен
    expect(countNewCardsIntroducedOn(records, DAY)).toBe(0);

    // Имитируем показ / принятый ответ карточек 1-й сессии
    session1.forEach((c) => markCardIntroduced(c, { day: DAY }));
    const introducedCount = countNewCardsIntroducedOn(records, DAY);
    expect(introducedCount).toBe(20);

    // Вторая сессия должна вернуть 0 оставшихся новых карточек для невыданных items
    const remainingDue = Object.values(records).filter((c) => !c.introducedOn);
    const session2 = limitNewCardsForSession(remainingDue, records, { day: DAY });
    expect(session2).toHaveLength(0);
  });

  it('не занимает дневной слот, если сессия запущена, но карточка не была показана', () => {
    const records = {
      n1: card('n1'),
      n2: card('n2'),
    };

    // Сессия 1 формирует очередь
    const session1 = limitNewCardsForSession(Object.values(records), records, {
      day: DAY,
      config: { dailyNewCardsLimit: 1, sessionNewCardsLimit: 1 },
    });

    expect(session1).toHaveLength(1);
    expect(session1[0].id).toBe('n1');
    // Ни одна карточка не помечена как введённая
    expect(records.n1.introducedOn).toBeUndefined();

    // Повторный запуск сессии до показа выдает ту же карточку и слот не потрачен
    const session2 = limitNewCardsForSession(Object.values(records), records, {
      day: DAY,
      config: { dailyNewCardsLimit: 1, sessionNewCardsLimit: 1 },
    });

    expect(session2).toHaveLength(1);
    expect(session2[0].id).toBe('n1');

    // После реального показа/ответа карточка помечается введённой
    markCardIntroduced(records.n1, { day: DAY });
    expect(records.n1.introducedOn).toBe(DAY);
  });

  it('обычные reviews не ограничиваются лимитом новых карточек', () => {
    const records = {};
    // 25 ревью карточек
    for (let i = 1; i <= 25; i++) {
      records[`rev_${i}`] = card(`rev_${i}`, State.Review);
    }
    // 30 новых карточек
    for (let i = 1; i <= 30; i++) {
      records[`new_${i}`] = card(`new_${i}`, State.New);
    }

    const selected = limitNewCardsForSession(Object.values(records), records, { day: DAY });
    // Все 25 reviews + 20 new = 45 карточек
    expect(selected).toHaveLength(45);
    const reviewsInSelected = selected.filter((c) => c.state === State.Review);
    expect(reviewsInSelected).toHaveLength(25);
  });

  it('dashboard корректно разделяет reviews и new items', () => {
    const records = {
      rev1: card('rev1', State.Review),
      rev2: card('rev2', State.Learning),
      new1: card('new1', State.New),
      new2: card('new2', State.New),
      new3: card('new3', State.New),
    };

    const due = Object.values(records);
    const sessionCards = limitNewCardsForSession(due, records, { day: DAY });

    const reviewsCount = due.filter((c) => c.state !== State.New).length;
    const availableNewCount = sessionCards.filter((c) => c.state === State.New).length;
    const totalCount = Object.keys(records).length;

    expect(reviewsCount).toBe(2);
    expect(availableNewCount).toBe(3);
    expect(totalCount).toBe(5);
  });
});
