import DOMPurify from 'dompurify';

const DISALLOWED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'about:']);
const DEFAULT_ALLOWED_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

/**
 * Sanitizes raw HTML string using DOMPurify with a strict, feature-rich policy.
 * Preserves ruby markup, ARIA attributes, classes, and safe data attributes.
 * Removes scripts, iframes, objects, inline handlers, javascript: URLs, dangerous SVG, srcdoc.
 *
 * @param {string} markup - Raw HTML input markup.
 * @returns {string} Sanitized HTML string safe for DOM insertion.
 */
export function sanitizeHTML(markup) {
  if (typeof markup !== 'string') return '';
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['ruby', 'rt', 'rp'],
    ADD_ATTR: [
      'aria-label',
      'aria-hidden',
      'aria-expanded',
      'aria-controls',
      'aria-describedby',
      'role',
      'data-testid',
    ],
  });
}

/**
 * Centralized safe dynamic HTML rendering helper.
 *
 * @param {HTMLElement|null} element - Target DOM element.
 * @param {string} markup - Raw HTML markup to sanitize and assign.
 */
export function setSafeHTML(element, markup) {
  if (!element) return;
  element.innerHTML = sanitizeHTML(markup);
}

/**
 * Validates and normalizes external URLs to prevent javascript:, data:, and other dangerous schemes.
 * Correctly handles whitespace, casing, and percent-encoding.
 *
 * @param {string} rawUrl - Raw URL input string.
 * @param {Object} [options] - Options object.
 * @param {Set<string>|Array<string>} [options.allowedSchemes] - Allowed URL schemes.
 * @returns {string|null} Validated URL string or null if invalid/unsafe.
 */
export function validateExternalUrl(rawUrl, { allowedSchemes = DEFAULT_ALLOWED_SCHEMES } = {}) {
  if (typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Remove invisible control characters and whitespace
  const sanitizedInput = trimmed.replace(/[\u0000-\u001F\u007F-\u009F\s]+/gu, '');

  const allowedSet = allowedSchemes instanceof Set ? allowedSchemes : new Set(allowedSchemes);

  // Catch percent-encoded schemes (e.g. java%73cript:alert(1))
  try {
    const decodedInput = decodeURIComponent(sanitizedInput);
    const schemeMatch = decodedInput.match(/^([a-z0-9+.-]+):/i);
    if (schemeMatch) {
      const scheme = (schemeMatch[1] + ':').toLowerCase();
      if (DISALLOWED_SCHEMES.has(scheme) || !allowedSet.has(scheme)) {
        return null;
      }
    }
  } catch {
    // Ignore decodeURIComponent error
  }

  let parsedUrl = null;
  try {
    // Attempt standard URL resolution using a base URL if needed
    parsedUrl = new URL(sanitizedInput, 'https://relative-base.internal/');
  } catch {
    // Try decoding percent-encoded characters if direct parsing fails
    try {
      const decoded = decodeURIComponent(sanitizedInput);
      parsedUrl = new URL(decoded, 'https://relative-base.internal/');
    } catch {
      return null;
    }
  }

  if (!parsedUrl) return null;

  const protocol = parsedUrl.protocol.toLowerCase();

  // If the parsed scheme is disallowed, reject immediately
  if (DISALLOWED_SCHEMES.has(protocol)) {
    return null;
  }

  // Check against explicit allowed schemes
  if (!allowedSet.has(protocol)) {
    return null;
  }

  // Double check decoded protocol to catch double-percent-encoded schemes
  try {
    const decodedProtocol = decodeURIComponent(protocol).toLowerCase();
    if (DISALLOWED_SCHEMES.has(decodedProtocol) || !allowedSet.has(decodedProtocol)) {
      return null;
    }
  } catch {
    return null;
  }

  // Return absolute URL string or original trimmed string if mailto
  if (parsedUrl.origin === 'https://relative-base.internal') {
    // Relative URL (internal navigation)
    return sanitizedInput;
  }

  return parsedUrl.href;
}

/**
 * Safely opens external URL in browser with noopener noreferrer attributes.
 *
 * @param {string} rawUrl - Target URL.
 * @param {Object} [windowRef] - Window reference (defaults to global window).
 * @returns {boolean} True if opened, false if rejected or failed.
 */
export function safeOpenExternalUrl(
  rawUrl,
  windowRef = typeof window !== 'undefined' ? window : null
) {
  const safeUrl = validateExternalUrl(rawUrl);
  if (!safeUrl || !windowRef || typeof windowRef.open !== 'function') {
    return false;
  }

  try {
    const opened = windowRef.open(safeUrl, '_blank', 'noopener,noreferrer');
    if (opened) {
      opened.opener = null;
    }
    return true;
  } catch (err) {
    console.warn('[Security] Failed to open external URL:', err);
    return false;
  }
}

const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /auth(orization)?/i,
  /token/i,
  /secret/i,
  /openrouter/i,
  /password/i,
];

const SECRET_VALUE_REGEXES = [
  /sk-or-v1-[a-zA-Z0-9_-]{16,}/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{10,}/gi,
];

/**
 * Recursively redacts sensitive API keys, authorization headers, and tokens from objects, arrays, and strings.
 *
 * @param {any} value - Value to sanitize.
 * @param {WeakSet} [seen] - Internal circular dependency tracker.
 * @returns {any} Sanitized value.
 */
export function redactSecrets(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    let sanitized = value;
    SECRET_VALUE_REGEXES.forEach((regex) => {
      sanitized = sanitized.replace(regex, '[REDACTED_SECRET]');
    });
    return sanitized;
  }

  if (typeof value !== 'object') return value;

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, seen));
  }

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey && typeof val === 'string' && val.trim().length > 0) {
      result[key] = '[REDACTED_SECRET]';
    } else {
      result[key] = redactSecrets(val, seen);
    }
  }

  return result;
}
