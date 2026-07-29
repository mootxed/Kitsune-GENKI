// ui/session-recovery-modal.js - Модальное окно восстановления активной SRS-сессии

export function showSessionRecoveryModal(sessionRecord, { onResume, onRestart, onCancel }) {
  const existing = document.getElementById('session-recovery-modal-overlay');
  if (existing) existing.remove();

  const managerStats = sessionRecord?.managerState?.stats || {};
  const reviewed = managerStats.reviewed ?? 0;
  const remaining = managerStats.remaining ?? 0;
  const total = managerStats.total ?? reviewed + remaining;
  const typeText =
    sessionRecord?.sessionType === 'chapter'
      ? `Глава ${sessionRecord.chapterId || ''}`
      : 'Повторение слов';

  const overlay = document.createElement('div');
  overlay.id = 'session-recovery-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'session-recovery-title');
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width: 480px;">
      <h2 id="session-recovery-title">Найдена незавершённая сессия</h2>
      <div class="modal-content" style="text-align: left; font-size: 14px; line-height: 1.6;">
        <p style="margin-bottom: 12px;">У вас осталась незавершённая сессия повторения карточек.</p>
        <div style="background: var(--bg-secondary, rgba(0,0,0,0.04)); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>Тип сессии:</span>
            <strong>${typeText}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>Завершено карточек:</span>
            <strong>${reviewed} из ${total}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Осталось карточек:</span>
            <strong>${remaining}</strong>
          </div>
        </div>
      </div>
      <div class="modal-buttons" style="display: flex; flex-direction: column; gap: 8px;">
        <button class="btn-primary" id="btn-session-resume" style="width: 100%;">▶️ Продолжить сессию</button>
        <div style="display: flex; gap: 8px; width: 100%;">
          <button class="btn-ghost" id="btn-session-restart" style="flex: 1;">🔄 Начать заново</button>
          <button class="btn-ghost" id="btn-session-cancel" style="flex: 1; color: var(--danger, #f44336);">❌ Отменить</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const resumeBtn = overlay.querySelector('#btn-session-resume');
  const restartBtn = overlay.querySelector('#btn-session-restart');
  const cancelBtn = overlay.querySelector('#btn-session-cancel');

  if (resumeBtn) {
    resumeBtn.focus();
    resumeBtn.onclick = () => {
      overlay.remove();
      if (typeof onResume === 'function') onResume();
    };
  }

  if (restartBtn) {
    restartBtn.onclick = () => {
      overlay.remove();
      if (typeof onRestart === 'function') onRestart();
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      overlay.remove();
      if (typeof onCancel === 'function') onCancel();
    };
  }
}
