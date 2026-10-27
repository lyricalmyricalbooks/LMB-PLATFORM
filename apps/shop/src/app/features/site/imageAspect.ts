// Turns a Studio "W:H" image-shape value into a CSS aspect-ratio ("3 / 4").
export function aspectRatioValue(shape: unknown, fallback = "3 / 4"): string {
  const m = typeof shape === "string" ? shape.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/) : null;
  if (!m || !Number(m[1]) || !Number(m[2])) return fallback;
  return `${m[1]} / ${m[2]}`;
}
