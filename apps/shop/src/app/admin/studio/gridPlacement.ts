// Free placement on a grid (Studio 3.0 phase 3). The preview reports where a block was dropped or resized in pixels,
// measured against the Flexible composition's grid; these pure helpers turn that into the grid cells the storefront
// already reads (`block.grid[device] = { column, span, row, rowSpan, z }`, components/SectionComponents.tsx).

export type GridDevice = "desktop" | "tablet" | "mobile";
export type GridCell = { column: number; span: number; row: number; rowSpan: number };
/** The grid as the preview measured it: column count, its width, the gap and the heights of the rows it has drawn. */
export type GridMeasure = { width: number; columns: number; gap: number; rows: number[]; rowGap?: number };
export type PixelRect = { x: number; y: number; w: number; h: number };

export const MAX_ROW = 30;
export const MAX_ROW_SPAN = 12;
/** Height used for rows the grid hasn't drawn yet (dropping below the last block). */
export const DEFAULT_ROW_PX = 80;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Left edge (px) of each column, and the width of one column. */
function columnGeometry(g: GridMeasure) {
  const columns = clamp(Math.round(g.columns) || 12, 1, 24);
  const gap = Math.max(0, g.gap || 0);
  const colW = Math.max(1, (g.width - gap * (columns - 1)) / columns);
  return { columns, gap, colW, step: colW + gap };
}

/** Top edge (px) of each row, extending past the drawn rows with default-height rows. */
function rowTops(g: GridMeasure, upTo: number): number[] {
  const gap = Math.max(0, g.rowGap ?? g.gap ?? 0);
  const tops: number[] = [];
  let y = 0;
  for (let i = 0; i < MAX_ROW + MAX_ROW_SPAN; i++) {
    tops.push(y);
    y += (g.rows[i] ?? DEFAULT_ROW_PX) + gap;
    if (y > upTo + DEFAULT_ROW_PX * 2 && i >= g.rows.length) break;
  }
  return tops;
}

/** Index of the row edge nearest to y. */
function nearestEdge(tops: number[], y: number): number {
  let best = 0;
  for (let i = 1; i < tops.length; i++) if (Math.abs(tops[i] - y) < Math.abs(tops[best] - y)) best = i;
  return best;
}

/** Grid cells for a block drawn at `rect` (px, relative to the grid's top-left), snapped to the nearest cells. */
export function cellsFromRect(rect: PixelRect, g: GridMeasure): GridCell {
  const { columns, gap, step } = columnGeometry(g);
  const column = clamp(Math.round(rect.x / step) + 1, 1, columns);
  const end = clamp(Math.round((rect.x + rect.w + gap) / step), column, columns);
  const rowGap = Math.max(0, g.rowGap ?? g.gap ?? 0);
  const tops = rowTops(g, rect.y + rect.h);
  const start = Math.min(nearestEdge(tops, rect.y), MAX_ROW - 1);
  const stop = nearestEdge(tops, rect.y + rect.h + rowGap);
  return { column, span: end - column + 1, row: start + 1, rowSpan: clamp(stop - start, 1, MAX_ROW_SPAN) };
}

/** Keeps a placement inside the grid (used for typed numbers and arrow-key nudges too). */
export function clampCell(cell: Partial<GridCell>, columns: number): GridCell {
  const cols = clamp(Math.round(columns) || 12, 1, 24);
  const column = clamp(Math.round(cell.column || 1), 1, cols);
  return {
    column,
    span: clamp(Math.round(cell.span || 1), 1, cols - column + 1),
    row: clamp(Math.round(cell.row || 1), 1, MAX_ROW),
    rowSpan: clamp(Math.round(cell.rowSpan || 1), 1, MAX_ROW_SPAN),
  };
}

