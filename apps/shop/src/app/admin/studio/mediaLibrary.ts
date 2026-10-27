import { isGroupSurface } from "../../features/site/sectionGroups";
// Studio media library (2.4) — pure helpers (tested in mediaLibrary.test.ts). The records live in the
// admin-only Firestore `media/{id}` collection (admin/mediaApi.ts); the files under the public
// Storage folder `assets/media/<id>/` (studio/mediaUpload.ts). A picture placed in a section keeps its
// plain URL in the field plus a `${field}__media` record (features/site/mediaRef.ts) for `srcset`.
import { MEDIA_SUFFIX, mediaKey, type MediaRef } from "../../features/site/mediaRef";

export type MediaVariant = { w: number; h: number; url: string; path: string; bytes: number };
export type MediaItem = {
  id: string;
  /** The uploaded file's name, for search. */
  name: string;
  /** Description read aloud by screen readers (alt text). */
  alt: string;
  /** Focal point, 0–100 % from the left / top; copied into a field's Image style when placed. */
  focalX: number;
  focalY: number;
  width: number;
  height: number;
  type: string;
  /** Total size of every copy. */
  bytes: number;
  widths: number[];
  variants: MediaVariant[];
  /** Files from before a Replace, kept until the image is deleted (the live design may still use them). */
  previous?: { url: string; path: string }[];
  createdAt: string;
  updatedAt: string;
};

export type MediaFilter = "all" | "unused" | "over" | "noalt";

// Page-weight budgets from docs/THEME_EDITOR.md (thumb < 50 KB, content < 150 KB, hero < 200 KB).
export function budgetFor(width: number): number {
  if (width > 0 && width <= 480) return 50_000;
  if (width > 0 && width <= 960) return 150_000;
  // The 2400 px copy only reaches big retina screens, so it may weigh more.
  if (width > 1600) return 450_000;
  return 200_000;
}

const largest = (item: MediaItem): MediaVariant | undefined =>
  [...(item.variants || [])].sort((a, b) => (b.w || 0) - (a.w || 0))[0];

/** The URL written into an image field: the largest copy. */
export const mainUrl = (item: MediaItem) => largest(item)?.url || "";
/** The smallest copy, for thumbnails in Studio. */
export const thumbUrl = (item: MediaItem) => [...(item.variants || [])].sort((a, b) => (a.w || 0) - (b.w || 0))[0]?.url || "";
/** Every URL this image has ever had (current copies and replaced ones). */
export const allUrls = (item: MediaItem) => [...(item.variants || []).map(v => v.url), ...(item.previous || []).map(p => p.url)].filter(Boolean);
export const allPaths = (item: MediaItem) => [...(item.variants || []).map(v => v.path), ...(item.previous || []).map(p => p.path)].filter(Boolean);

export const overBudgetVariants = (item: MediaItem) => (item.variants || []).filter(v => v.bytes > budgetFor(v.w));
export const isOverBudget = (item: MediaItem) => overBudgetVariants(item).length > 0;
export const missingAlt = (item: MediaItem) => !String(item.alt || "").trim();

/** The public record placed beside an image field. */
export function mediaRefOf(item: MediaItem): MediaRef {
  return {
    id: item.id,
    src: mainUrl(item),
    srcset: (item.variants || []).filter(v => v.w > 0 && v.url).map(v => ({ url: v.url, w: v.w })).sort((a, b) => a.w - b.w),
    ...(item.width > 0 && item.height > 0 ? { width: item.width, height: item.height } : {}),
    alt: String(item.alt || "").trim(),
  };
}

/**
 * What to write into a section/block record when the owner picks `item` for `fieldKey`: the URL, its
 * `__media` record, and the library focal point unless the field already has its own.
 */
export function pickPatch(fieldKey: string, item: MediaItem, record: any = {}): Record<string, any> {
  const patch: Record<string, any> = { [fieldKey]: mainUrl(item), [mediaKey(fieldKey)]: mediaRefOf(item) };
  const hasFocal = record?.[`${fieldKey}__focalX`] != null || record?.[`${fieldKey}__focalY`] != null;
  if (!hasFocal && (item.focalX !== 50 || item.focalY !== 50) && Number.isFinite(item.focalX) && Number.isFinite(item.focalY)) {
    patch[`${fieldKey}__focalX`] = Math.round(item.focalX);
    patch[`${fieldKey}__focalY`] = Math.round(item.focalY);
  }
  return patch;
}

// ── Where used ─────────────────────────────────────────────────────────────
export type Path = (string | number)[];
export type StringAt = { path: Path; value: string };

/** Every string in a design (or any JSON value) with its path. `__media` records are skipped: only fields count. */
export function collectStrings(root: any, path: Path = [], out: StringAt[] = []): StringAt[] {
  if (typeof root === "string") { if (root) out.push({ path, value: root }); return out; }
  if (Array.isArray(root)) { root.forEach((v, i) => collectStrings(v, [...path, i], out)); return out; }
  if (root && typeof root === "object") {
    for (const [k, v] of Object.entries(root)) if (!k.endsWith(MEDIA_SUFFIX)) collectStrings(v, [...path, k], out);
  }
  return out;
}

/** Paths whose text contains one of the image's URLs (an image field, or a picture inside rich text). */
export function usagePaths(strings: StringAt[], item: MediaItem): Path[] {
  const urls = allUrls(item);
  if (!urls.length) return [];
  return strings.filter(s => urls.some(u => s.value.includes(u))).map(s => s.path);
}

