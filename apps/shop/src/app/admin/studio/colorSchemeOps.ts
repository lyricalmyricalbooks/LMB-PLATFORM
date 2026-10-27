// Pure edits behind Studio › Theme settings › Colour schemes (StudioColorSchemes.tsx).
// Every function returns a new design (or list); nothing is mutated, so each edit is one undo step.
import { writeDesignValue } from "../../features/site/designModel";
import { DEFAULT_COLOR_SCHEMES, ELEMENT_SCHEME_TARGETS, schemeList, upgradeScheme, type ColorScheme, type SchemeRole } from "../../features/site/colorSchemes";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** The schemes Studio edits: the design's own, else a copy of the starter schemes. */
export const editableSchemes = (design: any): ColorScheme[] => clone(schemeList(design));

/**
 * Save a scheme list for every page. Page surfaces carrying an older copy of the list (from before
 * "All pages" cleared them) are cleared too, so what Studio shows is what every page uses.
 */
export const writeSchemes = (design: any, list: ColorScheme[]) => writeDesignValue(design, "colorSchemes", list, "all");

/** A scheme id not used in `list`. */
export const newSchemeId = (list: ColorScheme[]) => {
  let id = "";
  do id = `scheme-${Math.random().toString(36).slice(2, 8)}`; while (list.some((s) => s.id === id));
  return id;
};

const uniqueName = (list: ColorScheme[], base: string) => {
  const names = new Set(list.map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
};

/** A new scheme `id` (every role) at the end, starting from the first scheme's colours. */
export function addScheme(list: ColorScheme[], id: string): ColorScheme[] {
  const base = upgradeScheme(list[0] || DEFAULT_COLOR_SCHEMES[0]);
  return [...list, { ...base, id, name: uniqueName(list, "New scheme") }];
}

/** A copy of scheme `id`, called `copyId`, right after it. */
export function duplicateScheme(list: ColorScheme[], id: string, copyId: string): ColorScheme[] {
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return list;
  const copy = { ...clone(list[at]), id: copyId, name: uniqueName(list, `${list[at].name} copy`) };
  return [...list.slice(0, at + 1), copy, ...list.slice(at + 1)];
}

export const renameScheme = (list: ColorScheme[], id: string, name: string) =>
  list.map((s) => (s.id === id ? { ...s, name } : s));

/** Set one role. The scheme then uses every role (an older scheme is upgraded on its first colour edit). */
export const setSchemeRole = (list: ColorScheme[], id: string, role: SchemeRole, value: string) =>
  list.map((s) => (s.id === id ? { ...upgradeScheme(s), [role]: value } : s));

/** Use every role for an older scheme without changing any stored colour. */
export const upgradeSchemeIn = (list: ColorScheme[], id: string) => list.map((s) => (s.id === id ? upgradeScheme(s) : s));

export const moveScheme = (list: ColorScheme[], id: string, by: -1 | 1) => {
  const at = list.findIndex((s) => s.id === id), to = at + by;
  if (at < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
};

// ── Where a scheme is used ──────────────────────────────────────────────────

/** Walk every section (all pages, every-page sections, saved sections) and apply `fn` to its settings. */
function mapSectionSettings(value: any, fn: (settings: any) => any, key = ""): any {
  if (Array.isArray(value)) {
    if (key === "colorSchemes") return value;
    const mapped = value.map((v) => mapSectionSettings(v, fn));
    return mapped.some((v, i) => v !== value[i]) ? mapped : value;
  }
  if (!value || typeof value !== "object") return value;
  let out: any = value;
  for (const [k, v] of Object.entries(value)) {
    const next = mapSectionSettings(v, fn, k);
    if (next !== v) { if (out === value) out = { ...value }; out[k] = next; }
  }
  if (typeof value.type === "string" && out.settings && typeof out.settings === "object") {
    const settings = fn(out.settings);
    if (settings !== out.settings) out = { ...(out === value ? value : out), settings };
  }
  return out;
}

export type SchemeUsage = { sections: number; elements: string[] };

/** How many sections and which parts of the shop use a scheme. */
export function schemeUsage(design: any, id: string): SchemeUsage {
  let sections = 0;
  mapSectionSettings(design, (settings) => { if (settings.colorSchemeId === id) sections++; return settings; });
  const chosen = design?.elementSchemes || {};
  const elements = Object.entries(ELEMENT_SCHEME_TARGETS).filter(([key]) => chosen[key] === id).map(([, t]) => t.label);
  return { sections, elements };
}

export const usageText = (u: SchemeUsage) => [
  u.sections ? `${u.sections} section${u.sections === 1 ? "" : "s"}` : "",
  ...u.elements.map((e) => e.toLowerCase()),
].filter(Boolean).join(", ");

/**
 * Delete a scheme. Sections and parts of the shop that used it fall back to the theme's own colours
 * (their `colorSchemeId` / `elementSchemes` entry is removed). The last scheme can't be deleted —
 * an empty list would bring the starter schemes back.
 */
export function deleteScheme(design: any, id: string): any {
  const list = editableSchemes(design);
  if (list.length <= 1 || !list.some((s) => s.id === id)) return design;
  let next = writeSchemes(design, list.filter((s) => s.id !== id));
  next = mapSectionSettings(next, (settings) => {
    if (settings.colorSchemeId !== id) return settings;
    const { colorSchemeId: _drop, ...rest } = settings;
    return rest;
  });
  const chosen = next.elementSchemes;
  if (chosen && typeof chosen === "object" && Object.values(chosen).includes(id)) {
    const kept = Object.fromEntries(Object.entries(chosen).filter(([, v]) => v !== id));
    next = { ...next };
    if (Object.keys(kept).length) next.elementSchemes = kept; else delete next.elementSchemes;
  }
  return next;
}
