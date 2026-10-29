// The experts directory (code plan 12.13): independent people a press can hire for the work Colophon's help does not
// cover (design, photos, fulfilment, bookkeeping, writing). Julian adds a person by adding an entry to EXPERTS below,
// in a pull request. Colophon takes no booking, no payment and no fee here: the press and the expert agree the work
// and the price themselves. Plain ES module with no imports; the page and the tests read the same list.

export const KINDS = Object.freeze({
  design: "Design and branding",
  photos: "Photos and product images",
  fulfilment: "Packing and shipping help",
  bookkeeping: "Bookkeeping and taxes",
  writing: "Writing and product descriptions",
  other: "Something else",
});

/**
 * The people listed. Each entry:
 *   id       short lowercase name for the address (`#maria-photos`)
 *   name     what to call them (a person or a studio)
 *   kinds    one or more keys of KINDS
 *   about    one or two plain sentences on what they do for a shop like yours
 *   where    where they work from, or "Anywhere" for remote work
 *   link     an https address a press can visit to get in touch
 *   listedOn YYYY-MM-DD, the day Julian added them
 * Empty until the first expert is added.
 */
export const EXPERTS = Object.freeze([]);

/** Where an expert applies to be listed. Empty until Julian chooses an address; the page then says to check back. */
export const APPLY_URL = "";

const ID = /^[a-z][a-z0-9-]{1,40}$/;

/** What is wrong with one entry, as plain sentences; an empty list means it can be shown. */
export function problemsWith(entry) {
  const found = [];
  if (!entry || typeof entry !== "object") return ["Not an entry."];
  if (!ID.test(String(entry.id || ""))) found.push("The id must be lowercase letters, numbers and dashes.");
  if (!String(entry.name || "").trim()) found.push("A name is needed.");
  const kinds = Array.isArray(entry.kinds) ? entry.kinds : [];
  if (!kinds.length || kinds.some((kind) => !(kind in KINDS))) found.push("Choose at least one kind of work from the list.");
  if (!String(entry.about || "").trim() || String(entry.about).length > 300) found.push("Say what they do in up to 300 characters.");
  if (!String(entry.where || "").trim()) found.push("Say where they work from.");
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(String(entry.link || ""))) found.push("The link must be a full https address.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.listedOn || ""))) found.push("The day they were listed is needed (YYYY-MM-DD).");
  return found;
}

/** The entries of one kind ("" = all) that contain every word of the search, in the order listed. */
export function expertsFor({ kind = "", search = "", list = EXPERTS } = {}) {
  const words = String(search || "").toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((entry) => {
    if (problemsWith(entry).length) return false;
    if (kind && !entry.kinds.includes(kind)) return false;
    const text = [entry.name, entry.about, entry.where, ...entry.kinds.map((k) => KINDS[k])].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
