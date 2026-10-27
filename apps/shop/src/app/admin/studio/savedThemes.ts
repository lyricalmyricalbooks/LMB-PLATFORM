// "My themes": complete copies of the design (style, text, menus AND sections) that the merchant
// saved from Studio, each stored as its own admin-only `savedThemes/{id}` document (admin/themeStore.ts). Applying one replaces the
// working draft (undoable) — nothing goes live until Publish.

export type SavedTheme = { id: string; name: string; savedAt: string; design: any };

export const MAX_SAVED_THEMES = 10;

export function addSavedTheme(list: SavedTheme[] | undefined, name: string, design: any, now = new Date()): SavedTheme[] {
  const clean = name.trim().slice(0, 60) || "Untitled theme";
  const entry: SavedTheme = {
    id: `theme_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    savedAt: now.toISOString(),
    // JSON round-trip drops undefined (Firestore rejects it) and detaches from live state.
    design: JSON.parse(JSON.stringify(design ?? {})),
  };
  // same name replaces the older copy instead of piling up
  const rest = (list || []).filter((t) => t.name.toLowerCase() !== clean.toLowerCase());
  return [entry, ...rest].slice(0, MAX_SAVED_THEMES);
}

/** The theme already called `name` (any capitalisation), other than `exceptId`: saving or renaming onto it replaces it. */
export function themeNamed(list: SavedTheme[] | undefined, name: string, exceptId?: string): SavedTheme | undefined {
  const clean = name.trim().slice(0, 60).toLowerCase() || "untitled theme";
  return (list || []).find((t) => t.id !== exceptId && t.name.toLowerCase() === clean);
}

/**
 * Why a new theme called `name` can't be added, or null. At the cap, adding would silently drop the oldest
 * theme (`addSavedTheme` keeps only MAX_SAVED_THEMES), so Studio refuses instead; replacing a same-named theme is fine.
 */
export function savedThemeLimitProblem(list: SavedTheme[] | undefined, name: string): string | null {
  if (themeNamed(list, name)) return null;
  return (list || []).length >= MAX_SAVED_THEMES
    ? `You have the maximum of ${MAX_SAVED_THEMES} themes. Delete one in My themes first.` : null;
}

export const removeSavedTheme = (list: SavedTheme[] | undefined, id: string) => (list || []).filter((t) => t.id !== id);

const clone = (v: any) => JSON.parse(JSON.stringify(v ?? {}));

export function renameSavedTheme(list: SavedTheme[] | undefined, id: string, name: string): SavedTheme[] {
  const clean = name.trim().slice(0, 60);
  if (!clean) return list || [];
  // renaming onto another theme's name would make two identical names; the other one is replaced
  return (list || [])
    .filter((t) => t.id === id || t.name.toLowerCase() !== clean.toLowerCase())
    .map((t) => (t.id === id ? { ...t, name: clean } : t));
}

export function duplicateSavedTheme(list: SavedTheme[] | undefined, id: string, now = new Date()): SavedTheme[] {
  const src = (list || []).find((t) => t.id === id);
  if (!src) return list || [];
  const names = new Set((list || []).map((t) => t.name.toLowerCase()));
  let name = `${src.name.slice(0, 50)} copy`;
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `${src.name.slice(0, 48)} copy ${n}`;
  return addSavedTheme(list, name, src.design, now);
}

const FILE_KIND = "lyricalmyrical-theme";

export const themeFileName = (t: Pick<SavedTheme, "name">) =>
  `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "theme"}.theme.json`;

export const serializeThemeFile = (t: Pick<SavedTheme, "name" | "design">, now = new Date()) =>
  JSON.stringify({ kind: FILE_KIND, version: 1, name: t.name, exportedAt: now.toISOString(), design: clone(t.design) }, null, 2);

/** Design keys whose content runs as script/markup on every public page (Studio › Style › Custom code). */
const SCRIPT_KEYS: [string, string][] = [["customHeadHtml", "Extra <head> HTML"], ["customFooterScripts", "Footer scripts"]];

/**
 * A theme file comes from outside, so it must not carry code into the storefront: the head HTML and footer
 * scripts are removed (at the top level and inside page/surface overrides) and named so Studio can say so.
 * The owner's own saved themes keep their custom code; only imports go through here (#118).
 */
export function stripImportedCustomCode(design: any): { design: any; removed: string[] } {
  const removed = new Set<string>();
  const clean = (node: any): any => {
    const out = { ...node };
    for (const [key, label] of SCRIPT_KEYS) {
      if (key in out) { if (String(out[key] ?? "").trim()) removed.add(label); delete out[key]; }
    }
    return out;
  };
  const top = clean(design);
  for (const [key, value] of Object.entries(top)) {
    if (value && typeof value === "object" && !Array.isArray(value)) top[key] = clean(value);
  }
  return { design: top, removed: [...removed] };
}

/** Reads a downloaded theme file. Returns an error string instead of throwing so the UI can show it. */
export function parseThemeFile(text: string): { name: string; design: any; strippedCustomCode?: string[] } | { error: string } {
  let raw: any;
  try { raw = JSON.parse(text); } catch { return { error: "That file isn't valid JSON." }; }
  const design = raw && raw.kind === FILE_KIND ? raw.design : raw?.design ?? null;
  if (!design || typeof design !== "object" || Array.isArray(design)) return { error: "That file isn't a Lyricalmyrical theme export." };
  const { design: safe, removed } = stripImportedCustomCode(design);
  return { name: String(raw.name || "Imported theme").slice(0, 60), design: safe, ...(removed.length ? { strippedCustomCode: removed } : {}) };
}
