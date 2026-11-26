// The starter library (round three phase 2b, 25 November 2026): the platform site's theme-store page for starters,
// /demo/starters/, and a page per starter, /demo/starters/<id>. Anyone can browse them before signing up: what each
// starter suits, its three styles, a live look at desktop and phone, and the way in (See it live, Use this starter).
// This file holds the data and rules; libraryPage.ts draws them.
//
// Only the starters the control room offers are listed (`GET /api/starters/offered`, control-room/starterSites.js), so a
// new starter waiting for the owner's yes stays off the public page too; if the record can't be read, the ready ones show.
import { libraryLook, offeredStarters, offeredStyles, STARTER_SITES, type StarterChoice } from "../app/admin/lookGallery";
import { presetSections } from "../app/admin/studio/presetContent";
import { type DemoKind, underBase } from "./demoShop";

export type StarterKind = "products" | "services" | "books";

/** What each starter suits: the filters it answers, the kinds of shop named on its card, and the sample shop it opens as. */
export const STARTER_INFO: Record<string, { kinds: StarterKind[]; bestFor: string[]; sells: DemoKind; cover?: string }> = {
  "juniper-slow-season": { kinds: ["products"], bestFor: ["Home goods", "Clothing", "Seasonal collections"], sells: "home" },
  // Catalogue opens on the same still life as Slow Season, so its card shows one of its own products instead.
  "juniper-catalogue": { kinds: ["products", "books"], bestFor: ["Books and prints", "Collections", "Small ranges"], sells: "books", cover: "/starters/catalogue/opening.jpg" },
  "aurel-editorial": { kinds: ["products", "books"], bestFor: ["Clothing", "Design objects", "Editorial shops"], sells: "clothing" },
  "starter-gallery": { kinds: ["products", "books"], bestFor: ["A few products", "Makers", "Art and prints"], sells: "home" },
  "starter-warehouse": { kinds: ["products"], bestFor: ["A big range", "Clothing", "Shops with many categories"], sells: "clothing" },
  "starter-larder": { kinds: ["products"], bestFor: ["Food and drink", "Bakeries", "Coffee and tea"], sells: "home" },
  "starter-salon": { kinds: ["services"], bestFor: ["Salons", "Beauty and wellness", "Appointments"], sells: "beauty" },
  "starter-workshop": { kinds: ["services"], bestFor: ["Classes", "Workshops", "Studios"], sells: "studio" },
  "starter-commission": { kinds: ["products", "services"], bestFor: ["Made to order", "Furniture and craft", "Enquiries"], sells: "home" },
};

export const LIBRARY_FILTERS: { id: "all" | StarterKind; label: string }[] = [
  { id: "all", label: "All starters" },
  { id: "products", label: "Things to sell" },
  { id: "services", label: "Appointments and classes" },
  { id: "books", label: "Books and prints" },
];

export type LibraryEntry = {
  id: string;
  name: string;
  mood: string;
  kinds: StarterKind[];
  bestFor: string[];
  sells: DemoKind;
  /** The starter's opening photo, under the demo's folder, or "" when it has none. */
  cover: string;
  styles: { id: string; name: string; swatches: [string, string, string] }[];
};

/** The starter's first photo on its home page: the one its card shows. */
function coverOf(theme: any): string {
  for (const section of presetSections(theme).heroPage || []) {
    const settings = section.settings as any;
    const url = settings?.imageUrl || settings?.slides?.[0]?.imageUrl || settings?.items?.[0]?.imageUrl;
    if (typeof url === "string" && url) return url;
  }
  return "";
}

/** Every starter the control room offers, in its order, as the library shows it. */
export function libraryEntries(choice: StarterChoice, base = "/"): LibraryEntry[] {
  return offeredStarters(choice).flatMap((id) => {
    const theme = libraryLook(id);
    const info = STARTER_INFO[id];
    if (!theme || !info) return [];
    const styles = offeredStyles(id, choice).map((s) => ({ id: s.id, name: s.name, swatches: s.swatches }));
    const { cover, ...rest } = info;
    return [{ id, name: String(theme.name), mood: String(theme.mood || ""), ...rest, cover: underBase(cover || coverOf(theme), base), styles }];
  });
}

export const filterEntries = (entries: LibraryEntry[], filter: string) => (filter === "all" ? entries : entries.filter((e) => e.kinds.includes(filter as StarterKind)));

/** Which page an address inside the demo folder is: the library, one starter's page, or (null) a sample shop. */
export function libraryRoute(pathname: string, base = "/demo/"): { page: "library" } | { page: "starter"; id: string } | null {
  const root = base.replace(/\/?$/, "/");
  if (!pathname.startsWith(`${root}starters`)) return null;
  const rest = pathname.slice(`${root}starters`.length).replace(/^\/+|\/+$/g, "");
  if (!rest) return { page: "library" };
  return STARTER_SITES.includes(rest) ? { page: "starter", id: rest } : { page: "library" };
}

/** The live sample shop for a starter in one style. */
export const liveHref = (entry: LibraryEntry, style: string, base = "/demo/") =>
  `${base.replace(/\/?$/, "/")}?${new URLSearchParams({ starter: entry.id, style, sells: entry.sells })}`;

/** Sign-up with the starter and style already picked (join/app.js reads these). */
export const joinHref = (entry: LibraryEntry, style: string) => {
  const at = entry.styles.findIndex((s) => s.id === style);
  const name = at > 0 ? `${entry.name} ${entry.styles[at].name}` : entry.name;
  return `/join/?${new URLSearchParams({ starter: entry.id, style, name })}`;
};

/** The control room's choice of starters, or null (the ready ones show) when it can't be read in time. */
export async function readOfferedChoice(fetcher: typeof fetch = fetch, wait = 2500): Promise<StarterChoice> {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), wait));
    const answer = await Promise.race([fetcher("/api/starters/offered").then((r) => (r.ok ? r.json() : null)), timeout]);
    return answer && typeof answer === "object" && answer.choice && typeof answer.choice === "object" ? answer.choice : null;
  } catch {
    return null;
  }
}

