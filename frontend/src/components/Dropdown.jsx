import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Small menu: `trigger` receives button props, `children` receives a close() helper. */
export function Dropdown({ trigger, children, label }) {
  const location = useLocation();
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === location.pathname;
  const setOpen = (update) => setOpenOn((current) => {
    const next = typeof update === 'function' ? update(current === location.pathname) : update;
    return next ? location.pathname : null;
  });
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpenOn(null);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        'aria-label': label,
        onClick: () => setOpen((value) => !value),
      })}
      {open && (
        <div className="menu-panel" id={id} role="menu">
          {children(() => setOpenOn(null))}
        </div>
      )}
    </div>
  );
}
