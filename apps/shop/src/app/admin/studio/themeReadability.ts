// The readability check (plan 1.25): under every theme, the words every section and book page block draws stay
// readable. Two parts, both pure:
//   - `themeColourPairs`: the colour pairs the shop paints words with (page, cards, buttons, tags, header,
//     announcement bar, footer, bag, the book page's buy box, every colour scheme), with the same fallbacks the
//     storefront uses for an unset key, so a theme that leaves a key empty is checked against what shoppers see.
//   - `markupProblems`: walks rendered markup (a section, a book page) and checks every piece of text against the
//     colour behind it, from inline styles and the storefront's colour classes (`colorUtilityCss`), resolving the
//     shop's colour variables and see-through layers. Text over a picture is skipped: its background is the picture.
// `themeReadability.test.tsx` renders every section and book page block under every theme with both.
import { contrastRatio, resolveScheme, schemeList } from "../../features/site/colorSchemes";
import { buildStorefrontTokenVars, colorUtilityCss } from "../../features/site/themeTokens";

/** Body text needs 4.5:1 (WCAG AA); big headings and the bold capitals on buttons and tags need 3:1. */
export const BODY = 4.5;
export const LARGE = 3;

export type ColourPair = { part: string; text: string; on: string; min: number };

const set = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const pick = (...values: unknown[]) => values.find(set) as string;
const fmt = (n: number) => `${Math.round(n * 10) / 10}:1`;

/** The storefront's colour variables for this design (`--fg-rgb`, `--accent`, `--surface`, …) plus `--bg-color`. */
export function colourTokens(design: any): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of buildStorefrontTokenVars(design || {}).split("\n")) {
    const m = /^\s*(--[\w-]+):\s*(.+?);\s*$/.exec(line);
    if (m) vars[m[1]] = m[2];
  }
  // As MainSite / StorefrontThemeStyle set them.
  vars["--bg-color"] = pick(design?.backgroundColor, "#000000");
  vars["--background"] = vars["--bg-color"];
  vars["--text"] = pick(design?.textColor, "#ffffff");
  vars["--text-color"] = vars["--text"];
  vars["--btn-bg"] = pick(design?.buttonColor, design?.primaryColor, "#e8402a");
  vars["--btn-text"] = pick(design?.buttonTextColor, "#100f0d");
  return vars;
}

/** Replace `var(--x, fallback)` with the token's value (or the fallback), repeatedly; null when one stays unknown. */
export function resolveColour(value: string, tokens: Record<string, string>): string | null {
  let out = String(value || "").replace(/!important/g, "").trim();
  for (let i = 0; i < 8 && out.includes("var("); i++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, name: string, fallback?: string) =>
      tokens[name] ?? (fallback !== undefined ? fallback.trim() : "\u0000"));
  }
  if (out.includes("\u0000") || out.includes("var(")) return null;
  // max(0.4, 0.35) in an alpha (faint text's readable floor, themeTokens `--fg-faint`).
  out = out.replace(/max\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g, (_m, a: string, b: string) => String(Math.max(Number(a), Number(b))));
  return contrastRatio("#000000", out) === null ? null : out;
}

