import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  speakJapanese,
  stopSpeaking,
  getAvailableVoices,
  isJapaneseVoiceAvailable,
  _resetVoicesForTesting,
} from '../src/audio-helper.js';

describe('audio-helper.js TTS Initialization and Timeout', () => {
  let originalSpeechSynthesis;

  beforeEach(() => {
    originalSpeechSynthesis = global.speechSynthesis;
    _resetVoicesForTesting();
  });

  afterEach(() => {
    global.speechSynthesis = originalSpeechSynthesis;
    _resetVoicesForTesting();
    vi.restoreAllMocks();
  });

  it('should resolve false and not hang when getVoices returns empty array and no voices arrive', async () => {
    global.speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const isAvailablePromise = isJapaneseVoiceAvailable();

    const result = await isAvailablePromise;
    expect(result).toBe(false);
  }, 3000);

  it('should resolve true when getVoices initially returns empty array but voiceschanged event fires', async () => {
    let voicesChangedHandler = null;
    let voicesList = [];

    global.speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => voicesList),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'voiceschanged') {
          voicesChangedHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
    };

    const isAvailablePromise = isJapaneseVoiceAvailable();

    setTimeout(() => {
      voicesList = [{ name: 'Kyoko', lang: 'ja-JP' }];
      if (voicesChangedHandler) {
        voicesChangedHandler();
      }
    }, 50);

    const result = await isAvailablePromise;
    expect(result).toBe(true);
  }, 3000);

  it('should trigger toast when speakJapanese is called and japanese voice is unavailable', async () => {
    global.speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    window.toast = vi.fn();

    await speakJapanese('こんにちは');

    expect(window.toast).toHaveBeenCalledWith(expect.stringContaining('Японский голос не найден'));
    expect(global.speechSynthesis.speak).not.toHaveBeenCalled();

    delete window.toast;
  }, 3000);
});
