# План: Экспорт/импорт прогресса

**Дата:** 2026-07-18  
**Задача:** Реализовать расширенный экспорт/импорт всего localStorage с валидацией

## Архитектура

### Структура экспорта

```json
{
  "app": "kitsune_genki",
  "exportType": "full_localstorage",
  "schemaVersion": "2.0",
  "timestamp": "2026-07-18T12:16:00.056Z",
  "data": {
    "state": {/* полный state */},
    "lessonVersion": "123",
    "lastActivityDay": "2026-07-18",
    "theme": "dark"
  }
}
```

### Ключи localStorage для экспорта

- ✅ `LS_STATE` — основное состояние (chapters, srs, streak, xp, achievements, quests, chatHistory)
- ❌ `LS_LESSONS` — исключён (кэш уроков, слишком большой)
- ✅ `LS_LESSON_VERSION` — версия уроков
- ✅ `LS_LAST_ACTIVITY_DAY` — последний день активности
- ✅ `LS_THEME` — тема оформления

### Новые функции

1. **`exportFullProgress()`**
   - Собирает все данные из localStorage
   - Добавляет schemaVersion: "2.0"
   - Создаёт JSON файл
   - Web Share API для мобильных / скачивание для десктопа

2. **`importFullProgress()`**
   - Валидация структуры JSON
   - Проверка schemaVersion
   - Диалог подтверждения с деталями
   - Специальная обработка API-ключа (чекбокс сохранения)
   - Восстановление всех ключей localStorage

### UI изменения

Добавить в `renderSettings()` после существующего блока бэкапа:

```html
<div class="set-group">
  <div class="set-item">
    <label>🔐 Полный экспорт прогресса</label>
    <div class="set-hint">
      Экспорт всего localStorage включая достижения, квесты и историю чата.
      <strong>Внимание:</strong> Включает API-ключ OpenRouter!
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button class="btn-ghost" id="btn-export-full">📦 Скачать прогресс (.json)</button>
      <button class="btn-ghost" id="btn-import-full">📥 Восстановить из файла</button>
    </div>
  </div>
</div>
```

### Логика валидации импорта

```javascript
// 1. Проверка формата
if (!data.exportType || data.exportType !== 'full_localstorage') {
  return 'Неверный тип экспорта';
}

// 2. Проверка версии схемы
if (!data.schemaVersion || data.schemaVersion !== '2.0') {
  return 'Несовместимая версия схемы данных';
}

// 3. Проверка обязательных полей
if (!data.data || !data.data.state) {
  return 'Отсутствуют обязательные данные';
}

// 4. Диалог подтверждения
const currentProgress = {
  xp: state.xp,
  level: state.level,
  streak: state.streak.count,
};
const importProgress = {
  xp: data.data.state.xp,
  level: data.data.state.level,
  streak: data.data.state.streak.count,
};

// 5. Обработка API-ключа
if (data.data.state.settings?.openrouterKey && state.settings.openrouterKey) {
  // Показать чекбокс "Сохранить мой текущий API-ключ"
}
```

### Дополнения к существующему бэкапу

В функцию `shareProgressBackup()` добавить недостающие поля:

- `unlockedAchievements`
- `claimedAchievements`
- `quests`
- `chatHistory`

## Файлы для изменения

1. **app.js**
   - Добавить функции `exportFullProgress()` и `importFullProgress()`
   - Обновить `shareProgressBackup()` (добавить недостающие поля)
   - Обновить `restoreProgressBackup()` (добавить недостающие поля)
   - Добавить UI в `renderSettings()`

## Тестирование

1. Экспорт создаёт валидный JSON с версией схемы
2. Импорт валидирует структуру и версию
3. Диалог подтверждения показывает корректные данные
4. Чекбокс API-ключа работает правильно
5. Web Share API работает на мобильных
6. Все существующие тесты проходят: `npm test`
