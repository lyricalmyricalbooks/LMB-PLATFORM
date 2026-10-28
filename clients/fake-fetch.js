// A fake `fetch` for the clients' tests: it answers from a script of expected requests, in order, and fails the test
// when a request differs from the script (method, address, body or a missing token). `seen` keeps every request.
//
//   const fetch = scriptedFetch([
//     { method: "GET", url: "https://…", status: 200, json: { … } },
//     { method: "POST", url: "https://…", body: { … }, status: 409, json: { error: { status: "ALREADY_EXISTS" } } },
//   ]);
import assert from "node:assert/strict";

export function scriptedFetch(script, { token = "test-token" } = {}) {
  const queue = [...script];
  const seen = [];
  const fetch = async (url, init = {}) => {
    const request = { method: init.method ?? "GET", url, headers: init.headers ?? {}, body: init.body === undefined ? undefined : JSON.parse(init.body) };
    seen.push(request);
    const expected = queue.shift();
    assert.ok(expected, `unexpected request ${request.method} ${url}`);
    assert.equal(`${request.method} ${url}`, `${expected.method} ${expected.url}`);
    if ("body" in expected) assert.deepEqual(request.body, expected.body, `body of ${request.method} ${url}`);
    if (expected.auth !== false) assert.equal(request.headers.Authorization, `Bearer ${token}`, `token on ${url}`);
    else assert.equal(request.headers.Authorization, undefined, `no token on ${url}`);
    const status = expected.status ?? 200;
    const text = expected.json === undefined ? "" : JSON.stringify(expected.json);
    return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text || "{}") };
  };
  fetch.seen = seen;
  fetch.done = () => assert.equal(queue.length, 0, `${queue.length} expected request(s) never made: ${queue.map((q) => `${q.method} ${q.url}`).join(", ")}`);
  return fetch;
}

export const token = async () => "test-token";
