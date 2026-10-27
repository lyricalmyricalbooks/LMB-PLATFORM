// Product information as blocks (Studio 2.9): the product page's buy card is an ordered list of blocks. The list is
// `productInfoBlocks` on the `productPage` surface or on an alternate template (`productPage~<id>`, 2.8) — arrays layer
// wholesale, so an alternate either has its own list or follows the default's. No list = DEFAULT_PRODUCT_BLOCKS, which is
// exactly the card as it was hand-written (productCard.parity.test.tsx). Built-in blocks wrap the existing pieces and keep
// every older show/hide control; the owner can also add Text, Collapsible, Badge, Look inside and Book detail blocks.
// Pure and storefront-safe.

export type BuiltInBlockType =
  | "tag" | "heading" | "price" | "formats" | "boxSet" | "addOns" | "giftCard" | "buy" | "backInStock" | "details";
export type CustomBlockType = "text" | "collapsible" | "badge" | "lookInside" | "customField";
export type ProductBlockType = BuiltInBlockType | CustomBlockType | "divider";
export type ProductBlock = { id: string; type: ProductBlockType; hidden?: boolean; settings?: Record<string, any> };

export const BUILT_IN_BLOCKS: { type: BuiltInBlockType; label: string; hint: string; required?: boolean }[] = [
  { type: "tag", label: "Category tag", hint: "Also follows Style › Product page · buy card & details › Show category tag." },
  { type: "heading", label: "Title, subtitle & author", hint: "Always shown.", required: true },
  { type: "price", label: "Price, sale end & stock", hint: "The stock line also follows Show stock line." },
  { type: "formats", label: "Editions & formats", hint: "Shown for books sold in editions (or gift card amounts)." },
  { type: "boxSet", label: "Box set contents", hint: "Shown for box sets." },
  { type: "addOns", label: "Extras (signed copy, inscription…)", hint: "Shown when the book has extras." },
  { type: "giftCard", label: "Gift card details", hint: "Shown for gift cards." },
  { type: "buy", label: "Quantity, Add to bag, wishlist & share", hint: "Always shown — shoppers need it to buy.", required: true },
  { type: "backInStock", label: "Back-in-stock sign-up", hint: "Shown when sold out and Notify me when back in stock is on." },
  { type: "details", label: "Description & details (Sections layout)", hint: "Shown when Product details layout is Sections." },
];

export const CUSTOM_BLOCKS: { type: CustomBlockType; label: string; defaults: Record<string, any> }[] = [
  { type: "text", label: "Text", defaults: { text: "Add a short note about this book." } },
  { type: "collapsible", label: "Collapsible note", defaults: { heading: "Shipping & returns", body: "Ships in 2–3 working days." } },
  { type: "badge", label: "Badge", defaults: { label: "Staff pick", tone: "accent" } },
  { type: "lookInside", label: "Look inside link", defaults: { label: "Look inside", link: "" } },
  { type: "customField", label: "Book detail", defaults: { fieldKey: "", label: "" } },
];

const BUILT_IN = new Set<string>(BUILT_IN_BLOCKS.map(b => b.type));
const CUSTOM = new Set<string>(CUSTOM_BLOCKS.map(b => b.type));
export const isBuiltIn = (type: string): type is BuiltInBlockType => BUILT_IN.has(type);
export const isRequired = (type: string) => BUILT_IN_BLOCKS.some(b => b.type === type && b.required);
export const blockLabel = (block: ProductBlock) =>
  block.type === "divider" ? "Divider" : BUILT_IN_BLOCKS.find(b => b.type === block.type)?.label || CUSTOM_BLOCKS.find(b => b.type === block.type)?.label || block.type;

export const MAX_PRODUCT_BLOCKS = 40;

/** The card exactly as it was hand-written: three sections split by dividers. */
export const DEFAULT_PRODUCT_BLOCKS: ProductBlock[] = [
  { id: "tag", type: "tag" }, { id: "heading", type: "heading" }, { id: "price", type: "price" },
  { id: "divider-1", type: "divider" },
  { id: "formats", type: "formats" }, { id: "boxSet", type: "boxSet" }, { id: "addOns", type: "addOns" },
  { id: "giftCard", type: "giftCard" }, { id: "buy", type: "buy" }, { id: "backInStock", type: "backInStock" },
  { id: "divider-2", type: "divider" },
  { id: "details", type: "details" },
];

