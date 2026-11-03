import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createHttpServer } from "./http.js";

/** Starts a server on a free port around `handle`, runs `work(base)`, then stops it. */
async function withServer(handle, work, options) {
  const server = createHttpServer(handle, options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await work(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("a request reaches the door as method, path, query, headers, parsed body, raw body and ip", async () => {
  let seen;
  await withServer(async (request) => {
    seen = request;
    return { status: 201, body: { ok: true, echo: request.body } };
  }, async (base) => {
    const raw = '{"pressName":"Moth Press",  "n": 1}';
    const response = await fetch(`${base}/api/signup/address?shopId=moth-press&x=1`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer abc", "Stripe-Signature": "t=1,v1=x" }, body: raw });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, echo: { pressName: "Moth Press", n: 1 } });
    assert.equal(seen.method, "POST");
    assert.equal(seen.path, "/api/signup/address");
    assert.deepEqual(seen.query, { shopId: "moth-press", x: "1" });
    assert.equal(seen.headers.authorization, "Bearer abc");
    assert.equal(seen.headers["stripe-signature"], "t=1,v1=x");
    // The exact text, spaces and all, for signature checks.
    assert.equal(seen.rawBody, raw);
    assert.equal(seen.ip, "127.0.0.1");
  });
});

test("every answer carries the safety headers and is never cached; a page is sent as a page", async () => {
  await withServer(async (request) => (request.path === "/tips/off" ? { status: 200, html: "<!doctype html><p>Done</p>" } : { status: 200, body: { ok: true } }), async (base) => {
    const json = await fetch(`${base}/api/plans`);
    assert.equal(json.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(json.headers.get("cache-control"), "no-store");
    assert.equal(json.headers.get("x-content-type-options"), "nosniff");
    assert.equal(json.headers.get("x-frame-options"), "DENY");
    assert.match(json.headers.get("strict-transport-security"), /max-age=31536000/);
    assert.equal(json.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'");
    const page = await fetch(`${base}/tips/off?shop=a&sig=b`);
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(page.headers.get("content-security-policy"), /style-src 'unsafe-inline'/);
    assert.equal(await page.text(), "<!doctype html><p>Done</p>");
  });
});

test("a door's own headers are sent (a redirect), and a body that isn't JSON reaches it only as raw text", async () => {
  let seen;
  await withServer(async (request) => {
    seen = request;
    return { status: 302, body: {}, headers: { Location: "https://platform.example/account/" } };
  }, async (base) => {
    const response = await fetch(`${base}/api/payments/square/oauth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json", redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://platform.example/account/");
    assert.equal(seen.body, null);
    assert.equal(seen.rawBody, "{not json");
  });
});

test("a body over the limit is refused before the door sees it", async () => {
  let called = false;
  await withServer(async () => {
    called = true;
    return { status: 200, body: {} };
  }, async (base) => {
    const big = await fetch(`${base}/api/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: "a".repeat(2000) }) });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).ok, false);
    // A sender that hides the size (chunked) is cut off as it goes over.
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(`${base}/api/signup`, { method: "POST", headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.write("a".repeat(600));
      req.end("b".repeat(600));
    });
    assert.equal(status, 413);
  }, { maxBytes: 1000 });
  assert.equal(called, false);
});

test("a door that throws answers 500 in plain words and the error goes only to the log", async () => {
  const logged = [];
  await withServer(async () => {
    throw new Error("secret detail sk_test_123");
  }, async (base) => {
    const response = await fetch(`${base}/api/plans`);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.doesNotMatch(JSON.stringify(body), /secret detail/);
  }, { log: (line) => logged.push(line) });
  assert.match(logged.join("\n"), /secret detail/);
});
