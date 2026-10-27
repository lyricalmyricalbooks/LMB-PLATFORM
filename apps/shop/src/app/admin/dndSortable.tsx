import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Shared drag-and-drop helpers for the theme editor's many vertical lists
 * (sections, blocks, global sections, nav menu items, color schemes).
 *
 * Built on @dnd-kit — the same library already used by BookEditor's photo
 * gallery. Centralised here so every list gets identical, accessible behaviour
 * (pointer + keyboard) instead of five hand-rolled copies.
 */

/**
 * Pointer sensor with a 5px activation distance (so clicks stay clicks, not
 * accidental drags) plus a keyboard sensor for accessible reordering.
 */
export function useListSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

type HandleProps = React.HTMLAttributes<HTMLElement> & {
  ref: (el: HTMLElement | null) => void;
};

/**
 * Wraps a single sortable row. The `children` render-prop receives
 * `handleProps` — spread these onto the drag handle (e.g. the grip icon) so
 * that ONLY the handle starts a drag while the rest of the row keeps its own
 * onClick (select / expand). `handleProps` also carries the dnd-kit a11y
 * attributes, enabling keyboard reordering (Tab to handle → Space → arrows).
 *
 * The default handle affordances live here instead of every caller: a shared
 * label/title, touch-action lock (important for mobile side-panel editing),
 * and click suppression so selecting/expanding rows remains predictable.
 */
export function SortableRow({
  id,
  className,
  style: extraStyle,
  onClick,
  children,
}: {
  id: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children: (args: { handleProps: HandleProps; isDragging: boolean }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.4 : 1,
    ...extraStyle,
  };

  const handleProps: HandleProps = {
    ref: setActivatorNodeRef,
    ...attributes,
    ...listeners,
    "aria-label": "Drag to reorder", // dnd-kit sets no aria-label of its own
    title: "Drag to reorder",
    style: { touchAction: "none", userSelect: "none" },
    // The handle should never trigger the row's select/expand onClick.
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <div ref={setNodeRef} style={style} className={className} onClick={onClick}>
      {children({ handleProps, isDragging })}
    </div>
  );
}

/**
 * Thin generic wrapper around DndContext + SortableContext for a vertical list.
 * Computes old/new index by id and hands back the reordered array (plus the
 * indices, which some callers need — e.g. to keep an "expanded" row in sync).
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  className,
  children,
}: {
  items: T[];
  getId: (item: T, index: number) => string;
  onReorder: (next: T[], oldIndex: number, newIndex: number) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const sensors = useListSensors();
  const ids = items.map((item, i) => getId(item, i));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex), oldIndex, newIndex);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {className ? <div className={className}>{children}</div> : children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * A visible insertion target for dragging a new item from a palette/library into
 * a sortable outline. Sortable rows are great for reordering existing items,
 * but library-to-canvas interactions need explicit "drop between rows" targets
 * so the user can choose the exact insertion point (including an empty list).
 */
export function InsertionDropZone({
  id,
  active = false,
  label = "Drop here",
  className = "",
}: {
  id: string;
  active?: boolean;
  label?: string;
  className?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const highlighted = active || isOver;

  return (
    <div
      ref={setNodeRef}
      className={`relative flex items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
        highlighted
          ? "h-12 border-violet-400 bg-violet-50 text-violet-700"
          : "h-3 border-transparent text-transparent hover:h-10 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-500"
      } ${className}`}
      aria-label={label}
    >
      <span className="pointer-events-none text-[9px] font-black uppercase tracking-[0.2em]">
        {label}
      </span>
    </div>
  );
}