/**
 * The list to render: unknown types and duplicate built-ins dropped, required blocks (title, Add to bag) always present
 * and never hidden, capped. Built-ins missing from a saved list are added back hidden at the end, so a block added to the
 * shop later never silently appears on a list the owner arranged.
 */
export function productBlocks(design: any): ProductBlock[] {
  const saved = design?.productInfoBlocks;
  if (!Array.isArray(saved) || !saved.length) return DEFAULT_PRODUCT_BLOCKS;
  const seen = new Set<string>();
  const out: ProductBlock[] = [];
  for (const raw of saved) {
    if (!raw || typeof raw !== "object" || typeof raw.type !== "string") continue;
    const type = raw.type as ProductBlockType;
    if (type !== "divider" && !isBuiltIn(type) && !CUSTOM.has(type)) continue;
    if (isBuiltIn(type)) { if (seen.has(type)) continue; seen.add(type); }
    const id = typeof raw.id === "string" && raw.id ? raw.id : `${type}-${out.length}`;
    out.push({ id, type, ...(raw.hidden && !isRequired(type) ? { hidden: true } : {}), ...(raw.settings && typeof raw.settings === "object" ? { settings: raw.settings } : {}) });
    if (out.length >= MAX_PRODUCT_BLOCKS) break;
  }
  for (const def of DEFAULT_PRODUCT_BLOCKS) {
    if (!isBuiltIn(def.type) || seen.has(def.type)) continue;
    // A missing title goes first and a missing Add to bag last; any other missing built-in waits, hidden, at the end.
    if (def.type === "heading") out.unshift({ ...def });
    else out.push(isRequired(def.type) ? { ...def } : { ...def, hidden: true });
  }
  return out;
}

/** Card sections: the blocks between dividers (empty sections are dropped by the renderer). */
export function cardSections(blocks: ProductBlock[]): ProductBlock[][] {
  const sections: ProductBlock[][] = [[]];
  for (const b of blocks) {
    if (b.type === "divider") { if (sections[sections.length - 1].length) sections.push([]); continue; }
    if (!b.hidden) sections[sections.length - 1].push(b);
  }
  return sections.filter(s => s.length);
}

/**
 * Ruled rows (Style › Book page · buy box & details › Ruled rows, `pdpRuledRows`, on by default): the category tag, the
 * title and the price each get their own ruled row instead of sharing the first part of the card.
 */
const OWN_ROW = new Set<ProductBlockType>(["tag", "heading", "price"]);
export function ruledSections(sections: ProductBlock[][]): ProductBlock[][] {
  const out: ProductBlock[][] = [];
  for (const section of sections) {
    let run: ProductBlock[] = [];
    for (const b of section) {
      if (OWN_ROW.has(b.type)) { if (run.length) out.push(run); out.push([b]); run = []; }
      else run.push(b);
    }
    if (run.length) out.push(run);
  }
  return out;
}

// ── pure edits (Studio › Page layout › Buy box blocks) ────────────────────────────────────────────
const newId = (type: string) => `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addBlock(list: ProductBlock[], type: CustomBlockType | "divider", at = list.length): { list: ProductBlock[]; id: string } {
  const def = CUSTOM_BLOCKS.find(b => b.type === type);
  const block: ProductBlock = { id: newId(type), type, ...(def ? { settings: { ...def.defaults } } : {}) };
  const index = Math.max(0, Math.min(list.length, at));
  return { list: [...list.slice(0, index), block, ...list.slice(index)], id: block.id };
}
export function moveBlock(list: ProductBlock[], id: string, by: number): ProductBlock[] {
  const i = list.findIndex(b => b.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function toggleBlock(list: ProductBlock[], id: string): ProductBlock[] {
  return list.map(b => (b.id === id && !isRequired(b.type) ? (b.hidden ? (({ hidden: _h, ...rest }) => rest)(b) : { ...b, hidden: true }) : b));
}
export function updateBlock(list: ProductBlock[], id: string, patch: Record<string, any>): ProductBlock[] {
  return list.map(b => (b.id === id ? { ...b, settings: { ...(b.settings || {}), ...patch } } : b));
}
/** Only added blocks and dividers can be removed; built-in ones are hidden instead. */
export function removeBlock(list: ProductBlock[], id: string): ProductBlock[] {
  return list.filter(b => b.id !== id || isBuiltIn(b.type));
}
