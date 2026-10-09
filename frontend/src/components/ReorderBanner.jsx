import { Check, CircleAlert, GripVertical, LoaderCircle } from 'lucide-react';

const STATUS = {
  saving: { icon: LoaderCircle, text: 'Enregistrement…', className: 'spin' },
  saved: { icon: Check, text: 'Ordre enregistré' },
  error: { icon: CircleAlert, text: 'Échec de l’enregistrement' },
};

/** Explains the reorder mode, shows whether the last change is saved, and closes the mode. */
export function ReorderBanner({ children, status = 'idle', extra, onDone }) {
  const state = STATUS[status];
  const Icon = state?.icon;
  return (
    <div className="reorder-banner">
      <div className="reorder-icon"><GripVertical aria-hidden="true" /></div>
      <div className="reorder-text">
        <p>{children}</p>
        <span className={`reorder-status ${status}`} role="status">
          {Icon && <Icon aria-hidden="true" className={state.className} />}
          {state?.text}
        </span>
      </div>
      <div className="reorder-actions">
        {extra}
        <button type="button" className="btn btn-primary" onClick={onDone}>
          <Check aria-hidden="true" /> Terminer
        </button>
      </div>
    </div>
  );
}