/** Every colour pair the shop paints words with under this design, with the storefront's own fallbacks. */
export function themeColourPairs(design: any): ColourPair[] {
  const d = design || {};
  const tokens = colourTokens(d);
  const tok = (name: string) => tokens[name];
  const text = tok("--text"), bg = tok("--bg-color"), muted = tok("--muted"), surface = tok("--surface");
  const accent = tok("--accent");
  const buttonBg = tok("--btn-bg"), buttonText = tok("--btn-text");
  const cardBg = pick(d.pdpCardBg, surface);
  const pairs: ColourPair[] = [
    { part: "Body text on the page", text, on: bg, min: BODY },
    { part: "Secondary text on the page", text: muted, on: bg, min: BODY },
    { part: "Text on cards and boxes", text, on: surface, min: BODY },
    { part: "Text on raised boxes", text, on: tok("--surface-2"), min: BODY },
    { part: "Links and highlights on the page", text: accent, on: bg, min: LARGE },
    { part: "Button words", text: buttonText, on: buttonBg, min: LARGE },
    { part: "Button words when pointed at", text: pick(d.buttonHoverTextColor, buttonText), on: pick(d.buttonHoverBgColor, buttonBg), min: LARGE },
    { part: "Selected tab or option", text: tok("--active-fg"), on: tok("--active-bg"), min: BODY },
    { part: "Sale tag", text: pick(d.badgeTextPrimary, "#100f0d"), on: pick(d.badgeBgPrimary, accent), min: LARGE },
    { part: "Second tag", text: pick(d.badgeTextSecondary, text), on: pick(d.badgeBgSecondary, surface), min: LARGE },
    { part: "Header words", text: pick(d.headerColor, text), on: pick(d.headerBg, bg), min: BODY },
    { part: "Logo words", text: pick(d.logoColor, d.headerColor, text), on: pick(d.headerBg, bg), min: LARGE },
    { part: "Footer words", text: pick(d.footerTextColor, text), on: pick(d.footerBg, bg), min: BODY },
    { part: "Shopping bag words", text: pick(d.cartDrawerText, text), on: pick(d.cartDrawerBg, bg), min: BODY },
    { part: "Shopping bag small print", text: pick(d.cartDrawerMuted, muted), on: pick(d.cartDrawerBg, bg), min: BODY },
    { part: "Book page buy box words", text, on: cardBg, min: BODY },
    { part: "Book page small print", text: pick(d.pdpMetaColor, muted), on: cardBg, min: BODY },
    { part: "Book page format choices", text: pick(d.pdpChipTextColor, muted), on: cardBg, min: BODY },
    { part: "Book page chosen format", text: pick(d.pdpChipActiveText, tok("--active-fg")), on: pick(d.pdpChipActiveBg, tok("--active-bg")), min: BODY },
    { part: "Book page open tab", text: pick(d.pdpTabActiveText, tok("--active-fg")), on: pick(d.pdpTabActiveBg, tok("--active-bg")), min: BODY },
    { part: "Checkout words", text, on: pick(d.checkoutBgColor, bg), min: BODY },
  ];
  if (d.showAnnouncement !== false) {
    pairs.push({ part: "Announcement bar", text: pick(d.announcementColor, tok("--on-accent")), on: pick(d.announcementBg, accent), min: BODY });
  }
  for (const scheme of schemeList(d)) {
    const s = resolveScheme(scheme);
    const label = `Colour scheme “${scheme.name || scheme.id}”`;
    pairs.push(
      { part: `${label}: text`, text: s.text, on: s.background, min: BODY },
      { part: `${label}: button words`, text: s.buttonText, on: s.buttonBg, min: LARGE },
      { part: `${label}: words on the accent`, text: s.onAccent, on: s.accent, min: LARGE },
    );
  }
  return pairs.map((p) => ({ ...p, text: resolveColour(p.text, tokens) || p.text, on: resolveColour(p.on, tokens) || p.on }));
}

/** The pairs that fall short, in plain words. */
export function pairProblems(pairs: ColourPair[], where: string): string[] {
  const out: string[] = [];
  for (const p of pairs) {
    const ratio = contrastRatio(p.text, p.on);
    if (ratio === null) out.push(`${where}: ${p.part} can't be checked (${p.text} on ${p.on})`);
    else if (ratio < p.min) out.push(`${where}: ${p.part} is hard to read (${fmt(ratio)}, needs ${fmt(p.min)}: ${p.text} on ${p.on})`);
  }
  return out;
}

type Paint = { color?: string; background?: string; picture?: boolean; opacity?: number };

/** What an element paints: its colour classes first (as the storefront re-points them), then its inline style. */
function paintOf(el: Element): Paint {
  const out: Paint = {};
  const take = (prop: string, value: string) => {
    value = value.replace(/!important/g, "").trim();
    if (prop === "color") out.color = value;
    else if (prop === "background-color") out.background = value;
    else if (prop === "background") {
      if (/url\(|gradient\(/i.test(value)) out.picture = true;
      else out.background = value;
    } else if (prop === "background-image" && value !== "none") out.picture = true;
    else if (prop === "opacity" && Number.isFinite(Number(value))) out.opacity = Number(value);
  };
  for (const cls of (el.getAttribute("class") || "").split(/\s+/)) {
    if (!cls || cls.includes(":")) continue; // hover/focus/breakpoint variants: not the resting look
    const rule = colorUtilityCss(cls);
    const body = rule && /\{([^}]*)\}/.exec(rule)?.[1];
    if (body) for (const decl of body.split(";")) { const at = decl.indexOf(":"); if (at > 0) take(decl.slice(0, at).trim(), decl.slice(at + 1)); }
    if (/^bg-(gradient|linear|radial)/.test(cls)) out.picture = true;
  }
  for (const decl of (el.getAttribute("style") || "").split(";")) {
    const at = decl.indexOf(":");
    if (at > 0) take(decl.slice(0, at).trim().toLowerCase(), decl.slice(at + 1));
  }
  return out;
}

const isPicture = (el: Element) => ["img", "video", "picture", "iframe", "canvas"].includes(el.tagName.toLowerCase());
const covers = (el: Element) => /\babsolute\b/.test(el.getAttribute("class") || "") && /\binset-0\b/.test(el.getAttribute("class") || "");

/** Whether a colour has no see-through part. */
function opaque(colour: string): boolean {
  const m = /^rgba?\(([^)]+)\)$/i.exec(colour.trim());
  if (m) { const a = m[1].split(/[\s,/]+/).filter(Boolean)[3]; return a === undefined || Number(a) >= 1; }
  return !/^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(colour.trim());
}

