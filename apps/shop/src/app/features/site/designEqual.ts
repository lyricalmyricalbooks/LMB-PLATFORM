// Phase 4: compare two designs without serialising them. `designEqual(a, b)` answers "would they save as the same
// JSON?" — the question `JSON.stringify(a) === JSON.stringify(b)` asked — but stops at the first difference and skips
// any subtree both sides share (Studio's edits are immutable, so unchanged sections keep their identity). Key order
// does not matter here (stringify only compared it by accident). Pure; safe in the storefront and in Studio.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** What JSON keeps of a value inside an object: undefined/functions/symbols are dropped (null = dropped). */
function jsonValue(v: unknown): unknown {
  if (v === undefined || typeof v === "function" || typeof v === "symbol") return undefined;
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  if (isObj(v) && typeof (v as any).toJSON === "function") return (v as any).toJSON();
  return v;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  a = jsonValue(a); b = jsonValue(b);
  if (a === b) return true;
  if (!isObj(a) || !isObj(b)) return false;
  const arrA = Array.isArray(a), arrB = Array.isArray(b);
  if (arrA !== arrB) return false;
  if (arrA) {
    const x = a as unknown as unknown[], y = b as unknown as unknown[];
    if (x.length !== y.length) return false;
    // Inside arrays JSON writes null for undefined, functions and non-finite numbers.
    const item = (v: unknown) => { const j = jsonValue(v); return j === undefined ? null : j; };
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && !eq(item(x[i]), item(y[i]))) return false;
    return true;
  }
  let countA = 0;
  for (const key in a) {
    if (!Object.prototype.hasOwnProperty.call(a, key)) continue;
    const va = jsonValue(a[key]);
    if (va === undefined) continue;
    countA++;
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const vb = b[key];
    if (va !== vb && !eq(va, vb)) return false;
  }
  let countB = 0;
  for (const key in b) {
    if (Object.prototype.hasOwnProperty.call(b, key) && jsonValue(b[key]) !== undefined) countB++;
  }
  return countA === countB;
}

/** Same saved JSON (ignoring key order), with `null`/`undefined` at the top treated alike, as sameDesign always did. */
export function designEqual(a: unknown, b: unknown): boolean {
  return eq(a ?? null, b ?? null);
}
