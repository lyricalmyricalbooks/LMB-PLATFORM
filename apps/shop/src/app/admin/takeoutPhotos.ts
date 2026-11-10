// Copies the product photos for "Download your shop". Best effort: a photo the browser can't read stays at its web
// address (the zip's images.csv says which). Stops adding at MAX_BYTES so a very large shop still finishes.
import type { PhotoPlan } from "./shopTakeout";

export const MAX_BYTES = 400 * 1024 * 1024;
const AT_ONCE = 6;

export async function fetchPhotos(plan: PhotoPlan[], { onProgress, fetcher = fetch }: { onProgress?: (done: number, of: number) => void; fetcher?: typeof fetch } = {}) {
  const saved = new Map<string, { file: string; bytes: Uint8Array }>();
  let total = 0, done = 0, next = 0;
  const worker = async () => {
    while (next < plan.length) {
      const photo = plan[next++];
      try {
        if (total < MAX_BYTES) {
          const response = await fetcher(photo.url);
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (total + bytes.length <= MAX_BYTES) { total += bytes.length; saved.set(photo.url, { file: photo.file, bytes }); }
          }
        }
      } catch { /* stays at its original address */ }
      onProgress?.(++done, plan.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, plan.length) }, worker));
  return saved;
}
