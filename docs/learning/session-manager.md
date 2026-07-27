# SessionManager & Execution Flow — Прохождение Сессии

Документ описывает логику работы оркестратора учебной сессии `SessionManager` (`session-manager.js`).

---

## 🔄 Жизненный цикл сессии (Session Lifecycle)

```mermaid
graph TD
    A[Инициализация SessionManager.startSession] --> B[Формирование батча карт Batcher]
    B --> C[Выбор следующей карточки getNextCard]
    C --> D[Выбор UI режима Mode Selector]
    D --> E[Отрисовка и ожидание ответа пользователя]
    E -->|Ответ дан| F[recordReview & Оценка FSRS]
    F -->|Успех Good/Easy/Hard| G[Перемещение в список completed]
    F -->|Ошибка Again| H[Добавление в relearningQueue]
    G --> I{Остались карточки в батче?}
    H --> I
    I -->|Да| C
    I -->|Нет| J[Завершение сессии, начисление XP, сохранение State]
```

---

## ⏪ Функция отмены хода (Undo)

- `SessionManager` поддерживает стек отмены `undoStack`.
- При нажатии кнопки **Undo** на текущей карточке:
  1. Последний review event извлекается из стека.
  2. Карточка возвращается в предыдущее FSRS-состояние (восстанавливаются `stability`, `difficulty`, `due`).
  3. Отменяется начисление XP за отмененный ответ.
  4. Сессионная очередь возвращает карточку в активное состояние.
