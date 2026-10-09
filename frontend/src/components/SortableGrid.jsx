import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useMemo, useState } from 'react';

const SortableItem = memo(function SortableItem({ id, label, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`sortable-item${isDragging ? ' placeholder' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      aria-roledescription="élément déplaçable"
      aria-label={label}
      {...listeners}
    >
      {children}
    </div>
  );
});

/**
 * Grid whose items are reordered by drag and drop: mouse, touch (after a short
 * press, so the page still scrolls) or keyboard (Space, arrows, Space).
 * `onReorder` receives the items in their new order.
 */
export function SortableGrid({ items, getId = (item) => item.id, getLabel, renderItem, onReorder, className }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState(null);
  const ids = useMemo(() => items.map(getId), [items, getId]);
  const position = (id) => ids.indexOf(id) + 1;
  const name = (id) => getLabel?.(items[ids.indexOf(id)]) ?? `L’élément ${position(id)}`;
  const active = activeId === null ? null : items[ids.indexOf(activeId)];

  const announcements = {
    onDragStart: ({ active: a }) => `${name(a.id)} saisi, position ${position(a.id)} sur ${ids.length}.`,
    onDragOver: ({ active: a, over }) => (over ? `${name(a.id)} au-dessus de la position ${position(over.id)}.` : `${name(a.id)} hors de la grille.`),
    onDragEnd: ({ active: a, over }) => (over ? `${name(a.id)} déposé en position ${position(over.id)}.` : `${name(a.id)} reposé à sa place.`),
    onDragCancel: ({ active: a }) => `Déplacement annulé, ${name(a.id)} reste en position ${position(a.id)}.`,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'Appuyez sur Espace pour saisir l’élément, déplacez-le avec les flèches, puis Espace pour le déposer ou Échap pour annuler.',
        },
      }}
      onDragStart={({ active: a }) => setActiveId(a.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active: a, over }) => {
        setActiveId(null);
        if (over && a.id !== over.id) onReorder(arrayMove(items, ids.indexOf(a.id), ids.indexOf(over.id)));
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableItem key={ids[index]} id={ids[index]} label={getLabel?.(item)}>
              {renderItem(item, index)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {active ? <div className="sortable-overlay">{renderItem(active, ids.indexOf(activeId), true)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
