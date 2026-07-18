// ui/shop.js - Модуль магазина внутриигровых предметов

import { $, $$, toast, syncAvatars, applyStreakSkin, applyCustomTheme } from './shared.js';

// Глобальная переменная для текущей вкладки магазина
let shopTab = "avatars";

// Константа - список товаров магазина
const SHOP_ITEMS = [
  // Аватарки
  { id: "kitsune", type: "avatar", emoji: "🦊", name: "Кицунэ (стандарт)", price: 0 },
  { id: "onigiri", type: "avatar", emoji: "🍙", name: "Онигири", price: 150 },
  { id: "sakura", type: "avatar", emoji: "🌸", name: "Сакура", price: 300 },
  { id: "matcha", type: "avatar", emoji: "🍵", name: "Маття", price: 150 },
  { id: "sushi", type: "avatar", emoji: "🍣", name: "Суши", price: 100 },
  { id: "bamboo", type: "avatar", emoji: "🎋", name: "Бамбук", price: 200 },
  { id: "torii", type: "avatar", emoji: "⛩️", name: "Врата Тории", price: 500 },
  { id: "fuji", type: "avatar", emoji: "🗻", name: "Фудзи", price: 500 },
  { id: "tengu", type: "avatar", emoji: "👺", name: "Тэнгу", price: 500 },
  { id: "dragon", type: "avatar", emoji: "🐉", name: "Дракон", price: 1000 },
  { id: "crown", type: "avatar", emoji: "👑", name: "Корона", price: 1500 },
  { id: "sensei", type: "avatar", emoji: "🎓", name: "Сенсей", price: 2000 },
  // Скины карточки стрика
  { id: "skin_default", type: "streakSkin", value: "default", name: "Карточка: Стандартная", price: 0, emoji: "🔥" },
  { id: "skin_sakura", type: "streakSkin", value: "sakura", name: "Карточка: Сакура", price: 200, emoji: "🌸" },
  { id: "skin_matcha", type: "streakSkin", value: "matcha", name: "Карточка: Маття", price: 200, emoji: "🍵" },
  { id: "skin_neo_tokyo", type: "streakSkin", value: "neo_tokyo", name: "Карточка: Ночной Токио", price: 250, emoji: "🌃" },
  { id: "skin_kanagawa", type: "streakSkin", value: "kanagawa", name: "Карточка: Волна Канагавы", price: 200, emoji: "🌊" },
  { id: "skin_akaryu", type: "streakSkin", value: "akaryu", name: "Карточка: Красный Дракон", price: 200, emoji: "⛩️" },
  { id: "skin_nezumi", type: "streakSkin", value: "nezumi", name: "Карточка: Эдо", price: 200, emoji: "🌑" },
  // Темы приложения
  { id: "theme_sakura", type: "theme", value: "sakura", name: "Тема: Сакура", price: 400, emoji: "🌸" },
  { id: "theme_matcha", type: "theme", value: "matcha", name: "Тема: Маття", price: 400, emoji: "🍵" },
  { id: "theme_neo_tokyo", type: "theme", value: "neo_tokyo", name: "Тема: Ночной Токио", price: 500, emoji: "🌃" },
  { id: "theme_kanagawa", type: "theme", value: "kanagawa", name: "Тема: Волна Канагавы", price: 400, emoji: "🌊" },
  { id: "theme_akaryu", type: "theme", value: "akaryu", name: "Тема: Красный Дракон", price: 400, emoji: "⛩️" },
  { id: "theme_nezumi", type: "theme", value: "nezumi", name: "Тема: Эдо", price: 400, emoji: "🐀" },
  // Титулы
  { id: "title_kohai", type: "title", value: "Кохай", name: "Титул: Кохай", price: 300, emoji: "👋" },
  { id: "title_sempai", type: "title", value: "Сэмпай", name: "Титул: Сэмпай", price: 600, emoji: "⭐" },
  { id: "title_samurai", type: "title", value: "Самурай словаря", name: "Титул: Самурай словаря", price: 800, emoji: "🗡️" },
  { id: "title_otaku", type: "title", value: "Отаку", name: "Титул: Отаку", price: 500, emoji: "🎮" },
  { id: "title_kanji", type: "title", value: "Покоритель Кандзи", name: "Титул: Покоритель Кандзи", price: 1200, emoji: "🀄" },
];

// Главная функция рендеринга магазина
export function renderShop(state, dependencies) {
  const { save } = dependencies;
  
  const body = $("#shop-body");
  if (!body) return;
  
  // Инициализируем обработчики табов
  $$(".shop-tab").forEach((t) => {
    t.onclick = () => {
      shopTab = t.dataset.shopTab;
      renderShop(state, dependencies);
    };
    t.classList.toggle("active", t.dataset.shopTab === shopTab);
  });
  
  // Фильтруем товары по типу
  const typeMap = {
    avatars: "avatar",
    skins: "streakSkin",
    themes: "theme",
    titles: "title",
  };
  const filterType = typeMap[shopTab] || "avatar";
  const items = SHOP_ITEMS.filter((item) => item.type === filterType);
  
  if (items.length === 0) {
    body.innerHTML = `<div class="empty"><div class="em">🛒</div><h3>Нет товаров</h3></div>`;
    return;
  }
  
  body.innerHTML = items.map((item) => {
    let owned, equipped;
    
    if (item.type === "avatar") {
      owned = state.unlockedAvatars.includes(item.emoji);
      equipped = state.currentAvatar === item.emoji;
    } else if (item.type === "streakSkin") {
      owned = state.unlockedStreakSkins.includes(item.value);
      equipped = state.currentStreakSkin === item.value;
    } else if (item.type === "theme") {
      owned = state.unlockedThemes.includes(item.value);
      equipped = state.currentTheme === item.value;
    } else if (item.type === "title") {
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
        <div class="shop-item-price">${owned ? "✓ Куплено" : `${item.price} 🪙`}</div>
      </div>
      ${btnHtml}
    </div>`;
  }).join("");
  
  // Обработчики покупки
  $$(".btn-shop-buy").forEach((btn) => {
    if (!btn.disabled) {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const price = parseInt(btn.dataset.price, 10);
        const item = SHOP_ITEMS.find((i) => i.id === id);
        if (!item) return;
        if (state.coins >= price) {
          state.coins -= price;
          if (item.type === "avatar") {
            state.unlockedAvatars.push(item.emoji);
          } else if (item.type === "streakSkin") {
            state.unlockedStreakSkins.push(item.value);
          } else if (item.type === "theme") {
            state.unlockedThemes.push(item.value);
          } else if (item.type === "title") {
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
  $$(".btn-shop-equip").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const item = SHOP_ITEMS.find((i) => i.id === id);
      if (!item) return;
      if (item.type === "avatar") {
        state.currentAvatar = item.emoji;
        save();
        syncAvatars();
        toast(`Аватар установлен ${item.emoji}`);
      } else if (item.type === "streakSkin") {
        state.currentStreakSkin = item.value;
        save();
        applyStreakSkin();
        toast(`Скин карточки установлен: ${item.name}`);
      } else if (item.type === "theme") {
        state.currentTheme = item.value;
        state.settings.darkMode = "custom";
        save();
        applyCustomTheme();
        toast(`Тема установлена: ${item.name}`);
      } else if (item.type === "title") {
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