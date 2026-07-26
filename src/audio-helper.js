/**
 * audio-helper.js — Robust offline Japanese TTS using Web Speech API
 * Handles Firefox async voice loading and graceful fallbacks
 */

let japaneseVoice = null;
let voicesLoaded = false;
let voiceLoadPromise = null;

/**
 * Инициализация и кэширование списка голосов
 * Firefox требует ожидания события voiceschanged
 * @param {number} [timeoutMs=1000] - Максимальное время ожидания загрузки голосов в мс
 */
function initVoices(timeoutMs = 1000) {
  if (voiceLoadPromise) return voiceLoadPromise;

  voiceLoadPromise = new Promise((resolve) => {
    // Проверка поддержки Web Speech API
    if (!('speechSynthesis' in window)) {
      console.warn('Web Speech API не поддерживается в этом браузере');
      resolve(false);
      return;
    }

    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        voicesLoaded = true;

        // Ищем японский голос с приоритетом ja-JP
        japaneseVoice =
          voices.find((v) => v.lang === 'ja-JP') || voices.find((v) => v.lang.startsWith('ja'));

        if (japaneseVoice) {
          console.log('✅ Японский голос найден:', japaneseVoice.name, japaneseVoice.lang);
          return true;
        } else {
          console.warn('⚠️ Японский голос не найден в системе');
          return false;
        }
      }
      return null;
    };

    const initialResult = checkVoices();
    if (initialResult !== null) {
      if (!initialResult) {
        voiceLoadPromise = null;
      }
      resolve(initialResult);
      return;
    }

    let isSettled = false;
    let timeoutId = null;
    let retryTimerId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (retryTimerId) clearTimeout(retryTimerId);
      if (typeof window.speechSynthesis.removeEventListener === 'function') {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      } else if (window.speechSynthesis.onvoiceschanged === onVoicesChanged) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };

    const finish = (result) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      if (!result) {
        voiceLoadPromise = null;
      }
      resolve(result);
    };

    const onVoicesChanged = () => {
      const res = checkVoices();
      if (res !== null) {
        finish(res);
      }
    };

    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    } else {
      window.speechSynthesis.onvoiceschanged = onVoicesChanged;
    }

    // Fallback 1: повторная попытка через 100ms
    retryTimerId = setTimeout(() => {
      if (isSettled) return;
      const res = checkVoices();
      if (res !== null) {
        finish(res);
      }
    }, 100);

    // Fallback 2: тайм-аут, чтобы Promise не повис навсегда
    timeoutId = setTimeout(() => {
      if (isSettled) return;
      const finalRes = checkVoices();
      if (finalRes !== null) {
        finish(finalRes);
      } else {
        console.warn('⚠️ Тайм-аут ожидания загрузки голосов TTS');
        finish(false);
      }
    }, timeoutMs);
  });

  return voiceLoadPromise;
}

/**
 * Озвучивание японского текста
 * @param {string} text - Текст для озвучивания (хирагана, катакана, кандзи)
 * @param {object} options - Опциональные параметры (rate, pitch, volume)
 */
export async function speakJapanese(text, options = {}) {
  if (!text || typeof text !== 'string') return;

  // Проверка поддержки API
  if (!('speechSynthesis' in window)) {
    console.warn('Web Speech API недоступен');
    return;
  }

  // Останавливаем предыдущее воспроизведение
  window.speechSynthesis.cancel();

  // Инициализация голосов (если ещё не загружены)
  if (!voicesLoaded) {
    const success = await initVoices();
    if (!success && window.toast) {
      window.toast(
        'Японский голос не найден в системе. Пожалуйста, установите языковой пакет ja-JP в настройках ОС/браузера.'
      );
      return;
    }
  }

  // Если голос всё ещё не найден, выходим
  if (!japaneseVoice) {
    console.warn('Японский голос недоступен');
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = japaneseVoice;
    utterance.lang = japaneseVoice.lang;
    utterance.rate = options.rate || 0.9; // Немного медленнее для лучшего понимания
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 1.0;

    // Обработка ошибок
    utterance.onerror = (event) => {
      // "interrupted" — нормальная ситуация при смене карточки или быстрых кликах
      if (event.error !== 'interrupted') {
        console.error('Ошибка озвучивания:', event.error);
      }
    };

    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error('Не удалось озвучить текст:', error);
  }
}

/**
 * Остановка текущего воспроизведения
 */
export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Получение списка доступных голосов
 * @returns {Promise<Array>} Массив доступных голосов
 */
export async function getAvailableVoices() {
  if (!('speechSynthesis' in window)) return [];

  await initVoices();
  return window.speechSynthesis.getVoices();
}

/**
 * Проверка доступности японского голоса
 * @returns {Promise<boolean>}
 */
export async function isJapaneseVoiceAvailable() {
  await initVoices();
  return !!japaneseVoice;
}

/**
 * Сброс состояния (для тестирования)
 */
export function _resetVoicesForTesting() {
  japaneseVoice = null;
  voicesLoaded = false;
  voiceLoadPromise = null;
}

// Автоматическая инициализация при загрузке модуля
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  initVoices();
}
