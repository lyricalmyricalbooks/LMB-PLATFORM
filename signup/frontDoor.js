// The front door's server side (code plan 18.4, the five-screen flow in docs/plans/1-front-door-v2.md): email, the
// six-digit code, four questions, then the admin. One sign-in path for new and returning presses.
//
//   POST /api/code/send   { email }            emails a six-digit code (public; the same answer for any address)
//   POST /api/code/check  { email, code }      checks it; on a match, answers { link }: a one-time Firebase sign-in
//                                              link for that address, which the page signs in with at once
//                                              (signInWithEmailLink). The link is never emailed: the code was the proof.
//   POST /api/press       {}                   makes the press's setup record, or gives back the one still in setup
//   GET  /api/press                            the signed-in person's presses
//   POST /api/press/setup { pressId, plan?, pressName?, sells?, country?, look?, adminLook?, moving?, language?, cardProvider? }
//                                              saves answers while the press is in setup
//   POST /api/press/old-shop { pressId, address }
//   POST /api/press/domain { pressId, domain }   the press's own domain for its shop ("" takes it off)
//   POST /api/press/free-name { pressId, name }  checks a name for the free address while the press types it:
//                                              { name, address, problem, available } (nothing is saved)
//                                              reads the old shop's public product list (23.2) and answers it as a
//                                              product file { host, csv, products, notes } for the browser to preview
//
// Nothing here starts a trial, takes a card or makes a shop: those wait for Open my shop (18.8).
//
// Clients passed in:
//   presses   get(pressId); create(pressId, record) -> bool; listByOwner(ownerUid); listByFreeName(name) (optional);
//             update(pressId, change) -> change's result, read and written in one transaction
//   codes     the sign-in code store (signInCode.js): get(key); set(key, row)
//   email     sendPlatform({ kind, to, data, idempotencyKey })
//   auth      signInLink(email, { url }) -> link (clients/signInLinks.js in the platform project)
//   settings  { platformUrl }
//   freeNameTaken  optional: (address) -> boolean, whether a shop already has that free address (freeAddress.js
//             freeAddressTaken over the registry)
import { createHash, randomBytes } from "node:crypto";
import { SignupError, randomSuffix } from "./signup.js";
import { createSignInCode } from "./signInCode.js";
import { createAccountStart } from "./accountStart.js";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, SETUP_FIELDS, advanceStatus, importPathFor, setupChange } from "./pressRecord.js";
import { COUNTRIES, PUBLISHES, SQUARE_COUNTRIES, isEmail, squareWords } from "./form.js";
import { readOldShop as readPublicShop } from "../services/moving/oldShop.js";
import { domainProblem, normalDomain } from "../services/domains/names.js";
import { sellerName } from "../services/domains/sellers.js";
import { FALLBACK_HANDLE, baseHandle, cleanHandle, freeAddressPreview, handleProblem } from "../services/domains/freeAddress.js";

/** The page the front door lives on, under the platform's address. */
export const START_PAGE = "join";

/** What a press sees of its own record: never the owner's uid or the platform's own fields. */
const shownRecord = (record, shopDomain = "") => ({
  // The free address the shop would get (moth-press.<shop domain>, or the name the press picked, `freeName`; a number
  // is added if it's taken), or "".
  freeAddress: freeAddressPreview(record.pressName ?? "", shopDomain, record.freeName ?? ""), freeName: record.freeName ?? "",
  // The press's name can't be an address (a big brand's, a rude word, one the platform keeps): setup asks for a name.
  freeNameNeeded: Boolean(shopDomain && record.pressName && !record.freeName && baseHandle(record.pressName) === FALLBACK_HANDLE),
  pressId: record.pressId, status: record.status, plan: record.plan ?? "", shopId: record.shopId ?? "",
  // How the shop is starting once opened (18.8): "queued", or "in-line" with the words saying why it waits.
  shopStatus: record.shopStatus ?? "", shopMessage: record.shopMessage ?? "", pressName: record.pressName, sells: record.sells, country: record.country,
  look: record.look ?? "", adminLook: record.adminLook ?? "", moving: record.moving ?? "", language: record.language ?? "",
  cardProvider: record.cardProvider ?? "",
  // "Your web address" (setup guide): the answer, the press's own domain and where it was bought.
  domainChoice: record.domainChoice ?? "", domain: record.domain ?? "", domainSeller: record.domainSeller ?? "", domainEasy: record.domainEasy === true,
  // What the press sees of its kept file: never the path.
  stagedImport: record.stagedImport ? { name: record.stagedImport.name, size: record.stagedImport.size, rows: record.stagedImport.rows, at: record.stagedImport.at } : null,
});

