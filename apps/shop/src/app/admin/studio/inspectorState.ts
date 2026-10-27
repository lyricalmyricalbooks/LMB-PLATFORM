// Pure rules behind the section inspector: which tab stays open between selections, how a block
// moves among its siblings, and the explicit per-device "hide" toggles. No React here, so they are tested.
import { moveBlockBefore, type StudioBlock } from "./studioModel";

export type InspectorTab = "content" | "style" | "layout" | "visibility";
const TABS: InspectorTab[] = ["content", "style", "layout", "visibility"];

/**
 * The tab to show after the owner selects a section. It is kept when the new section is of the same
 * kind (so picking the next Hero while on Style stays on Style) and falls back to Content when the
 * kind changes or the remembered tab doesn't exist.
 */
export function tabAfterSelection(current: string, previousType: string | undefined, nextType: string): InspectorTab {
  if (previousType !== nextType) return "content";
  return TABS.includes(current as InspectorTab) ? current as InspectorTab : "content";
}

/** The list of blocks (top level or nested) that holds block `id`, or null. */
function siblingsOf(blocks: StudioBlock[], id: string): StudioBlock[] | null {
  if ((blocks || []).some(b => b.id === id)) return blocks;
  for (const b of blocks || []) {
    const found = b.children?.length ? siblingsOf(b.children, id) : null;
    if (found) return found;
  }
  return null;
}

/** Whether block `id` can move up / down among the blocks beside it. */
export function blockMoveRoom(blocks: StudioBlock[], id: string): { up: boolean; down: boolean } {
  const list = siblingsOf(blocks, id);
  const i = list ? list.findIndex(b => b.id === id) : -1;
  return { up: i > 0, down: i >= 0 && !!list && i < list.length - 1 };
}

/** Moves block `id` one place among its siblings; returns the same array when it cannot move. */
export function moveBlockBy(blocks: StudioBlock[], id: string, direction: -1 | 1): StudioBlock[] {
  const list = siblingsOf(blocks, id);
  if (!list) return blocks;
  const i = list.findIndex(b => b.id === id);
  if (direction < 0) return i > 0 ? moveBlockBefore(blocks, id, list[i - 1].id) : blocks;
  return i >= 0 && i < list.length - 1 ? moveBlockBefore(blocks, list[i + 1].id, id) : blocks;
}

/** The devices a block can be hidden on, in the order shown. Same keys the "responsive" overrides always used.
 *  The storefront's tablet rule is "up to tablet width" (`UP_TO.tablet`), so hiding on tablets hides on phones too. */
export const HIDE_DEVICES: { device: "mobile" | "tablet"; label: string }[] = [
  { device: "mobile", label: "Hide on phones" },
  { device: "tablet", label: "Hide on tablets and phones" },
];

/**
 * The block's `responsive` map with `hidden` switched for one device. It writes exactly what the old
 * "Hide at this size" box wrote (`responsive[device].hidden`, removed when off), whatever size is previewed.
 */
export function withDeviceHidden(responsive: Record<string, any> | undefined, device: "mobile" | "tablet", hidden: boolean) {
  return { ...(responsive || {}), [device]: { ...(responsive?.[device] || {}), hidden: hidden || undefined } };
}
