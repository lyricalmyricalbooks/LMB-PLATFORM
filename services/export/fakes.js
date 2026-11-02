// Pretend clients for a press's data export (export.js). Nothing here reaches Google.

/** The exports made, in memory (the real one is dataExports/<id> in the platform project, which no browser reads). */
export function fakeExportStore() {
  const rows = new Map();
  return {
    rows,
    get: async (id) => structuredClone(rows.get(id) ?? null),
    set: async (id, row) => void rows.set(id, structuredClone(row)),
    list: async ({ shopId } = {}) => structuredClone([...rows.values()].filter((row) => !shopId || row.shopId === shopId)),
    /** Reads and writes with nothing awaited in between, so it is atomic like the real store's transaction. `fn` returning null writes nothing. */
    update: async (id, fn) => {
      const next = fn(structuredClone(rows.get(id) ?? null));
      if (next) rows.set(id, structuredClone(next));
      return structuredClone(next ?? null);
    },
  };
}

/**
 * A pretend storage bucket. `files` holds what was written by path; `signedUrl` gives a made-up link carrying its
 * expiry, and `open(link, atMs)` answers like the real signed link: the file until it runs out, then nothing.
 * `failWrites` makes every write throw.
 */
export function fakeExportStorage() {
  const files = new Map();
  const links = new Map();
  const storage = {
    files,
    links,
    failWrites: false,
    write: async (path, content, { contentType } = {}) => {
      if (storage.failWrites) throw new Error("the bucket didn't answer (pretend error)");
      files.set(path, { content: Buffer.isBuffer(content) ? Buffer.from(content) : String(content), contentType });
    },
    signedUrl: async (path, { expiresAt }) => {
      if (!files.has(path)) throw new Error(`no file at ${path}`);
      const link = `https://storage.example/${path}?expires=${encodeURIComponent(expiresAt)}&signature=fake${links.size + 1}`;
      links.set(link, { path, expiresAt });
      return link;
    },
    open: (link, atMs) => {
      const signed = links.get(link);
      if (!signed || atMs >= Date.parse(signed.expiresAt)) return null;
      return files.get(signed.path)?.content ?? null;
    },
  };
  return storage;
}

/** A shop's database with `list`, like clients/shop.js shopDataClient (accounts/fakes.js fakeShopData is the same). */
export { fakeShopData } from "../../accounts/fakes.js";
