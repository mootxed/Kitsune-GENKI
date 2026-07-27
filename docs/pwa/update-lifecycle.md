# SW Update Lifecycle — Управление Обновлениями PWA

В этом документе опиcана механика обнаружения и применения обновлений Service Worker (`src/sw-update-manager.js`).

---

## 🔄 Поток обновления Service Worker

```mermaid
sequenceDiagram
    autonumber
    participant App as Приложение Kitsune-GENKI
    participant Manager as SW Update Manager
    participant SW as Service Worker (public/sw.js)

    App->>Manager: initSWUpdateManager()
    Manager->>SW: Регистрация navigator.serviceWorker.register()
    SW-->>Manager: Обнаружена новая версия (updatefound)
    Manager->>App: Показ UI-уведомления "Доступно обновление"
    User->>App: Клик "Обновить сейчас"
    App->>SW: postMessage({ type: 'SKIP_WAITING' })
    SW->>SW: skipWaiting()
    SW-->>Manager: Событие controllerchange
    Manager->>App: Безопасный reload страницы window.location.reload()
```

Пользовательские данные в IndexedDB гарантированно сохраняются при перезагрузке приложения.
