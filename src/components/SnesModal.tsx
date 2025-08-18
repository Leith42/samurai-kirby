import type { ReactNode } from "react";

export default function SnesModal({
  open,
  title,
  message,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title?: string;
  message?: string;
  children?: ReactNode;
  actions?: { label: string; onClick: () => void; disabled?: boolean }[];
  onClose?: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="overlay-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Modal"}
    >
      <div className="snes-panel snes-font modal-panel">
        {title ? <div className="modal-title-lg">{title}</div> : null}
        {message ? <div className="modal-subtitle">{message}</div> : null}
        {children}
        <div className="btn-row" style={{ marginTop: 12 }}>
          {(actions && actions.length > 0
            ? actions
            : [{ label: "OK", onClick: onClose || (() => {}) }]
          ).map((a, i) => (
            <button
              key={i}
              className="snes-button"
              onClick={a.onClick}
              disabled={a.disabled}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
