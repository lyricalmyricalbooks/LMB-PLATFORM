// Studio › Essentials (plan 1.27): the few settings a new press changes first, on one short panel that Studio opens
// in. Every one is the same control as in Theme settings or Text & labels (same key, same save), so nothing here is
// a second way to store a value. Everything else stays under "All settings": the other workspaces in the rail.
import { COPY_SCHEMA } from "../../features/site/storeCopy";
import { STYLE_GROUPS, type StyleField, type StyleGroup } from "./styleSchema";

export type EssentialStep = {
  id: string;
  title: string;
  hint: string;
  /** Text & labels keys (words). */
  copy?: string[];
  /** Theme settings keys. */
  style?: string[];
  /** A button that opens a whole workspace for this step. */
  open?: { tab: "sections" | "themes" | "pages"; label: string };
};

export const ESSENTIALS: EssentialStep[] = [
  { id: "name", title: "Your shop's name", hint: "Shown in the header, the footer, checkout and every email.", copy: ["siteName"] },
  { id: "logo", title: "Logo", hint: "Optional: without a picture, the name above is your logo.", style: ["logoUrl", "faviconUrl"] },
  { id: "look", title: "Start from a look", hint: "A ready-made set of colours, fonts and layout. Your words and books are kept.",
    open: { tab: "themes", label: "Browse looks" } },
  { id: "colours", title: "Colours", hint: "The page, its words and your accent colour.", style: ["backgroundColor", "textColor", "primaryColor"] },
  { id: "fonts", title: "Fonts and buttons", hint: "One font for titles, one for reading.", style: ["headingFont", "bodyFont", "buttonStyle"] },
  { id: "announcement", title: "Announcement bar", hint: "A short line above the header, for news or free shipping.", style: ["showAnnouncement", "announcementText"] },
  { id: "home", title: "Your homepage", hint: "Add, move and edit the sections shoppers see first.", open: { tab: "sections", label: "Arrange the homepage" } },
  { id: "pages", title: "About and policy pages", hint: "About, shipping, returns and contact.", open: { tab: "pages", label: "Open pages" } },
];

/** The Theme settings field (and its group) behind a key, or null when the key has no control. */
export function essentialStyleField(key: string): { group: StyleGroup; field: StyleField } | null {
  for (const group of STYLE_GROUPS) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return { group, field };
  }
  return null;
}

/** The Text & labels field (and its group name) behind a key, or null. */
export function essentialCopyField(key: string) {
  for (const group of COPY_SCHEMA) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return { group: group.group, field };
  }
  return null;
}
