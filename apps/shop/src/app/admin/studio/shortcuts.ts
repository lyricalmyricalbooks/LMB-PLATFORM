// Studio keyboard shortcuts: one table drives the key handler and the "?" cheat sheet.

export type ShortcutAction = "find" | "save" | "undo" | "redo" | "delete" | "duplicate" | "moveUp" | "moveDown"
  | "deselect" | "help" | "desktop" | "tablet" | "mobile" | "toggleMode"
  | "workbench" | "back" | "addSection" | "prevSection" | "nextSection" | "goPrefix" | GoAction;

/** "G then a letter" jumps to a Studio workspace (a two-key sequence, like Gmail or GitHub). */
export const GO_KEYS = [
  { key: "l", tab: "sections", label: "Page layout" },
  { key: "t", tab: "style", label: "Theme settings" },
  { key: "x", tab: "text", label: "Text & labels" },
  { key: "n", tab: "menus", label: "Navigation" },
  { key: "p", tab: "pages", label: "Pages" },
  { key: "m", tab: "media", label: "Media" },
  { key: "h", tab: "themes", label: "Themes" },
] as const;
export type GoTab = typeof GO_KEYS[number]["tab"];
export type GoAction = `go:${GoTab}`;
/** How long after G the second key still counts. */
export const GO_SEQUENCE_MS = 1200;
/** The workspace a key pressed right after G opens, or null. */
export const resolveGoKey = (key: string): GoAction | null => {
  const hit = GO_KEYS.find(g => g.key === (key.length === 1 ? key.toLowerCase() : key));
  return hit ? `go:${hit.tab}` : null;
};
/** "G then T" style hint for a workspace button's tooltip. */
export const goHint = (tab: string) => { const hit = GO_KEYS.find(g => g.tab === tab); return hit ? `G then ${hit.key.toUpperCase()}` : ""; };

export const SHORTCUTS: { action: ShortcutAction; keys: string; label: string; group: string }[] = [
  { action: "find", keys: "Ctrl/⌘ K", label: "Find any setting, word, page or action", group: "Everywhere" },
  { action: "save", keys: "Ctrl/⌘ S", label: "Save draft (in Pages: save the page)", group: "Everywhere" },
  { action: "undo", keys: "Ctrl/⌘ Z", label: "Undo", group: "Everywhere" },
  { action: "redo", keys: "Ctrl/⌘ Shift Z  ·  Ctrl/⌘ Y", label: "Redo", group: "Everywhere" },
  { action: "back", keys: "Alt ←", label: "Go back to where you were before your last jump (Find, a click in the preview, a new page)", group: "Everywhere" },
  { action: "help", keys: "?", label: "Show these shortcuts", group: "Everywhere" },
  { action: "workbench", keys: "W", label: "Open or close the Workbench (Health, Changes, Setup)", group: "Everywhere" },
  ...GO_KEYS.map(g => ({ action: `go:${g.tab}` as ShortcutAction, keys: `G then ${g.key.toUpperCase()}`, label: `Go to ${g.label}`, group: "Go to a workspace" })),
  { action: "addSection", keys: "A", label: "Add a section to this page", group: "Page layout" },
  { action: "prevSection", keys: "[", label: "Select the section above", group: "Page layout" },
  { action: "nextSection", keys: "]", label: "Select the section below", group: "Page layout" },
  { action: "duplicate", keys: "Ctrl/⌘ D", label: "Duplicate the selected section", group: "Selected section" },
  { action: "delete", keys: "Delete", label: "Delete the selected section (Undo brings it back)", group: "Selected section" },
  { action: "moveUp", keys: "Alt ↑", label: "Move the selected section up", group: "Selected section" },
  { action: "moveDown", keys: "Alt ↓", label: "Move the selected section down", group: "Selected section" },
  { action: "deselect", keys: "Esc", label: "Clear the selection", group: "Selected section" },
  { action: "desktop", keys: "1", label: "Desktop preview", group: "Preview" },
  { action: "tablet", keys: "2", label: "Tablet preview", group: "Preview" },
  { action: "mobile", keys: "3", label: "Phone preview", group: "Preview" },
  { action: "toggleMode", keys: "E", label: "Switch between Edit and Browse mode", group: "Preview" },
];

export type KeyInput = { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; typing?: boolean; dialogOpen?: boolean; /** Focus is on a button or link (Backspace there must not delete). */ onControl?: boolean };

/** Which Studio action a key press means, or null. Plain-key shortcuts never fire while typing. */
export function resolveShortcut(e: KeyInput): ShortcutAction | null {
  const mod = !!(e.ctrl || e.meta);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.alt) {
    if (key === "k") return "find";
    if (key === "s") return "save";
    if (key === "y") return e.typing ? null : "redo";
    if (key === "z") return e.typing ? null : e.shift ? "redo" : "undo";
    if (key === "d") return e.typing || e.dialogOpen ? null : "duplicate";
    return null;
  }
  if (e.typing || e.dialogOpen || mod) return null;
  if (e.alt && !e.shift && key === "ArrowLeft") return "back";
  if (e.alt && key === "ArrowUp") return "moveUp";
  if (e.alt && key === "ArrowDown") return "moveDown";
  if (e.alt) return null;
  // Backspace is "delete" on Mac keyboards, but on a focused button it reads as "go back": only Delete works there.
  if (key === "Delete" || (key === "Backspace" && !e.onControl)) return "delete";
  if (key === "Escape") return "deselect";
  if (key === "?") return "help";
  if (key === "1") return "desktop";
  if (key === "2") return "tablet";
  if (key === "3") return "mobile";
  if (key === "e") return "toggleMode";
  if (key === "w") return "workbench";
  if (key === "a") return "addSection";
  if (key === "[") return "prevSection";
  if (key === "]") return "nextSection";
  if (key === "g") return "goPrefix";
  return null;
}
