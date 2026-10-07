import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/Modal';

const ConfirmContext = createContext(null);

/** Promise-based confirmation dialog: `if (await confirm({ title, message })) …` */
export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((next) => new Promise((resolve) => {
    resolver.current = resolve;
    setOptions(next);
  }), []);

  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(options)}
        onClose={() => settle(false)}
        title={options?.title}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => settle(false)}>Annuler</button>
            <button
              type="button"
              className={`btn ${options?.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => settle(true)}
              autoFocus
            >
              {options?.confirmLabel || 'Confirmer'}
            </button>
          </>
        )}
      >
        <p className="soft">{options?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside ConfirmProvider');
  return context;
}
