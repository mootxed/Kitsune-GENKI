# SRS, retrievability и mastery в Kitsune-GENKI

## Версия и источник истины

Проект использует `ts-fsrs` **5.4.1** (`FSRSVersion`: `v5.4.1 using FSRS-6.0`).
Схема карточки сверена с установленным файлом `node_modules/ts-fsrs/dist/index.d.ts`.
Зависимость не обновлялась в рамках миграции.

Три понятия намеренно разделены:

- **schedule** — состояние отдельной FSRS-карточки и время следующего review;
- **retrievability** — вычисляемая `scheduler.get_retrievability(...)` вероятность вспомнить сейчас;
- **mastery** — вычисляемая глубина владения knowledge item по истории и нескольким skills.

Ни retrievability, ни mastery не сохраняются как изменяемый процент.

## Knowledge items, skills и стабильные ID

Одна FSRS-карточка относится ровно к одному `itemId` и одному `skill`.
Для vocabulary используются навыки:

- `recognition` — выбор значения/формы в multiple choice (слабое evidence);
- `recall` — активный ввод чтения по значению, режим `typing`;
- `reading-writing` — воспроизведение кандзи, режим `drawing`;
- `context-production` — выбор слова в контексте, если для категории есть шаблон.

Recognition сохраняет исторический ID слова (`L1_w1`). Остальные направления имеют
детерминированный ID вида `L1_w1::recall`. Это сохраняет старые ссылки и позволяет
безопасно достраивать новые skill-карточки начатых глав.

Vocabulary-карточки больше не превращаются случайно в particle quiz или sentence
building. Эти режимы не могут обновить vocabulary FSRS даже при ошибочном вызове.

## Полная сохраняемая карточка

JSON-запись в `state.srs[cardId]` содержит все поля `Card` из `ts-fsrs` 5.4.1:

| Поле             | Тип                                          |
| ---------------- | -------------------------------------------- |
| `due`            | timestamp ms                                 |
| `stability`      | number                                       |
| `difficulty`     | number                                       |
| `elapsed_days`   | number                                       |
| `scheduled_days` | number                                       |
| `learning_steps` | non-negative integer                         |
| `reps`           | non-negative integer                         |
| `lapses`         | non-negative integer                         |
| `state`          | `New`, `Learning`, `Review` или `Relearning` |
| `lastReview`     | timestamp ms или `null`                      |

Дополнительно сохраняются `id`, `itemId`, `skill`, `knowledgeType`, метаданные
лимита (`introducedOn`) и leech-метаданные. Legacy `progress` может остаться в
старой записи, но новая логика его не читает и не меняет.

`SRS.serializeCard()` — единственная точка нормализации. `SRS.hydrate()` переводит
timestamps в `Date` для библиотеки. Результат `repeat()` снова проходит через тот
же сериализатор, поэтому `learning_steps` и другие поля не теряются между запусками.

Для старой карточки без `learning_steps` используется детерминированное значение `0`.
Это безопасно перезапускает неизвестный шаг обучения, не придумывая историю.

## Применение review и журнал

UI применяет review через `SRS.applyReview()`. В той же записи состояния создаётся
событие:

```js
{
  eventId,
  eventType: 'review',
  itemId,
  cardId,
  skill,
  mode,
  firstAttemptCorrect,
  mistakes,
  hintUsed,
  responseTimeMs,
  rawRating,
  effectiveRating,
  reviewedAt,
  previousCard,
  nextCard,
  undoneAt
}
```

`state.reviewEvents` и `state.srs` сохраняются одним объектом `app_state`, поэтому
карточка и её новое событие не расходятся из-за отдельной асинхронной append-записи.
Старый IndexedDB store `review_log` сохраняется для совместимости бэкапов; старые
неполные записи не считаются доказательством mastery.

System fallback, preview practice и debug skip не создают успешный review. Обычный
пропуск также не является доказательством воспоминания. Внутрисессионная повторная
попытка завершает доучивание, но второй раз FSRS не обновляет.

