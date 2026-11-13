// Licence keys (gap list 38), the admin's side: the pure rule for pasted keys, the same as functions/licenceKeys.js
// cleanKeys (licenceKeys.test.ts checks they agree), and the merge the editor saves. The server hands keys out.
export const MAX_KEYS = 2000;
export const MAX_KEY_LENGTH = 200;

/** The keys pasted in the editor: one per line, trimmed, no blanks or repeats, at most MAX_KEYS of MAX_KEY_LENGTH. */
export function cleanKeys(text: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const key = raw.replace(/[\u0000-\u001f]/g, "").trim();
    if (!key || key.length > MAX_KEY_LENGTH || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_KEYS) break;
  }
  return out;
}

/** New keys added after the waiting ones, skipping any already waiting; `skipped` counts repeats and keys over the cap. */
export function addKeys(waiting: string[], pasted: string[]): { available: string[]; added: number; skipped: number } {
  const have = new Set(waiting);
  const fresh = pasted.filter((k) => !have.has(k));
  const room = Math.max(0, MAX_KEYS - waiting.length);
  const take = fresh.slice(0, room);
  return { available: [...waiting, ...take], added: take.length, skipped: pasted.length - take.length };
}
