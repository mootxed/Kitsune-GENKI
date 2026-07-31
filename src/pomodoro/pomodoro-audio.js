/* src/pomodoro/pomodoro-audio.js — Web Audio API chime player for Pomodoro */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch {
        audioCtx = null;
      }
    }
  }
  return audioCtx;
}

/**
 * Call on explicit user action (e.g. clicking Start button) to resume suspended AudioContext
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * Plays a short, pleasant sound notification for phase completion
 * @param {string} type - 'focus' | 'break'
 */
export function playPomodoroChime(type = 'focus') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';

    if (type === 'focus') {
      // Gentle double chime (E5 -> A5)
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(880.0, now + 0.15); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    } else {
      // Gentle break completion chime (A5 -> E5 -> C6)
      osc.frequency.setValueAtTime(880.0, now); // A5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(1046.5, now + 0.24); // C6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + (type === 'focus' ? 0.45 : 0.55));
  } catch (err) {
    console.warn('[PomodoroAudio] Could not play audio chime:', err);
  }
}
