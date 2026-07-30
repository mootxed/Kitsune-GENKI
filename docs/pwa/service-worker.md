# Service Worker Implementation — Реализация Service Worker

Документ описывает логику работы Service Worker (`public/sw.js`).

---

## ⚙️ Управление кешами в `sw.js`

Service Worker использует отдельные имена кэша по типу данных:

```javascript
const CACHE_DICTIONARY = `kitsune-dictionary-${CACHE_VERSION}`;
```

Глобальные `manifest.json`, `entries.json`, `token-index.json` и `aliases.json`
precache-ятся отдельно от курса, обслуживаются stale-while-revalidate и защищены
от LRU. При активации новой версии Service Worker старые кеши других версий
автоматически удаляются.
