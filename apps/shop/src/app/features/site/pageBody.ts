// Custom page body helpers (Studio › Pages). Pure: they read and rewrite the page's HTML string.

export interface PageBodyStats {
  words: number;
  /** Reading time at ~220 words a minute; 0 for an empty page. */
  minutes: number;
  images: number;
  /** Pictures with no description (alt text) for screen readers and search engines. */
  missingAlt: number;
  /** Pictures pasted as `data:` text that still need uploading (they would bloat the page record). */
  pasted: number;
  videos: number;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};

const decodeEntities = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function pageBodyText(html: string): string {
  return decodeEntities(String(html || "").replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

export function pageBodyStats(html: string): PageBodyStats {
  const body = String(html || "");
  const text = pageBodyText(body);
  const words = text ? text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  const tags = body.match(IMG_TAG) || [];
  return {
    words,
    minutes: words ? Math.max(1, Math.round(words / 220)) : 0,
    images: tags.length,
    missingAlt: tags.filter((t) => !(attr(t, "alt") || "").trim()).length,
    pasted: tags.filter((t) => /^data:image\//i.test((attr(t, "src") || "").trim())).length,
    videos: (body.match(/<iframe\b/gi) || []).length,
  };
}

/** Every distinct `src` of the body's pictures, in order. */
export function imageSources(html: string): string[] {
  const out: string[] = [];
  for (const tag of String(html || "").match(IMG_TAG) || []) {
    const src = (attr(tag, "src") || "").trim();
    if (src && !out.includes(src)) out.push(src);
  }
  return out;
}

/** The first real (uploaded, http/https) picture on the page — the default sharing image. */
export function firstBodyImage(html: string): string {
  return imageSources(html).find((src) => /^https?:\/\//i.test(src)) || "";
}

/** Pasted pictures still stored inline as `data:image/…` text. */
export function pastedImageSources(html: string): string[] {
  return imageSources(html).filter((src) => /^data:image\//i.test(src));
}

/** Rewrites picture `src`s (exact matches only) — used to swap pasted pictures for their uploaded copies. */
export function replaceImageSources(html: string, map: Record<string, string>): string {
  return String(html || "").replace(IMG_TAG, (tag) => {
    const src = attr(tag, "src");
    if (src == null || !map[src.trim()]) return tag;
    const next = map[src.trim()].replace(/"/g, "&quot;");
    return tag.replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` src="${next}"`);
  });
}

/** A `data:image/png;base64,…` string as a File, so it can go through the normal Studio upload. */
export function dataUrlToFile(dataUrl: string, baseName = "pasted-picture"): File | null {
  const m = String(dataUrl).match(/^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/is);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const ext = (type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/\+.*$/, "");
  let bytes: Uint8Array;
  try {
    if (m[2]) {
      const bin = atob(m[3].replace(/\s/g, ""));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
  } catch { return null; }
  return new File([bytes as BlobPart], `${baseName}.${ext}`, { type });
}

/** Studio picture-size choices; the value is written as the `<img width>` attribute ("" = natural size). */
export const IMAGE_SIZES: { value: string; label: string }[] = [
  { value: "33%", label: "Small" },
  { value: "50%", label: "Medium" },
  { value: "75%", label: "Large" },
  { value: "100%", label: "Full width" },
  { value: "", label: "Original" },
];
