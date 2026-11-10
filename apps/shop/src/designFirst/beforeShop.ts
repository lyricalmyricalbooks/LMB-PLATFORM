// Design your shop before it exists (10 November 2026, Julian: "let customers design and customize their shop before
// launching and creating the site"). The real Studio runs at /design/studio with no shop behind it: sample products in
// the press's own kind, its brand name, and every save kept on the press's setup record (`design`, through the platform's
// door) instead of a shop database. When the store is made, the shop maker hands the design over (setup/handover.js) and
// the new admin puts it on (admin/overview/SignupDesignStage.tsx). Pure parts here; the page itself is main.tsx.
import { applyLook } from "../app/admin/studio/themeSwitch";
import { libraryLook, sampleProducts } from "../app/admin/lookGallery";
import { withStarterWords } from "../app/admin/sells";
import { ThemeConflictError, type ThemeBackend } from "../app/admin/themeStore";
import type { SetupDoor, SetupPress } from "../setupMode/door";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
const LOOK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The look a design was built on (Studio stores it as `themeBase` on Use this look), or "" when none. */
export function designLook(design: any): string {
  const id = typeof design?.themeBase?.id === "string" ? design.themeBase.id : "";
  return LOOK_ID.test(id) && id.length <= 40 ? id : "";
}

/**
 * Where the designer starts: the design saved earlier, else the look picked in setup laid over the starting design, else
 * the starting design. A shop that doesn't sell books gets its starter words, and the brand name is the site's name until
 * the press types another.
 */
export function startingDesign(press: Pick<SetupPress, "design" | "look" | "pressName" | "sells">, base: any): any {
  if (press.design && typeof press.design === "object") return clone(press.design);
  const theme = press.look ? libraryLook(press.look) : null;
  const design = withStarterWords(theme ? applyLook(clone(base), theme) : clone(base), press.sells || null);
  const name = (press.pressName || "").trim();
  return name && !design.copy?.siteName ? { ...design, copy: { ...(design.copy || {}), siteName: name } } : design;
}

// Covers drawn in the page, so nothing is fetched and every look shows them in its own frame.
const FILLS = ["#7a8b99", "#4b3b5c", "#c9b28a", "#8a5a44", "#3f6b5a", "#b4485a", "#2f4f7f", "#d0a23c"];
const cover = (fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${fill}"/></svg>`)}`;
const slugOf = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const priceOf = (text = "") => Number(String(text).replace(/[^0-9.]/g, "")) || 20;

/** Sample products in the press's own kind (the sign-up answer), as the shop's pages read books. Never saved anywhere. */
export function sampleShopBooks(sells?: string | null): any[] {
  return sampleProducts(sells).map((p, i) => ({
    id: `sample-${i + 1}`, slug: slugOf(p.title), title: p.title, authorName: p.maker || "", author: p.maker || "",
    retailPrice: priceOf(p.price), stockLevel: i === 5 ? 0 : 8, status: "published",
    isFeatured: i < 4, featured: i < 4, categories: [i % 2 ? "New" : "Featured"],
    photos: [{ id: `p${i + 1}`, url: cover(FILLS[i % FILLS.length]), alt: p.title }],
    description: `<p>A sample to show how your pages look. Your own will be here once your store is made.</p>`,
    createdAt: new Date(Date.UTC(2026, 10, 10 - i)).toISOString(),
    ...(p.kind ? { kind: p.kind } : {}),
  }));
}

/**
 * Studio's draft store for a press without a shop: Save draft and Publish both keep the design on the setup record
 * (one design, used when the store is made), with the look it was built on. Revisions count saves in this tab; the
 * server copy is the press's record.
 */
export function beforeShopBackend(door: Pick<SetupDoor, "save">, pressId: string, initial: any, onSaved?: (press: SetupPress) => void): ThemeBackend & { current: () => any } {
  let draft = clone(initial);
  let rev = 0;
  return {
    current: () => clone(draft),
    open: async () => ({ draft: clone(draft), rev, savedThemes: [] }),
    write: async (expectedRev, next, live) => {
      if (expectedRev !== rev) throw new ThemeConflictError({ draft: clone(draft), rev });
      const design = clone(live ?? next);
      const look = designLook(design);
      const saved = await door.save(pressId, { design, ...(look ? { look } : {}) });
      draft = design;
      onSaved?.(saved);
      return ++rev;
    },
    saveThemes: async () => { throw new Error("Saving extra themes comes with your store. Save this design instead."); },
    fieldUpdate: async (fields) => {
      draft = { ...draft, ...clone(fields) };
      await door.save(pressId, { design: clone(draft) });
      rev++;
    },
    readField: async (key) => clone(draft?.[key]),
  };
}

/** What Studio says for a part that needs a real store (pictures, share links, schedules, pages). */
export const WITH_YOUR_STORE = "That comes with your store. Finish your design, start your trial, and it's ready inside.";

/** Where Done goes: back to the front door, which shows the press's answers and its design ready for the trial. */
export const designerReturn = (pressId: string) => `/join/?press=${encodeURIComponent(pressId)}&designed=1`;

/** The designer's address for a press (the front door links here; Hosting serves design.html). */
export const designerUrl = (pressId: string) => `/design/studio?press=${encodeURIComponent(pressId)}`;
