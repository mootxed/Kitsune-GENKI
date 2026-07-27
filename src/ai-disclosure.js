/**
 * src/ai-disclosure.js — Модуль уведомления и согласия на передачу данных в AI-сервисы
 */

export function ensureAIPrivacyDisclosure(state, saveFn) {
  return new Promise((resolve) => {
    if (state?.settings?.aiPrivacyAccepted === true) {
      resolve(true);
      return;
    }

    const existingModal = document.getElementById('ai-privacy-modal');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ai-privacy-modal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'ai-privacy-title');
    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 440px;">
        <h3 id="ai-privacy-title" style="margin-top: 0;">🤖 Передача данных в AI-сервис</h3>
        <div class="modal-content" style="text-align: left; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 12px;">
            AI-функция отправит выбранный текст, слова и инструкции внешнему сервису <b>OpenRouter</b> и поставщику выбранной модели.
          </p>
          <div style="background: rgba(255, 152, 0, 0.1); border-left: 3px solid var(--orange, #ff9800); padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 14px;">
            <b>⚠️ Предупреждение о конфиденциальности:</b><br>
            Не отправляйте персональные, платёжные, медицинские, конфиденциальные и другие чувствительные данные.
          </div>
          <p style="font-size: 12px; color: var(--muted, #666); margin: 0;">
            Основной курс KotoKitsu работает полностью оффлайн и не требует использования AI.
          </p>
        </div>
        <div class="modal-buttons" style="margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn-ghost" id="ai-privacy-cancel" data-testid="ai-privacy-cancel-btn">Отмена</button>
          <button class="btn-primary" id="ai-privacy-accept" data-testid="ai-privacy-accept-btn">Согласен и продолжить</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('#ai-privacy-cancel');
    const acceptBtn = overlay.querySelector('#ai-privacy-accept');

    cancelBtn.onclick = () => {
      overlay.remove();
      resolve(false);
    };

    acceptBtn.onclick = () => {
      if (state?.settings) {
        state.settings.aiPrivacyAccepted = true;
        if (typeof saveFn === 'function') saveFn();
      }
      overlay.remove();
      resolve(true);
    };
  });
}
