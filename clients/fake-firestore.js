// A pretend Firestore behind `fetch`, for tests of the real stores (clients/firestore.js speaks to it exactly as it
// speaks to Google). It answers the REST calls that client makes, from memory: documents get, createDocument, patch
// (with or without an update mask), delete, runQuery (field filters, AND, order, limit, direct children of one parent),
// beginTransaction and commit. A commit whose transaction read a document someone else changed since is turned away
// with ABORTED, as Google does, so a store's transaction is really tested for "only one of two wins".
//
//   const fs = fakeFirestore();                 // fs.fetch is the fetch; fs.docs the documents by "project db path"
//   const db = firestoreClient({ fetch: fs.fetch, token, projectId: "lmb-platform-prod" });
//
// Every call must carry the token (`Bearer test-token`, like clients/fake-fetch.js); `fs.calls` counts them, `fs.fail`
// makes the next that many calls answer 500, and `fs.noDatabase` holds "project database" pairs that don't exist yet.
// Nothing here reaches the network.
import { fromFields, fromValue } from "./firestore.js";

const BASE = "https://firestore.googleapis.com/v1/";
const OPS = {
  EQUAL: (a, b) => a === b,
  NOT_EQUAL: (a, b) => a !== b,
  LESS_THAN: (a, b) => a < b,
  LESS_THAN_OR_EQUAL: (a, b) => a <= b,
  GREATER_THAN: (a, b) => a > b,
  GREATER_THAN_OR_EQUAL: (a, b) => a >= b,
  ARRAY_CONTAINS: (a, b) => Array.isArray(a) && a.includes(b),
  IN: (a, b) => Array.isArray(b) && b.includes(a),
};

const answer = (status, json) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json), json: async () => json });
const failure = (status, code, message) => answer(status, { error: { code: status, status: code, message } });

/** The plain value at a dotted field path ("payments.provider"), or undefined. */
const fieldOf = (data, path) => path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), data);

