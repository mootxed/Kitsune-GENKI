# Content Validation — Скрипты Валидации Контента

Документ описывает автоматизированные скрипты проверки качества и валидности обучающего контента (`scripts/`).

---

## 🛠️ Скрипты валидации

### 1. `scripts/validate-grammar-quizzes.js`

Проверяет структуру всех интерактивных тестов, объявленных GENKI I manifest и
grammar index:

- Уникальность `id` каждого вопроса.
- Наличие правильного ответа (`correctAnswer` / `correctIndex`).
- Отсутствие сломанных UTF-8 символов.

Вызывается автоматически перед сборкой:

```bash
npm run validate:grammar-quizzes
```

### 2. `scripts/validate-courses.js`

Проверяет каждый `public/data/courses/*/manifest.json`, package-relative пути,
порядок уроков, уникальность runtime ID и загрузку минимального курса.

```bash
npm run validate:courses
```

### 3. `scripts/validate-genki-i-data.js`

Проверяет package-specific инварианты GENKI I: 12 уроков, каноническую лексику,
грамматику, истории, aliases и relations.

```bash
npm run validate:genki
```

### 4. Глобальный словарь

`build-dictionary.js --check` проверяет идемпотентность генерации, а
`validate-dictionary.js` — схемы, aliases, token index, коллизии и все course
references.

```bash
npm run build:dictionary
npm run validate:dictionary
```

### 5. `scripts/build-kanji-data.js`

Проверяет доступность векторных данных начертания иероглифов в пакете `@k1low/hanzi-writer-data-jp` и собирает кэш-файлы.
