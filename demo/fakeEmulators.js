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
      if (method === "POST" && target.searchParams.get("documentId")) {
        const key = `${path}/${target.searchParams.get("documentId")}`;
        if (docs.has(key)) return ok({ error: { status: "ALREADY_EXISTS", message: "exists" } }, 409);
        docs.set(key, JSON.parse(init.body).fields);
        return ok({});
      }
      if (method === "PATCH") {
        docs.set(path, JSON.parse(init.body).fields);
        return ok({});
      }
      if (method === "GET") return docs.has(path) ? ok({ fields: docs.get(path) }) : ok({ error: { message: "not found" } }, 404);
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { fetch, docs, files, accounts, requests, live: () => live };
}
