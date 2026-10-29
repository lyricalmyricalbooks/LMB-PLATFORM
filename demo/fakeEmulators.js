// A pretend emulator suite for the demo's tests (demo.test.js, sample-press.test.js): sign-in, storage, Firestore
// documents and the Realtime Database in memory, every request recorded. `ports` says which port is which emulator:
// the demo's usual ones by default, the sample press's internal ones when it is given hosted.js INTERNAL_PORTS.
import { PORTS } from "./config.js";

export function fakeEmulators(ports = PORTS) {
  const docs = new Map();
  const files = new Set();
  const accounts = new Set();
  let live = { untouched: true };
  const requests = [];
  const ok = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? "GET";
    requests.push({ method, url: String(url), headers: init.headers ?? {}, body: init.body });
    const auth = new Headers(init.headers ?? {}).get("authorization");
    const port = Number(target.port);
    if (port === ports.auth) {
      if (method === "DELETE" && /^\/emulator\/v1\/projects\/demo-colophon-test\/accounts$/.test(target.pathname)) {
        accounts.clear();
        return ok({});
      }
      if (target.pathname.endsWith("accounts:signInWithIdp")) {
        const isNewUser = !accounts.has("uid-1");
        accounts.add("uid-1");
        return ok({ localId: "uid-1", isNewUser });
      }
      if (target.pathname.endsWith("accounts:update")) return auth === "Bearer owner" ? ok({}) : ok({ error: { message: "no" } }, 401);
    }
    if (port === ports.database) {
      if (method === "PUT" && target.pathname === "/.json" && auth === "Bearer owner") {
        live = JSON.parse(init.body);
        return ok(live);
      }
      if (method === "GET") return ok(live);
    }
    if (port === ports.storage) {
      if (method === "GET") return files.has(target.pathname) ? ok({}) : ok({ error: {} }, 404);
      const name = target.searchParams.get("name");
      files.add(`/v0/b/demo-colophon-test.appspot.com/o/${encodeURIComponent(name)}`);
      return ok({ name });
    }
    if (port === ports.firestore) {
      const clear = /^\/emulator\/v1\/projects\/demo-colophon-test\/databases\/([^/]+)\/documents$/.exec(decodeURIComponent(target.pathname));
      if (clear && method === "DELETE") {
        for (const key of [...docs.keys()]) if (key.startsWith(`${clear[1]}/documents/`)) docs.delete(key);
        return ok({});
      }
      const path = decodeURIComponent(target.pathname.replace(/^\/v1\/projects\/demo-colophon-test\/databases\//, ""));
      const full = (key) => `projects/demo-colophon-test/databases/${key}`;
      // Saving and restoring a whole database (keepDatabase.js): collection ids under a parent, a collection's
      // documents a page at a time (with parents that exist only through their subcollections), and a commit.
      if (method === "POST" && path.endsWith(":listCollectionIds")) {
        const parent = path.slice(0, -":listCollectionIds".length);
        const ids = new Set([...docs.keys()].filter((key) => key.startsWith(`${parent}/`)).map((key) => key.slice(parent.length + 1).split("/")[0]));
        return ok({ collectionIds: [...ids].sort() });
      }
      if (method === "POST" && path.endsWith(":commit")) {
        for (const { update } of JSON.parse(init.body).writes) docs.set(update.name.replace(full(""), ""), update.fields);
        return ok({});
      }
      const segments = path.split("/").slice(2); // after "<database>/documents"
      if (method === "GET" && segments.length % 2 === 1) {
        const below = [...docs.keys()].filter((key) => key.startsWith(`${path}/`)).map((key) => key.slice(path.length + 1).split("/")[0]);
        const ids = [...new Set(below)].sort();
        const size = Number(target.searchParams.get("pageSize") || 100);
        const from = Number(target.searchParams.get("pageToken") || 0);
        const documents = ids.slice(from, from + size).map((id) => {
          const key = `${path}/${id}`;
          return docs.has(key) ? { name: full(key), fields: docs.get(key), createTime: "2026-10-28T00:00:00Z" } : { name: full(key) };
        });
        return ok({ documents, ...(from + size < ids.length ? { nextPageToken: String(from + size) } : {}) });
      }
      if (method === "POST" && target.searchParams.get("documentId")) {
        const key = `${path}/${target.searchParams.get("documentId")}`;
        if (docs.has(key)) return ok({ error: { status: "ALREADY_EXISTS", message: "exists" } }, 409);
        docs.set(key, JSON.parse(init.body).fields);
        return ok({});
      }
      if (method === "PATCH") {
        const fields = JSON.parse(init.body).fields ?? {};
        const mask = target.searchParams.getAll("updateMask.fieldPaths");
        if (!mask.length) docs.set(path, fields);
        else {
          // Only the masked fields change, as Firestore does: a dotted path reaches into maps, and a masked field
          // missing from the body is removed.
          const doc = structuredClone(docs.get(path) ?? {});
          for (const fieldPath of mask) {
            const parts = fieldPath.split(".");
            let to = doc;
            let from = fields;
            for (const part of parts.slice(0, -1)) {
              to[part] ??= { mapValue: { fields: {} } };
              to = to[part].mapValue.fields;
              from = from?.[part]?.mapValue?.fields;
            }
            const last = parts.at(-1);
            if (from && last in from) to[last] = from[last];
            else delete to[last];
          }
          docs.set(path, doc);
        }
        return ok({});
      }
      if (method === "GET") return docs.has(path) ? ok({ fields: docs.get(path) }) : ok({ error: { message: "not found" } }, 404);
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { fetch, docs, files, accounts, requests, live: () => live };
}
