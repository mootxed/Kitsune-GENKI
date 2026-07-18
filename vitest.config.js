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
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', '*.config.js', 'public/'],
    },

    // Паттерны для поиска тестовых файлов
    include: ['tests/**/*.test.js'],

    // Таймаут для тестов (в миллисекундах)
    testTimeout: 10000,

    // Очистка моков между тестами
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});
