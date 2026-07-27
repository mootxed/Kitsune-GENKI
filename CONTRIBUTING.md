# Вклад в развитие KotoKitsu

Привет! Спасибо за интерес к проекту **KotoKitsu**.

## Правила участия и юридические требования

Каждый участник (contributor) при отправке Pull Request подтверждает следующее:

1. **Право на вклад**: Вы имеете право предоставлять данный код или контент.
2. **Лицензия кода**: Весь программный код предоставляется на условиях лицензии **GPL-3.0-or-later**.
3. **Требования к учебному контенту**:
   - Вклад **НЕ должен содержать** сканы книг, файлы Answer Key, официальные аудиозаписи или дословно скопированные упражнения из коммерческих изданий.
   - Запрещено загружать материалы, нарушающие права третьих лиц.
4. **ИИ-материалы и provenance**:
   - Все AI-generated материалы должны иметь явную пометку.
   - Для новых контентных файлов необходимо заполнять provenance-шаблон.

---

## Шаблон Provenance для вклада в контент

При отправке нового учебного контента или материалов укажите в описании PR следующий шаблон:

```yaml
content_origin: original | ai-generated | third-party | adapted | unknown
author: Имя или псевдоним автора
source: Источник (или self)
license: GPL-3.0-or-later | CC0-1.0 | proprietary-author | external-license
external_materials_consulted: false | true
copies_third_party_text: false | true
ai_model: none | model-name
prompt_archive: none | url-or-notes
human_reviewed: true | false
```

---

## Инструкция по созданию PR

1. Сделайте **Fork** репозитория.
2. Создайте новую ветку (`git checkout -b feature/AmazingFeature`).
3. Закоммитьте изменения (`git commit -m 'feat: Add amazing feature'`).
4. Выполните проверки: `npm run legal:check` и `npm test`.
5. Запушьте ветку (`git push origin feature/AmazingFeature`).
6. Откройте **Pull Request**.
