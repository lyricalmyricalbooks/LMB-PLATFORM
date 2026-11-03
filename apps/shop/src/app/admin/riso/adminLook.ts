// The admin's look (plan 1.26): Riso Press, Paper, Ledger, Pop, Desk or Bento. Colours for both live in adminThemes.css; the chosen look is
// set on <html data-admin-look> so dialogs and menus drawn outside the admin shell follow it too. The choice is a
// per-browser preference, like day/night appearance, and never touches the shop or its saved settings.
export type AdminLookId = "riso" | "paper" | "ledger" | "pop" | "desk" | "bento";

export const ADMIN_LOOKS: { id: AdminLookId; name: string; description: string }[] = [
  { id: "riso", name: "Riso Press", description: "Cream paper, ink outlines and a flare-red accent." },
  { id: "paper", name: "Paper", description: "Plain white paper, a light menu, soft corners and a calm blue accent." },
  { id: "ledger", name: "Ledger", description: "Pale sage paper, a forest-green menu, serif type and thin rules." },
  { id: "pop", name: "Pop", description: "Lilac paper, a violet menu, rounded corners and hard violet shadows." },
  { id: "desk", name: "Desk", description: "A dark-rail working desk: icon menu that opens on hover, dense type, flat panels, amber accent." },
  { id: "bento", name: "Bento", description: "Bright and friendly: a floating menu dock and boards of big rounded, coloured tiles." },
];

/** The faces each look draws with besides Riso Press's own (loaded in index.html); fetched only when the look is used. */
export const ADMIN_LOOK_FONTS: Record<AdminLookId, string> = {
  riso: "",
  paper: "family=Inter:wght@400;500;600;700",
  ledger: "family=Source+Serif+4:wght@400;600;700",
  pop: "family=Syne:wght@600;800&family=Inter:wght@400;500;600;700",
  desk: "family=Manrope:wght@400;500;600;700;800",
  bento: "family=Bricolage+Grotesque:wght@500;800&family=DM+Sans:wght@400;500;600;700",
};

const isLook = (v: unknown): v is AdminLookId => ADMIN_LOOKS.some((l) => l.id === v);

function loadLookFonts(look: AdminLookId): void {
  const query = ADMIN_LOOK_FONTS[look];
  if (!query || typeof document === "undefined") return;
  const id = `admin-look-fonts-${look}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  document.head.appendChild(link);
}

const KEY = "adminLook";

export function readAdminLook(): AdminLookId {
  try {
    const saved = localStorage.getItem(KEY);
    return isLook(saved) ? saved : "riso";
  } catch {
    return "riso";
  }
}

/** Puts the look on the page and remembers it in this browser. */
export function applyAdminLook(look: AdminLookId, remember = true): void {
  if (typeof document !== "undefined") {
    if (look === "riso") document.documentElement.removeAttribute("data-admin-look");
    else document.documentElement.setAttribute("data-admin-look", look);
    loadLookFonts(look);
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
  const next = ADMIN_LOOKS[(ADMIN_LOOKS.findIndex((l) => l.id === look) + 1) % ADMIN_LOOKS.length];
  return { id: next.id, label: `${next.name} look` };
}
