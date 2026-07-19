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
 */
function initVoices() {
  if (voiceLoadPromise) return voiceLoadPromise;

  voiceLoadPromise = new Promise((resolve) => {
    // Проверка поддержки Web Speech API
    if (!('speechSynthesis' in window)) {
      console.warn('Web Speech API не поддерживается в этом браузере');
      resolve(false);
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();

      if (voices.length > 0) {
        voicesLoaded = true;

        // Ищем японский голос с приоритетом ja-JP
        japaneseVoice =
          voices.find((v) => v.lang === 'ja-JP') || voices.find((v) => v.lang.startsWith('ja'));

        if (japaneseVoice) {
          console.log('✅ Японский голос найден:', japaneseVoice.name, japaneseVoice.lang);
          resolve(true);
        } else {
          console.warn('⚠️ Японский голос не найден в системе');
          resolve(false);
        }
      } else {
        // Голоса ещё не загружены, ждём события (Firefox)
        if (!window.speechSynthesis.onvoiceschanged) {
          window.speechSynthesis.onvoiceschanged = () => {
            loadVoices();
          };
        }

        // Fallback: повторная попытка через 100ms
        setTimeout(() => {
          const retryVoices = window.speechSynthesis.getVoices();
          if (retryVoices.length > 0) {
            loadVoices();
          }
        }, 100);
      }
    };

    loadVoices();
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

// Автоматическая инициализация при загрузке модуля
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  initVoices();
}
