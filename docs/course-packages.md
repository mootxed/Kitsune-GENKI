# Пакеты курсов

KotoKitsu отделяет универсальное приложение от структуры конкретного
учебника. UI, план, SRS и прогресс работают с runtime-контрактом курса, а
CourseLoader является единственной точкой чтения package JSON.

## Структура пакета

Каждый встроенный курс располагается в `public/data/courses/<course-id>/` и
имеет `manifest.json`. Manifest задаёт:

- `courseId`, `contentVersion` и языки;
- `lessonOrder` с глобально уникальными ID вида
  `<course-id>:lesson-<local-id>`;
- package-relative пути в `dataPaths`;
- опциональные capabilities в `features`.

`content-index.json` связывает уроки с их JSON и историями. Имена файлов,
количество уроков и формат локальных ID не являются частью ядра.

## Идентификаторы

Локальные ID допустимы только внутри пакета и package-specific миграций.
CourseLoader преобразует их в runtime ID:

```text
test-course:lesson-alpha
test-course:vocabulary:hello
test-course:grammar:greeting
test-course:exercise:intro
test-course:story:lesson-1
```

Runtime-сущность также содержит `localId`, `courseId` и `introducedIn` или
`lessonId`. FSRS card ID строится из namespaced knowledge ID и skill через
разделитель `::`.

## Добавление курса

1. Создайте package directory и manifest по схеме
   `src/courses/course-contract.js`.
2. Добавьте content index и хотя бы один lesson JSON. Grammar, exercises,
   stories, relations и aliases подключайте только через manifest/index.
3. Если исходный формат требует преобразования, создайте adapter в
   `src/courses/<course-id>/`; не добавляйте проверки этого курса в generic
   domain/UI.
4. Зарегистрируйте descriptor в `src/courses/course-registry.js`.
5. Добавьте fixture-тест CourseLoader и, при наличии старого состояния,
   детерминированную идемпотентную миграцию.
6. Запустите:

   ```bash
   npm run validate:courses
   npm test
   npm run build
   ```

Минимальный эталон находится в `tests/fixtures/courses/test-course/`. Он
использует строковый lesson ID и доказывает, что ядро не зависит от GENKI I.

## Границы

Generic runtime может импортировать только course contract/context/registry.
Прямой импорт `src/courses/genki-1/**` разрешён registry, миграциям состояния и
явным compatibility re-export. Канонические данные GENKI I существуют только
в `public/data/courses/genki-1/`.
