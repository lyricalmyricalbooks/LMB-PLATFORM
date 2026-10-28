// A local run of the whole release check with a real browser (Playwright's Chromium) against stand-in pages served
// from this machine: a shop with the same class names and field ids the real one uses, a card form in its own frame
// like Stripe's, a stockroom that brings orders in only while open and signed in, and an admin that lists orders only
// for a signed-in owner. It proves the browser driver (browser.js), the sign-in hand-over (Firebase's IndexedDB store)
// and the runner end to end. It does not prove the real shop's pages: that needs the real test shop (docs/test-shop.md).
//
//   node release-check/local-proof.js        (needs Playwright; CHROMIUM_PATH to use an installed Chromium)
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { playwrightBrowser, authKey } from "./browser.js";
import { runReleaseCheck } from "./runner.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { TEST_PRINTED_IDS, TEST_STOCK } from "../setup/test-catalogue.js";

const API_KEY = "AIzaLocalProofKey";
const OWNER = "owner@example.com";

const signedInScript = `
  function signedInUser() {
    return new Promise((resolve) => {
      const open = indexedDB.open("firebaseLocalStorageDb", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      open.onsuccess = () => {
        const tx = open.result.transaction("firebaseLocalStorage", "readonly");
        const get = tx.objectStore("firebaseLocalStorage").get(${JSON.stringify(authKey(API_KEY))});
        get.onsuccess = () => resolve(get.result && get.result.value);
        get.onerror = () => resolve(null);
      };
      open.onerror = () => resolve(null);
    });
  }`;

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

