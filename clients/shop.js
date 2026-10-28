// The shop maker's clients for a shop's own data and its stockroom (setup/later-steps.js): `shopData`, `stockroom`,
// `inventoryLink`, `siteCheck`, and the per-shop files kept in the registry (`envFiles`, `profileFiles`).
//
// - shopData and stockroom write with the platform's token through clients/firestore.js. The stockroom's data is its
//   own named database in the shop's project (plan 1.20, decided 28 October 2026), laid out as the stockroom copy
//   keeps it: settings/catalog { data: <JSON of every book by id>, ts }, settings/modeFlags { fs_mode_global,
//   fs_mode_<book> } (which storage each book uses; the link reads only books on the newer one), and
//   books/<id>/data/<part> { data: <JSON>, ts } (apps/stockroom/src/firebase.js).
// - inventoryLink calls the shop's own link admin, as the shop would from its admin page: POST
//   <functions>/createStripeCheckoutSession { action: "inventoryLink", op, … } with an admin's sign-in
//   (apps/shop/functions/checkoutAdmin.js handleInventoryLinkAdmin). Only the test shop uses it, signed in as the test
//   owner (clients/identity.js).

/**
 * The stockroom's own named database in each shop's project (plan 1.20). Its name is set in one place: setup step 5
 * creates it and step 6 writes it into the profile's `stockroom` block, which the stockroom copy opens and deploys
 * its rules to (apps/stockroom/scripts/deployConfig.mjs).
 */
export const STOCKROOM_DATABASE = "stockroom";

/** `firestoreFor(projectId)` gives the shop's default database. */
export function shopDataClient(firestoreFor) {
  return {
    get: (projectId, path) => firestoreFor(projectId).get(path),
    set: (projectId, path, data) => firestoreFor(projectId).set(path, data),
    async create(projectId, path, data) {
      if (!(await firestoreFor(projectId).create(path, data))) throw new Error(`${path} already exists`);
    },
  };
}

const parse = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

/** `firestoreFor(projectId)` gives the stockroom's named database in that project. */
export function stockroomClient(firestoreFor, { now = () => new Date() } = {}) {
  return {
    async books(projectId) {
      const doc = await firestoreFor(projectId).get("settings/catalog");
      const catalog = doc ? parse(doc.data) : {};
      return Object.fromEntries(Object.entries(catalog).filter(([key, book]) => !key.startsWith("_") && book && typeof book === "object"));
    },
    // One transaction: books already in the catalogue are never changed, the others are added, switched to the newer
    // storage and given an empty details document (a book with none counts as still on the old storage).
    async addBooks(projectId, books) {
      await firestoreFor(projectId).transaction(async (tx) => {
        const catalogDoc = await tx.get("settings/catalog");
        const catalog = catalogDoc ? parse(catalogDoc.data) : {};
        const flags = (await tx.get("settings/modeFlags")) ?? {};
        const added = books.filter((book) => !catalog[book.id]);
        if (!added.length) return;
        const ts = now().getTime();
        for (const book of added) {
          catalog[book.id] = book;
          flags[`fs_mode_${book.id}`] = true;
          if (!(await tx.get(`books/${book.id}/data/metadata`))) tx.create(`books/${book.id}/data/metadata`, { data: "{}", ts });
        }
        flags.fs_mode_global = true;
        tx.set("settings/catalog", { data: JSON.stringify(catalog), ts });
        tx.set("settings/modeFlags", flags);
      });
    },
  };
}

/**
 * `functionsBase(projectId)` is like https://<region>-<project>.cloudfunctions.net; `idToken(projectId)` an admin's
 * sign-in for that shop (the test owner's).
 */
export function inventoryLinkClient({ fetch, functionsBase, idToken }) {
  const ask = async (projectId, body) => {
    const response = await fetch(`${await functionsBase(projectId)}/createStripeCheckoutSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await idToken(projectId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "inventoryLink", ...body }),
    });
    let answer = {};
    try { answer = await response.json(); } catch { /* empty */ }
    if (!response.ok) throw new Error(answer.error ?? `the shop's link answered ${response.status}`);
    return answer;
  };
  return {
    state: async (projectId) => (await ask(projectId, { op: "status" })).state ?? null,
    async check(projectId) {
      const { connection = {} } = await ask(projectId, { op: "check" });
      return connection.ok ? { ok: true } : { ok: false, problem: connection.problem ?? connection.error ?? "unreachable" };
    },
    startSales: (projectId, { startDay }) => ask(projectId, { op: "startSales", startDay }),
    async saveLinks(projectId, links) {
      const { links: saved, errors = [] } = await ask(projectId, { op: "saveLinks", links });
      return { links: saved, errors };
    },
  };
}

/** A page answers: its status, and problems such as a page that says it is broken. */
export function siteCheckClient({ fetch }) {
  return {
    async get(url) {
      try {
        const response = await fetch(url, { method: "GET", redirect: "follow" });
        const text = await response.text();
        const problems = [];
        if (response.status === 200 && !text.trim()) problems.push("the page is empty");
        return { status: response.status, problems };
      } catch (error) {
        return { status: 0, problems: [`no answer (${error.message})`] };
      }
    },
  };
}

/**
 * A per-shop text file kept in the registry (`shops/<id>/files/<name>`): the functions env file (step 8) and the
 * served /shop-profile.js (step 6). The release build copies them into each shop's deploy.
 */
export function registryFiles(registryFirestore, name) {
  const path = (shopId) => `shops/${shopId}/files/${name}`;
  return {
    read: async (shopId) => (await registryFirestore.get(path(shopId)))?.text ?? null,
    write: (shopId, text) => registryFirestore.set(path(shopId), { text }),
  };
}
