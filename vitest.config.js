import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Окружение jsdom для эмуляции браузерного окружения
    environment: 'jsdom',

    // Файл с глобальными моками для тестов
    setupFiles: ['./tests/setup-mocks.js'],

    // Глобальные переменные для тестов (describe, it, expect без импортов)
    globals: true,

    // Покрытие кода
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/', '*.config.js', 'public/'],
      thresholds: {
        lines: 60,
        functions: 50,
        branches: 55,
        statements: 60,
        'state/**': {
          lines: 80,
          functions: 70,
          branches: 70,
          statements: 80,
        },
        'srs.js': {
          lines: 85,
          functions: 80,
          branches: 80,
          statements: 85,
        },
        'src/srs-*.js': {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'src/mastery.js': {
          lines: 85,
          functions: 80,
          branches: 80,
          statements: 85,
        },
        'achievements.js': {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'quests.js': {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'studyplan.js': {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'src/study-plan-creation.js': {
          lines: 75,
          functions: 70,
          branches: 55,
          statements: 75,
        },
        'src/daily-plan.js': {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'src/migration.js': {
          lines: 75,
          functions: 60,
          branches: 60,
          statements: 75,
        },
        'src/courses/genki-1/migrations/**': {
          lines: 90,
          functions: 75,
          branches: 75,
          statements: 90,
        },
        'src/dictionary/**': {
          lines: 75,
          functions: 65,
          branches: 65,
          statements: 75,
        },
        'src/user-dictionaries/**': {
          lines: 75,
          functions: 65,
          branches: 75,
          statements: 75,
        },
      },
    },

    // Паттерны для поиска тестовых файлов
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**'],

    // Таймаут для тестов (в миллисекундах)
    testTimeout: 10000,

    // Очистка моков между тестами
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});
