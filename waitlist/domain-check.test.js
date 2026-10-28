import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOTSTRAP_URL, CANDIDATES, checkDomains, rdapBaseFor } from "./domain-check.js";

const bootstrap = {
  services: [
    [["com", "net"], ["https://rdap.registry.example/com/v1/"]],
    [["press"], ["http://rdap.press.example/", "https://rdap.press.example"]],
  ],
};

// A fake registry: names in `taken` answer 200, others 404; `broken` names answer 503; `down` throws.
function fakeFetch({ taken = [], broken = [], down = [] } = {}) {
  const seen = [];
  const fetch = async (url) => {
    seen.push(url);
    if (url === BOOTSTRAP_URL) return { ok: true, status: 200, json: async () => bootstrap };
    const name = url.split("/domain/")[1];
    if (down.includes(name)) throw new Error("connection reset");
    const status = broken.includes(name) ? 503 : taken.includes(name) ? 200 : 404;
    return { ok: status === 200, status, json: async () => ({}) };
  };
  fetch.seen = seen;
  return fetch;
}

test("the registry for each ending comes from IANA's list, over https only", () => {
  assert.equal(rdapBaseFor(bootstrap, "colophon.com"), "https://rdap.registry.example/com/v1/");
  assert.equal(rdapBaseFor(bootstrap, "colophon.press"), "https://rdap.press.example/");
  assert.equal(rdapBaseFor(bootstrap, "colophon.zz"), "");
});

test("registered, not registered and unknown answers are told apart, and one bad answer stops nothing", async () => {
  const fetch = fakeFetch({ taken: ["colophon.com"], broken: ["usecolophon.com"], down: ["colophonhq.com"] });
  const results = await checkDomains(["colophon.com", "Colophon.Press ", "usecolophon.com", "colophonhq.com", "colophon.zz"], { fetch });
  assert.deepEqual(results.map((r) => [r.domain, r.status]), [
    ["colophon.com", "registered"],
    ["colophon.press", "not registered"],
    ["usecolophon.com", "unknown"],
    ["colophonhq.com", "unknown"],
    ["colophon.zz", "unknown"],
  ]);
  assert.equal(fetch.seen[0], BOOTSTRAP_URL);
  assert.ok(fetch.seen.includes("https://rdap.press.example/domain/colophon.press"));
});

test("it only ever reads: every request is a plain GET", async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push(init.method ?? "GET");
    return url === BOOTSTRAP_URL ? { ok: true, status: 200, json: async () => bootstrap } : { ok: false, status: 404 };
  };
  await checkDomains(["colophon.com"], { fetch });
  assert.deepEqual(calls, ["GET", "GET"]);
});

test("refuses something that isn't a domain name before asking anyone", async () => {
  const fetch = fakeFetch();
  for (const bad of ["colophon", "-colophon.com", "colo phon.com", "colophon.com/x"]) {
    await assert.rejects(checkDomains([bad], { fetch }), /not a domain name/, bad);
  }
  assert.equal(fetch.seen.length, 0);
});

test("the candidate list is all colophon names, with no duplicates", () => {
  assert.equal(new Set(CANDIDATES).size, CANDIDATES.length);
  for (const name of CANDIDATES) assert.match(name, /colophon/);
});
