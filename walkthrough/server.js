// The walkthrough server: the platform's own pages on pretend data, for a person to click through on their own computer
// (`npm run walkthrough`, walkthrough/README.md). It serves the pages' own files from their folders, with three small
// changes made as they are sent (the files on disk are never touched):
//   - signup/config.js        points the sign-in library at a stand-in (stub/) so "Continue with Google" signs in as a
//                             made-up person, and drops the platform project's web settings
//   - waitlist/config.js      turns the pricing on (the plans door and the sign-up page) and drops the platform project
//   - waitlist/firestoreStore.js  keeps waitlist sign-ups in this server's memory
// Everything the pages ask of `/api` goes to the same web door the road test uses (world.js), against a pretend Google
// and a pretend Stripe. The card page is a stand-in for Stripe's too (`/walkthrough/card`). No network call is made.
//
// The path `/` is the start page (startPage.js, plan 9.11): every page as the platform owner and as a press. The control
// room is served at `/control/`, and the stand-in sign-in lets admin@example.com in with the two-step sign-in done.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { platformWorld } from "./world.js";
import { randomSuffix } from "../signup/signup.js";
import { TERMS_VERSION } from "../terms/terms.js";
import { TEST_SHOP } from "../setup/test-shop.js";
import { PORTS, url } from "../demo/config.js";
import { startPage } from "./startPage.js";
import { seedRoom } from "./seedRoom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HERE = join(ROOT, "walkthrough");

/** The pages: where each is served and the folder its own files come from. */
export const MOUNTS = Object.freeze({
  "/waitlist/": "waitlist",
  "/signup/": "signup",
  "/account/": "accounts",
  "/accounts/": "accounts",
  "/help/": "help",
  "/terms/": "terms",
  "/control/": "control-room",
});

/** The address of each page the walkthrough is for, with what to expect there. */
export const PAGES = Object.freeze([
  { name: "Start page", path: "/", note: "every page below, as the platform owner and as a press, with who each signs in as" },
  { name: "Control room", path: "/control/", note: "signs in as admin@example.com, the platform owner, with the two-step sign-in done" },
  { name: "Waitlist", path: "/waitlist/", note: "the waitlist page with the plans and Start your free trial" },
  { name: "Sign up", path: "/signup/", note: "signs in as newcomer@example.com, who has no shop yet" },
  { name: "Account", path: "/account/", note: "signs in as owner@example.com, who has two made-up presses" },
]);

/** The two presses the walkthrough starts with, both owned by owner@example.com. */
export const SEED_PRESSES = Object.freeze([
  { pressName: "Moth Press", address: "moth-press", plan: "both", note: "on its free trial, no card yet" },
  { pressName: "Paper Wasp Press", address: "paper-wasp", plan: "shop", note: "paused until a card is added" },
]);

/** People waiting on the waitlist, for the control room's Sign-ups and the waitlist. */
export const SEED_WAITLIST = Object.freeze([
  { email: "riso@example.com", name: "Rae", press: "Riso Rabbit", plan: "shop", firstSignedUpAt: "2026-10-20T15:00:00Z" },
  { email: "chapbooks@example.com", name: "Cy", press: "Chapbook Corner", plan: "both", firstSignedUpAt: "2026-10-26T09:30:00Z" },
  { email: "stickers@example.com", name: "", press: "", plan: "stockroom", firstSignedUpAt: "2026-10-28T08:10:00Z" },
]);

const SEED_OWNER = Object.freeze({ uid: "uid-owner", email: "owner@example.com", email_verified: true, name: "Ada Owner" });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const SERVED = /\.(html|js|css|svg|png|ico)$/;

