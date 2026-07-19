import { AlertTriangle, X } from "lucide-react";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
        <div className="modal-symbol"><AlertTriangle size={22} /></div>
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="button button--danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
