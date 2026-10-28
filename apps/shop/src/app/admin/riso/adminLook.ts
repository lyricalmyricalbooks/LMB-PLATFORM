// The admin's look (plan 1.26): Riso Press or Paper. Colours for both live in adminThemes.css; the chosen look is
// set on <html data-admin-look> so dialogs and menus drawn outside the admin shell follow it too. The choice is a
// per-browser preference, like day/night appearance, and never touches the shop or its saved settings.
export type AdminLookId = "riso" | "paper";

export const ADMIN_LOOKS: { id: AdminLookId; name: string; description: string }[] = [
  { id: "riso", name: "Riso Press", description: "Cream paper, ink outlines and a flare-red accent." },
  { id: "paper", name: "Paper", description: "Plain white paper, soft shadows and a calm blue accent." },
];

const KEY = "adminLook";

export function readAdminLook(): AdminLookId {
  try {
    return localStorage.getItem(KEY) === "paper" ? "paper" : "riso";
  } catch {
    return "riso";
  }
}

/** Puts the look on the page and remembers it in this browser. */
export function applyAdminLook(look: AdminLookId, remember = true): void {
  if (typeof document !== "undefined") {
    if (look === "riso") document.documentElement.removeAttribute("data-admin-look");
    else document.documentElement.setAttribute("data-admin-look", look);
  }
  if (!remember) return;
  try {
    localStorage.setItem(KEY, look);
  } catch {
    /* private mode: the look still applies for this visit */
  }
}

/** The look the account menu offers next, and its label. */
export function nextAdminLook(look: AdminLookId): { id: AdminLookId; label: string } {
  const next = look === "paper" ? ADMIN_LOOKS[0] : ADMIN_LOOKS[1];
  return { id: next.id, label: `${next.name} look` };
}