const CARD_PAGE = (session, shop) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Add a card</title>
<style>body{font:18px/1.5 system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px}button,a{font:inherit;padding:12px 16px;min-height:48px;margin:8px 8px 0 0;display:inline-block;border:2px solid #222;background:#fff;color:#222;text-decoration:none;cursor:pointer}#add{background:#ffe800}</style></head>
<body><h1>Add a card</h1>
<p>This page stands in for the card page. Nothing is charged: the walkthrough uses made-up money.</p>
<button id="add" type="button">Add the test card (Visa ending 4242)</button>
<a href="/account/billing?shop=${encodeURIComponent(shop)}">Not now</a>
<p id="status" role="status"></p>
<script>
document.getElementById("add").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Adding your card…";
  const answer = await fetch("/walkthrough/card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: ${JSON.stringify(session)} }) });
  if (!answer.ok) { status.textContent = "That didn't work. Try again."; return; }
  location.href = "/account/billing?shop=${encodeURIComponent(shop)}&card=added";
});
</script></body></html>
`;

/** A clock that follows real time, shaped like world.js `fakeClock`. */
const realClock = { ms: () => Date.now(), date: () => new Date(), tick() {}, days() {} };

/** The platform's own test shop in the walkthrough: the demo shop (`npm run demo`) on this computer. */
export const WALKTHROUGH_TEST_SHOP = Object.freeze({ ...TEST_SHOP, ownerEmail: "admin@example.com", siteUrl: url(PORTS.shop, "").replace(/\/$/, "") });

/**
 * Makes the platform's pretend world and fills it: two made-up presses for owner@example.com (the first on its free
 * trial, the second paused until a card is added), and the platform's test shop, which is the demo shop, with a passed
 * release check, and three more presses with repairs, support requests and the rest (seedRoom.js). Returns the world.
 */
export async function seedWalkthrough(world) {
  for (const press of SEED_PRESSES) {
    await world.signup.start(SEED_OWNER, { pressName: press.pressName, plan: press.plan, country: "CA", address: press.address, termsAccepted: true, termsVersion: TERMS_VERSION, sellingToday: "fairs", publishes: "books" });
  }
  await world.shopMaker.sweep();
  const { siteUrl, ...row } = WALKTHROUGH_TEST_SHOP;
  if (!(await world.registry.getShop(row.shopId))) {
    await world.registry.createShop(row.shopId, { ...row, status: "live", createdAt: world.clock.date().toISOString() });
    await world.registry.saveProfile(row.shopId, { ...((await world.registry.getProfile(row.shopId)) ?? {}), siteUrl });
    await world.registry.recordReleaseCheck(row.shopId, { ok: true, finishedAt: world.clock.date().toISOString(), version: "demo" });
  }
  // The rest of the platform's day, so no control-room page starts empty (seedRoom.js).
  await seedRoom(world);
  return world;
}

const readBody = (request) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 100_000) {
      reject(Object.assign(new Error("too big"), { status: 413 }));
      request.destroy();
    } else chunks.push(chunk);
  });
  request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  request.on("error", reject);
});

/** The pages' own files, with the walkthrough's changes. Null when the file isn't one to serve. */
async function fileFor(folder, name) {
  const wanted = normalize(name || "index.html");
  if (wanted.startsWith("..") || wanted.includes(`..${sep}`) || /\.test\.js$/.test(wanted) || !SERVED.test(wanted)) return null;
  const path = join(ROOT, folder, wanted);
  let text;
  try {
    text = await readFile(path);
  } catch {
    return null;
  }
  const key = `${folder}/${wanted}`;
  if (key === "signup/config.js") {
    return {
      type: TYPES[".js"],
      body: text.toString("utf8")
        .replace(/export const PLATFORM_FIREBASE = Object\.freeze\(\{[\s\S]*?\}\);/, 'export const PLATFORM_FIREBASE = Object.freeze({ apiKey: "walkthrough", authDomain: "walkthrough.example", projectId: "demo-walkthrough" });')
        .replace(/export const FIREBASE_SDK = ".*";/, 'export const FIREBASE_SDK = "/walkthrough/firebase";'),
    };
  }
  if (key === "waitlist/config.js") {
    return {
      type: TYPES[".js"],
      body: text.toString("utf8")
        .replace(/export const WAITLIST_FIREBASE = .*;/, 'export const WAITLIST_FIREBASE = { projectId: "demo-walkthrough", apiKey: "" };')
        .replace(/export const PLANS_URL = .*;/, 'export const PLANS_URL = "/api/plans";')
        .replace(/export const SIGNUP_URL = .*;/, 'export const SIGNUP_URL = "/signup/";'),
    };
  }
  if (key === "waitlist/firestoreStore.js") return { type: TYPES[".js"], body: await readFile(join(HERE, "stub", "waitlistStore.js")) };
  return { type: TYPES[extname(wanted)] ?? "application/octet-stream", body: text };
}

/**
 * Starts the walkthrough. `port` 0 picks a free one (the tests do). Returns { server, url, world, waitlist, close }.
 */
export async function startWalkthrough({ port = 0, host = "127.0.0.1", world = null, sweepEveryMs = 1000 } = {}) {
  const made = world ?? (await seedWalkthrough(platformWorld({ clock: realClock, suffix: randomSuffix, waitlisted: structuredClone(SEED_WAITLIST) })));
  const waitlist = new Map();
  const sweep = setInterval(() => made.shopMaker.sweep().catch(() => {}), sweepEveryMs);
  sweep.unref();

  const send = (response, status, body, type = "application/json; charset=utf-8", headers = {}) => {
    response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...headers });
    response.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  async function handle(request, response) {
    const { pathname } = new URL(request.url, "http://walkthrough.local");

    if (pathname === "/" || pathname === "/start" || pathname === "/start/") return send(response, 200, startPage(), TYPES[".html"]);

    // The platform's web door, the same one the road test walks.
    if (pathname.startsWith("/api/")) {
      let body;
      if (request.method !== "GET") {
        try {
          const text = await readBody(request);
          body = text ? JSON.parse(text) : {};
        } catch (error) {
          return send(response, error.status ?? 400, { ok: false, message: "That request couldn't be read." });
        }
      }
      const answer = await made.door({ method: request.method, path: pathname, headers: request.headers, body });
      // Stripe's card page is pretend here: send the owner to the stand-in.
      if (pathname === "/api/billing/card" && typeof answer.body?.url === "string" && answer.body.url.startsWith("https://checkout.stripe.example/")) {
        const session = answer.body.url.split("/").pop();
        answer.body.url = `/walkthrough/card?session=${encodeURIComponent(session)}&shop=${encodeURIComponent(body?.shopId ?? "")}`;
      }
      return send(response, answer.status, answer.body);
    }

    if (pathname.startsWith("/walkthrough/firebase/")) {
      const file = await readFile(join(HERE, "stub", pathname.slice("/walkthrough/firebase/".length).replace(/[^\w.-]/g, "")), "utf8").catch(() => null);
      return file === null ? send(response, 404, "Not found\n", "text/plain") : send(response, 200, file, TYPES[".js"]);
    }

    if (pathname === "/walkthrough/card") {
      const query = new URL(request.url, "http://walkthrough.local").searchParams;
      if (request.method === "GET") return send(response, 200, CARD_PAGE(query.get("session") ?? "", query.get("shop") ?? ""), TYPES[".html"]);
      if (request.method === "POST") {
        const { session } = JSON.parse((await readBody(request)) || "{}");
        const sessions = made.stripe.world.sessions;
        if (!sessions.has(session)) return send(response, 404, { ok: false, message: "There's no card page open for that." });
        const answer = await made.stripeEvent("checkout.session.completed", made.stripe.completeSetup(session));
        return send(response, answer.status, { ok: answer.status === 200 });
      }
    }

    if (pathname === "/walkthrough/waitlist" && request.method === "POST") {
      const { id, record } = JSON.parse((await readBody(request)) || "{}");
      if (typeof id !== "string" || !id) return send(response, 400, { ok: false });
      if (!waitlist.has(id)) waitlist.set(id, record);
      return send(response, 200, { ok: true });
    }

    // The pages: /waitlist/, /signup/, /account/ (and /accounts/), /help/, /terms/, /control/, and the Plan & billing page.
    if (pathname === "/account/billing") {
      const page = await fileFor("accounts", "billing.html");
      return send(response, 200, page.body, page.type);
    }
    const mount = Object.keys(MOUNTS).find((prefix) => pathname.startsWith(prefix) || `${pathname}/` === prefix);
    if (mount) {
      if (`${pathname}/` === mount) return send(response, 301, "", TYPES[".html"], { Location: mount });
      const file = await fileFor(MOUNTS[mount], pathname.slice(mount.length));
      if (file) return send(response, 200, file.body, file.type);
    }
    return send(response, 404, "There's nothing here.\n", "text/plain; charset=utf-8");
  }

  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) send(response, 500, { ok: false, message: "Something went wrong on the walkthrough." });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const { port: actual } = server.address();
  return {
    server, world: made, waitlist, url: `http://${host === "0.0.0.0" ? "localhost" : host}:${actual}`, port: actual,
    close: () => new Promise((resolve) => {
      clearInterval(sweep);
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}
