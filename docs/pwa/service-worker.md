# Service Worker Implementation — Реализация Service Worker

Документ описывает логику работы Service Worker (`public/sw.js`).

---

## ⚙️ Управление кешами в `sw.js`

Service Worker использует 3 специализированных имени кэша:

```javascript
const CACHE_NAMES = {
  PRECACHE: 'kitsune-precache-v16',
  RUNTIME: 'kitsune-runtime-v16',
  CONTENT: 'kitsune-content-v16',
};
```

При активации новой версии Service Worker старые кеши других версий автоматически удаляются.
