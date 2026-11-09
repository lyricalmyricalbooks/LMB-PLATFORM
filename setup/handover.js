// Setup step 20: hand over what the press set up at the front door (code plan 18.9). A press that opened its shop from
// setup mode (signup/frontDoor.js openShop) chose a look for its website and its admin, and may have kept a product file
// (18.7). Its name, plan, country and what it sells already reach the shop through the sign-up row; this step carries
// the rest into the new shop's own database, where the shop's admin applies it with its own tools (the look picker and
// Books › Import, apps/shop/src/app/admin/setupHandover.ts) the first time the owner opens it:
//
//   firstWeek/handover               { pressId, look, adminLook, file: { name, rows, at, parts } | null, at }
//   firstWeek/handover/parts/<n>     { text }: the kept file in pieces small enough for one document each
//
// Then the kept file is let go: the press record forgets its path, and the platform's copy is removed. The shop's own
// copy is the only one left. Safe to run twice: the hand-over is written again from the record, and once the file is let
// go the record no longer names it, so the shop's copy stays as it is.
//
// Clients:
//   presses      get(pressId) -> the setup record | null; update(pressId, fn) (signup/fakes.js fakeFrontDoorStores)
//   stagedFiles  read(path) -> Buffer | null; remove(path) (signup/frontDoor.js)
//   shopData     get / set (clients/shop.js)
// A shop made from the old sign-up page has no `pressId`: nothing to hand over.

/** The largest piece of the file kept in one document, in UTF-8 bytes: well under a document's 1 MiB, counting the field's overhead. */
export const PART_BYTES = 900_000;
export const HANDOVER_DOC = "firstWeek/handover";
const partPath = (n) => `${HANDOVER_DOC}/parts/${n}`;
// Worded for the repair queue (shopMaker.js NEEDS_A_PERSON): a retry can't connect the store.
const NOT_CONNECTED = "the kept product files' store isn't connected, so the file kept in setup can't be carried to the shop: a person connects it";

/**
 * The text in pieces of at most `size` UTF-8 bytes (Firestore counts bytes, not characters), each cut between whole
 * characters so no piece ends in half of one. At least one piece, so an empty file still has one.
 */
export function partsOf(text, size = PART_BYTES) {
  const parts = [];
  let piece = "";
  let bytes = 0;
  for (const char of text) {
    const length = Buffer.byteLength(char, "utf8");
    if (bytes + length > size && piece) { parts.push(piece); piece = ""; bytes = 0; }
    piece += char;
    bytes += length;
  }
  if (piece || !parts.length) parts.push(piece);
  return parts;
}

export function handoverStep({ number = 20, presses = null, stagedFiles = null, shopData, now = () => new Date() }) {
  const pressOf = async (shop) => (shop.pressId && presses ? presses.get(shop.pressId) : null);
  // Only the website's admin reads the hand-over: a stockroom on its own keeps its file kept until the stockroom imports.
  const carriesFile = (shop) => shop.plan !== "stockroom";
  return {
    number,
    name: "Hand over the look and the product file the press chose in setup",
    async check({ shop }) {
      const press = await pressOf(shop);
      if (!press) return true;
      const handover = await shopData.get(shop.shopId, HANDOVER_DOC);
      return !!handover && (!press.stagedImportPath || !carriesFile(shop));
    },
    async act({ shop }) {
      const press = await pressOf(shop);
      if (!press) return { detail: { nothing: true } };
      const path = carriesFile(shop) ? press.stagedImportPath : "";
      // Fails loudly rather than mark the step done with the file left behind for good (a later run never looks again).
      if (path && !stagedFiles) throw new Error(NOT_CONNECTED);
      const at = now().toISOString();
      const earlier = await shopData.get(shop.shopId, HANDOVER_DOC);
      const handover = (file) => ({ pressId: press.pressId, look: press.look ?? "", adminLook: press.adminLook ?? "", file, at: earlier?.at ?? at });
      // The looks first, so a file that fails part way never costs the press its look.
      let file = earlier?.file ?? null;
      await shopData.set(shop.shopId, HANDOVER_DOC, handover(file));
      if (path) {
        const bytes = await stagedFiles.read(path);
        // The record names a file the platform no longer has: nothing to carry, and nothing to promise the press.
        if (bytes) {
          const parts = partsOf(Buffer.from(bytes).toString("utf8"));
          for (const [n, text] of parts.entries()) await shopData.set(shop.shopId, partPath(n), { text });
          const kept = press.stagedImport ?? {};
          file = { name: kept.name ?? "products.csv", rows: kept.rows ?? 0, at: kept.at ?? at, parts: parts.length };
          await shopData.set(shop.shopId, HANDOVER_DOC, handover(file));
        }
        // The shop has its copy: the record lets go first, then the platform's copy goes.
        await presses.update(press.pressId, (current) => (current?.stagedImportPath === path
          ? { row: { ...current, stagedImportPath: "" }, result: null } : { row: null, result: null }));
        await stagedFiles.remove(path);
      }
      return { detail: { look: !!press.look, adminLook: !!press.adminLook, file: file ? { rows: file.rows, parts: file.parts } : null } };
    },
  };
}
