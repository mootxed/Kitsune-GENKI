# Аудит архитектуры курсов (issue #38)

Дата аудита: 2026-07-30. Базовое состояние: `f9c07db`.

## Граница, к которой приводится приложение

```text
universal UI/domain modules
        ↓
course contract + active course context
        ↓
course registry
        ↓
GENKI I package / test course
```

Универсальные модули могут работать только с runtime-сущностями курса и
namespaced ID. Внутренние пути и локальные ID пакета разрешены только загрузчику,
реестру, валидатору и миграциям соответствующего курса.

## Найденные зависимости

| Зависимость                                                        | Файл и участок                                                                                                                                            | Почему это GENKI I                                                                | Целевая зона                   | Способ миграции                                                                                                      | Риск                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Индекс контента загружается по фиксированному пути                 | `src/content-loader.js:23-31`                                                                                                                             | `data/content-index.json` является индексом единственного учебника                | CourseLoader                   | Загружать `manifest.json`, затем ресурс из `manifest.dataPaths.contentIndex`                                         | Высокий: старт приложения и offline |
| Пути урока и истории строятся из номера                            | `src/content-loader.js:44-103`                                                                                                                            | Формат `lesson-XX.json`/`story-XX.json` и числовой ID принадлежат текущему пакету | CourseLoader                   | Находить запись урока по manifest/index и разрешать относительные пути от корня пакета                               | Высокий                             |
| Grammar loader знает каталог и предел 12                           | `src/grammar-quiz-content.js:124-147`, `:512-570`, `:602-607`                                                                                             | Путь `data/grammar-quizzes`, числовые главы и диапазон GENKI I                    | Contract + CourseLoader        | Оставить универсальную валидацию quiz-структуры; данные и список тем получать у активного курса                      | Высокий                             |
| Supplemental practice имеет глобальный фиксированный путь          | `src/supplemental-practice.js:10-17`, `:94-123`                                                                                                           | Единственный файл описывает Workbook GENKI I                                      | CourseLoader                   | Ресурс exercises объявить в manifest; validator сделать независимым от числового ID                                  | Средний                             |
| Таблица кандзи названа и валидируется как GENKI                    | `src/genki-kanji.js`, `src/content-loader.js:33-41`                                                                                                       | Диапазон уроков 3–12 и формат `Lx_Vxxx` — правило учебника                        | CourseFeature/relations        | Универсальный orthography projection; таблица и legacy matcher остаются в пакете GENKI I                             | Высокий: режимы карточек            |
| Knowledge model напрямую импортирует GENKI-модуль                  | `src/knowledge-model.js:6`, `:53-64`                                                                                                                      | Ядро FSRS зависит от правила отображения конкретного курса                        | Core + feature provider        | Запрашивать capability у активного курса через универсальный orthography API                                         | Высокий                             |
| SRS helper разбирает `L<number>_` и вызывает GENKI alias migration | `src/srs-helpers.js:1-20`                                                                                                                                 | Chapter выводится из локального ID GENKI I                                        | KnowledgeItemReference         | Использовать индекс `introducedIn` активного курса и generic canonicalizer                                           | Критический: фильтрация сессий      |
| Создание vocabulary cards использует урок из ID/числа              | `src/chapter-vocabulary.js:23-82`, `:93-162`                                                                                                              | Предполагает локальный vocabulary ID и числовой chapter                           | Core + contract                | Записывать `courseId`, `lessonId`, `dictionaryId` в knowledge/card references                                        | Критический                         |
| Нормализация урока приводит ID к Number                            | `src/chapter-content.js:6-58`                                                                                                                             | Строковый namespaced lesson ID уничтожается                                       | Contract normalization         | Сохранять строковый `id`; порядок хранить отдельно в `order`/manifest                                                | Высокий                             |
| Каталог плана приводит lesson/chapter ID к Number                  | `src/study-plan-creation.js:22-121`                                                                                                                       | Второй курс со строковыми ID невозможно подключить                                | Core                           | Сопоставлять по opaque ID; сортировать по `lessonOrder`                                                              | Критический                         |
| План и unlock-модули повторяют `Number(chapterId)`                 | `studyplan.js:704-709`; `src/vocabulary-unlock-plan.js`; `src/grammar-plan.js`; `src/practice-plan.js`                                                    | Число одновременно используется как ID и порядок GENKI                            | Core                           | Ввести helpers `canonicalLessonId`, `sameLessonId`, `compareLessonIds`; порядок брать из course context              | Критический                         |
| Home содержит список названий и метрик 12 уроков                   | `ui/home.js:42-89`                                                                                                                                        | Темы, количество и fallback принадлежат GENKI I                                   | Course manifest/index          | Удалить массивы; title, jp, counts и порядок брать из пакета                                                         | Высокий                             |
| Onboarding и Plan ограничены 12 уроками                            | `ui/onboarding.js:95-110`; `ui/plan.js:760`                                                                                                               | UI знает размер GENKI I                                                           | Core UI                        | Строить выбор и прогресс по `lessonOrder`/`CONTENT_INDEX.length` без fallback 12                                     | Средний                             |
| Stories используют numeric lesson ID и `CH_NAMES`                  | `ui/stories.js:15-103`, `:194-297`                                                                                                                        | Названия и порядок извлекаются из GENKI-таблицы                                   | Universal UI + contract        | Использовать Course Story/lesson metadata                                                                            | Средний                             |
| Workbook/Textbook подписи зашиты в UI/core                         | `ui/chapter.js:336`; `src/practice-tasks.js:1-69`                                                                                                         | Название источника — метаданные курса                                             | Exercise metadata              | Отображать `source` из упражнения; generic fallback без названия учебника                                            | Низкий                              |
| State v14 хранит один набор progress-map                           | `state/store.js:338-419`, `:456-518`                                                                                                                      | `chapters`, unlock maps и active chapter не имеют course scope                    | State contract + migration v15 | Добавить `activeCourseId`, `courses[courseId]`, namespaced references; оставить совместимый active-course projection | Критический                         |
| Runtime normalization отбрасывает строковые ID                     | `state/store.js:464-487`                                                                                                                                  | `map(Number)` и `Number(activeChapterId)` ломают namespaced ID                    | Core state                     | Валидировать opaque string IDs и восстанавливать через course migration adapter                                      | Критический                         |
| Миграция aliases живёт в общем `src/`                              | `src/genki-vocabulary-migration.js`, `src/genki-vocabulary-id-map.js`                                                                                     | Правила дубликатов относятся только к GENKI I                                     | `courses/genki-1/migrations`   | Сохранить поведение v14, перенести реализацию в пакет и оставить совместимый re-export при необходимости             | Высокий                             |
| Review/card references не содержат course identity                 | `src/knowledge-model.js`; `session-manager.js`; `src/review-log.js`                                                                                       | Локальные `Lx_Vxxx` могут столкнуться со вторым курсом                            | KnowledgeItemReference         | Namespaced item/card IDs; добавить metadata, не менять FSRS-поля и due                                               | Критический                         |
| AI получает номер текущего урока                                   | `src/ai/context-builder.js:52`; `src/ai/word-selector.js:120-170`                                                                                         | Контекст не различает курсы                                                       | Universal context              | Передавать `activeCourseId`, namespaced lesson ID и минимальные course metadata                                      | Средний                             |
| Service worker перечисляет 12 grammar files                        | `public/sw.js:60-75`                                                                                                                                      | Offline shell знает структуру GENKI I                                             | PWA generic content caching    | Кэшировать manifest/registry; остальные JSON — runtime stale-while-revalidate по `/data/courses/`                    | Высокий                             |
| Import/validate scripts пишут старые каталоги                      | `scripts/import-genki-i-data.js:10-17`; `scripts/validate-genki-i-data.js:66-229`                                                                         | Это tooling пакета GENKI I, но пути больше не изолированы                         | Course package tooling         | Обновить константы на `public/data/courses/genki-1`; валидировать manifest и единственность источника                | Средний                             |
| Grammar validator перечисляет 1–12                                 | `scripts/validate-grammar-quizzes.js:30-57`                                                                                                               | Универсальная команда фактически знает GENKI I                                    | Package validator              | Читать manifest/index и обходить явный `lessonOrder`                                                                 | Низкий                              |
| Legal check перечисляет 12 quiz files                              | `scripts/check-legal-metadata.js:102-113`                                                                                                                 | Проверка знает внутреннюю структуру учебника                                      | Package metadata               | Получать список из manifest/index                                                                                    | Низкий                              |
| Тесты импортируют старые JSON напрямую                             | `tests/grammar-quiz-content.test.js`, `tests/grammar-quiz-all-chapters.test.js`, `tests/typing-capability.test.js`, `tests/supplemental-practice.test.js` | Фикстуры закрепляют старые пути и numeric IDs                                     | Package tests                  | Импортировать package data либо проверять через CourseLoader                                                         | Средний                             |
| Legacy duplicate grammar JSON                                      | `public/data/genki-lesson-01-grammar-quiz.json`                                                                                                           | Параллельный источник урока 1 вне канонического quiz index                        | GENKI I package                | Перевести старые тесты на канонический файл и удалить duplicate                                                      | Средний                             |

