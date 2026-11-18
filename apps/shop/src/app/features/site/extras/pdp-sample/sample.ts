// Free samples on product pages (Digital D3b, Beta). The owner uploads one short public file per product (Books › edit ›
// Digital product › Free sample): shoppers play an audio or video sample in the page, or open a PDF in a new tab.
// Samples are public (products/samples/ in the shop's storage), so they are never the bought file itself.

export type SampleKind = "audio" | "video" | "read";
export interface ProductSample { url: string; name?: string; kind: SampleKind; size?: number }

/** Samples are public and every play is download traffic on the shop's bill, so they stay small. */
export const MAX_SAMPLE_BYTES = 50 * 1024 * 1024;
const AUDIO: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav" };
const VIDEO: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
const READ: Record<string, string> = { pdf: "application/pdf" };
export const SAMPLE_ACCEPT = [...Object.keys(AUDIO), ...Object.keys(VIDEO), ...Object.keys(READ)].map((ext) => `.${ext}`).join(",");

const extension = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name || "")?.[1] || "").toLowerCase();

/** What a file would be as a sample, with the type to store it under, or null for a kind shoppers can't open in the page. */
export function sampleFileKind(name: string): { kind: SampleKind; contentType: string } | null {
  const ext = extension(name);
  if (AUDIO[ext]) return { kind: "audio", contentType: AUDIO[ext] };
  if (VIDEO[ext]) return { kind: "video", contentType: VIDEO[ext] };
  if (READ[ext]) return { kind: "read", contentType: READ[ext] };
  return null;
}

/** Why a file can't be the sample, in plain words, or "" when it can. */
export function sampleProblem(file: { name: string; size: number }): string {
  if (!sampleFileKind(file.name)) return `${file.name} can't be a sample. Use an audio file (such as MP3), a video (MP4) or a PDF.`;
  if (file.size > MAX_SAMPLE_BYTES) return `${file.name} is ${Math.round(file.size / 1048576)} MB. A sample can be up to 50 MB: use a short excerpt.`;
  return "";
}

/** The product's sample when it has a usable one (an https link of a known kind), else null. */
export function productSample(book: any): ProductSample | null {
  const s = book?.sample;
  if (!s || typeof s !== "object" || typeof s.url !== "string" || !/^https:\/\//.test(s.url)) return null;
  if (s.kind !== "audio" && s.kind !== "video" && s.kind !== "read") return null;
  return { url: s.url, kind: s.kind, ...(typeof s.name === "string" ? { name: s.name } : {}), ...(Number(s.size) > 0 ? { size: Number(s.size) } : {}) };
}
