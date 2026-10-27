// Book video uploads (Books › edit › Images › Add video). The file is stored as chosen under
// `products/videos/` (public read, admin write — storage.rules already covers products/**), and a still
// frame from it is uploaded through `uploadBookPhoto`, so the video's entry in `photos` is an ordinary
// photo (`url` + `srcset`) with `videoUrl` added (features/site/bookVideo.ts).
// Videos are big and every play is a download from Firebase Storage, which counts against the
// project's monthly download allowance, so files are capped (MAX_BOOK_VIDEO_BYTES) and shoppers only
// fetch the first few kilobytes until they press play (`preload="metadata"`).
import { mediaApi } from "./mediaApi";
import { bookPhotoPath, uploadBookPhoto, type BookPhotoFile } from "./bookPhotoUpload";
import type { BookVideoFields } from "../features/site/bookVideo";

export const MAX_BOOK_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_BOOK_VIDEOS = 5;
/** MP4 (H.264) plays everywhere; WebM and MOV play in most browsers. The poster check below catches the rest. */
export const BOOK_VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
export const BOOK_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov";

export function videoExtension(name: string): string {
  return (name.match(/\.([A-Za-z0-9]+)$/)?.[1] || "").toLowerCase();
}

export function isVideoFile(file: { name: string; type?: string }): boolean {
  return (file.type || "").startsWith("video/") || !!BOOK_VIDEO_TYPES[videoExtension(file.name)];
}

/** The content type the file is stored with, or "" when it isn't a format the shop plays. */
export function videoContentType(file: { name: string; type?: string }): string {
  const byExt = BOOK_VIDEO_TYPES[videoExtension(file.name)];
  if (byExt) return byExt;
  return Object.values(BOOK_VIDEO_TYPES).includes(file.type || "") ? file.type! : "";
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** Why a file can't be added as a book video, in plain words, or "" when it can. */
export function videoProblem(file: { name: string; type?: string; size: number }): string {
  if (!videoContentType(file)) return `${file.name} isn't an MP4, WebM or MOV video.`;
  if (file.size > MAX_BOOK_VIDEO_BYTES) {
    return `${file.name} is ${formatMegabytes(file.size)}. Videos can be up to ${formatMegabytes(MAX_BOOK_VIDEO_BYTES)}: export it at 720p or 1080p as MP4, or trim it.`;
  }
  return "";
}

/** `products/videos/1700000000000-trailer.mp4` */
export function bookVideoPath(stamp: number, fileName: string): string {
  return bookPhotoPath(stamp, fileName).replace(/^products\//, "products/videos/");
}

type Poster = { file: File; width: number; height: number; duration: number };

/**
 * A still frame (half a second in, or the middle of a shorter clip) as a JPEG, plus the video's size and
 * length. Fails when this browser can't decode the video — a shopper's browser likely can't either.
 */
export function captureVideoPoster(file: File, timeoutMs = 20000): Promise<Poster> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (error: Error | null, poster?: Poster) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(poster!);
    };
    const unplayable = () => new Error(`This browser can't play ${file.name}, so shoppers' browsers may not either. Export it as MP4 (H.264) and try again.`);
    const timer = setTimeout(() => finish(unplayable()), timeoutMs);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => finish(unplayable());
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) { finish(unplayable()); return; }
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = d > 1 ? 0.5 : d / 2;
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { finish(unplayable()); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) { finish(unplayable()); return; }
          const base = file.name.replace(/\.[^.]+$/, "") || "video";
          finish(null, {
            file: new File([blob], `${base}-poster.jpg`, { type: "image/jpeg" }),
            width: video.videoWidth,
            height: video.videoHeight,
            duration: Number.isFinite(video.duration) ? Math.round(video.duration) : 0,
          });
        }, "image/jpeg", 0.92);
      } catch {
        finish(unplayable());
      }
    };
    video.src = url;
  });
}

/** Uploads one file with progress (0–1), so a 50 MB video doesn't look stuck. Returns its download URL. */
export async function uploadWithProgress(file: File, path: string, contentType: string, onProgress?: (share: number) => void): Promise<string> {
  const [{ getStorage, ref, uploadBytesResumable, getDownloadURL }, { getApp }] = await Promise.all([import("firebase/storage"), import("firebase/app")]);
  const task = uploadBytesResumable(ref(getStorage(getApp()), path), file, {
    contentType,
    // The file never changes at this address, so browsers may keep it: a second play costs no download.
    cacheControl: "public, max-age=31536000, immutable",
  });
  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0), reject, () => resolve());
  });
  return getDownloadURL(task.snapshot.ref);
}

export type BookVideoEntry = BookPhotoFile & BookVideoFields;

export async function uploadBookVideo(file: File, onProgress?: (share: number) => void, now = Date.now()): Promise<BookVideoEntry> {
  const problem = videoProblem(file);
  if (problem) throw new Error(problem);
  const contentType = videoContentType(file);
  const poster = await captureVideoPoster(file);
  const still = await uploadBookPhoto(poster.file, now);
  const path = bookVideoPath(now, file.name);
  let videoUrl: string;
  try {
    videoUrl = await uploadWithProgress(file, path, contentType, onProgress);
  } catch (error) {
    // The still frame on its own would show up as a stray photo; nothing is added.
    const stillPaths = [still.url, ...(still.srcset || []).map((s) => s.url), still.originalUrl || ""].map(storagePathOf).filter(Boolean) as string[];
    await mediaApi.removeFiles([...new Set(stillPaths)]).catch(() => {});
    throw error;
  }
  return {
    ...still,
    width: still.width || poster.width,
    height: still.height || poster.height,
    videoUrl,
    videoType: contentType,
    videoBytes: file.size,
    videoDuration: poster.duration,
  };
}

/** `products/…` from a Firebase download URL (`…/o/products%2F…?alt=media&token=…`). */
export function storagePathOf(url: string): string {
  const m = url.match(/\/o\/([^?#]+)/);
  if (!m) return "";
  try { return decodeURIComponent(m[1]); } catch { return ""; }
}