/** Why a press's record can't change now (inside a store update): not the owner's, or no longer in setup. Null when it can. */
function setupRefusal(current, claims) {
  if (!current || current.ownerUid !== claims?.uid) return { ok: false, status: 404, message: "We couldn't find that press." };
  if (current.status !== "setup") return { ok: false, status: 409, message: "Your shop is already opening, so setup is locked." };
  return null;
}

// A press that pressed Open my shop holds the opening for this long, so a double click or a second tab waits for the
// first instead of starting a second shop. After it, a call that died part way can be tried again.
const OPENING_HOLD_MS = 2 * 60_000;
// How often a visit to setup is written down (myPresses): enough for a 60-day clock, without a write on every load.
const SEEN_EVERY_MS = 60 * 60_000;
const OPENING_WORDS = "Your shop is already being opened. Give it a moment.";
/** Is Open my shop running for this record right now? Its answers stay as they are until it finishes. */
const holding = (record, at) => !!record?.openingSince && at - Date.parse(record.openingSince) < OPENING_HOLD_MS;
const OPEN_NEEDS = Object.freeze({
  pressName: "Add your press's name in Settings › General first.",
  country: "Choose where your press is in Settings › General first.",
});

const TOO_BIG = "That file is larger than 5 MB. Split it into smaller files: bring one now and the rest once your shop is open.";
// Upload links last long enough for a slow connection, and no longer.
const UPLOAD_MINUTES = 15;

/**
 * `stagedFiles` keeps each press's product file until its shop exists (18.7): uploadUrl(path, { contentType, size,
 * expiresAt }) -> { url, method, headers }, a link that accepts exactly one upload of that size and nothing else;
 * stat(path) -> { size } | null; remove(path), which is fine when nothing is there. The shop maker (18.9) reads it.
 *
 * `signup` is sign-up's own start (signup.js createSignup): Open my shop (18.8) hands the press's answers to it, so the
 * daily cap, the countries that are open, invites, the free trial (billing.startTrial) and the shop maker's queue work
 * exactly as they do for every shop.
 */
