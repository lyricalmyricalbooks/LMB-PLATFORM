/**
 * Book descriptions are plain text the owner types in Books › edit › Details, with a small, safe
 * formatting language the editor's toolbar writes (rendered by `DescriptionText.tsx`):
 *   [link text](https://…) or a bare web address   **bold**   *italic* / _italic_
 *   "## Heading" / "### Small heading" lines   "- item" / "1. item" lists   "> quote" lines   "---" divider
 * Only http(s), mailto and shop paths ("/…") become links; anything else stays as typed. Text with
 * none of this renders exactly as before (one block, line breaks kept).
 */
export type DescriptionPart = { text: string; href?: string };

const LINK_RE = /\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)|(https?:\/\/[^\s<>()\[\]]+)/gi;

export function safeHref(value: string): string {
  const href = value.trim();
  if (/^\/(?!\/)/.test(href)) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function descriptionParts(text = ""): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  const push = (part: DescriptionPart) => {
    const last = parts[parts.length - 1];
    if (!part.href && last && !last.href) last.text += part.text;
    else if (part.text) parts.push(part);
  };
  let at = 0;
  for (const match of String(text).matchAll(LINK_RE)) {
    const start = match.index ?? 0;
    push({ text: text.slice(at, start) });
    if (match[1] !== undefined) {
      const href = safeHref(match[2]);
      push(href ? { text: match[1], href } : { text: match[0] });
      at = start + match[0].length;
    } else {
      // A sentence's closing punctuation is not part of a bare address.
      const raw = match[3];
      const trimmed = raw.replace(/[.,;:!?'"]+$/, "");
      const href = safeHref(trimmed);
      push(href ? { text: trimmed, href } : { text: trimmed });
      at = start + trimmed.length;
    }
  }
  push({ text: text.slice(at) });
  return parts;
}

export type InlinePart = DescriptionPart & { bold?: boolean; italic?: boolean };

const EMPHASIS_RE = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|(?<![\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])([^_\n]+?)(?<![\s_])_(?![\w_])/g;

function emphasis(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  let at = 0;
  for (const m of text.matchAll(EMPHASIS_RE)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ text: text.slice(at, start) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2] ?? m[3], italic: true });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** One line or paragraph's words: links first, then **bold** / *italic* in the text between them. */
export function inlineParts(text = ""): InlinePart[] {
  return descriptionParts(text).flatMap((part) =>
    part.href ? [{ ...part, text: part.text.replace(/\*\*|__/g, "") }] : emphasis(part.text));
}

export type DescriptionBlock =
  | { type: "text"; text: string }
  | { type: "h3" | "h4"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

/** Splits a description into blocks. Plain lines (blank ones too) stay together as one text block. */
export function descriptionBlocks(text = ""): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  let plainLines: string[] = [];
  const flushPlain = () => {
    // A single line break either side of a heading/list belongs to that block, not to the text.
    const t = plainLines.join("\n").replace(/^\n/, "").replace(/\n$/, "");
    if (t.trim()) blocks.push({ type: "text", text: t });
    plainLines = [];
  };
  for (const line of lines) {
    const heading = /^\s*(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const last = blocks[blocks.length - 1];
    if (heading) { flushPlain(); blocks.push({ type: heading[1].length === 3 ? "h4" : "h3", text: heading[2] }); }
    else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPlain(); blocks.push({ type: "hr" }); }
    else if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      const item = (bullet || numbered)![1];
      if (!plainLines.length && last && last.type === type) last.items.push(item);
      else { flushPlain(); blocks.push({ type, items: [item] }); }
    } else if (/^\s*>\s?/.test(line)) {
      const quoted = line.replace(/^\s*>\s?/, "");
      if (!plainLines.length && last && last.type === "quote") last.text += "\n" + quoted;
      else { flushPlain(); blocks.push({ type: "quote", text: quoted }); }
    } else plainLines.push(line);
  }
  flushPlain();
  return blocks;
}

