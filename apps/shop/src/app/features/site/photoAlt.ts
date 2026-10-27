/**
 * A photo's own description (Books › edit › Images), or "" when what is saved there is really a file name.
 * Imported photos carried their file names ("01", "IMG_9564", "preview_DL01130214", "libro (1) (1)") as alt text,
 * which tells shoppers using screen readers and Google Images nothing; those fall back to the shop's wording.
 */
export function describedAlt(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return looksLikeFileName(text) ? "" : text;
}

/** One "word" (after dropping " (1)" copy counters) with a digit, underscore or file extension, or a bare number. */
export function looksLikeFileName(text: string): boolean {
  const core = text.trim().replace(/\s*\(\d+\)/g, "").trim();
  if (!core) return true;
  if (/\.(jpe?g|png|webp|gif|heic|tiff?|avif)$/i.test(core)) return true;
  if (/\s/.test(core)) return false;
  return /[\d_]/.test(core) || core.length <= 3 || /^(img|dsc|image|photo|foto|libro|scan|preview|copertina|cover)$/i.test(core);
}
