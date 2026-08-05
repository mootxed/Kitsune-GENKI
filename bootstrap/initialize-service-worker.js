import { registerAndManageSW, activateWaitingWorker } from '../src/sw-update-manager.js';
import { announce } from '../src/a11y-helpers.js';
import { toastRich } from '../ui/app-shell.js';

export async function initializeServiceWorker() {
  if (typeof window === 'undefined') return;

  if (import.meta.env.DEV) {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  await registerAndManageSW(swUrl, {
    onUpdateAvailable(waitingWorker) {
      showUpdateNotification(waitingWorker);
    },
    onUpdateActivated() {
      announce('Приложение обновлено');
    },
    onStatusChange(status) {
      if (status === 'ready') {
        console.log('[App] Service Worker: приложение готово к офлайн-работе');
      } else if (status === 'failed') {
        console.warn('[App] Service Worker: регистрация не удалась — офлайн недоступен');
      } else if (status === 'unsupported') {
        console.info('[App] Service Worker не поддерживается этим браузером');
      } else if (status === 'updated') {
        console.log('[App] Service Worker: новая версия активирована');
      }
    },
  });
}

function showUpdateNotification(waitingWorker) {
  const message = `
    <span style="flex: 1;">🔄 Доступна новая версия</span>
    <button id="sw-update-btn" style="
      margin-left: 8px;
      padding: 6px 14px;
      background: var(--primary, #FF4B2B);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    " aria-label="Обновить приложение до новой версии">
      Обновить
    </button>
    <button id="sw-later-btn" style="
      margin-left: 6px;
      padding: 6px 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.4);
      border-radius: 8px;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
    " aria-label="Обновить позже, продолжить работу">
      Позже
    </button>
  `;

  announce('Доступна новая версия приложения');

  toastRich(message, {
    duration: 0,
    onRendered(container) {
      const updateBtn = container.querySelector('#sw-update-btn');
      const laterBtn = container.querySelector('#sw-later-btn');

      if (updateBtn) {
        updateBtn.onclick = () => {
          activateWaitingWorker(waitingWorker);
          container.textContent = 'Обновление...';
        };
      }

      if (laterBtn) {
        laterBtn.onclick = () => {
          container.classList.remove('show');
          console.log('[App] SW update deferred by user');
        };
      }
    },
  });
}