/** True when the description uses any formatting, so a reader needs more than plain text. */
export function hasFormatting(text = ""): boolean {
  const blocks = descriptionBlocks(text);
  return blocks.some((b) => b.type !== "text") || blocks.some((b) => b.type === "text" && inlineParts(b.text).some((p) => p.href || p.bold || p.italic));
}

/** The description as shoppers read it, without any formatting markup (search snippets, JSON-LD). */
export function descriptionPlainText(text = ""): string {
  const words = (t: string) => inlineParts(t).map((part) => part.text).join("");
  return descriptionBlocks(text).map((b) => {
    if (b.type === "hr") return "";
    if (b.type === "ul" || b.type === "ol") return b.items.map(words).join("\n");
    return "text" in b ? words(b.text) : "";
  }).filter(Boolean).join("\n");
}

/** Markup for one link, as the editor's Add link button inserts it. */
export function linkMarkup(label: string, href: string): string {
  const text = label.replace(/[\[\]\n]/g, " ").replace(/\s+/g, " ").trim();
  const url = href.trim();
  return text && text !== url ? `[${text}](${url})` : url;
}

export type FormatAction = "bold" | "italic" | "heading" | "subheading" | "bullets" | "numbers" | "quote" | "divider";

/**
 * Applies one toolbar button to the description: wraps the selection (bold/italic) or prefixes the
 * selected lines (headings, lists, quotes); pressing it again on formatted text removes it.
 * Returns the new text and where the selection should be.
 */
export function applyFormat(text: string, start: number, end: number, action: FormatAction): { text: string; start: number; end: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  if (action === "bold" || action === "italic") {
    const mark = action === "bold" ? "**" : "*";
    const selected = text.slice(s, e);
    const before = text.slice(0, s), after = text.slice(e);
    if (before.endsWith(mark) && after.startsWith(mark) && (action === "bold" || !before.endsWith("**"))) {
      return { text: before.slice(0, -mark.length) + selected + after.slice(mark.length), start: s - mark.length, end: e - mark.length };
    }
    const word = selected || (action === "bold" ? "bold text" : "italic text");
    // Keep spaces the owner selected outside the marks, so **text** stays valid.
    const lead = word.match(/^\s*/)![0], trail = word.match(/\s*$/)![0];
    const core = word.trim() || word;
    const next = before + lead + mark + core + mark + trail + after;
    const from = s + lead.length + mark.length;
    return { text: next, start: from, end: from + core.length };
  }
  if (action === "divider") {
    const before = text.slice(0, s);
    const pre = before && !before.endsWith("\n") ? "\n" : "";
    const insert = `${pre}---\n`;
    return { text: before + insert + text.slice(e), start: s + insert.length, end: s + insert.length };
  }
  const lineStart = text.lastIndexOf("\n", s - 1) + 1;
  const nl = text.indexOf("\n", e > s && text[e - 1] === "\n" ? e - 1 : e);
  const lineEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const strip = (line: string) => line.replace(/^\s*(#{1,3}\s+|[-*•]\s+|\d{1,3}[.)]\s+|>\s?)/, "");
  const prefixOf = (i: number) => ({ heading: "## ", subheading: "### ", bullets: "- ", numbers: `${i + 1}. `, quote: "> " } as Record<string, string>)[action];
  const has = (line: string, i: number) => {
    if (action === "numbers") return NUMBERED.test(line);
    if (action === "bullets") return BULLET.test(line);
    return line.startsWith(prefixOf(i)) && !(action === "heading" && line.startsWith("### "));
  };
  const nonEmpty = lines.filter((l) => l.trim());
  const remove = nonEmpty.length > 0 && lines.every((l, i) => !l.trim() || has(l, i));
  let n = 0;
  const changed = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    return remove ? strip(line) : prefixOf(n++) + strip(line);
  }).join("\n");
  const next = text.slice(0, lineStart) + changed + text.slice(lineEnd);
  return { text: next, start: lineStart, end: lineStart + changed.length };
}
