/** Spread on a button inside a sortable item so that pressing it never starts a drag. */
export const noDrag = {
  onPointerDown: (event) => event.stopPropagation(),
  onMouseDown: (event) => event.stopPropagation(),
  onTouchStart: (event) => event.stopPropagation(),
  onKeyDown: (event) => event.stopPropagation(),
};
