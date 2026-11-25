// The live demo shops' rules (main.ts serves them): which starter, style and kind of shop an address asks for, and the
// design and sample products it shows. Unknown answers fall back to the first starter, its own style and a clothing shop.
import { STARTER_SITES } from "../app/admin/lookGallery";
import { stylesFor, styledName, withStyle } from "../app/admin/studio/starterStyles";
import { sampleShopBooks } from "../designFirst/beforeShop";
import { defaultSettings } from "../app/admin/defaultSettings";
import { applyStarter, starterForShop } from "../app/admin/studio/starterDesign";
import { getSectionMeta } from "../app/admin/ThemeEditorExtensions";
import { starterPhotos } from "../app/admin/studio/starterPhotos";
import { withStarterWords } from "../app/admin/sells";
import { wordsFor } from "../shared/shopSells";
import { libraryLook } from "../app/admin/lookGallery";

export const DEMO_KEY = "colophon-demo-shop";
/** The name a sample shop shows: the visitor's own goes in when they start. */
export const DEMO_NAME = "Your shop";
/**
 * The kinds of shop a demo can be shown as, one per sample set (admin/starterSamples.ts), each with the sign-up answer
 * it stands for: the answer is what the shop's words, menu and sample photos follow (shared/shopSells.ts).
 */
export const DEMO_SELLS = { clothing: "clothing", home: "other", books: "books", studio: "studio" } as const;
export type DemoKind = keyof typeof DEMO_SELLS;
export type DemoChoice = { starter: string; style: string; sells: DemoKind };

export function demoChoice(asked: { starter?: string | null; style?: string | null; sells?: string | null }): DemoChoice {
  const starter = asked.starter && STARTER_SITES.includes(asked.starter) ? asked.starter : STARTER_SITES[0];
  const styles = stylesFor(starter);
  const style = styles.find((s) => s.id === asked.style)?.id || styles[0]?.id || "";
  const sells = Object.hasOwn(DEMO_SELLS, String(asked.sells)) ? (asked.sells as DemoKind) : "clothing";
  return { starter, style, sells };
}

/**
 * The starter's pictures live at the site's root in a shop (`/starters/…`); in a demo they sit under the demo's own
 * folder, so every such address gets the folder in front.
 */
export function underBase<T>(value: T, base: string): T {
  const root = base.replace(/\/?$/, "/");
  if (root === "/") return value;
  return JSON.parse(JSON.stringify(value).replace(/"\/starters\//g, `"${root}starters/`));
}

/**
 * The shop name a demo shows: the visitor's own (sign-up's live preview passes the brand name being typed), else
 * DEMO_NAME. Plain text only, one line, at most 60 characters.
 */
export function demoShopName(asked?: string | null): string {
  const name = String(asked ?? "").replace(/[<>]/g, "").replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 60).trim();
  return name || DEMO_NAME;
}

/** The design and sample products a demo shows, and its name ("Aurel Sand"). */
export function demoDesign(choice: DemoChoice, base = "/", shopName = DEMO_NAME): { design: any; books: any[]; name: string; sells: string } {
  const sells = DEMO_SELLS[choice.sells];
  const theme = withStyle(libraryLook(choice.starter), choice.style);
  const shop = starterForShop(theme, sells);
  const applied = applyStarter(defaultSettings().design, shop, getSectionMeta, wordsFor(sells), starterPhotos(sells, base));
  const design = withStarterWords({ ...applied, copy: { ...(applied.copy || {}), siteName: shopName } }, sells);
  return { design: underBase(design, base), books: underBase(sampleShopBooks(sells, choice.starter), base), name: styledName(theme), sells };
}
