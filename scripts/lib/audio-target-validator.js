/**
 * audio-target-validator.js
 * Validates and sanitizes speakable audio target text for SpeechSynthesis / TTS.
 */

/**
 * Sanitize TTS text by stripping romaji, brackets, furigana duplicates, and Cyrillic text.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeTTSSpeakableTarget(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // Remove parenthesis content e.g. (わたし) or (私) or [я] or (e.g. ...)
  sanitized = sanitized.replace(/[(（[][^)）\]]*[)）\]]/gu, '');

  // Remove Latin letters (romaji) if Japanese characters are present
  const HAS_JAPANESE = /[\u3040-\u30FF\u4E00-\u9FAF]/u;
  if (HAS_JAPANESE.test(sanitized)) {
    sanitized = sanitized.replace(/[a-zA-Z]+/gu, '');
    sanitized = sanitized.replace(/[\u0400-\u04FF]+/gu, ''); // Remove Cyrillic
  }

  // Collapse whitespace and trim
  return sanitized.replace(/\s+/gu, ' ').trim();
}

/**
 * Validate TTS audio target text.
 * @param {string} text
 * @param {string} canonicalReading
 * @returns {{ speakable: boolean, targetText: string, issues: string[] }}
 */
export function validateAudioTarget(text, canonicalReading = '') {
  const issues = [];
  const targetText = sanitizeTTSSpeakableTarget(text || canonicalReading);

  if (!targetText) {
    issues.push('Audio target text is empty');
    return { speakable: false, targetText: '', issues };
  }

  const CYRILLIC_RE = /[\u0400-\u04FF]/u;
  const ROMAJI_RE = /[a-zA-Z]/u;

  if (CYRILLIC_RE.test(targetText)) {
    issues.push(`Audio target "${targetText}" contains Cyrillic characters`);
  }

  if (ROMAJI_RE.test(targetText)) {
    issues.push(`Audio target "${targetText}" contains Latin characters (romaji)`);
  }

  return {
    speakable: issues.length === 0,
    targetText,
    issues,
  };
}
