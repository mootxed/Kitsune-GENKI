# CI & Deployment — Непрерывная Интеграция и Публикация

Документ описывает автоматизированные рабочие процессы (Workflows) в GitHub Actions и процесс деплоя веб-приложения **Kitsune-GENKI** на GitHub Pages.

---

## 🤖 GitHub Actions Workflows

Проект использует 3 основных workflow (`.github/workflows/`):

### 1. `ci.yml` — Continuous Integration

Запускается при каждом Push и Pull Request в ветки `main` и `master`.
Выполняет трибунал проверок:

- **`lint-and-format`**: Проверка линтинга ESLint (`npm run lint`) и форматирования Prettier (`npm run format:check`).
- **`unit-tests`**: Запуск всех Vitest тестов (`npm test`).
- **`build-check`**: Проверка пребилда и сборки приложения Vite (`npm run build`).

### 2. `deploy.yml` — Production Deployment

Запускается автоматически при успехе `ci.yml` в ветке `main` (или вручную через `workflow_dispatch`).
Этапы:

1. Выполняет `npm run build`.
2. Публикует содержимое папки `dist/` в **GitHub Pages**.

### 3. `roadmap-dates.yml` — Roadmap Dates Validation

Запускается по расписанию или PR для проверки корректности временных рамок и дат в планировщике.

---

## ⚠️ Важные особенности публикации

> [!NOTE]
> При сборке Vite для GitHub Pages базовый путь `base` подставляется из конфигурации `vite.config.js`. Приложение полностью сохраняет относительные пути для оффлайн-кеширования в Service Worker.
