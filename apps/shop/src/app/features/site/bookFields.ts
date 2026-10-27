// Custom book fields (Studio 2.7): the publisher defines extra details for every book (series, translator, awards,
// a sample PDF link…) in Books › Book fields; each book stores its answers in `book.custom[key]`. Definitions live in
// the public, admin-written `settings/bookFields` doc ({ fields: BookFieldDef[] }), so no new rules are needed.
// Pure and storefront-safe.

export type BookFieldKind = "text" | "multiline" | "number" | "date" | "url" | "image";
export type BookFieldDef = { key: string; label: string; kind: BookFieldKind; help?: string };

export const BOOK_FIELDS_DOC = "bookFields";
export const MAX_BOOK_FIELDS = 30;
export const MAX_FIELD_VALUE = 2000;

export const BOOK_FIELD_KINDS: { value: BookFieldKind; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "multiline", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "url", label: "Web address (link)" },
  { value: "image", label: "Picture (link to an image)" },
];

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** A stable key from a label ("Translated by" → "translated_by"), unique among `taken`. */
export function fieldKeyFor(label: string, taken: string[]): string {
  const base = (label || "field").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 36) || "field";
  let key = base, n = 2;
  while (taken.includes(key)) key = `${base}_${n++}`;
  return key;
}

/** Definitions as saved: known kinds, valid unique keys, non-empty labels, at most MAX_BOOK_FIELDS. */
export function cleanBookFields(list: any): BookFieldDef[] {
  const out: BookFieldDef[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    const key = String(raw.key || "");
    const label = String(raw.label || "").trim().slice(0, 80);
    const kind = BOOK_FIELD_KINDS.some(k => k.value === raw.kind) ? raw.kind : "text";
    if (!KEY_RE.test(key) || !label || out.some(f => f.key === key)) continue;
    out.push({ key, label, kind, ...(raw.help ? { help: String(raw.help).slice(0, 200) } : {}) });
    if (out.length >= MAX_BOOK_FIELDS) break;
  }
  return out;
}

/** A book's answers as saved: only defined keys, trimmed, capped, blanks dropped. */
export function cleanCustomValues(defs: BookFieldDef[], values: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of defs) {
    const raw = values?.[def.key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim().slice(0, MAX_FIELD_VALUE);
    if (!text) continue;
    if (def.kind === "number" && !Number.isFinite(Number(text))) continue;
    if (def.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) continue;
    if ((def.kind === "url" || def.kind === "image") && !/^(https?:\/\/|\/)/i.test(text)) continue;
    out[def.key] = text;
  }
  return out;
}

/** Keeps answers for fields that were removed from the definitions (so removing a field by mistake loses nothing). */
export function mergeCustomValues(defs: BookFieldDef[], previous: any, edited: any): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [k, v] of Object.entries(previous || {})) if (!defs.some(d => d.key === k) && typeof v === "string") kept[k] = v;
  return { ...kept, ...cleanCustomValues(defs, edited) };
}
