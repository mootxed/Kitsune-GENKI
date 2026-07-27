/**
 * src/a11y-helpers.js
 *
 * Shared accessibility helpers for Kitsune Genki.
 *
 * Provides:
 *  - focusScreenHeading(screenEl)  — focus the main heading of a screen
 *  - announceNavigation(title)     — polite screen-reader announcement of navigation
 *  - announce(msg)                 — polite live region announcement
 *  - announceAlert(msg)            — urgent alert live region announcement
 *  - openModal(modalEl, openerEl)  — focus trap + focus management for modals
 *  - closeModal(modalEl, openerEl) — restore focus to opener
 *  - prefersReducedMotion()        — detect reduced-motion preference
 *
 * Live region elements are created lazily and appended to <body> once.
 * Only two live regions are used to avoid conflicts.
 */

// ===== LIVE REGIONS =====

let _politeRegion = null;
let _alertRegion = null;
let _lastPoliteMsg = null;

function getPoliteRegion() {
  if (_politeRegion && document.body.contains(_politeRegion)) return _politeRegion;
  _politeRegion = document.getElementById('a11y-announce');
  if (!_politeRegion) {
    _politeRegion = document.createElement('div');
    _politeRegion.id = 'a11y-announce';
    _politeRegion.setAttribute('aria-live', 'polite');
    _politeRegion.setAttribute('aria-atomic', 'true');
    _politeRegion.className = 'sr-only';
    document.body.appendChild(_politeRegion);
  }
  return _politeRegion;
}

function getAlertRegion() {
  if (_alertRegion && document.body.contains(_alertRegion)) return _alertRegion;
  _alertRegion = document.getElementById('a11y-alert');
  if (!_alertRegion) {
    _alertRegion = document.createElement('div');
    _alertRegion.id = 'a11y-alert';
    _alertRegion.setAttribute('role', 'alert');
    _alertRegion.setAttribute('aria-atomic', 'true');
    _alertRegion.className = 'sr-only';
    document.body.appendChild(_alertRegion);
  }
  return _alertRegion;
}

/**
 * Announces a message to screen readers via polite live region.
 * To re-announce the same message (e.g. same wrong answer twice), the region
 * is briefly cleared first so the change is detected.
 *
 * @param {string} message
 */
export function announce(message) {
  const region = getPoliteRegion();
  // Force re-announcement of identical messages by clearing first
  if (_lastPoliteMsg === message) {
    region.textContent = '';
    setTimeout(() => {
      region.textContent = message;
    }, 0);
  } else {
    region.textContent = message;
  }
  _lastPoliteMsg = message;
}

/**
 * Announces an urgent message via role="alert" (interrupts speech).
 * Only use for genuinely critical errors, not for routine feedback.
 *
 * @param {string} message
 */
export function announceAlert(message) {
  const region = getAlertRegion();
  // Clear and re-set to ensure re-announcement
  region.textContent = '';
  setTimeout(() => {
    region.textContent = message;
  }, 0);
}

/**
 * Announces that the user has navigated to a new screen.
 * Uses the polite live region to not interrupt ongoing speech.
 *
 * @param {string} screenTitle — human-readable name of the destination screen
 */
export function announceNavigation(screenTitle) {
  announce(`Экран: ${screenTitle}`);
}

// ===== FOCUS MANAGEMENT =====

/**
 * Moves focus to the primary heading of a screen after navigation.
 * The heading receives tabindex="-1" so it can be focused programmatically
 * without entering the natural tab order.
 *
 * @param {Element} screenEl — the newly-visible screen element
 */
export function focusScreenHeading(screenEl) {
  if (!screenEl) return;
  const heading = screenEl.querySelector('h1, h2, [role="heading"]');
  if (!heading) {
    // Fallback: focus the screen container itself
    if (!screenEl.hasAttribute('tabindex')) {
      screenEl.setAttribute('tabindex', '-1');
    }
    screenEl.focus({ preventScroll: true });
    return;
  }
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1');
  }
  heading.focus({ preventScroll: true });
}

// ===== MODAL FOCUS TRAP =====

// WeakMap: modal element → {cleanup: Function}
const _modalCleanups = new WeakMap();

/** Returns all focusable elements inside an element, in DOM order. */
function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), details > summary'
    )
  ).filter((el) => !el.closest('[hidden]') && !el.closest('[inert]'));
}

/**
 * Opens a modal: sets focus on first focusable element and installs a focus trap.
 *
 * @param {Element} modalEl — the dialog/modal element
 * @param {Element|null} openerEl — the element that triggered the modal (to restore focus)
 * @param {Object} [options]
 * @param {boolean} [options.closeOnEscape=true] — close on Escape key
 * @param {Function} [options.onClose] — callback when Escape is pressed
 */
export function openModal(modalEl, openerEl, options = {}) {
  if (!modalEl) return;

  const { closeOnEscape = true, onClose } = options;

  // Store opener for focus restoration
  modalEl._focusTrapOpener = openerEl || document.activeElement;

  // Focus first focusable element, or the modal itself
  const focusables = getFocusableElements(modalEl);
  const firstFocusable = focusables[0] || modalEl;
  if (!modalEl.hasAttribute('tabindex') && !focusables.length) {
    modalEl.setAttribute('tabindex', '-1');
  }
  // Defer slightly to allow display transitions to complete
  setTimeout(() => firstFocusable.focus({ preventScroll: true }), 0);

  // Focus trap handler
  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const items = getFocusableElements(modalEl);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  // Escape handler
  function escapeHandler(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose?.();
    }
  }

  modalEl.addEventListener('keydown', trapFocus);
  if (closeOnEscape) {
    document.addEventListener('keydown', escapeHandler, { capture: true });
  }

  // Store cleanup
  _modalCleanups.set(modalEl, {
    cleanup() {
      modalEl.removeEventListener('keydown', trapFocus);
      if (closeOnEscape) {
        document.removeEventListener('keydown', escapeHandler, { capture: true });
      }
    },
  });
}

/**
 * Closes a modal: removes focus trap and returns focus to the opener.
 *
 * @param {Element} modalEl
 * @param {Element|null} [openerEl] — override opener (uses stored opener if null)
 */
export function closeModal(modalEl, openerEl) {
  if (!modalEl) return;

  const stored = _modalCleanups.get(modalEl);
  if (stored) {
    stored.cleanup();
    _modalCleanups.delete(modalEl);
  }

  const target = openerEl || modalEl._focusTrapOpener;
  if (target && typeof target.focus === 'function' && document.body.contains(target)) {
    // Defer slightly to ensure the modal is hidden before focusing
    setTimeout(() => target.focus(), 0);
  }
}

// ===== REDUCED MOTION =====

/**
 * Returns true if the user has requested reduced motion.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ===== SCREEN MANAGEMENT =====

/**
 * Sets a screen as inert (keyboard/AT inaccessible) or active.
 * Uses the `inert` attribute (supported in all modern browsers).
 * Falls back gracefully if not supported.
 *
 * @param {Element} screenEl
 * @param {boolean} isInert
 */
export function setScreenInert(screenEl, isInert) {
  if (!screenEl) return;
  if (isInert) {
    screenEl.inert = true;
    screenEl.setAttribute('aria-hidden', 'true');
  } else {
    screenEl.inert = false;
    screenEl.removeAttribute('aria-hidden');
  }
}
