# Application State — Модель Состояния Приложения

В этом документе приведено детальное описание централизованного состояния веб-приложения **Kitsune-GENKI** (`state/store.js`).

---

## 📌 Версионирование состояния

- **Текущая версия схемы**: `CURRENT_VERSION = 16`.
- **Ключ хранения в localStorage (Legacy/Fallback)**: `kitsune_state_v1`.
- **Ключ хранения в IndexedDB (Основное)**: `app_state` store → запись с ID `'state'`.

---

## 🧱 Структура объектов State v16 (Упрощённый пример)

```javascript
// Упрощенный пример структуры приложения
{
  version: 16,                     // Идентификатор версии схемы (CURRENT_VERSION)
  onboardingCompleted: true,       // Флаг прохождения начального анкетирования
  xp: 1250,                        // Общий накопленный опыт пользователя
  streak: 5,                       // Стрик активности (дней подряд)
  lastActivityDate: "2026-07-27",  // Дата последней активности YYYY-MM-DD
  srs: {                           // Реестр карточек FSRS (ключ: cardId)
    "jp-word:映画:えいが": {
      id: "jp-word:映画:えいが",
      itemId: "jp-word:映画:えいが",
      due: "2026-07-28T09:00:00.000Z",
      stability: 4.25,
      difficulty: 5.12,
      elapsed_days: 2,
      scheduled_days: 3,
      reps: 4,
      lapses: 0,
      state: 2,                    // 0: New, 1: Learning, 2: Review, 3: Relearning
      last_review: "2026-07-25T09:00:00.000Z"
    }
  },
  vocabularyUnlocks: {             // Staged Skill Opening (разблокировка по дням)
    "genki1_l1_v1": { unlockedDay: 1, planLocked: false }
  },
  userPlan: {                      // Учебный план пользователя
    targetDate: "2026-09-01",
    dailyCapacityMinutes: 20,
    chapters: [1, 2, 3]
  },
  dailySnapshot: {                 // Снапшот дневного плана
    date: "2026-07-27",
    reviewTask: { total: 15, completed: 10 },
    newItemsTask: { total: 5, completed: 5 }
  },
  settings: {                      // Пользовательские настройки
    theme: "dark",
    dailyLimit: 30,
    audioAutoplay: true
  }
}
```

---

## 🔍 Источники истины vs Производные поля (Derived Fields)

| Поле в State              | Категория           | Описание                                                                                     |
| :------------------------ | :------------------ | :------------------------------------------------------------------------------------------- |
| `state.srs`               | **Source of Truth** | Карточки повторения, их stability/difficulty/due. Нельзя пересчитать из внешних данных.      |
| `state.xp`                | **Source of Truth** | Суммарный накопленный опыт.                                                                  |
| `state.vocabularyUnlocks` | **Source of Truth** | Состояние индивидуальной разблокировки навыков по дням.                                      |
| `Mastery Levels`          | **Derived Data**    | Вычисляется динамически функцией `calculateMastery()` из `state.srs` и истории `review_log`. |
| `Home Dashboard Summary`  | **Derived Data**    | Вычисляется на лету перед рендерингом главной страницы.                                      |

---

## 🔄 Реализация сохранения и сериализации

- При вызове `setState(updater)` состояние атомарно обновляется в памяти, оповещает подписчиков (`subscribers.forEach(fn => fn(state))`) и асинхронно записывается в IndexedDB store `app_state`.
- Все даты при сериализации приводятся к ISO 8601 строкам.
