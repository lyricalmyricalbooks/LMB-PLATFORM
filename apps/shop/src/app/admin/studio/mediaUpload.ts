// One upload path for every Studio image (section/block images, Theme settings images,
// rich-text pictures). Files go under `assets/`, which storage.rules lets the admin write,
// and are shrunk first so storefront pages stay light.
import { adminApi } from "../api";
import { mediaApi } from "../mediaApi";
import { MAX_STUDIO_IMAGE_EDGE, prepareMediaVariants, prepareProductImage } from "../prepareImage";
import type { MediaItem } from "./mediaLibrary";

export const STUDIO_UPLOAD_ROOT = "assets/studio";

/** `assets/studio/2026/10/1728400000000-summer-banner.webp` — dated folders, safe file names. */
export function studioUploadPath(fileName: string, now = new Date()): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "image";
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${STUDIO_UPLOAD_ROOT}/${now.getUTCFullYear()}/${month}/${now.getTime()}-${base}${ext ? "." + ext : ""}`;
}

export async function uploadStudioImage(file: File): Promise<string> {
  const ready = await prepareProductImage(file, MAX_STUDIO_IMAGE_EDGE);
  return adminApi.uploadFile(ready, studioUploadPath(ready.name));
}

/** Plain-English reason shown under the Upload button when an upload fails. */
export function uploadErrorMessage(error: unknown): string {
  const code = String((error as any)?.code || "");
  if (code === "storage/unauthorized") return "Upload refused — sign in again as the shop admin and retry.";
  if (code === "storage/quota-exceeded") return "Upload refused — the storage allowance is full.";
  if (code === "permission-denied") return "The media library isn't switched on yet — its security rules haven't been deployed. Use Upload image on the field instead.";
  if (code === "storage/retry-limit-exceeded" || code === "storage/canceled") return "Upload interrupted — check your connection and retry.";
  return "Upload failed — check your connection and try again.";
}

// ── Studio media library (2.4) ─────────────────────────────────────────────
// Library pictures live in `assets/media/<id>/` (storage.rules lets the admin write `assets/`), one file
// per copy: `<upload time>-480w.webp`, `-960w.webp`, `-1600w.webp`. A Replace adds new files under the
// same id with a new upload time, so the live design keeps working until the next Publish.
export const MEDIA_UPLOAD_ROOT = "assets/media";

export function newMediaId(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `m${Date.now().toString(36)}${random}`;
}

/** `assets/media/m1abc/1728400000000-960w.webp`; copies of unknown width are `-original`. */
export function mediaUploadPath(id: string, stamp: number, width: number, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeId = id.replace(/[^\w-]/g, "") || "image";
  return `${MEDIA_UPLOAD_ROOT}/${safeId}/${stamp}-${width > 0 ? `${width}w` : "original"}${ext ? "." + ext : ""}`;
}

/**
 * Resizes and uploads a picture into the library and saves its record. With `previous`, replaces that
 * image's files: the id, description and focal point stay; the old files are remembered in `previous`.
 */
export async function uploadMediaImage(file: File, previous?: MediaItem, now = Date.now()): Promise<MediaItem> {
  const prepared = await prepareMediaVariants(file);
  const id = previous?.id || newMediaId();
  const variants: MediaItem["variants"] = [];
  // A failed upload or record save removes the copies already stored, so nothing is left half-added.
  const undoUploads = (error: unknown) => mediaApi.removeFiles(variants.map(v => v.path)).catch(() => {}).then(() => { throw error; });
  try {
    for (const v of prepared.variants) {
      const path = mediaUploadPath(id, now, v.width, v.file.name);
      const url = await adminApi.uploadFile(v.file, path);
      variants.push({ w: v.width, h: v.height, url, path, bytes: v.file.size });
    }
  } catch (error) { return undoUploads(error); }
  const stamp = new Date(now).toISOString();
  const item: MediaItem = {
    id,
    name: file.name || previous?.name || "image",
    alt: previous?.alt || "",
    focalX: previous?.focalX ?? 50,
    focalY: previous?.focalY ?? 50,
    width: prepared.width,
    height: prepared.height,
    type: prepared.variants[0]?.file.type || file.type,
    bytes: variants.reduce((n, v) => n + v.bytes, 0),
    widths: variants.map(v => v.w).filter(w => w > 0),
    variants,
    ...(previous ? { previous: [...(previous.previous || []), ...previous.variants.map(v => ({ url: v.url, path: v.path }))] } : {}),
    createdAt: previous?.createdAt || stamp,
    updatedAt: stamp,
  };
  try { await mediaApi.save(item); } catch (error) { return undoUploads(error); }
  return item;
}
