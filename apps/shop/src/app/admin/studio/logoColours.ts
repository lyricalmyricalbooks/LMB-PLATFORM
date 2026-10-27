// Reads the main colours of a logo in the browser for the brand kit (brandKit.dominantColours does the counting).
// A file the owner just picked is read locally, so storage CORS never matters; a picture from the library is read with
// crossOrigin="anonymous" and returns null when the browser won't let the page read its pixels.
import { dominantColours } from "./brandKit";

const SIZE = 64;

function pixelsOf(img: HTMLImageElement): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  try { return ctx.getImageData(0, 0, SIZE, SIZE).data; } catch { return null; }
}

function load(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The picture couldn't be opened."));
    img.src = src;
  });
}

/** The logo's main colours, or null when they can't be read. */
export async function logoColours(source: File | string): Promise<string[] | null> {
  const local = typeof source !== "string";
  const src = local ? URL.createObjectURL(source) : source;
  try {
    const data = pixelsOf(await load(src, !local));
    return data ? dominantColours(data) : null;
  } catch { return null; }
  finally { if (local) URL.revokeObjectURL(src); }
}
