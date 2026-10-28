// A small Firestore client over the REST API (v1), for platform code that reads and writes a shop's database as the
// platform: the shop maker, the release check, health checks and migrations. Endpoints, from Google's discovery
// document for firestore v1 (https://firestore.googleapis.com/$discovery/rest?version=v1):
//
//   documents.get             GET    v1/{name}                          name = projects/P/databases/D/documents/PATH
//   documents.createDocument  POST   v1/{parent}/{collectionId}?documentId=ID   body: Document { fields }
//   documents.patch           PATCH  v1/{name}?updateMask.fieldPaths=…&currentDocument.exists=…
//   documents.delete          DELETE v1/{name}?currentDocument.exists=true
//   documents.runQuery        POST   v1/{parent}:runQuery                body: { structuredQuery }
//   documents.beginTransaction POST  v1/{database}/documents:beginTransaction  -> { transaction }
//   documents.commit          POST   v1/{database}/documents:commit      body: { writes, transaction? }
//
// The admin token bypasses security rules, so every caller decides what it may touch. `database` is "(default)" for
// the shop; the stockroom's own named database (plan 1.20) is passed by name.
import { googleHttp, isAlreadyExists, isNotFound } from "./http.js";

export const FIRESTORE = "https://firestore.googleapis.com/v1";

/** A plain value as a Firestore Value. Whole numbers are integers, other numbers doubles, Dates timestamps. */
export function toValue(value) {
  if (value === null || value === undefined) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Firestore can't store ${value}`);
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: value.length ? { values: value.map(toValue) } : {} };
  if (typeof value === "object") return { mapValue: { fields: toFields(value) } };
  throw new Error(`Firestore can't store a ${typeof value}`);
}

export function toFields(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
}

/** A Firestore Value as a plain value. Timestamps come back as ISO strings, integers as numbers. */
export function fromValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("geoPointValue" in value) return { ...value.geoPointValue };
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in value) return fromFields(value.mapValue.fields ?? {});
  return null;
}

export function fromFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

/** True when Firestore says the whole database isn't there (not just one document). */
export const missingDatabase = (error) => isNotFound(error) && /database .*does not exist/i.test(String(error.message));

const OPS = { "==": "EQUAL", "!=": "NOT_EQUAL", "<": "LESS_THAN", "<=": "LESS_THAN_OR_EQUAL", ">": "GREATER_THAN", ">=": "GREATER_THAN_OR_EQUAL", "array-contains": "ARRAY_CONTAINS", in: "IN" };

function checkPath(path, kind) {
  const parts = String(path).split("/");
  if (parts.some((part) => !part) || (kind === "document" ? parts.length % 2 !== 0 : parts.length % 2 !== 1)) {
    throw new Error(`${path} is not a ${kind} path`);
  }
  return parts;
}

/**
 * `firestoreClient({ fetch, token, projectId, database })`:
 *   get(path) -> data | null              create(path, data) -> true, or false when the document was already there
 *   set(path, data, { fields? })          replaces the document, or only `fields` (an update mask) when given
 *   remove(path) -> true | false          query(collection, { where, orderBy, limit }) -> [{ id, path, data }]
 *   transaction(async (tx) => …)          tx.get(path); tx.create/set/update/remove queue writes, committed together
 */
export function firestoreClient({ fetch, token, projectId, database = "(default)" }) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? "")) throw new Error("firestoreClient needs a project id");
  const call = googleHttp({ fetch, token });
  const databaseName = `projects/${projectId}/databases/${database}`;
  const root = `${databaseName}/documents`;
  const nameOf = (path) => `${root}/${checkPath(path, "document").map(encodeURIComponent).join("/")}`;
  const url = (name) => `${FIRESTORE}/${name}`;

  const decode = (doc) => ({ id: doc.name.split("/").at(-1), path: doc.name.slice(root.length + 1).split("/").map(decodeURIComponent).join("/"), data: fromFields(doc.fields) });

  async function get(path, { transaction } = {}) {
    try {
      return fromFields((await call("GET", url(nameOf(path)), { query: { transaction } })).fields);
    } catch (error) {
      // A missing document is null; a missing database is an error (the shop isn't set up that far).
      if (isNotFound(error) && !missingDatabase(error)) return null;
      throw error;
    }
  }

  async function create(path, data) {
    const parts = checkPath(path, "document");
    const parent = parts.length > 2 ? `${root}/${parts.slice(0, -2).map(encodeURIComponent).join("/")}` : root;
    try {
      await call("POST", `${url(parent)}/${encodeURIComponent(parts.at(-2))}`, { query: { documentId: parts.at(-1) }, body: { fields: toFields(data) } });
      return true;
    } catch (error) {
      if (isAlreadyExists(error)) return false;
      throw error;
    }
  }

  async function set(path, data, { fields } = {}) {
    await call("PATCH", url(nameOf(path)), { query: { "updateMask.fieldPaths": fields }, body: { fields: toFields(data) } });
  }

  async function remove(path) {
    try {
      await call("DELETE", url(nameOf(path)), { query: { "currentDocument.exists": true } });
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async function query(collection, { where = [], orderBy = [], limit } = {}) {
    checkPath(collection, "collection");
    const parts = collection.split("/");
    const parent = parts.length > 1 ? `${root}/${parts.slice(0, -1).map(encodeURIComponent).join("/")}` : root;
    const filters = where.map(([field, op, value]) => {
      if (!OPS[op]) throw new Error(`unknown query operator ${op}`);
      return { fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: toValue(value) } };
    });
    const structuredQuery = {
      from: [{ collectionId: parts.at(-1) }],
      ...(filters.length === 1 ? { where: filters[0] } : filters.length ? { where: { compositeFilter: { op: "AND", filters } } } : {}),
      ...(orderBy.length ? { orderBy: orderBy.map(([field, direction = "asc"]) => ({ field: { fieldPath: field }, direction: direction === "desc" ? "DESCENDING" : "ASCENDING" })) } : {}),
      ...(limit ? { limit } : {}),
    };
    const rows = await call("POST", `${url(parent)}:runQuery`, { body: { structuredQuery } });
    return (Array.isArray(rows) ? rows : []).filter((row) => row.document).map((row) => decode(row.document));
  }

  // Firestore turns a transaction away (ABORTED) when someone else wrote the same documents; it is tried again.
  async function transaction(work, { attempts = 5 } = {}) {
    for (let attempt = 1; ; attempt += 1) {
      const { transaction: id } = await call("POST", `${url(databaseName)}/documents:beginTransaction`, { body: {} });
      const writes = [];
      const tx = {
        get: (path) => get(path, { transaction: id }),
        create: (path, data) => writes.push({ update: { name: nameOf(path), fields: toFields(data) }, currentDocument: { exists: false } }),
        set: (path, data) => writes.push({ update: { name: nameOf(path), fields: toFields(data) } }),
        update: (path, data) => writes.push({ update: { name: nameOf(path), fields: toFields(data) }, updateMask: { fieldPaths: Object.keys(data) }, currentDocument: { exists: true } }),
        remove: (path) => writes.push({ delete: nameOf(path) }),
      };
      const result = await work(tx);
      try {
        await call("POST", `${url(databaseName)}/documents:commit`, { body: { writes, transaction: id } });
        return result;
      } catch (error) {
        if (error?.code === "ABORTED" && attempt < attempts) continue;
        throw error;
      }
    }
  }

  return { projectId, database, get, create, set, remove, query, transaction };
}