export function fakeFirestore({ token = "test-token" } = {}) {
  // "project db path" -> { fields, version }
  const docs = new Map();
  const transactions = new Map();
  let version = 0;
  let nextTx = 1;
  // `noDatabase` holds "project db" pairs that answer "database does not exist" (a shop not set up that far).
  const state = { docs, calls: 0, fail: 0, aborted: 0, transactions, noDatabase: new Set() };

  // name: projects/P/databases/D/documents/a/b -> { key: "P D a/b", path: "a/b", root }
  const parse = (name) => {
    const m = name.match(/^projects\/([^/]+)\/databases\/([^/]+)\/documents(?:\/(.*))?$/);
    if (!m) throw new Error(`not a document name: ${name}`);
    const path = (m[3] ?? "").split("/").filter(Boolean).map(decodeURIComponent).join("/");
    return { project: m[1], db: decodeURIComponent(m[2]), path, key: `${m[1]} ${decodeURIComponent(m[2])} ${path}`, root: `projects/${m[1]}/databases/${m[2]}/documents` };
  };
  const docName = (root, path) => `${root}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const plain = (key) => fromFields(docs.get(key).fields);

  function write(key, fields) {
    version += 1;
    docs.set(key, { fields: structuredClone(fields), version });
  }

  function applyWrites(writes) {
    // Checked first, applied together: a commit is all or nothing.
    for (const w of writes) {
      const target = w.update ? parse(w.update.name) : parse(w.delete);
      const exists = docs.has(target.key);
      if (w.currentDocument?.exists === false && exists) return failure(409, "ALREADY_EXISTS", "Document already exists");
      if (w.currentDocument?.exists === true && !exists) return failure(404, "NOT_FOUND", "No document to update");
    }
    for (const w of writes) {
      if (w.delete) {
        docs.delete(parse(w.delete).key);
        continue;
      }
      const { key } = parse(w.update.name);
      const mask = w.updateMask?.fieldPaths;
      write(key, mask ? { ...(docs.get(key)?.fields ?? {}), ...Object.fromEntries(mask.filter((f) => f in w.update.fields).map((f) => [f, w.update.fields[f]])) } : w.update.fields);
      if (mask) for (const f of mask) if (!(f in w.update.fields)) delete docs.get(key).fields[f];
    }
    return null;
  }

  function runQuery(parent, structuredQuery) {
    const { root, path: parentPath } = parse(parent);
    const collection = structuredQuery.from[0].collectionId;
    const prefix = `${parse(root).project} ${parse(root).db} ${parentPath ? `${parentPath}/` : ""}${collection}/`;
    const filters = structuredQuery.where?.compositeFilter ? structuredQuery.where.compositeFilter.filters : structuredQuery.where ? [structuredQuery.where] : [];
    let rows = [...docs.keys()]
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
      .map((key) => ({ key, path: key.split(" ").slice(2).join(" "), data: plain(key) }))
      .filter((row) => filters.every(({ fieldFilter: { field, op, value } }) => {
        const got = fieldOf(row.data, field.fieldPath);
        return got !== undefined && OPS[op](got, fromValue(value));
      }));
    for (const order of [...(structuredQuery.orderBy ?? [])].reverse()) {
      const dir = order.direction === "DESCENDING" ? -1 : 1;
      rows = rows.filter((row) => fieldOf(row.data, order.field.fieldPath) !== undefined)
        .sort((a, b) => {
          const x = fieldOf(a.data, order.field.fieldPath);
          const y = fieldOf(b.data, order.field.fieldPath);
          return x < y ? -dir : x > y ? dir : 0;
        });
    }
    if (structuredQuery.limit) rows = rows.slice(0, structuredQuery.limit);
    if (!rows.length) return [{ readTime: "2026-11-02T00:00:00Z" }];
    return rows.map((row) => ({ document: { name: docName(root, row.path), fields: structuredClone(docs.get(row.key).fields) } }));
  }

  state.fetch = async (url, init = {}) => {
    state.calls += 1;
    if ((init.headers ?? {}).Authorization !== `Bearer ${token}`) return failure(401, "UNAUTHENTICATED", "no token");
    if (state.fail > 0) {
      state.fail -= 1;
      return failure(500, "INTERNAL", "pretend outage");
    }
    if (!url.startsWith(BASE)) throw new Error(`the pretend Firestore only answers Firestore: ${url}`);
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : {};
    const name = parsed.pathname.slice("/v1/".length);
    const where = name.match(/^projects\/([^/]+)\/databases\/([^/]+)\//);
    if (where && state.noDatabase.has(`${where[1]} ${decodeURIComponent(where[2])}`)) {
      return failure(404, "NOT_FOUND", `The database ${decodeURIComponent(where[2])} does not exist for project ${where[1]}`);
    }

    if (method === "POST" && name.endsWith(":beginTransaction")) {
      const id = `tx${nextTx++}`;
      transactions.set(id, new Map());
      return answer(200, { transaction: id });
    }
    if (method === "POST" && name.endsWith(":commit")) {
      if (body.transaction) {
        const reads = transactions.get(body.transaction);
        transactions.delete(body.transaction);
        if (!reads) return failure(400, "INVALID_ARGUMENT", "unknown transaction");
        for (const [key, seen] of reads) if ((docs.get(key)?.version ?? 0) !== seen) return (state.aborted += 1), failure(409, "ABORTED", "Too much contention on these documents. Please try again.");
      }
      const refused = applyWrites(body.writes ?? []);
      return refused ?? answer(200, { commitTime: "2026-11-02T00:00:00Z" });
    }
    if (method === "POST" && name.endsWith(":runQuery")) return answer(200, runQuery(name.slice(0, -":runQuery".length), body.structuredQuery));

    if (method === "POST") {
      // createDocument: POST {parent}/{collectionId}?documentId=ID
      const target = parse(`${name}/${encodeURIComponent(parsed.searchParams.get("documentId"))}`);
      if (docs.has(target.key)) return failure(409, "ALREADY_EXISTS", `Document already exists: ${target.path}`);
      write(target.key, body.fields ?? {});
      return answer(200, { name: docName(target.root, target.path), fields: body.fields ?? {} });
    }
    const target = parse(name);
    if (method === "GET") {
      const tx = parsed.searchParams.get("transaction");
      if (tx && transactions.has(tx)) transactions.get(tx).set(target.key, docs.get(target.key)?.version ?? 0);
      if (!docs.has(target.key)) return failure(404, "NOT_FOUND", `Document "${name}" not found`);
      return answer(200, { name, fields: structuredClone(docs.get(target.key).fields) });
    }
    if (method === "PATCH") {
      const mask = parsed.searchParams.getAll("updateMask.fieldPaths");
      const refused = applyWrites([{ update: { name, fields: body.fields ?? {} }, ...(mask.length ? { updateMask: { fieldPaths: mask } } : {}) }]);
      return refused ?? answer(200, { name, fields: docs.get(target.key).fields });
    }
    if (method === "DELETE") {
      if (parsed.searchParams.get("currentDocument.exists") === "true" && !docs.has(target.key)) return failure(404, "NOT_FOUND", "No document to delete");
      docs.delete(target.key);
      return answer(200, {});
    }
    throw new Error(`the pretend Firestore can't answer ${method} ${url}`);
  };

  /** A document as plain data, or null: `get("lmb-platform-prod", "accounts/a1")` (default database). */
  state.get = (project, path, db = "(default)") => (docs.has(`${project} ${db} ${path}`) ? plain(`${project} ${db} ${path}`) : null);
  /** Every document path under a collection prefix, for checks. */
  state.paths = (project, prefix = "", db = "(default)") => [...docs.keys()].filter((k) => k.startsWith(`${project} ${db} ${prefix}`)).map((k) => k.split(" ").slice(2).join(" "));
  return state;
}
