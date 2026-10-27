// Admin › Discounts: random codes and batches of single-use codes. Pure, tested.
// No 0/O, 1/I/L: codes are read aloud and typed from print.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MAX_BATCH = 200;

const randomIndex = (n: number) => {
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
};

/** Up to 20 letters/digits for the start of a code, e.g. "fall sale" → "FALLSALE". */
export const cleanPrefix = (prefix: string) => String(prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

/** "PREFIX-XXXXXX" (or just "XXXXXXXX" without a prefix). */
export function randomCode(prefix = "", rand: (n: number) => number = randomIndex): string {
  const p = cleanPrefix(prefix);
  const body = Array.from({ length: p ? 6 : 8 }, () => CODE_ALPHABET[rand(CODE_ALPHABET.length)]).join("");
  return p ? `${p}-${body}` : body;
}

/** `count` distinct new codes that clash with none in `existing` (case-insensitive). */
export function batchCodes(prefix: string, count: number, existing: string[] = [], rand: (n: number) => number = randomIndex): string[] {
  const n = Math.max(0, Math.min(MAX_BATCH, Math.floor(Number(count) || 0)));
  const taken = new Set(existing.map(c => String(c || "").trim().toUpperCase()));
  const out: string[] = [];
  for (let guard = 0; out.length < n && guard < n * 50; guard++) {
    const code = randomCode(prefix, rand);
    if (taken.has(code)) continue;
    taken.add(code);
    out.push(code);
  }
  return out;
}

/** CSV of created codes (codes are letters/digits/hyphens only, so no spreadsheet formulas). */
export function codesCsv(codes: string[], summary = ""): string {
  const q = (v: string) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
  return ["Code,Uses,Offer", ...codes.map(c => `${q(c)},1,${q(summary)}`)].join("\r\n");
}
