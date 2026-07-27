# Testing Guide — Руководство по Тестированию

Проект **Kitsune-GENKI** содержит развитую инфраструктуру тестирования, покрывающую доменную логику, состояние, интерфейс, доступность и E2E сценарии.

---

## 🧪 Инструменты тестирования

1. **Vitest** (`^4.1.10`): Быстрый юнит- и интеграционный тест-раннер.
2. **jsdom** (`^29.1.1`): Эмуляция DOM-окружения для Vitest.
3. **Playwright** (`^1.50.0`): Полноценное E2E тестирование в реальных браузерах (Chromium, Firefox, WebKit).
4. **@axe-core/playwright** (`^4.12.1`): Автоматический аудит WCAG 2.2 AA доступности.

---

## 🏃 Запуск тестов

### 1. Юнит- и Интеграционные тесты (Vitest)

```bash
# Запуск всех Vitest тестов 1 раз
npm test

# Запуск в режиме наблюдения (watch mode) при разработке
npm run test:watch

# Запуск с графическим интерфейсом UI
npm run test:ui

# Запуск с генерацией отчета о покрытии кода (coverage)
npm run test:coverage
```

### 2. End-to-End тесты (Playwright)

```bash
# Запуск E2E тестов в headless режиме
npm run test:e2e
```

### 3. Валидация контента и связей

```bash
# Валидация грамматических JSON тестов
npm run validate:grammar-quizzes

# Валидация ссылок и структуры документации
npm run docs:check
```

---

## 📝 Написание нового юнит-теста

Тесты располагаются в папке `tests/` и должны оканчиваться на `.test.js`.

Пример структуры теста доменной функции (`tests/example.test.js`):

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { calculateMasteryLevel } from '../src/mastery.js';

describe('Mastery Calculation System', () => {
  it('should return level 0 for new card without reviews', () => {
    const cardHistory = [];
    const level = calculateMasteryLevel(cardHistory);
    expect(level).toBe(0);
  });
});
```

---

## 🎭 Изоляция IndexedDB и DOM в тестах

Для предотвращения взаимовлияния тестов в `tests/setup-mocks.js` инициализируются глобальные моки для `indexedDB`, `localStorage`, `SpeechSynthesis` и `AudioContext`.

Каждый тест состояния перед запуском выполняет сброс мок-хранилища.
