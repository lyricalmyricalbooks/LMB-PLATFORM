// The page structure Studio lists in its Page panel: what the preview actually rendered, grouped
// as Header · Page · Footer · Pop-ups. The preview bridge scans the live DOM (sections, built-in
// regions and click-to-edit targets in document order) and sends it as STRUCTURE; this module turns
// that flat scan into a small tree. Pure — no DOM, no React — so it is easy to test.

export type Zone = "header" | "main" | "footer" | "overlay";
export type StructureNode = {
  key: string; label: string; target: string; region: string; section: string;
  parent: string; zone: Zone; hidden: boolean; count: number;
};
export type StructureItem = {
  key: string; label: string; target: string; region: string;
  hidden: boolean; count: number; children: StructureItem[];
};
export type PageStructure = {
  header: StructureItem[];
  /** Built-in parts of the page body (sections are listed separately, in the outline). */
  main: StructureItem[];
  footer: StructureItem[];
  overlay: StructureItem[];
  /** Whole-page wrappers ("Page background, colours & fonts") — settings, not places. */
  page: StructureItem[];
  /** Section ids in the order the preview rendered them. */
  sections: string[];
};

const ZONES: Zone[] = ["header", "main", "footer", "overlay"];
const MAX_NODES = 800;
const str = (v: unknown, max = 300) => typeof v === "string" ? v.slice(0, max) : "";

/** Validates a STRUCTURE message from the preview; anything malformed is dropped. */
export function readStructure(raw: unknown): StructureNode[] | null {
  if (!Array.isArray(raw)) return null;
  const out: StructureNode[] = [];
  for (const n of raw.slice(0, MAX_NODES)) {
    if (!n || typeof n !== "object") continue;
    const key = str((n as any).key);
    if (!/^[srt]:/.test(key)) continue;
    const zone = ZONES.includes((n as any).zone) ? (n as any).zone as Zone : "main";
    out.push({
      key, zone, label: str((n as any).label, 120), target: str((n as any).target), region: str((n as any).region, 80),
      section: str((n as any).section, 120), parent: str((n as any).parent), hidden: (n as any).hidden === true,
      count: Math.max(1, Math.min(9999, Number((n as any).count) || 1)),
    });
  }
  return out;
}

/** A readable name for a node with no label of its own. */
export function structureLabel(n: Pick<StructureNode, "label" | "region" | "target">): string {
  if (n.label) return n.label;
  if (n.region) return n.region.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
  return n.target.split("|")[0] || "Element";
}

export function buildPageStructure(nodes: StructureNode[]): PageStructure {
  const byKey = new Map(nodes.map(n => [n.key, n]));
  const isSection = (n?: StructureNode) => Boolean(n?.section);
  // Parts drawn inside a section belong to that section; the outline already lists it.
  const insideSection = (n: StructureNode) => {
    for (let p = byKey.get(n.parent), guard = 0; p && guard < 50; p = byKey.get(p.parent), guard++) if (isSection(p)) return true;
    return false;
  };
  // A wrapper holds sections, or is a page-body element holding the header, footer or a pop-over
  // (the whole storefront root): it is a page-wide setting, not a place on the page.
  const wrappers = new Set<string>();
  for (const n of nodes) {
    for (let p = byKey.get(n.parent), guard = 0; p && guard < 50; p = byKey.get(p.parent), guard++) {
      if (isSection(n) || (p.zone === "main" && n.zone !== "main")) wrappers.add(p.key);
    }
  }
  const items = new Map<string, StructureItem>();
  const out: PageStructure = { header: [], main: [], footer: [], overlay: [], page: [], sections: [] };
  for (const n of nodes) {
    if (isSection(n)) { out.sections.push(n.section); continue; }
    if (insideSection(n)) continue;
    const item: StructureItem = { key: n.key, label: structureLabel(n), target: n.target, region: n.region, hidden: n.hidden, count: n.count, children: [] };
    items.set(n.key, item);
    if (wrappers.has(n.key)) { out.page.push(item); continue; }
    // Nest under the nearest listed ancestor in the same zone; otherwise it is a top-level part.
    let parent: StructureItem | undefined;
    for (let p = byKey.get(n.parent), guard = 0; p && guard < 50; p = byKey.get(p.parent), guard++) {
      if (p.zone !== n.zone || wrappers.has(p.key)) break;
      parent = items.get(p.key);
      if (parent) break;
    }
    (parent ? parent.children : out[n.zone]).push(item);
  }
  return out;
}

/** Every key in a tree (for "is this still on the page?" checks). */
export function structureKeys(items: StructureItem[]): string[] {
  return items.flatMap(i => [i.key, ...structureKeys(i.children)]);
}

/** Pop-overs Studio can open in the preview, whether or not they are open right now. */
export const STUDIO_OVERLAYS = [
  { id: "cart" as const, label: "Shopping bag", target: "style:cartDrawer|copy:Cart" },
  { id: "search" as const, label: "Search", target: "copy:Search & filters" },
  { id: "popup" as const, label: "Pop-up", target: "style:popup|copy:Sections" },
  // Shown in the preview even after this browser answered it (the answer is never changed from the preview).
  { id: "cookie" as const, label: "Cookie banner", target: "style:overlayLayout|copy:Cookie banner" },
];

/** The click-to-edit target to open for a structure item: the first style target, else the first one. */
export function primaryTarget(target: string): string {
  const list = target.split("|").filter(Boolean);
  return list.find(t => t.startsWith("style:")) || list[0] || "";
}

const ZONE_NAMES: Record<string, string> = { header: "Header", main: "Page", footer: "Footer", overlay: "Pop-ups", page: "Page" };

/** Where a part sits, for the inspector's breadcrumb: its zone, then the parts around it. */
export function structurePath(structure: PageStructure | null, key: string): string[] {
  if (!structure) return [];
  const walk = (items: StructureItem[], trail: string[]): string[] | null => {
    for (const item of items) {
      if (item.key === key) return trail;
      const inner = walk(item.children, [...trail, item.label]);
      if (inner) return inner;
    }
    return null;
  };
  for (const zone of ["header", "main", "footer", "overlay", "page"] as const) {
    const found = walk(structure[zone], [ZONE_NAMES[zone]]);
    if (found) return found;
  }
  return [];
}
