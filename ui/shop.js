import { $ } from '../src/utils.js';
import { syncAvatars, applyStreakSkin, applyCustomTheme } from './shared.js';
import { openModal, closeModal } from '../src/a11y-helpers.js';
import { SHOP_ITEMS } from './shop-catalog.js';

// Локальный контекст зависимостей
let deps = null;

// Глобальная переменная для текущей вкладки магазина
let shopTab = 'avatars';

// Главная функция рендеринга магазина
export function renderShop(state, dependencies) {
  if (dependencies) deps = dependencies;
  const { save } = deps;
  const toast = deps?.toast || window.toast || (() => {});
  const $$ = deps?.$$ || window.$$ || ((s) => Array.from(document.querySelectorAll(s)));

  // Магазин — модалка: открываем её и привязываем кнопку закрытия
  const modal = $('#shop-modal');
  if (modal) {
    modal.classList.remove('hidden');
    openModal(modal, null, {
      closeOnEscape: true,
      onClose: () => {
        closeModal(modal);
        modal.classList.add('hidden');
      },
    });
    const closeBtn = $('#shop-modal-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        closeModal(modal);
        modal.classList.add('hidden');
      };
    }
  }

  const body = $('#shop-body');
  if (!body) return;

  // Инициализируем обработчики табов
  $$('.shop-tab').forEach((t) => {
    t.onclick = () => {
      shopTab = t.dataset.shopTab;
      renderShop(state, dependencies);
    };
    t.classList.toggle('active', t.dataset.shopTab === shopTab);
  });

  // Фильтруем товары по типу
  const typeMap = {
    avatars: 'avatar',
    skins: 'streakSkin',
    themes: 'theme',
    titles: 'title',
  };
  const filterType = typeMap[shopTab] || 'avatar';
  const items = SHOP_ITEMS.filter((item) => item.type === filterType);

  if (items.length === 0) {
    body.innerHTML = `<div class="empty"><div class="em">🛒</div><h3>Нет товаров</h3></div>`;
    return;
  }

  body.innerHTML = items
    .map((item) => {
      let owned, equipped;

      if (item.type === 'avatar') {
        owned = state.unlockedAvatars.includes(item.emoji);
        equipped = state.currentAvatar === item.emoji;
      } else if (item.type === 'streakSkin') {
        owned = state.unlockedStreakSkins.includes(item.value);
        equipped = state.currentStreakSkin === item.value;
      } else if (item.type === 'theme') {
        owned = state.unlockedThemes.includes(item.value);
        equipped = state.currentTheme === item.value;
      } else if (item.type === 'title') {
        owned = state.unlockedTitles.includes(item.value);
        equipped = state.currentTitle === item.value;
      }

      const canBuy = state.coins >= item.price;

      let btnHtml;
      if (item.price === 0) {
        btnHtml = `<button class="btn-shop equipped" disabled>✓ Бесплатно</button>`;
      } else if (owned && equipped) {
        btnHtml = `<button class="btn-shop equipped" disabled>✓ Установлено</button>`;
      } else if (owned) {
        btnHtml = `<button class="btn-shop btn-shop-equip" data-id="${item.id}">Установить</button>`;
      } else if (canBuy) {
        btnHtml = `<button class="btn-shop btn-shop-buy" data-id="${item.id}" data-price="${item.price}">Купить за ${item.price} 🪙</button>`;
      } else {
        btnHtml = `<button class="btn-shop btn-shop-buy" disabled>${item.price} 🪙</button>`;
      }

      return `<div class="shop-item">
      <div class="shop-item-emoji">${item.emoji}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price">${owned ? '✓ Куплено' : `${item.price} 🪙`}</div>
      </div>
      ${btnHtml}
    </div>`;
    })
    .join('');

  // Обработчики покупки
  $$('.btn-shop-buy').forEach((btn) => {
    if (!btn.disabled) {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const price = parseInt(btn.dataset.price, 10);
        const item = SHOP_ITEMS.find((i) => i.id === id);
        if (!item) return;
        if (state.coins >= price) {
          state.coins -= price;
          if (item.type === 'avatar') {
            state.unlockedAvatars.push(item.emoji);
          } else if (item.type === 'streakSkin') {
            state.unlockedStreakSkins.push(item.value);
          } else if (item.type === 'theme') {
            state.unlockedThemes.push(item.value);
          } else if (item.type === 'title') {
            state.unlockedTitles.push(item.value);
          }
          save();
          toast(`🎉 Куплен ${item.name}!`);
          renderShop(state, dependencies);
        }
      };
    }
  });

  // Обработчики установки
  $$('.btn-shop-equip').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const item = SHOP_ITEMS.find((i) => i.id === id);
      if (!item) return;
      if (item.type === 'avatar') {
        state.currentAvatar = item.emoji;
        save();
        syncAvatars();
        toast(`Аватар установлен ${item.emoji}`);
      } else if (item.type === 'streakSkin') {
        state.currentStreakSkin = item.value;
        save();
        applyStreakSkin();
        toast(`Скин карточки установлен: ${item.name}`);
      } else if (item.type === 'theme') {
        state.currentTheme = item.value;
        state.settings.darkMode = 'custom';
        save();
        applyCustomTheme();
        toast(`Тема установлена: ${item.name}`);
      } else if (item.type === 'title') {
        state.currentTitle = item.value;
        save();
        toast(`Титул установлен: ${item.value}`);
      }
      renderShop(state, dependencies);
    };
  });
}

// Экспорт константы для использования в других модулях
export { SHOP_ITEMS };
