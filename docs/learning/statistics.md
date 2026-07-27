# Statistics Calculations — Расчёт Статистики

В этом документе описаны алгоритмы сбора и вычисления аналитических метрик (`src/statistics/`).

---

## 📊 Таблица вычисляемых метрик

| Метрика                | Формула / Метод вычисления                                                               | Модуль                    | Источник данных      |
| :--------------------- | :--------------------------------------------------------------------------------------- | :------------------------ | :------------------- |
| **Observed Retention** | $\frac{\text{Успешные повторения (Quality >= 2)}}{\text{Всего повторений в периоде}}$    | `retention-statistics.js` | `review_log`         |
| **Lapse Rate**         | $\frac{\text{Количество событий Rating.Again}}{\text{Всего повторений карточек Review}}$ | `lapse-statistics.js`     | `review_log`         |
| **Workload Forecast**  | Сумма карточек с `due <= TargetDate` по дням                                             | `workload-statistics.js`  | `state.srs`          |
| **Mastery Breakdown**  | Распределение карточек по уровням 0..4                                                   | `mastery-statistics.js`   | `calculateMastery()` |
| **Skill Performance**  | Средняя точность в разрезе по `skill`                                                    | `skill-statistics.js`     | `review_log`         |

---

## ⚠️ Отличие Observed Retention от FSRS Retrievability

- **Observed Retention**: Фактическая экспериментальная точность пользователя за прошлый период (например, 92% верных ответов за последнюю неделю).
- **FSRS Retrievability ($R$)**: Теоретическая вероятность вспомнить конкретную карточку в данный момент времени, рассчитываемая по экспоненциальной кривой забывания FSRS.