## Идентификаторы

Локальные ID внутри исходного пакета (`L3_V001`, `L3_g1`) сохраняются как
`localId`, чтобы не потерять результаты канонизации v14 и aliases. CourseLoader
выдаёт глобальные runtime ID:

```text
genki-1:lesson-3
genki-1:vocabulary:L3_V001
genki-1:grammar:L3_g1
genki-1:exercise:L3_p_dialog
genki-1:story:lesson-3
```

`dictionaryId` строится независимо от course ID (`jp-word:<written>:<reading>`).
FSRS card ID остаётся производным от knowledge item ID и skill. Миграция не
пересчитывает FSRS scheduling fields.

## План изменений по файлам

1. `src/courses/course-contract.js` — схемы/валидация manifest и runtime entities.
2. `src/courses/course-loader.js` — base-path-safe fetch, загрузка и изоляция данных.
3. `src/courses/course-registry.js`, `src/courses/course-context.js` — единственная
   точка выбора пакета и lookup opaque IDs.
4. `public/data/courses/genki-1/**` — единственный источник канонических данных и manifest.
5. `src/content-loader.js`, `src/grammar-quiz-content.js`,
   `src/supplemental-practice.js` — compatibility facades поверх активного курса.
6. `src/course-orthography.js`, knowledge/SRS/chapter modules — универсальные
   feature/reference APIs вместо GENKI imports и regex.
7. `src/courses/genki-1/migrations/state-v15.js`, `state/store.js` — deterministic
   v14→v15 migration и course-scoped progress.
8. `scripts/*genki*`, `public/sw.js`, docs — новые пути, package validation и PWA.
9. `tests/fixtures/courses/test-course/**`, course/state/architecture tests —
   доказательство второго курса без изменения ядра.

## Явно отложено

- Глобальное объединение одинаковых слов и FSRS между курсами (issue #39).
- GENKI II, пользовательские пакеты, marketplace и plugin system.
- Переписывание Vanilla JS UI или алгоритма FSRS.

## Результат реализации

- Канонический GENKI I перенесён в `public/data/courses/genki-1/`; старые
  глобальные источники и дубли удалены.
- Universal contract, CourseLoader, registry и active course context работают
  с opaque IDs и package-relative ресурсами.
- State v15 создаёт `courses[courseId]`, namespaced references и архив
  неизвестных ссылок, не изменяя FSRS scheduling evidence.
- Минимальный `test-course` со строковым lesson ID загружается тем же
  CourseLoader.
- Архитектурные тесты запрещают прямые GENKI imports из generic runtime и
  возврат удалённых глобальных путей.
