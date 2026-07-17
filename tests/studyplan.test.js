import { describe, it, expect, beforeEach } from 'vitest';
import { StudyPlan } from '../studyplan.js';

describe('StudyPlan', () => {
  let mockLessons;

  beforeEach(() => {
    // Мокаем данные уроков для тестирования
    mockLessons = [
      {
        id: 1,
        words: Array(20).fill({ word: 'test' }), // 20 слов
        grammar: ['rule1', 'rule2', 'rule3'], // 3 грамматических правила
      },
      {
        id: 2,
        words: Array(25).fill({ word: 'test' }), // 25 слов
        grammar: ['rule1', 'rule2'], // 2 правила
      },
      {
        id: 3,
        words: Array(30).fill({ word: 'test' }), // 30 слов
        grammar: ['rule1', 'rule2', 'rule3', 'rule4'], // 4 правила
      },
    ];
  });

  describe('generatePlan', () => {
    it('должен сгенерировать план с заданным deadline', () => {
      const params = {
        startDate: '2026-01-01',
        deadline: '2026-02-01',
        studyDaysOfWeek: [1, 2, 3, 4, 5], // Пн-Пт
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      expect(plan.error).toBeUndefined();
      expect(plan.startDate).toBe('2026-01-01');
      expect(plan.deadline).toBe('2026-02-01');
      expect(plan.segments).toBeDefined();
      expect(plan.segments.length).toBeGreaterThan(0);
    });

    it('должен сгенерировать план с заданным totalDays', () => {
      const params = {
        startDate: '2026-01-01',
        totalDays: 30,
        studyDaysOfWeek: [1, 2, 3, 4, 5], // Пн-Пт
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      expect(plan.error).toBeUndefined();
      expect(plan.segments).toBeDefined();
    });

    it('должен вернуть ошибку если не указан ни deadline ни totalDays', () => {
      const params = {
        startDate: '2026-01-01',
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      expect(plan.error).toBe('Необходимо указать deadline или totalDays');
    });

    it('должен исключить завершённые главы из плана', () => {
      const params = {
        startDate: '2026-01-01',
        totalDays: 30,
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const completedChapters = [1]; // Глава 1 завершена
      const plan = StudyPlan.generatePlan(params, mockLessons, completedChapters);

      expect(plan.error).toBeUndefined();
      // Проверяем что глава 1 не включена в план
      const chaptersInPlan = plan.segments
        .filter(s => s.type === 'chapter')
        .map(s => s.chapterId);
      expect(chaptersInPlan).not.toContain(1);
      expect(chaptersInPlan).toContain(2);
      expect(chaptersInPlan).toContain(3);
    });

    it('должен вернуть ошибку если все главы завершены', () => {
      const params = {
        startDate: '2026-01-01',
        totalDays: 30,
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const completedChapters = [1, 2, 3]; // Все главы завершены
      const plan = StudyPlan.generatePlan(params, mockLessons, completedChapters);

      expect(plan.error).toBe('Все главы уже изучены! 🎓');
    });

    it('должен вернуть ошибку если период слишком короткий', () => {
      const params = {
        startDate: '2026-01-01',
        deadline: '2026-01-05', // Только 5 дней
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      expect(plan.error).toContain('Слишком сжатый срок');
      expect(plan.minDays).toBe(12);
      expect(plan.availableDays).toBeDefined();
    });

    it('должен распределить больше дней на главы с большим весом', () => {
      const lessons = [
        {
          id: 1,
          words: Array(10).fill({ word: 'test' }), // Лёгкая глава
          grammar: ['rule1'],
        },
        {
          id: 2,
          words: Array(50).fill({ word: 'test' }), // Тяжёлая глава
          grammar: ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'],
        },
      ];

      const params = {
        startDate: '2026-01-01',
        totalDays: 30,
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const plan = StudyPlan.generatePlan(params, lessons, []);

      const chapter1Days = plan.segments.find(s => s.chapterId === 1)?.days || 0;
      const chapter2Days = plan.segments.find(s => s.chapterId === 2)?.days || 0;

      // Глава 2 должна получить больше дней чем глава 1
      expect(chapter2Days).toBeGreaterThan(chapter1Days);
    });

    it('должен включить дни для повторения каждые 3 главы', () => {
      const manyLessons = Array(9).fill(null).map((_, i) => ({
        id: i + 1,
        words: Array(20).fill({ word: 'test' }),
        grammar: ['rule1', 'rule2'],
      }));

      const params = {
        startDate: '2026-01-01',
        totalDays: 60,
        studyDaysOfWeek: [1, 2, 3, 4, 5, 6, 0], // Каждый день
      };

      const plan = StudyPlan.generatePlan(params, manyLessons, []);

      // Должны быть дни для повторения
      const reviewSegments = plan.segments.filter(s => s.type === 'review');
      expect(reviewSegments.length).toBeGreaterThan(0);
    });

    it('должен назначить каждому сегменту даты начала и окончания', () => {
      const params = {
        startDate: '2026-01-01',
        totalDays: 20,
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      plan.segments.forEach(segment => {
        expect(segment.startDate).toBeDefined();
        expect(segment.endDate).toBeDefined();
        expect(new Date(segment.startDate)).toBeInstanceOf(Date);
        expect(new Date(segment.endDate)).toBeInstanceOf(Date);
      });
    });

    it('должен учитывать только выбранные дни недели', () => {
      const params = {
        startDate: '2026-01-05', // Понедельник (учебный день)
        totalDays: 18, // Увеличено для гарантии достаточного количества дней
        studyDaysOfWeek: [1, 3, 5], // Только Пн, Ср, Пт
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      // Проверяем что все даты соответствуют выбранным дням недели
      plan.segments.forEach(segment => {
        const startDay = new Date(segment.startDate).getDay();
        const endDay = new Date(segment.endDate).getDay();
        expect([1, 3, 5]).toContain(startDay);
        expect([1, 3, 5]).toContain(endDay);
      });
    });

    it('должен гарантировать минимум 1 день на главу', () => {
      const params = {
        startDate: '2026-01-01',
        totalDays: 15,
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      const plan = StudyPlan.generatePlan(params, mockLessons, []);

      const chapterSegments = plan.segments.filter(s => s.type === 'chapter');
      chapterSegments.forEach(segment => {
        expect(segment.days).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('recalcPlan', () => {
    it('должен пересчитать план с текущей даты', () => {
      const originalPlan = {
        startDate: '2026-01-01',
        deadline: '2026-09-01', // Обновлено на дату в будущем
        studyDaysOfWeek: [1, 2, 3, 4, 5],
        segments: [],
      };

      const today = new Date().toISOString().slice(0, 10);
      const recalculated = StudyPlan.recalcPlan(originalPlan, mockLessons, []);

      expect(recalculated.startDate).toBe(today);
      expect(recalculated.deadline).toBe(originalPlan.deadline);
      expect(recalculated.studyDaysOfWeek).toEqual(originalPlan.studyDaysOfWeek);
    });

    it('должен учитывать завершённые главы при пересчёте', () => {
      const originalPlan = {
        startDate: '2026-01-01',
        deadline: '2026-09-01', // Обновлено на дату в будущем
        studyDaysOfWeek: [1, 2, 3, 4, 5],
        segments: [],
      };

      const completedChapters = [1, 2];
      const recalculated = StudyPlan.recalcPlan(originalPlan, mockLessons, completedChapters);

      const chaptersInPlan = recalculated.segments
        .filter(s => s.type === 'chapter')
        .map(s => s.chapterId);
      expect(chaptersInPlan).not.toContain(1);
      expect(chaptersInPlan).not.toContain(2);
      expect(chaptersInPlan).toContain(3);
    });
  });

  describe('getHeuristicAdvice', () => {
    it('должен давать базовую рекомендацию для сбалансированной главы', () => {
      const chapter = {
        words: Array(25).fill({ word: 'test' }), // Средний объём
        grammar: ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'], // Средний объём
      };

      const advice = StudyPlan.getHeuristicAdvice(chapter);

      expect(advice.words).toBeDefined();
      expect(advice.grammar).toBeDefined();
      expect(advice.reading).toBeDefined();
      expect(advice.listening).toBeDefined();
      expect(advice.tip).toContain('сбалансирована');
    });

    it('должен рекомендовать больше времени на словарь при большом объёме слов', () => {
      const chapter = {
        words: Array(40).fill({ word: 'test' }), // Много слов
        grammar: ['rule1', 'rule2'],
      };

      const advice = StudyPlan.getHeuristicAdvice(chapter);

      // При большом количестве слов процент на словарь должен быть выше базового (40%)
      expect(advice.words).toBeGreaterThan(40);
      expect(advice.tip).toContain('слов');
      expect(advice.tip).toContain('словарному запасу');
    });

    it('должен рекомендовать больше времени на грамматику при сложной грамматике', () => {
      const chapter = {
        words: Array(20).fill({ word: 'test' }),
        grammar: Array(10).fill('complex rule'), // Много грамматики
      };

      const advice = StudyPlan.getHeuristicAdvice(chapter);

      // При большом количестве грамматики процент должен быть выше базового (35%)
      expect(advice.grammar).toBeGreaterThan(35);
      expect(advice.tip).toContain('грамматик');
    });

    it('должен корректировать рекомендации при малом времени', () => {
      const chapter = {
        words: Array(25).fill({ word: 'test' }),
        grammar: ['rule1', 'rule2'],
      };

      const advice = StudyPlan.getHeuristicAdvice(chapter, 5); // Осталось 5 дней

      expect(advice.tip).toContain('мало времени');
      expect(advice.listening).toBeLessThan(10); // Listening уменьшается при дефиците времени
    });

    it('должен всегда возвращать положительные значения', () => {
      const chapter = {
        words: Array(50).fill({ word: 'test' }),
        grammar: Array(15).fill('rule'),
      };

      const advice = StudyPlan.getHeuristicAdvice(chapter, 3);

      expect(advice.words).toBeGreaterThan(0);
      expect(advice.grammar).toBeGreaterThan(0);
      expect(advice.reading).toBeGreaterThan(0);
      expect(advice.listening).toBeGreaterThan(0);
    });

    it('должен работать с главой без слов или грамматики', () => {
      const emptyChapter = {};

      const advice = StudyPlan.getHeuristicAdvice(emptyChapter);

      expect(advice.words).toBeDefined();
      expect(advice.grammar).toBeDefined();
      expect(advice.tip).toBeDefined();
    });
  });

  describe('Интеграционные сценарии', () => {
    it('должен создать полный план для 12 глав Genki за 3 месяца', () => {
      const genkiLessons = Array(12).fill(null).map((_, i) => ({
        id: i + 1,
        words: Array(25 + Math.floor(Math.random() * 10)).fill({ word: 'test' }),
        grammar: Array(4 + Math.floor(Math.random() * 3)).fill('rule'),
      }));

      const params = {
        startDate: '2026-01-01',
        deadline: '2026-04-01', // 3 месяца
        studyDaysOfWeek: [1, 2, 3, 4, 5, 6], // 6 дней в неделю
      };

      const plan = StudyPlan.generatePlan(params, genkiLessons, []);

      expect(plan.error).toBeUndefined();
      expect(plan.segments.length).toBeGreaterThan(12); // Главы + дни повторения
      
      // Проверяем что все 12 глав включены
      const chaptersInPlan = plan.segments
        .filter(s => s.type === 'chapter')
        .map(s => s.chapterId);
      expect(chaptersInPlan).toHaveLength(12);
      expect(Math.min(...chaptersInPlan)).toBe(1);
      expect(Math.max(...chaptersInPlan)).toBe(12);
    });

    it('должен адаптироваться к разной интенсивности обучения', () => {
      // Интенсивный план (каждый день)
      const intensiveParams = {
        startDate: '2026-01-01',
        totalDays: 30,
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      };

      const intensivePlan = StudyPlan.generatePlan(intensiveParams, mockLessons, []);

      // Расслабленный план (3 дня в неделю)
      const relaxedParams = {
        startDate: '2026-01-01',
        totalDays: 30,
        studyDaysOfWeek: [1, 3, 5],
      };

      const relaxedPlan = StudyPlan.generatePlan(relaxedParams, mockLessons, []);

      // Интенсивный план должен покрыть больший период
      expect(intensivePlan.error).toBeUndefined();
      expect(relaxedPlan.error).toBeUndefined();
      
      // Даты deadline должны отличаться
      expect(intensivePlan.deadline).not.toBe(relaxedPlan.deadline);
    });

    it('должен корректно работать при постепенном прохождении плана', () => {
      const params = {
        startDate: '2026-01-01',
        deadline: '2026-09-01', // Используем deadline в будущем для корректной работы recalcPlan
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      };

      // Начальный план
      let plan = StudyPlan.generatePlan(params, mockLessons, []);
      expect(plan.segments.filter(s => s.type === 'chapter')).toHaveLength(3);

      // Завершили главу 1
      plan = StudyPlan.recalcPlan(plan, mockLessons, [1]);
      expect(plan.segments.filter(s => s.type === 'chapter')).toHaveLength(2);

      // Завершили главы 1 и 2
      plan = StudyPlan.recalcPlan(plan, mockLessons, [1, 2]);
      expect(plan.segments.filter(s => s.type === 'chapter')).toHaveLength(1);
      expect(plan.segments.find(s => s.chapterId === 3)).toBeDefined();
    });
  });
});