/** Moves (dx/dy) or resizes (dw/dh) a placement by whole cells, kept inside the grid. */
export function nudgeCell(cell: GridCell, by: { dx?: number; dy?: number; dw?: number; dh?: number }, columns: number): GridCell {
  const moved = { ...cell, column: cell.column + (by.dx || 0), row: cell.row + (by.dy || 0), span: cell.span + (by.dw || 0), rowSpan: cell.rowSpan + (by.dh || 0) };
  // A move at the right edge keeps the width and stops; a resize gives way instead.
  if (by.dx && moved.column + moved.span - 1 > columns) moved.column = Math.max(1, columns - moved.span + 1);
  return clampCell(moved, columns);
}

type Block = { id?: string; grid?: Record<string, any>; children?: Block[]; [k: string]: any };

/** Sets one block's grid placement for one device (nested group children too), leaving everything else as it was. */
export function setBlockGrid<T extends Block>(blocks: T[], blockId: string, device: GridDevice, patch: Record<string, any>): T[] {
  let changed = false;
  const walk = (list: Block[]): Block[] => list.map(b => {
    if (b.id === blockId) {
      changed = true;
      const current = b.grid?.[device] || {};
      const next = { ...current, ...patch };
      for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
      return { ...b, grid: { ...(b.grid || {}), [device]: next } };
    }
    if (Array.isArray(b.children)) {
      const children = walk(b.children);
      return children.some((c, i) => c !== b.children![i]) ? { ...b, children } : b;
    }
    return b;
  });
  const out = walk(blocks) as T[];
  return changed ? out : blocks;
}

/** Top-level blocks, front-most first, by their layer (z) at this size. Equal layers keep page order, later in front. */
export function layerOrder<T extends Block>(blocks: T[], device: GridDevice): T[] {
  const z = (b: Block) => Number(b.grid?.[device]?.z ?? b.grid?.desktop?.z ?? 0) || 0;
  return blocks.map((b, i) => ({ b, i })).sort((a, c) => z(c.b) - z(a.b) || c.i - a.i).map(x => x.b);
}

/** The new layer number that puts a block one step in front of (or behind) its neighbour at this size. */
export function shiftLayer(blocks: Block[], blockId: string, device: GridDevice, dir: "forward" | "back"): number | null {
  const order = layerOrder(blocks, device);
  const at = order.findIndex(b => b.id === blockId);
  if (at < 0) return null;
  const neighbour = order[dir === "forward" ? at - 1 : at + 1];
  if (!neighbour) return null;
  const z = (b: Block) => Number(b.grid?.[device]?.z ?? b.grid?.desktop?.z ?? 0) || 0;
  return clamp(z(neighbour) + (dir === "forward" ? 1 : -1), 0, 20);
}

/** A placement message from the preview: a drop/resize (`rect`) or a keyboard nudge (`by`, measured from `rect`). */
export type GridMessage = {
  sectionId: string; blockId: string; device: GridDevice;
  rect: PixelRect; grid: GridMeasure; by?: { dx?: number; dy?: number; dw?: number; dh?: number };
};

/** The design with one block of a Flexible composition placed where the preview said, or the same design when the
 *  message doesn't name a real block (stale preview). Placement stays on the placement, never a shared source. */
export function applyGridMessage(design: any, msg: GridMessage, blocksKey: (type: string) => string, update: (design: any, ids: string[], fn: (s: any) => any) => any): any {
  if (!msg || typeof msg.sectionId !== "string" || typeof msg.blockId !== "string" || !msg.rect || !msg.grid) return design;
  const device: GridDevice = msg.device === "tablet" || msg.device === "mobile" ? msg.device : "desktop";
  const columns = msg.grid.columns;
  const measured = cellsFromRect(msg.rect, msg.grid);
  const cell = msg.by ? nudgeCell(measured, msg.by, columns) : measured;
  return update(design, [msg.sectionId], section => {
    if (section.type !== "CompositionSection") return section;
    const key = blocksKey(section.type);
    const list = section.settings?.[key] || section.settings?.blocks || [];
    const next = setBlockGrid(list, msg.blockId, device, cell);
    return next === list ? section : { ...section, settings: { ...section.settings, [key]: next } };
  });
}