/** The stand-in shop and stockroom, with the server-side state the checks read. */
export function standInShop() {
  const state = {
    books: Object.fromEntries(TEST_PRINTED_IDS.map((id) => [id, { stockLevel: TEST_STOCK, trackInventory: true, title: id }])),
    orders: {},
    emailLog: [],
    stockroom: { onHand: Object.fromEntries(TEST_PRINTED_IDS.map((id) => [id, TEST_STOCK])), published: false, websiteOrders: {} },
  };
  let next = 1;
  const routes = {
    "/": () => page("Home", `<header>Test Press</header><main>${TEST_PRINTED_IDS.map((id) => `<a href="/books/${id}"><h3 class="fm-card-title">${id}</h3><span>$20.00</span></a>`).join("")}</main><footer></footer>`),
    "/collections/publications": () => page("Publications", `<main><h3 class="fm-card-title">Test Book One</h3><span>$20.00</span></main>`),
    "/stripe-frame.html": () => page("card", `<input name="number"><input name="expiry"><input name="cvc"><input name="postalCode">`),
    "/checkout": () => page("Checkout", `<form onsubmit="return false">
      <input type="email" id="co-field-email"><input id="co-field-name"><input id="co-field-street"><input id="co-field-city">
      <select id="co-field-state"><option value="ON">Ontario</option></select><input id="co-field-zip">
      <label><input type="radio" name="fulfillment-option" value="ship"> Ship</label>
      <iframe src="/stripe-frame.html"></iframe>
      <button type="submit" class="fm-co-paybtn-main">Pay</button></form>
      <script>
        document.querySelector(".fm-co-paybtn-main").addEventListener("click", async () => {
          const card = document.querySelector("iframe").contentDocument;
          const body = { email: document.querySelector("#co-field-email").value, number: card.querySelector("[name=number]").value,
            book: sessionStorage.getItem("bag"), shipping: document.querySelector("[name=fulfillment-option]").checked };
          const res = await fetch("/pay", { method: "POST", body: JSON.stringify(body) });
          const { orderId, error } = await res.json();
          if (orderId) location.href = "/checkout?success=true&order_id=" + encodeURIComponent(orderId); else document.body.append(error);
        });
      </script>`),
    "/stockroom/": () => page("Stockroom", `<main id="app">Stockroom</main><script>${signedInScript}
      signedInUser().then((user) => {
        if (!user || user.email !== ${JSON.stringify(OWNER)} || !user.emailVerified) return;
        window.IS_PUBLISHER = true;
        // Brings website orders in while open, like runWebsiteImport.
        const tick = () => fetch("/stockroom/import", { method: "POST" });
        tick(); setInterval(tick, 300);
      });</script>`),
    "/admin": () => page("Admin", `<main id="admin">Sign in</main><script>${signedInScript}
      signedInUser().then(async (user) => {
        if (!user || user.email !== ${JSON.stringify(OWNER)}) return;
        const orders = await (await fetch("/admin/orders")).json();
        document.querySelector("#admin").innerHTML = orders.map((id) => '<button aria-label="Order ' + id + ', Release Check">' + id + "</button>").join("");
      });</script>`),
  };
  const bookPage = (id) => page(id, `<main><div class="fm-pdp-card"><h1 class="fm-pdp-title">${id}</h1><span>$20.00</span>
    <button onclick="sessionStorage.setItem('bag', '${id}'); document.querySelector('#bag').hidden = false">Add to bag</button></div>
    <aside id="bag" class="fm-bag" hidden><a href="/checkout">Checkout</a></aside></main>`);

  const json = (res, value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.method === "POST" && pathname === "/pay") {
      const { email, number, book, shipping } = JSON.parse(body);
      if (number !== "4242424242424242" || !shipping || !state.books[book]) return json(res, { error: "declined" }, 402);
      const orderId = `LOCAL-${next++}`;
      state.orders[orderId] = { paymentStatus: "paid", sandboxPayment: true, isTest: true, createdAt: new Date().toISOString(), items: [{ bookId: book, quantity: 1 }] };
      state.books[book].stockLevel -= 1;
      state.stockroom.websiteOrders[orderId] = { web: { books: { [book]: 1 } }, pending: true };
      state.emailLog.push({ orderId, kind: "orderConfirmed", status: "sent", to: email });
      return json(res, { orderId });
    }
    if (req.method === "POST" && pathname === "/stockroom/import") {
      const room = state.stockroom;
      room.published = true;
      for (const [id, doc] of Object.entries(room.websiteOrders)) {
        if (!doc.pending) continue;
        for (const [bookId, qty] of Object.entries(doc.web.books)) room.onHand[bookId] += doc.web.refunded ? qty : -qty;
        room.websiteOrders[id] = { ...doc, pending: false, imported: { at: new Date().toISOString() } };
      }
      return json(res, { ok: true });
    }
    if (pathname === "/admin/orders") return json(res, Object.keys(state.orders));
    const html = routes[pathname]?.() ?? (pathname.startsWith("/books/") ? bookPage(pathname.slice(7)) : null);
    if (!html) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  const clients = {
    shopData: {
      order: async (id) => structuredClone(state.orders[id] ?? null),
      book: async (id) => structuredClone(state.books[id] ?? null),
      orderEmails: async (id) => state.emailLog.filter((e) => e.orderId === id),
      testOrdersBefore: async (iso) => Object.entries(state.orders).filter(([, o]) => o.isTest && o.sandboxPayment && o.createdAt < iso).map(([id]) => id),
      removeOrder: async (id) => { delete state.orders[id]; },
    },
    stockroomData: {
      feed: async (bookId) => (state.stockroom.published ? { onHand: state.stockroom.onHand[bookId] } : null),
      websiteOrder: async (id) => structuredClone(state.stockroom.websiteOrders[id] ?? null),
    },
    shopAdmin: {
      async refund(orderId) {
        const order = state.orders[orderId];
        order.paymentStatus = "refunded";
        for (const { bookId, quantity } of order.items) state.books[bookId].stockLevel += quantity;
        state.stockroom.websiteOrders[orderId] = { web: { ...state.stockroom.websiteOrders[orderId].web, refunded: true }, pending: true };
      },
    },
  };
  return { server, state, clients };
}

export async function localProof({ chromium, print = console.log, executablePath } = {}) {
  const { server, state, clients } = standInShop();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const registry = fakeRegistry();
  await registry.createShop("lmb-test-shop", { shopId: "lmb-test-shop", testShop: true, testMode: true, status: "live" });
  const session = { apiKey: API_KEY, idToken: "local", user: { uid: "owner", email: OWNER, emailVerified: true, stsTokenManager: {}, apiKey: API_KEY, appName: "[DEFAULT]" } };
  try {
    const browser = await playwrightBrowser({ chromium, launchOptions: { executablePath }, timeoutMs: 15_000 });
    const result = await runReleaseCheck({
      shopId: "lmb-test-shop", version: "local", registry, auditLog: fakeAuditLog(), inbox: "checks@example.com", print,
      clients: { ...clients, browser, session, profile: {}, urls: { site: base, stockroom: `${base}/stockroom/` } },
      wait: undefined,
    });
    return { result, state };
  } finally {
    server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const { result } = await localProof({ chromium, executablePath: process.env.CHROMIUM_PATH || undefined });
  console.log(result.ok ? "Local release check passed." : `Local release check failed at check ${result.failedCheck}: ${result.error}`);
  process.exitCode = result.ok ? 0 : 1;
}
