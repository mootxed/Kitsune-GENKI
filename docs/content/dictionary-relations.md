# Связанная архитектура данных словарной записи (Issue #32)

## Единый центр идентичности — DictionaryEntry

В KotoKitsu словарная запись (`DictionaryEntry`) выступает единым центром языковой идентичности слова, адресуемым через стабильный `dictionaryId`. Другие подсистемы (истории, примеры, спряжения, грамматика, уроки, FSRS) не дублируют языковые данные (словарную форму, чтение, значения, часть речи), а ссылаются на `dictionaryId`.

```text
DictionaryEntry
├─ TokenOccurrence[] (контекстные появления)
├─ ExampleReference[] (примеры из курсов/историй/AI)
├─ Conjugation[] (таблица спряжений с учётом изученного)
├─ GrammarReference[] (явная и типовая грамматика)
├─ LessonReference[] (уроки введения и повторения)
├─ StoryOccurrence[] (индекс предложений в историях)
└─ FSRSKnowledgeItem (read-only агрегация SRS-статистики)
```

## Агрегация данных — DictionaryDetailsService

Агрегацию данных выполняет read-only сервис `DictionaryDetailsService` (`src/dictionary/dictionary-details-service.js`).
Он собирает агрегированную карточку без изменения состояния приложения или расписания FSRS.

### Контракт `getDictionaryDetails`

- `dictionaryId`: канонический ID слова (после alias resolution).
- `entry`: ссылка на центральный `DictionaryEntry`.
- `context`: контекст текущего токена (`TokenOccurrence`).
- `examples`: дедуплицированный список примеров.
- `conjugations`: таблица спряжений с флагами доступности (`learned`, `available`, `future`).
- `grammarTopics`: релевантные грамматические темы.
- `lessons`: уроки введения и появления слова по всем зарегистрированным курсам.
- `storyOccurrences`: детерминированный индекс использования слова в историях.
- `fsrs`: read-only статистика SRS (retrievability, due date, reps, lapses, skills).

## Слои индексов — DictionaryRelationsIndex и StoryOccurrenceIndex

1. **DictionaryRelationsIndex** (`src/dictionary/dictionary-relations-index.js`):
   - Управляет связями по примера, урокам и грамматике.
   - Поддерживает типы связей: явные (`explicit`) и типовые (`type-rule` по части речи/классу глагола).
   - Кэширует производные данные и автоматически инвалидируется при смене курса или добавлении AI-записи.

2. **StoryOccurrenceIndex** (`src/dictionary/story-occurrence-index.js`):
   - Строит индекс `StoryOccurrence` по сохранённым встроенным и пользовательским AI-историям.
   - Использует детерминированные ключи `story-occurrence:<storyId>:<sentenceId>:<tokenId>`.
   - Поддерживает безопасный переход к предложению истории с временной подсветкой токена.

## Read-only интеграция FSRS

- Просмотр карточки или страницы слова берет данные FSRS через `calculateMastery()` и не совершает запись в review log (`affectSchedule: false`).
- FSRS-расписание остается защищенным от лишних повторений.