/** `colour` at `opacity`, laid over the solid `under`, as rgb(). */
function layer(colour: string, under: string, opacity = 1): string {
  const parse = (c: string): number[] => {
    const hex = /^#([0-9a-f]{3,8})$/i.exec(c.trim());
    if (hex) {
      let h = hex[1];
      if (h.length <= 4) h = h.split("").map((x) => x + x).join("");
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
    }
    const parts = (/^rgba?\(([^)]+)\)$/i.exec(c.trim())?.[1] || "0,0,0").split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const top = parse(colour), bottom = parse(under);
  const a = Math.max(0, Math.min(1, top[3] * opacity));
  return `rgb(${[0, 1, 2].map((i) => Math.round(top[i] * a + bottom[i] * (1 - a))).join(", ")})`;
}

/**
 * Words in rendered markup that are hard to read on what is behind them (at least 3:1, the large-text level, since
 * the size isn't known here; theme-wide body text is held to 4.5:1 by `themeColourPairs`). `page` gives the colours
 * outside the markup. Words over a picture and words hidden from everyone (`hidden`, `aria-hidden`,
 * screen-reader-only) are skipped.
 */
export function markupProblems(root: Element, design: any, where: string, page?: { text?: string; background?: string }): string[] {
  const tokens = colourTokens(design);
  const problems = new Set<string>();
  const walk = (el: Element, text: string | null, bg: string | null, picture: boolean) => {
    const cls = el.getAttribute("class") || "";
    const classes = cls.split(/\s+/);
    // Hidden from everyone: `hidden`, aria-hidden, screen-reader-only. "hidden md:block" still shows on computers.
    const shownLater = classes.some((c) => /:(block|flex|grid|inline|inline-block|inline-flex|table)$/.test(c));
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true" || classes.includes("sr-only") || (classes.includes("hidden") && !shownLater)) return;
    if (["style", "script", "svg", "noscript", "template"].includes(el.tagName.toLowerCase()) || isPicture(el)) return;
    const paint = paintOf(el);
    let nextBg = bg;
    let nextPicture = picture || !!paint.picture;
    if (paint.background) {
      const fill = resolveColour(paint.background, tokens);
      if (fill && opaque(fill) && (paint.opacity ?? 1) >= 1) { nextBg = fill; nextPicture = !!paint.picture; }
      else if (fill && nextBg && !nextPicture) nextBg = layer(fill, nextBg, paint.opacity ?? 1);
    }
    // Layers drawn behind the words: a picture, or a tint over the box (an absolute, full-size child with no words).
    for (const child of Array.from(el.children)) {
      if (isPicture(child) && /\b(absolute|inset-0|object-cover|w-full)\b/.test(child.getAttribute("class") || "")) nextPicture = true;
      else if (covers(child) && !(child.textContent || "").trim()) {
        if (child.querySelector("img,video,picture,iframe,canvas") || paintOf(child).picture) { nextPicture = true; continue; }
        const tint = paintOf(child);
        const fill = tint.background && resolveColour(tint.background, tokens);
        if (fill && nextBg && !nextPicture) nextBg = layer(fill, nextBg, tint.opacity ?? 1);
      }
    }
    const nextText = paint.color ? resolveColour(paint.color, tokens) ?? (paint.color === "currentColor" ? text : null) : text;
    if (!nextPicture && nextText && nextBg) {
      const words = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && (n.textContent || "").trim()).map((n) => (n.textContent || "").trim()).join(" ");
      if (words) {
        const ratio = contrastRatio(nextText, nextBg);
        if (ratio !== null && ratio < LARGE) problems.add(`${where}: “${words.slice(0, 40)}” is hard to read (${fmt(ratio)}: ${nextText} on ${nextBg})`);
      }
    }
    for (const child of Array.from(el.children)) walk(child, nextText, nextBg, nextPicture);
  };
  const text = resolveColour(page?.text || "var(--text)", tokens);
  const bg = resolveColour(page?.background || "var(--bg-color)", tokens);
  for (const child of Array.from(root.children)) walk(child, text, bg, false);
  return [...problems];
}