export type UsagePlace = { label: string; templateId?: string; sectionId?: string };

/**
 * Stored design snapshots (My themes, Version history) that still contain the picture. Restoring one of
 * them would bring the picture back, so Delete must treat them as uses too.
 */
export function snapshotUses(item: MediaItem, savedThemes: { name?: string; design?: any }[], versions: { label?: string; createdAt?: string; design?: any }[]): string[] {
  const has = (design: any) => usagePaths(collectStrings(design), item).length > 0;
  return [
    ...(savedThemes || []).filter(t => has(t?.design)).map(t => `My themes › ${t.name || "Untitled theme"}`),
    ...(versions || []).filter(v => has(v?.design)).map(v => `Version history › ${v.label || "Saved version"}${v.createdAt ? ` (${new Date(v.createdAt).toLocaleDateString()})` : ""}`),
  ];
}

/**
 * Designs stored for later (scheduled publishes, the design a running campaign will restore, share-preview links)
 * that still contain the picture. When they go live or are opened the picture would show, so Delete refuses too.
 */
export function storedDesignUses(item: MediaItem, stored: { label?: string; design?: any }[]): string[] {
  return (stored || []).filter(s => usagePaths(collectStrings(s?.design), item).length > 0).map(s => s.label || "Stored design");
}

/** "Home › Image banner" for `["heroPage", "sections", 2, "settings", "imageUrl"]`. */
export function describeUsage(design: any, path: Path, names: { surface: (id: string) => string; section: (section: any) => string }): UsagePlace {
  const [top, second, third] = path;
  const field = String(path[path.length - 1] ?? "");
  if (typeof top === "string" && isGroupSurface(top) && typeof second === "number") {
    const section = design?.[top]?.[second];
    return { label: `${names.surface(top)} › ${section ? names.section(section) : "section"}`, templateId: top === "globalSections" ? "__global" : top, sectionId: section?.id };
  }
  if (typeof top === "string" && second === "sections" && typeof third === "number") {
    const section = design?.[top]?.sections?.[third];
    return { label: `${names.surface(top)} › ${section ? names.section(section) : "section"}`, templateId: top, sectionId: section?.id };
  }
  return { label: `Theme settings › ${String(top ?? field).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}` };
}

/** One entry per place, in order (several fields of one section count once). */
export function usagePlaces(design: any, paths: Path[], names: Parameters<typeof describeUsage>[2]): UsagePlace[] {
  const seen = new Set<string>();
  const out: UsagePlace[] = [];
  for (const path of paths) {
    const place = describeUsage(design, path, names);
    const key = place.sectionId ? `${place.templateId}:${place.sectionId}` : place.label;
    if (!seen.has(key)) { seen.add(key); out.push(place); }
  }
  return out;
}

// ── Replace / describe ─────────────────────────────────────────────────────

/** The new copy closest in width to an old one (the largest when the old width is unknown). */
function nearest(after: MediaItem, width: number): string {
  const variants = [...(after.variants || [])].sort((a, b) => a.w - b.w);
  if (!variants.length) return "";
  if (!(width > 0)) return variants[variants.length - 1].url;
  return variants.reduce((best, v) => (Math.abs(v.w - width) < Math.abs(best.w - width) ? v : best)).url;
}

/**
 * After an image is replaced or its description changes: points every use in `design` at the new files
 * (fields and rich text) and refreshes each `__media` record of this image. Returns the same object when
 * nothing used it.
 */
export function applyMediaChange(design: any, before: MediaItem, after: MediaItem): any {
  const swaps = new Map<string, string>();
  for (const v of before.variants || []) if (v.url) swaps.set(v.url, nearest(after, v.w));
  for (const p of before.previous || []) if (p.url && !swaps.has(p.url)) swaps.set(p.url, mainUrl(after));
  const olds = [...swaps.keys()].filter(u => swaps.get(u) && swaps.get(u) !== u).sort((a, b) => b.length - a.length);
  const ref = mediaRefOf(after);
  const walk = (value: any): any => {
    if (typeof value === "string") {
      let next = value;
      for (const old of olds) if (next.includes(old)) next = next.split(old).join(swaps.get(old)!);
      return next;
    }
    if (Array.isArray(value)) {
      let changed = false;
      const out = value.map(v => { const n = walk(v); if (n !== v) changed = true; return n; });
      return changed ? out : value;
    }
    if (value && typeof value === "object") {
      let changed = false;
      const out: any = {};
      for (const [k, v] of Object.entries(value)) {
        let n: any;
        if (k.endsWith(MEDIA_SUFFIX) && v && typeof v === "object" && (v as any).id === after.id) {
          const fieldValue = walk(value[k.slice(0, -MEDIA_SUFFIX.length)]);
          n = fieldValue === ref.src ? ref : v;
          if (JSON.stringify(n) === JSON.stringify(v)) n = v;
        } else n = walk(v);
        if (n !== v) changed = true;
        out[k] = n;
      }
      return changed ? out : value;
    }
    return value;
  };
  return walk(design);
}

export function filterMedia(items: MediaItem[], query: string, filter: MediaFilter, isUsed: (item: MediaItem) => boolean): MediaItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(item => {
    if (q && !`${item.name} ${item.alt}`.toLowerCase().includes(q)) return false;
    if (filter === "unused") return !isUsed(item);
    if (filter === "over") return isOverBudget(item);
    if (filter === "noalt") return missingAlt(item);
    return true;
  });
}

export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return "0 KB";
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Newest first. */
export const sortMedia = (items: MediaItem[]) => [...items].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
