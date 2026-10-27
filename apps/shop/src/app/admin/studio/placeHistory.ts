// Where the owner is in Studio, and the way back (wayfinding). Pure: no React, no storage, never design data.
//
// A "place" is the part of the editor's state the owner would call "where I am": the workspace on the left rail,
// the Theme settings / Text & labels category, the page being previewed, and the section, block or page part that is
// open. StudioEditor watches its own state, so every way of moving (Find, a click in the preview, Show on page,
// the rail, the page picker, a link followed in the preview) is recorded without each call site doing anything.
// Back pops the last place; a section or block that has since been deleted is dropped from it, never restored.

export type PlaceElement = { key: string; label: string; target: string; region?: string; text?: string };

export type Place = {
  /** Rail workspace: sections (Page layout), style (Theme settings), text, menus, pages, media, themes. */
  leftTab: string;
  styleCategory: string | null;
  textCategory: string | null;
  /** Theme settings › "Editing: <part>" card. */
  styleFocus: { id: string; label: string } | null;
  templateId: string;
  /** Editing a shared group (under the header, above the footer, pop-up) instead of a page. */
  showGlobal: boolean;
  globalGroup: string;
  selectedId: string | null;
  blockId: string | null;
  /** A built-in page part open in the inspector (header, buy card…). */
  element: PlaceElement | null;
};

/** How many earlier places Back remembers. */
export const PLACE_LIMIT = 20;
/** Changes this soon after the last one belong to the same jump (a preview click followed by the page it reports). */
export const COALESCE_MS = 700;

/** A place with the state that is invisible on its workspace left out, so hidden leftovers never count as a move. */
export function normalizePlace(p: Place): Place {
  const style = p.leftTab === "style", text = p.leftTab === "text";
  return {
    leftTab: p.leftTab,
    styleCategory: style ? p.styleCategory || null : null,
    textCategory: text ? p.textCategory || null : null,
    styleFocus: style ? p.styleFocus || null : null,
    templateId: p.templateId,
    showGlobal: !!p.showGlobal,
    globalGroup: p.globalGroup,
    selectedId: p.selectedId || null,
    blockId: p.selectedId ? p.blockId || null : null,
    element: p.element ? { key: p.element.key, label: p.element.label, target: p.element.target, region: p.element.region, text: p.element.text } : null,
  };
}

export function placeKey(place: Place): string {
  const p = normalizePlace(place);
  return [p.leftTab, p.styleCategory || "", p.textCategory || "", p.styleFocus?.id || "", p.showGlobal ? `g:${p.globalGroup}` : `t:${p.templateId}`,
    p.selectedId || "", p.blockId || "", p.element?.key || ""].join("|");
}

export const samePlace = (a: Place | null | undefined, b: Place | null | undefined) => !!a && !!b && placeKey(a) === placeKey(b);

export type PlaceHistory = { back: Place[]; current: Place | null; /** When `current` was reached (jump start, for coalescing). */ at: number };
export const EMPTY_PLACES: PlaceHistory = { back: [], current: null, at: 0 };

/** The owner is now at `place`. A new place pushes the one they left; the same place changes nothing. */
export function visitPlace(h: PlaceHistory, place: Place, now: number): PlaceHistory {
  const next = normalizePlace(place);
  if (!h.current) return { back: [], current: next, at: now };
  if (samePlace(h.current, next)) return h;
  if (now - h.at < COALESCE_MS) {
    // Still the same jump: replace where it ended up. If it came straight back to where the jump started, there was no move.
    const last = h.back[h.back.length - 1];
    return samePlace(last, next) ? { back: h.back.slice(0, -1), current: next, at: now } : { back: h.back, current: next, at: h.at };
  }
  const back = samePlace(h.back[h.back.length - 1], h.current) ? h.back : [...h.back, h.current];
  return { back: back.slice(-PLACE_LIMIT), current: next, at: now };
}

/** Records where a Back landed without adding to the trail (the history was already stepped back). */
export function settlePlace(h: PlaceHistory, place: Place, now: number): PlaceHistory {
  const next = normalizePlace(place);
  return samePlace(h.current, next) ? h : { back: h.back, current: next, at: now };
}

/**
 * Steps back to the newest earlier place that can still be shown. `resolve` returns the place with anything that no
 * longer exists taken out (a deleted section or block), or null when the place itself is gone (a deleted page).
 * Places that resolve to where the owner already is are skipped. Returns null when there is nowhere to go.
 */
export function goBack(h: PlaceHistory, resolve: (p: Place) => Place | null, now: number): { history: PlaceHistory; place: Place } | null {
  const back = [...h.back];
  while (back.length) {
    const candidate = back.pop()!;
    const place = resolve(candidate);
    if (!place) continue;
    const next = normalizePlace(place);
    if (samePlace(next, h.current)) continue;
    return { history: { back, current: next, at: now }, place: next };
  }
  return null;
}

/** The place Back would try first (for the button's tooltip), or null. */
export const peekBack = (h: PlaceHistory): Place | null => h.back[h.back.length - 1] || null;

// ── Breadcrumb ────────────────────────────────────────────────────────────────────────────────

export type CrumbLevel = "workspace" | "category" | "focus" | "page" | "section" | "block" | "element";
export type PlaceCrumb = { level: CrumbLevel; label: string };

/** Names for a place; the editor supplies them from its own data. */
export type PlaceLabels = {
  workspace: (tab: string) => string;
  styleCategory: (id: string) => string;
  textCategory: (id: string) => string;
  page: (p: Place) => string;
  section: (p: Place) => string | null;
  block: (p: Place) => string | null;
};

/**
 * "Theme settings › Buttons › Primary button" or "Page layout › Home › Newsletter › Block 2": the workspace, the
 * category or page, then what is open. Every crumb but the last is somewhere to step back out to.
 */
export function placeCrumbs(p: Place, labels: PlaceLabels): PlaceCrumb[] {
  const crumbs: PlaceCrumb[] = [{ level: "workspace", label: labels.workspace(p.leftTab) }];
  if (p.leftTab === "style" && p.styleCategory) crumbs.push({ level: "category", label: labels.styleCategory(p.styleCategory) });
  if (p.leftTab === "style" && p.styleFocus) crumbs.push({ level: "focus", label: p.styleFocus.label });
  if (p.leftTab === "text" && p.textCategory) crumbs.push({ level: "category", label: labels.textCategory(p.textCategory) });
  if (p.leftTab === "sections") crumbs.push({ level: "page", label: labels.page(p) });
  const section = p.selectedId ? labels.section(p) : null;
  if (section) {
    crumbs.push({ level: "section", label: section });
    const block = p.blockId ? labels.block(p) : null;
    if (block) crumbs.push({ level: "block", label: block });
  } else if (p.element?.label && !(p.leftTab === "style" && p.styleFocus?.label === p.element.label)) {
    crumbs.push({ level: "element", label: p.element.label });
  }
  return crumbs;
}

export const describePlace = (p: Place, labels: PlaceLabels) => placeCrumbs(p, labels).map(c => c.label).join(" › ");
