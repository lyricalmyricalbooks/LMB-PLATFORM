// Studio Health (3.3): checks the page the preview actually rendered — the same-origin iframe document — for things a
// shopper would notice: hard-to-read text, pictures without a description, tiny tap targets, broken or empty links,
// heading order, heavy or oversized pictures, failed fonts, page size and the basics search engines read. Each finding
// names the part of the page it belongs to (the same keys the preview bridge uses), so Studio can show it and open its
// settings. Pure DOM reading: nothing in the preview is changed.

export type HealthCategory = "contrast" | "images" | "links" | "tap" | "headings" | "performance" | "fonts" | "seo";
export type HealthSeverity = "issue" | "tip";
/** The editable part a finding belongs to: a section ("s:<id>") or a built-in part (as the preview bridge keys it). */
export type HealthOwner = { key: string; label: string; target: string; region: string; sectionId?: string };
export type HealthFinding = {
  id: string;
  category: HealthCategory;
  severity: HealthSeverity;
  title: string;
  detail: string;
  /** How many places on the page share this finding. */
  count: number;
  owner: HealthOwner | null;
  /** The first element it was found on (for "Show me"); never serialised. */
  element?: Element | null;
};
export type HealthOptions = {
  /** Touch devices get 44 px tap targets; desktop the WCAG minimum of 24 px. */
  device?: "desktop" | "tablet" | "mobile";
  /** The site's sub-path (import.meta.env.BASE_URL), stripped before matching shop routes. */
  base?: string;
  /** Slugs that exist, to find links to missing books, pages and collections. Omit a set to skip that check. */
  known?: { books?: Set<string>; pages?: Set<string>; collections?: Set<string> };
  /** Most findings of one kind listed separately before they're folded together. */
  perKind?: number;
};

export const CATEGORY_LABELS: Record<HealthCategory, string> = {
  contrast: "Easy to read", images: "Pictures", links: "Links", tap: "Easy to tap", headings: "Headings",
  performance: "Speed", fonts: "Fonts", seo: "Search & sharing",
};

const SECTION = "[data-fm-section],[data-section-id]";
const NODE = `${SECTION},[data-studio-target],[data-store-region]`;
const SKIP = "[data-studio-overlay],script,style,noscript,template,svg title";
const INTERACTIVE = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox]";

