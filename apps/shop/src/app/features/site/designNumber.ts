/** A numeric Studio setting with a default: blank / missing / non-numeric falls back. */
export function designNumber(design: any, key: string, fallback: number): number {
  const raw = design?.[key];
  if (raw === "" || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
