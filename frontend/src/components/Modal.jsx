import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

/**
 * Accessible modal built on the native <dialog> element (focus trap, Escape
 * and top-layer stacking for free). Content mounts only while open, so forms
 * start fresh every time. With `onSubmit`, the body becomes a <form>.
 */
export function Modal({ open, onClose, title, description, children, footer, wide = false, onSubmit, busy = false }) {
  const ref = useRef(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => {
    if (!busy) onClose();
  };

  const Body = onSubmit ? 'form' : 'div';

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === ref.current) requestClose();
      }}
    >
      {open && (
        <Body
          style={{ display: 'contents' }}
          onSubmit={onSubmit ? (event) => {
            event.preventDefault();
            onSubmit(event);
          } : undefined}
        >
          <header className="modal-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="icon-btn sm" onClick={requestClose} aria-label="Fermer" disabled={busy}>
              <X />
            </button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </Body>
      )}
    </dialog>
  );
}