// ── colour maths (WCAG 2.x) ─────────────────────────────────────────────────────────────────────
type RGBA = [number, number, number, number];
export function parseColor(value: string | null | undefined): RGBA | null {
  const v = String(value || "").trim().toLowerCase();
  if (!v || v === "transparent") return v === "transparent" ? [0, 0, 0, 0] : null;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  if (v === "white") return [255, 255, 255, 1];
  if (v === "black") return [0, 0, 0, 1];
  return null;
}
const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top[3] + bottom[3] * (1 - top[3]);
  if (a <= 0) return [0, 0, 0, 0];
  const mix = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
  return [mix(0), mix(1), mix(2), a];
};
const luminance = ([r, g, b]: RGBA) => {
  const ch = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
export function contrastRatio(a: RGBA, b: RGBA): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const hex = ([r, g, b]: RGBA) => `#${[r, g, b].map(c => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
const sid = (n: Element) => n.getAttribute("data-fm-section") || n.getAttribute("data-section-id") || "";
/** Same keys as the preview bridge's nodeKey, so Studio can select the part. */
export function ownerOf(el: Element | null): HealthOwner | null {
  const n = el?.closest?.(NODE);
  if (!n) return null;
  const s = sid(n);
  const label = n.getAttribute("data-studio-label") || (s ? "Section" : "");
  const target = n.getAttribute("data-studio-target") || "";
  const region = n.getAttribute("data-store-region") || "";
  const key = s ? `s:${s}` : region ? `r:${region}` : `t:${target}|${n.getAttribute("data-studio-label") || ""}`;
  return { key, label, target, region, ...(s ? { sectionId: s } : {}) };
}
const textOf = (n: Element) => (n.textContent || "").replace(/\s+/g, " ").trim();
const clip = (t: string, max = 50) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label") || el.getAttribute("title") || "";
  if (aria.trim()) return aria.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const text = labelledby.split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.textContent || "").join(" ").trim();
    if (text) return text;
  }
  if (el.matches("input,select,textarea")) {
    const id = el.getAttribute("id");
    const label = (id && Array.from(el.ownerDocument.querySelectorAll("label[for]")).find(l => l.getAttribute("for") === id)) || el.closest("label");
    return (label?.textContent || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || "").trim();
  }
  const imgAlt = Array.from(el.querySelectorAll("img[alt]")).map(i => i.getAttribute("alt") || "").join(" ").trim();
  return (textOf(el) || imgAlt).trim();
}

/** Runs every check on the page the preview shows. */
export function auditDocument(doc: Document, win: Window = doc.defaultView as Window, opts: HealthOptions = {}): HealthFinding[] {
  const out: HealthFinding[] = [];
  const perKind = opts.perKind ?? 4;
  const style = (el: Element) => win.getComputedStyle(el);
  const skip = (el: Element) => !!el.closest(SKIP);
  // Visible = no hidden ancestor (cached, so the page is walked once) and a box on screen.
  const styleVisible = new Map<Element, boolean>();
  const visibleByStyle = (n: Element | null): boolean => {
    if (!n || n === doc.documentElement) return true;
    const known = styleVisible.get(n);
    if (known !== undefined) return known;
    const cs = style(n);
    const value = cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0" && visibleByStyle(n.parentElement);
    styleVisible.set(n, value);
    return value;
  };
  const shown = (el: Element) => {
    if (!visibleByStyle(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Folds repeats: up to `perKind` separate entries per kind, then one entry counting the rest.
  const kinds = new Map<string, HealthFinding[]>();
  const add = (kind: string, f: Omit<HealthFinding, "id" | "count"> & { groupKey?: string }) => {
    const list = kinds.get(kind) || [];
    const same = list.find(x => x.id === `${kind}:${f.groupKey ?? f.owner?.key ?? ""}`);
    if (same) { same.count++; return; }
    if (list.length >= perKind) { list[list.length - 1].count++; list[list.length - 1].detail = list[list.length - 1].detail.replace(/( Also on other parts of the page\.)?$/, " Also on other parts of the page."); return; }
    const { groupKey, ...rest } = f;
    const finding = { ...rest, id: `${kind}:${groupKey ?? f.owner?.key ?? ""}`, count: 1 };
    list.push(finding); kinds.set(kind, list); out.push(finding);
  };
  const body = doc.body;
  if (!body) return out;
  const all = Array.from(body.querySelectorAll("*")).filter(el => !skip(el));

  // Contrast: elements with their own text.
  const page = parseColor(style(body).backgroundColor);
  const canvas: RGBA = page && page[3] > 0 ? over(page, [255, 255, 255, 1]) : [255, 255, 255, 1];
  const backgroundOf = (el: Element): RGBA | null => {
    const layers: RGBA[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = style(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // a picture behind the text: can't measure
      const c = parseColor(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    return layers.reduceRight<RGBA>((acc, layer) => over(layer, acc), canvas);
  };
  let measured = 0;
  for (const el of all) {
    if (measured > 2500) break;
    const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.nodeValue || "").trim());
    if (!ownText || !shown(el)) continue;
    measured++;
    const cs = style(el);
    const fg = parseColor(cs.color), bg = backgroundOf(el);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(over(fg, bg), bg);
    const size = parseFloat(cs.fontSize) || 16, weight = Number(cs.fontWeight) || (cs.fontWeight === "bold" ? 700 : 400);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio >= need) continue;
    const owner = ownerOf(el);
    add("contrast", {
      category: "contrast", severity: ratio < need - 1 ? "issue" : "tip", owner, element: el,
      groupKey: `${owner?.key || ""}|${hex(fg)}|${hex(bg)}`,
      title: `Hard to read: “${clip(textOf(el), 40)}”`,
      detail: `${hex(over(fg, bg))} text on ${hex(bg)} has a contrast of ${ratio.toFixed(1)}:1; ${large ? "large" : "normal-size"} text needs at least ${need}:1. Darken or lighten the text or its background${owner ? ` (Edit this part › Style)` : ""}.`,
    });
  }

  // Pictures: descriptions, size on screen vs file, and file weight.
  const dpr = win.devicePixelRatio || 1;
  const viewport = win.innerHeight || 800;
  let totalImageBytes = 0;
  let firstScreen: { img: Element; area: number } | null = null;
  for (const img of Array.from(body.querySelectorAll("img")).filter(i => !skip(i))) {
    if (!shown(img)) continue;
    const owner = ownerOf(img);
    if (!img.hasAttribute("alt")) {
      add("alt", { category: "images", severity: "issue", owner, element: img, title: "A picture has no description",
        detail: "Screen readers can't describe it. Add a description (alt text) in the picture's field, or in Media for library pictures." });
    }
    const el = img as HTMLImageElement;
    const shownWidth = img.getBoundingClientRect().width;
    if (el.complete && el.naturalWidth > 0 && shownWidth > 0) {
      if (el.naturalWidth > shownWidth * dpr * 2.5 && el.naturalWidth > 1200 && !el.srcset) {
        add("oversize", { category: "performance", severity: "tip", owner, element: img, title: "A picture is much bigger than it's shown",
          detail: `It's ${el.naturalWidth} px wide but shown at about ${Math.round(shownWidth)} px. Pick it from the Media library (which makes smaller copies) or upload a smaller file.` });
      } else if (el.naturalWidth < shownWidth * 0.75) {
        add("blurry", { category: "images", severity: "tip", owner, element: img, title: "A picture may look blurry",
          detail: `It's ${el.naturalWidth} px wide but shown at about ${Math.round(shownWidth)} px. Upload a larger picture.` });
      }
    }
    const src = el.currentSrc || el.src;
    const entry = src ? (win.performance?.getEntriesByName?.(src)?.[0] as PerformanceResourceTiming | undefined) : undefined;
    const bytes = entry ? entry.encodedBodySize || entry.transferSize || 0 : 0;
    if (bytes > 400_000) {
      add("heavy", { category: "performance", severity: bytes > 1_000_000 ? "issue" : "tip", owner, element: img, groupKey: src,
        title: `A heavy picture (${Math.round(bytes / 1024)} KB)`,
        detail: "Large files slow the page on phones. Pick it from the Media library, which stores smaller copies, or save it smaller before uploading." });
    }
    totalImageBytes += bytes;
    // Layout jumps (CLS): without width/height (or a CSS aspect ratio) the page shifts when the picture arrives.
    // Pictures that fill a frame of their own (absolutely placed, object-fit, or a parent with a set shape) can't jump.
    const ics = style(img);
    const parentRatio = img.parentElement ? style(img.parentElement).aspectRatio : "";
    const framed = ics.position === "absolute" || ics.position === "fixed" || (ics.objectFit && ics.objectFit !== "fill")
      || (ics.aspectRatio && ics.aspectRatio !== "auto") || (parentRatio && parentRatio !== "auto");
    if (!img.hasAttribute("width") && !img.hasAttribute("height") && !framed) {
      add("jump", { category: "performance", severity: "tip", owner, element: img,
        title: "A picture may make the page jump while loading",
        detail: "It has no size set, so text below moves when it arrives. Pick it from the Media library (it records the size), or use a section that sets the picture's shape." });
    }
    // The main picture (LCP): the largest one in the first screenful should load straight away, not lazily.
    const r = img.getBoundingClientRect();
    if (r.top < viewport && r.bottom > 0 && r.width * r.height > (firstScreen?.area || 0)) firstScreen = { img, area: r.width * r.height };
  }
  if (firstScreen && firstScreen.img.getAttribute("loading") === "lazy" && firstScreen.area > 40_000) {
    add("lcp", { category: "performance", severity: "tip", owner: ownerOf(firstScreen.img), element: firstScreen.img,
      title: "The main picture at the top loads late",
      detail: "The biggest picture people see first is set to load lazily, which delays the page's main picture. Put it in the page's first section (the first section's pictures load straight away)." });
  }
  if (totalImageBytes > 3_000_000) {
    add("weight", { category: "performance", severity: "tip", owner: null,
      title: `Pictures on this page add up to ${(totalImageBytes / 1_000_000).toFixed(1)} MB`,
      detail: "That's a lot to download on a phone connection. Use the Media library's smaller copies, or fewer large pictures." });
  }
  // The browser's own measure of when the main content appeared, when it's available (Chrome); the preview is slower
  // than the live shop because Studio runs alongside it, so this is only a hint.
  const lcp = (win.performance?.getEntriesByType?.("largest-contentful-paint") || []).slice(-1)[0] as any;
  if (lcp && lcp.startTime > 2500) {
    add("lcpTime", { category: "performance", severity: "tip", owner: lcp.element ? ownerOf(lcp.element) : null, element: lcp.element || null,
      title: `The main content took ${(lcp.startTime / 1000).toFixed(1)} s to appear in the preview`,
      detail: "Google aims for under 2.5 s. Smaller pictures near the top and fewer fonts help most. (The preview is slower than the live shop, so treat this as a hint.)" });
  }

  // Links and buttons: a name for screen readers, somewhere to go, and pages that exist.
  const base = (opts.base || "/").replace(/\/?$/, "/");
  const origin = win.location?.origin || "";
  for (const el of Array.from(body.querySelectorAll("a,button,[role=button]")).filter(e => !skip(e))) {
    if (!shown(el)) continue;
    const owner = ownerOf(el);
    const kind = el.matches("a") ? "link" : "button";
    if (!accessibleName(el)) {
      add("noname", { category: "links", severity: "issue", owner, element: el, title: `A ${kind} has no name`,
        detail: `Screen readers announce it as just “${kind}”. Give it visible words, or a description for its icon or picture.` });
    }
    if (!el.matches("a")) continue;
    const raw = (el.getAttribute("href") ?? "").trim();
    if (!el.hasAttribute("href") || raw === "" || raw === "#") {
      add("nowhere", { category: "links", severity: "issue", owner, element: el, title: `A link goes nowhere: “${clip(accessibleName(el) || "link", 40)}”`,
        detail: "Its address is empty. Choose a page, book or collection for it." });
      continue;
    }
    if (!opts.known) continue;
    let url: URL;
    try { url = new URL(raw, win.location?.href || "http://localhost/"); } catch { continue; }
    if (url.origin !== origin) continue;
    let path = url.pathname;
    if (path.startsWith(base)) path = `/${path.slice(base.length)}`;
    const m = /^\/(books|page|collections)\/([^/?#]+)\/?$/.exec(path);
    if (!m) continue;
    const slug = decodeURIComponent(m[2]);
    const set = m[1] === "books" ? opts.known.books : m[1] === "page" ? opts.known.pages : opts.known.collections;
    if (!set || set.has(slug)) continue;
    add("broken", { category: "links", severity: "issue", owner, element: el, groupKey: path,
      title: `A link leads to a missing ${m[1] === "books" ? "book" : m[1] === "page" ? "page" : "collection"}`,
      detail: `“${clip(accessibleName(el) || raw, 40)}” goes to ${path}, which doesn't exist (or isn't published). Choose it again with the link picker.` });
  }

  // Tap targets.
  const touch = opts.device === "mobile" || opts.device === "tablet";
  const min = touch ? 44 : 24;
  for (const el of Array.from(body.querySelectorAll(INTERACTIVE)).filter(e => !skip(e))) {
    if (!shown(el) || (el as HTMLInputElement).type === "hidden") continue;
    // Links inside a sentence are exempt (WCAG target size exception).
    if (el.matches("a") && el.parentElement && textOf(el.parentElement).length > textOf(el).length + 12) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= min && r.height >= min) continue;
    const owner = ownerOf(el);
    add("tap", { category: "tap", severity: touch && (r.width < 24 || r.height < 24) ? "issue" : "tip", owner, element: el,
      title: `Small to ${touch ? "tap" : "click"}: “${clip(accessibleName(el) || el.tagName.toLowerCase(), 40)}”`,
      detail: `It's ${Math.round(r.width)}×${Math.round(r.height)} px; ${touch ? "fingers need about 44×44 px" : "aim for at least 24×24 px"}. Add padding${owner ? " (Edit this part › Layout)" : ""}.` });
  }

  // Headings.
  const headings = Array.from(body.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(h => !skip(h) && shown(h));
  const h1s = headings.filter(h => h.tagName === "H1");
  if (!h1s.length) add("h1", { category: "headings", severity: "tip", owner: null, title: "The page has no main heading",
    detail: "Search engines and screen readers use one main heading (H1) to know what a page is about. A Hero section's title is one: add a Hero section near the top." });
  else if (h1s.length > 1) add("h1", { category: "headings", severity: "tip", owner: ownerOf(h1s[1]), element: h1s[1], title: `${h1s.length} main headings on one page`,
    detail: "One main heading (H1) is clearest. Make the others smaller headings in their section's Style." });
  let previous = 0;
  for (const h of headings) {
    const level = Number(h.tagName.slice(1));
    if (previous && level > previous + 1) {
      add("skip", { category: "headings", severity: "tip", owner: ownerOf(h), element: h, groupKey: `${previous}-${level}`,
        title: `Heading levels jump from H${previous} to H${level}`,
        detail: `“${clip(textOf(h), 40)}” skips a level, which makes the page outline harder to follow with a screen reader.` });
    }
    previous = level;
  }

  // Fonts.
  const fonts = (doc as any).fonts as FontFaceSet | undefined;
  if (fonts && typeof (fonts as any).forEach === "function") {
    const families = new Set<string>();
    (fonts as any).forEach((face: FontFace) => {
      const family = String(face.family || "").replace(/["']/g, "");
      if (face.status === "error") add("fontfail", { category: "fonts", severity: "issue", owner: null, groupKey: family, title: `The font “${family}” didn't load`,
        detail: "Text falls back to another font. Choose it again in Theme settings › Typography." });
      if (face.status === "loaded") families.add(family);
    });
    if (families.size > 4) add("fontcount", { category: "fonts", severity: "tip", owner: null, title: `${families.size} fonts on one page`,
      detail: "Every font is a separate download. Two or three families usually look calmer and load faster." });
  }

  // Page size.
  const count = all.length;
  if (count > 1500) add("dom", { category: "performance", severity: count > 3000 ? "issue" : "tip", owner: null, title: `A large page (${count} parts)`,
    detail: "Very long pages take longer to show on phones. Consider fewer sections, or fewer books per grid." });

  // Search & sharing basics (the preview itself is never indexed).
  if (!doc.title.trim()) add("title", { category: "seo", severity: "issue", owner: null, title: "The page has no title",
    detail: "The title shows in browser tabs and search results. Set it in Text & labels › Site & sharing, or the page's own title." });
  const description = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || "";
  if (!description) add("desc", { category: "seo", severity: "tip", owner: null, title: "No search description",
    detail: "Search results show a short description under the title. Add one in Text & labels › Site & sharing." });
  else if (description.length > 160) add("desc", { category: "seo", severity: "tip", owner: null, title: "The search description is long",
    detail: `It's ${description.length} characters; search results usually cut it at about 155.` });

  const rank = (f: HealthFinding) => (f.severity === "issue" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

export function summarise(findings: HealthFinding[]) {
  const issues = findings.filter(f => f.severity === "issue").reduce((n, f) => n + f.count, 0);
  const tips = findings.filter(f => f.severity === "tip").reduce((n, f) => n + f.count, 0);
  return { issues, tips, text: !issues && !tips ? "No problems found on this page." : [issues && `${issues} issue${issues === 1 ? "" : "s"}`, tips && `${tips} suggestion${tips === 1 ? "" : "s"}`].filter(Boolean).join(" · ") };
}
