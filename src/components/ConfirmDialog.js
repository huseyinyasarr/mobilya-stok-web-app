import React from 'react';
import './ConfirmDialog.css';

/**
 * Paylaşımlı onay diyaloğu.
 *
 * Props:
 *   message       {string}   — Gösterilecek mesaj
 *   onConfirm     {function} — Onaylandığında çağrılır
 *   onCancel      {function} — İptal edildiğinde çağrılır
 *   confirmLabel  {string}   — Onay butonu etiketi (varsayılan: 'Onayla')
 *   cancelLabel   {string}   — İptal butonu etiketi (varsayılan: 'İptal')
 *   variant       {string}   — 'danger' (kırmızı) | 'neutral' (mavi-gri)
 */
function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  variant = 'danger',
}) {
  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog-box" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-cancel-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-dialog-confirm-btn ${variant}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