## Оценивание

Шкала приложения остаётся `Again=0`, `Hard=3`, `Good=4`, `Easy=5` и явно
преобразуется в `ts-fsrs Rating`.

- быстрый правильный multiple choice больше не повышается с Good до Easy;
- медленный Easy может быть понижен до Good;
- подсказка или повторная попытка не могут дать Easy;
- `mistakes`, `hintUsed`, raw и effective rating записываются явно;
- оба multiple-choice направления относятся только к recognition и остаются более
  слабым evidence, чем активный typing/drawing; они не создают recall/production axis.

## Extra practice

«Дополнительная практика» — preview:

- выбирает только уже введённые карточки;
- не меняет `due`, `stability`, `difficulty`, `state` или `learning_steps`;
- не вводит новые карточки и не расходует/обходит дневной лимит;
- не создаёт mastery evidence.

Отдельного режима «учитывать практику в расписании» сейчас нет.

## Undo

Каждое активное событие хранит `previousCard` и `nextCard`. Undo:

1. находит последнее неотменённое событие (в том числе после reload);
2. восстанавливает полный `previousCard`, включая `learning_steps`;
3. ставит `undoneAt` именно этому `eventId`;
4. сохраняет карточку и событие вместе в `app_state`;
5. при активной сессии также восстанавливает runtime snapshot очереди и статистики.

Mastery всегда исключает события с `undoneAt`.

## Расчёт mastery

Код находится в `src/mastery.js`. Учитываются последние **20** валидных событий для
accuracy. «Недавний lapse» — `effectiveRating === Again` за последние **30 дней**.
Дни считаются по локальной календарной дате пользователя.

Stability нескольких проверенных skills агрегируется консервативно: берётся минимум
среди skill-карточек, имеющих успешное evidence. Отсутствующие оси не подставляются
нулём, но требования покрытия не позволяют пройти высокий уровень без них.

Уровни:

- **Новое** — нет валидных попыток;
- **Знакомо** — есть правильная первая попытка;
- **Вспоминаю** — stability ≥ 7 дней, успехи минимум в два локальных дня и есть recall;
- **Уверенно** — stability ≥ 30 дней, retrievability ≥ 0.85, accuracy ≥ 80%, минимум два skills;
- **Освоено** — stability ≥ 90 дней, retrievability ≥ 0.90, есть context/production и нет lapse за 30 дней.

Из расчёта исключаются undone, system fallback, preview и debug события. Один быстрый
multiple choice даёт максимум «Знакомо».

Плавный UI score вычисляется, но не заменяет уровни:

- 50% — durability (`stability / 90`, с ограничением 100%);
- 35% — покрытие skills × accuracy;
- 15% — последовательность последних успехов.

Если mastered-item снова due, UI показывает `Освоено · пора освежить`, не обнуляя
долговременное мастерство.

## Лимиты и локальные даты

Все дневные ключи формируются через `src/local-date.js` из локальных компонентов
`Date`, без UTC slicing. Счётчики dashboard, home, chapter и badge используют тот же
`countAvailableCardsForSession()`, что и реальный запуск. Проверенные review никогда
не блокируются лимитом; ограничиваются только новые карточки.

## Миграция данных

Версия `state` повышена с 3 до 4:

1. все старые SM-2 карточки проходят прежнюю конверсию без изменения абсолютного `due`;
2. все FSRS-записи проходят единый сериализатор и получают `learning_steps: 0`, если поля не было;
3. добавляются `itemId`, `skill: recognition`, `knowledgeType` и `reviewEvents`;
4. legacy `progress` сохраняется и помечается `legacyMasteryEstimated`, но не становится mastery;
5. после загрузки контента начатым главам достраиваются стабильные skill-карточки.

Формат полного бэкапа — `4.0`; импорт `3.0` и `2.0` поддерживается. Пользовательские
данные не удаляются.