export function createFrontDoor({ presses, codes, email, auth, settings, stagedFiles, signup = null, now = () => new Date(), suffix = randomSuffix, random = null, readOldShop = readPublicShop, domainLookup = null, freeNameTaken = null }) {
  const shown = (record) => shownRecord(record, settings?.shopAddressDomain ?? "");
  // A name for the free address held by another press still setting up (or opening), or a shop that has it already.
  const HOLDING = new Set(["setup", "opening"]);
  /** Endings tried, in order, to suggest a free name close to a taken one. */
  const NAME_ENDINGS = ["shop", "studio", "co", "2", "3"];

  async function freeNameHeld(pressId, name) {
    if (!name) return false;
    if (typeof presses.listByFreeName === "function"
      && (await presses.listByFreeName(name)).some((other) => other.pressId !== pressId && HOLDING.has(other.status))) return true;
    const address = settings?.shopAddressDomain ? `${name}.${settings.shopAddressDomain}` : "";
    if (address && freeNameTaken) {
      try { return await freeNameTaken(address); } catch { return false; }
    }
    return false;
  }
  const signInCode = createSignInCode({
    store: codes,
    now,
    random,
    // Each code is its own email: a new code replaces the stored one, so its email must never be skipped as a repeat.
    sendEmail: ({ to, code }) => email.sendPlatform({
      kind: "sign-in-code",
      to,
      data: { code },
      idempotencyKey: `signin-code/${createHash("sha256").update(to).digest("hex").slice(0, 32)}/${now().toISOString()}/${randomBytes(4).toString("hex")}`,
    }),
  });
  const accountStart = createAccountStart({ presses, now, suffix });

  const addressOf = (value) => {
    if (!isEmail(value)) throw new SignupError(400, "Enter your email address.", { email: "Enter your email address." });
    return value.trim().toLowerCase();
  };

  async function ownPress(claims, pressId) {
    const record = typeof pressId === "string" && pressId ? await presses.get(pressId) : null;
    // Someone else's press reads the same as no press, so ids can't be probed.
    if (!record || record.ownerUid !== claims?.uid) throw new SignupError(404, "We couldn't find that press.");
    return record;
  }

  return {
    async sendCode(body = {}) {
      const to = addressOf(body.email);
      const sent = await signInCode.send(to);
      if (!sent.ok) throw new SignupError(429, sent.message);
      return {};
    },

    async checkCode(body = {}) {
      const to = addressOf(body.email);
      const code = String(body.code ?? "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) throw new SignupError(400, "Enter the six numbers from the email.", { code: "Enter the six numbers from the email." });
      const checked = await signInCode.check(to, code);
      if (!checked.ok) throw new SignupError(400, checked.message, { code: checked.message });
      const link = await auth.signInLink(to, { url: `${settings.platformUrl}/${START_PAGE}/?finish=1` });
      return { link };
    },

    async startPress(claims) {
      const { pressId } = await accountStart.start(claims, {});
      return { press: shown(await presses.get(pressId)) };
    },

    async myPresses(claims) {
      if (!claims?.uid) throw new SignupError(401, "Sign in first.");
      const mine = await presses.listByOwner(claims.uid);
      // Opening setup counts as a visit (18.11): it restarts the 60 days, at most once an hour per press.
      const at = now();
      for (const record of mine.filter((r) => r.status === "setup" && at - Date.parse(r.lastSeenAt ?? "") >= SEEN_EVERY_MS)) {
        await presses.update(record.pressId, (current) => (current?.status === "setup" && current.ownerUid === claims.uid
          ? { row: { ...current, lastSeenAt: at.toISOString() }, result: null } : { row: null, result: null }));
      }
      return { presses: mine.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(shown) };
    },

    async saveSetup(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      const change = {};
      for (const key of SETUP_FIELDS) if (key in body) change[key] = body[key];
      // The choices on the page are the only answers taken; an empty answer is a skipped question.
      if (typeof change.sells === "string" && change.sells && !PUBLISHES.options.some((o) => o.id === change.sells)) {
        throw new SignupError(400, "Pick one of the choices.", { sells: "Pick one of the choices." });
      }
      if (typeof change.country === "string" && change.country && !(change.country in COUNTRIES)) {
        throw new SignupError(400, "Pick your country from the list.", { country: "Pick your country from the list." });
      }
      // A name for the free address another press (or shop) already holds is refused, so two presses never pick one.
      if (typeof change.freeName === "string" && change.freeName && await freeNameHeld(record.pressId, cleanHandle(change.freeName))) {
        throw new SignupError(409, "Another shop already has that name. Try another one.", { freeName: "Another shop already has that name. Try another one." });
      }
      // Read and written in one step, so a save can never put back a status the platform has just moved on.
      const saved = await presses.update(record.pressId, (current) => {
        if (!current || current.ownerUid !== claims.uid) return { row: null, result: { ok: false, status: 404, message: "We couldn't find that press." } };
        // While Open my shop is running, the answers it is opening with stay as they are.
        if (holding(current, now().getTime())) return { row: null, result: { ok: false, status: 409, message: OPENING_WORDS } };
        const checked = setupChange(current, change);
        if (!checked.ok) return { row: null, result: { ...checked, status: 409 } };
        const updated = { ...current, ...checked.fields, lastSeenAt: now().toISOString() };
        return { row: updated, result: { ok: true, press: shown(updated) } };
      });
      if (!saved.ok) throw new SignupError(saved.status, saved.message);
      return { press: saved.press };
    },

    // The product file (18.7). The browser reads and previews it first; these only keep it.
    async startImport(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      if (record.status !== "setup") throw new SignupError(409, "Your shop is already opening, so setup is locked.");
      const size = Number(body.size);
      if (!Number.isInteger(size) || size < 1) throw new SignupError(400, "Choose a file with your products in it.");
      if (size > MAX_IMPORT_BYTES) throw new SignupError(400, TOO_BIG);
      // A path of its own for this upload, noted on the record as the one waiting to be kept.
      const path = importPathFor(record.pressId, randomBytes(8).toString("hex"));
      const noted = await presses.update(record.pressId, (current) => {
        const refused = setupRefusal(current, claims);
        if (refused) return { row: null, result: refused };
        return { row: { ...current, pendingImportPath: path }, result: { ok: true, earlier: current.pendingImportPath || "" } };
      });
      if (!noted.ok) throw new SignupError(noted.status, noted.message);
      // An earlier upload that was never kept is thrown away.
      if (noted.earlier && noted.earlier !== record.stagedImportPath) await stagedFiles.remove(noted.earlier);
      const expiresAt = new Date(now().getTime() + UPLOAD_MINUTES * 60_000);
      const upload = await stagedFiles.uploadUrl(path, { contentType: "text/csv", size, expiresAt });
      return { upload };
    },

    async keepImport(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      const name = String(body.name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "products.csv";
      const rows = Number(body.rows);
      if (!Number.isInteger(rows) || rows < 1 || rows > MAX_IMPORT_ROWS) {
        throw new SignupError(400, `A file brings between 1 and ${MAX_IMPORT_ROWS.toLocaleString("en")} products.`);
      }
      const path = record.pendingImportPath;
      const file = path ? await stagedFiles.stat(path) : null;
      if (!file) throw new SignupError(409, "The file didn't finish sending. Try again.");
      if (file.size > MAX_IMPORT_BYTES) {
        await stagedFiles.remove(path);
        throw new SignupError(400, TOO_BIG);
      }
      const at = now().toISOString();
      const saved = await presses.update(record.pressId, (current) => {
        const refused = setupRefusal(current, claims);
        if (refused) return { row: null, result: refused };
        // Another upload started since this one: that one is the file waiting now, so this one isn't kept.
        if (current.pendingImportPath !== path) return { row: null, result: { ok: false, status: 409, message: "Another file was chosen since. Choose the file again." } };
        const updated = { ...current, stagedImportPath: path, pendingImportPath: "", stagedImport: { name, size: file.size, rows, at }, lastSeenAt: at };
        return { row: updated, result: { ok: true, press: shown(updated), earlier: current.stagedImportPath || "" } };
      });
      if (!saved.ok) throw new SignupError(saved.status, saved.message);
      // The file it replaces goes only once the new one is kept.
      if (saved.earlier && saved.earlier !== path) await stagedFiles.remove(saved.earlier);
      return { press: saved.press };
    },

    // Bring a shop over from its address (23.2): only the press's owner, only in setup. Nothing is kept here: the
    // browser previews the file and keeps it through startImport/keepImport like any chosen file.
    async oldShop(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      if (record.status !== "setup") throw new SignupError(409, "Your shop is already opening, so setup is locked.");
      const read = await readOldShop(String(body.address ?? ""));
      if (!read.ok) throw new SignupError(400, read.message, { address: read.message });
      return { host: read.host, csv: read.csv, products: read.products, notes: read.notes };
    },

    // "Your web address" (setup guide): the press's own domain, kept until the shop is made, when the shop maker
    // connects it (shopMaker.js). Where it was bought is looked up now (public, services/domains/sellers.js), so
    // setup can say "you'll press Allow once at GoDaddy" before anything is connected. A lookup that fails only means
    // the seller isn't named. An empty domain takes it off.
    async saveDomain(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      if (record.status !== "setup") throw new SignupError(409, "Your shop is already opening, so setup is locked.");
      const name = normalDomain(String(body.domain ?? "")).replace(/^www\.(?=[^.]+\.[^.]+$)/, "");
      let fields = { domain: "", domainSeller: "", domainEasy: false, domainChoice: "" };
      if (name) {
        const problem = domainProblem(name, { platformDomain: settings?.domain ?? "" });
        if (problem) throw new SignupError(400, problem, { domain: problem });
        // An address on the platform's own shop domain is a free address, never a domain the press owns.
        const shopDomain = settings?.shopAddressDomain ?? "";
        if (shopDomain && (name === shopDomain || name.endsWith(`.${shopDomain}`))) {
          const words = "That address belongs to Colophon. Use an address you own.";
          throw new SignupError(400, words, { domain: words });
        }
        let found = null;
        if (domainLookup) {
          try { found = await domainLookup.lookup(name); } catch { found = null; }
        }
        const seller = sellerName(found?.registrar?.name) ?? sellerName(found?.domainConnect?.providerName) ?? "";
        fields = { domain: name, domainSeller: seller, domainEasy: found?.domainConnect?.hasTemplate === true, domainChoice: "own" };
      }
      const saved = await presses.update(record.pressId, (current) => {
        const refused = setupRefusal(current, claims);
        if (refused) return { row: null, result: refused };
        if (holding(current, now().getTime())) return { row: null, result: { ok: false, status: 409, message: OPENING_WORDS } };
        const updated = { ...current, ...fields, lastSeenAt: now().toISOString() };
        return { row: updated, result: { ok: true, press: shown(updated) } };
      });
      if (!saved.ok) throw new SignupError(saved.status, saved.message);
      return { press: saved.press };
    },

    // A name for the free address, checked as the press types it (freeAddress.js): cleaned, refused when the platform
    // keeps it or it's a brand's or rude, and `available: false` when a shop already has it (`freeNameTaken`, the
    // registry). Nothing is saved: Use this name saves `freeName` through saveSetup.
    async checkFreeName(claims, body = {}) {
      await ownPress(claims, body.pressId);
      const shopDomain = settings?.shopAddressDomain ?? "";
      const name = cleanHandle(String(body.name ?? "").slice(0, 60));
      const problem = handleProblem(name);
      const address = shopDomain && name ? `${name}.${shopDomain}` : "";
      const available = !problem && !(await freeNameHeld(body.pressId, name));
      // A taken name comes back with up to three free ones close to it, so the press picks instead of guessing.
      const suggestions = [];
      if (name && !problem && !available) {
        for (const ending of NAME_ENDINGS) {
          if (suggestions.length >= 3) break;
          const candidate = `${name.slice(0, 30 - ending.length - 1).replace(/-+$/, "")}-${ending}`;
          if (!handleProblem(candidate) && !(await freeNameHeld(body.pressId, candidate))) suggestions.push(candidate);
        }
      }
      return { name, address, problem, available, suggestions };
    },

    async removeImport(claims, body = {}) {
      const record = await ownPress(claims, body.pressId);
      // The record lets go first, then the files: at worst a file is left with nothing pointing at it.
      const saved = await presses.update(record.pressId, (current) => {
        const refused = setupRefusal(current, claims);
        if (refused) return { row: null, result: refused };
        const updated = { ...current, stagedImportPath: "", pendingImportPath: "", stagedImport: null, lastSeenAt: now().toISOString() };
        return { row: updated, result: { ok: true, press: shown(updated), paths: [current.stagedImportPath, current.pendingImportPath].filter(Boolean) } };
      });
      if (!saved.ok) throw new SignupError(saved.status, saved.message);
      for (const path of saved.paths) await stagedFiles.remove(path);
      return { press: saved.press };
    },

    /**
     * Open my shop (18.8): the press's answers go to sign-up's start, which starts the plan (the free trial when the
     * account hasn't had one) and queues the shop. Only then does the record become `opening`, so a refusal (a plan or
     * payment problem, the terms, a country that hasn't opened yet) leaves the press in setup with everything it typed.
     * Pressing twice opens one shop: sign-up finds the press's own row by `pressId`.
     */
    async openShop(claims, body = {}) {
      if (!signup) throw new SignupError(503, "Opening a shop isn't switched on yet. Everything you've set up is saved.");
      const record = await ownPress(claims, body.pressId);
      // Already opening: the same shop, whatever the second press of the button says.
      if (record.status !== "setup") return { press: shown(record) };
      const plan = typeof body.plan === "string" && body.plan ? body.plan : record.plan;
      for (const [field, words] of Object.entries(OPEN_NEEDS)) if (!record[field]) throw new SignupError(400, words, { [field]: words });
      // Square only where it works with the shop's checkout (form.js SQUARE_COUNTRIES): a country changed after picking it.
      const cardProvider = plan === "stockroom" ? "" : record.cardProvider;
      if (cardProvider === "square" && !SQUARE_COUNTRIES.includes(record.country)) throw new SignupError(400, squareWords(record.country), { cardProvider: squareWords(record.country) });
      const hold = now().toISOString();
      const held = await presses.update(record.pressId, (current) => {
        const refused = setupRefusal(current, claims);
        if (refused) return { row: null, result: refused };
        if (holding(current, Date.parse(hold))) return { row: null, result: { ok: false, status: 409, message: OPENING_WORDS } };
        return { row: { ...current, openingSince: hold }, result: { ok: true } };
      });
      if (!held.ok) throw new SignupError(held.status, held.message);
      // Lets go of this call's hold; `fields` are written with it (the words of a press asked to wait).
      const release = (fields = {}) => presses.update(record.pressId, (current) => (current?.openingSince === hold
        ? { row: { ...current, ...fields, openingSince: "" }, result: null } : { row: null, result: null }));
      let started;
      try {
        started = await signup.start(claims, {
          pressName: record.pressName, plan, country: record.country, publishes: record.sells || null,
          // The language chosen for the platform's emails, if any (pressRecord.js LANGUAGE_CHOICES).
          ...(record.language ? { language: record.language } : {}),
          // Stripe or Square for the website's cards (pressRecord.js CARD_PROVIDER_CHOICES); Stripe when not chosen.
          ...(cardProvider ? { paymentProvider: cardProvider } : {}),
          termsAccepted: body.termsAccepted === true, termsVersion: body.termsVersion,
        }, { pressId: record.pressId });
      } catch (error) {
        // Nothing was opened: the press can fix what was wrong and press again.
        await release();
        throw error;
      }
      // Its country hasn't opened yet: no plan started and no shop is made, so the press stays in setup and can press
      // again (or change its country) later.
      if (started.status === "later") {
        await release({ plan });
        return { press: shown({ ...(await presses.get(record.pressId)) }), shop: { status: started.status, trialEnd: null, message: started.message } };
      }
      const saved = await presses.update(record.pressId, (current) => {
        if (!current) return { row: null, result: { ok: false, status: 404, message: "We couldn't find that press." } };
        if (current.status !== "setup") return { row: null, result: { ok: true, press: shown(current) } };
        const moved = advanceStatus(current, "opening");
        if (!moved.ok) return { row: null, result: { ok: false, status: 409, message: moved.message } };
        const updated = {
          ...current, status: moved.status, plan, shopId: started.shopId, shopStatus: started.status, shopMessage: started.message ?? "",
          openingSince: "", openedAt: now().toISOString(), lastSeenAt: now().toISOString(),
        };
        return { row: updated, result: { ok: true, press: shown(updated) } };
      });
      if (!saved.ok) throw new SignupError(saved.status, saved.message);
      return { press: saved.press, shop: { status: started.status, trialEnd: started.trialEnd ?? null, ...(started.message ? { message: started.message } : {}) } };
    },
  };
}

/** The routes anyone may call: sending and checking a code. */
export const frontDoorPublicRoutes = (door) => ({
  "POST /api/code/send": (request) => door.sendCode(request.body ?? {}),
  "POST /api/code/check": (request) => door.checkCode(request.body ?? {}),
});

/** The signed-in routes: the press's setup record. */
export const frontDoorRoutes = (door) => ({
  "POST /api/press": (claims) => door.startPress(claims),
  "GET /api/press": (claims) => door.myPresses(claims),
  "POST /api/press/setup": (claims, request) => door.saveSetup(claims, request.body ?? {}),
  "POST /api/press/import": (claims, request) => door.startImport(claims, request.body ?? {}),
  "POST /api/press/import/kept": (claims, request) => door.keepImport(claims, request.body ?? {}),
  "POST /api/press/import/remove": (claims, request) => door.removeImport(claims, request.body ?? {}),
  "POST /api/press/old-shop": (claims, request) => door.oldShop(claims, request.body ?? {}),
  "POST /api/press/domain": (claims, request) => door.saveDomain(claims, request.body ?? {}),
  "POST /api/press/free-name": (claims, request) => door.checkFreeName(claims, request.body ?? {}),
  "POST /api/press/open": (claims, request) => door.openShop(claims, request.body ?? {}),
});
