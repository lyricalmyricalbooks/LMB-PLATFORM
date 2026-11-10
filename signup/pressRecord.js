import { PLAN_CHOICES, QUESTION, SQUARE_COUNTRIES, squareWords } from "./form.js";
import { cleanHandle, handleProblem } from "../services/domains/freeAddress.js";

// The setup record for one press (code plan 18.2): the only thing made for a press before it launches. One document per
// press in the platform's own project, `presses/{pressId}`. It holds what the press typed during setup and nothing that
// needs a live shop. Status moves one way: setup, then opening, then open (or expired, which a timer sets).

export const PRESS_STATUSES = Object.freeze(["setup", "opening", "open", "expired"]);
// Only these come from the press. The staged import file and the timestamps are written by the platform.
// `plan` is what the press wants to set up (shop, stockroom or both; billing's plan ids), asked first at the front door
// and picked again at Open my shop (18.8). `look` is the website's theme and `adminLook` the admin's look, both chosen
// in the welcome inside setup mode (18.6).
// `moving` is the press's answer to Home's "Selling somewhere already?" card (code plan 23.0): "yes" (bringing a shop
// over), "fresh" (starting fresh, which puts the card away) or "" (not answered yet).
// `sellingToday` is the front door's "Where do you sell today?" (form.js QUESTION, one of its ids, or "" for skipped). It
// goes to sign-up's row as its answer when the shop opens (frontDoor.js openShop), which picks the guide's first steps.
// `cardProvider` is who takes the website's card payments, Stripe or Square, chosen in setup's Settings › Payments
// ("" until chosen: the shop maker then uses Stripe). It goes to sign-up's row when the shop opens (frontDoor.js openShop).
// `domainChoice` is the setup guide's "Your web address" answer: "own" (bringing a domain the press has; the domain
// itself is saved through frontDoor.js saveDomain, which looks up where it was bought), "buy" (gone to buy one),
// "free" (the free address for now) or "" (not answered). `freeName` is the name the press picked for its free address
// (moth-press in moth-press.<shop domain>), cleaned and checked; "" means its press name.
// `design` is the shop website the press designed before its store was made (the designer at /design/studio, 10 November
// 2026): Studio's whole design, kept as it is and handed to the new shop (setup/handover.js), whose admin puts it on. null
// clears it. Only its size and shape are checked here: the shop's own designer owns what a design may hold.
export const SETUP_FIELDS = Object.freeze(["plan", "pressName", "sells", "country", "look", "adminLook", "moving", "language", "cardProvider", "domainChoice", "freeName", "sellingToday", "design"]);
/** The largest design kept, as JSON in UTF-8 bytes: well under a document's 1 MiB with the rest of the record. */
export const MAX_DESIGN_BYTES = 400_000;
const TEXT_LIMITS = Object.freeze({ plan: 9, pressName: 120, sells: 300, country: 2, look: 40, adminLook: 40, moving: 5, language: 2, cardProvider: 6, domainChoice: 4, freeName: 60, sellingToday: 20 });
export const DOMAIN_CHOICES = Object.freeze(["", "own", "buy", "free"]);
export const MOVING_CHOICES = Object.freeze(["", "yes", "fresh"]);
// The language of the platform's emails (services/email/templatesFr.js): "" is automatic (French then English for a
// Quebec billing address), "fr" or "en" a choice. It goes to the plan when the shop opens (frontDoor.js openShop).
export const LANGUAGE_CHOICES = Object.freeze(["", "fr", "en"]);
// The card payment providers a press can pick (setup/payments.js PAYMENT_PROVIDERS), or "" for not chosen yet.
export const CARD_PROVIDER_CHOICES = Object.freeze(["", "stripe", "square"]);
// A look is stored by its id. The platform checks only the shape, not a list: the shop and the stockroom own their lists
// and grow them, and the shop maker (18.9) applies a look the new shop knows and falls back to the default otherwise.
const LOOK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const NEXT_STATUS = Object.freeze({ setup: "opening", opening: "open", open: null, expired: null });

// The press's product file, kept for its shop until the shop exists (code plan 18.7). One kept file per press, at a path
// only the platform knows; the press's browser uploads it through a short-lived upload link and the platform never hands
// out a link to read it. Each upload gets a path of its own and becomes the kept file only when the press confirms it, so
// a failed, doubled or late upload can never change the file the shop maker reads. The limits match the shop's own importer (Books › Import: 5 MB, 2,000 rows), so a file kept here
// always imports once the shop opens.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const importPathFor = (pressId, nonce) => `press-imports/${pressId}/${nonce}.csv`;

// Sign-up makes this one document and nothing else (18.3).
export function newPressRecord({ pressId, ownerUid, email, now }) {
  if (!/^[a-z0-9-]{8,40}$/.test(pressId)) throw new Error("A press needs a short id.");
  if (!ownerUid || !email) throw new Error("A press needs an owner.");
  const at = now.toISOString();
  return { pressId, ownerUid, ownerEmail: email.toLowerCase(), status: "setup", plan: "", pressName: "", sells: "", country: "",
    look: "", adminLook: "", design: null, moving: "", language: "", cardProvider: "", domainChoice: "", freeName: "", sellingToday: "", domain: "", domainSeller: "", domainEasy: false, stagedImportPath: "", stagedImport: null, pendingImportPath: "", shopId: "", shopStatus: "", shopMessage: "", openingSince: "", createdAt: at, lastSeenAt: at };
}

// Checks a change a press makes through the platform's door. Returns the fields to write, or a plain-words refusal.
export function setupChange(current, change) {
  if (current.status !== "setup") return { ok: false, message: "Your shop is already opening, so setup is locked." };
  const fields = {};
  for (const [key, value] of Object.entries(change ?? {})) {
    if (!SETUP_FIELDS.includes(key)) return { ok: false, message: `"${key}" can't be set here.` };
    if (key === "design") {
      const problem = designProblem(value);
      if (problem) return { ok: false, message: problem };
      fields.design = value;
      continue;
    }
    if (key in TEXT_LIMITS) {
      if (typeof value !== "string" || value.length > TEXT_LIMITS[key]) {
        return { ok: false, message: `${key} is too long. Keep it under ${TEXT_LIMITS[key]} characters.` };
      }
    }
    const text = typeof value === "string" ? value.trim() : value;
    if ((key === "look" || key === "adminLook") && text !== "" && !LOOK_ID.test(text)) {
      return { ok: false, message: "Pick a look from the choices." };
    }
    // One plan for every shop (10 November 2026): any known plan an older page sends is saved as "both".
    if (key === "plan") {
      if (text !== "" && !["shop", "stockroom", ...PLAN_CHOICES].includes(text)) return { ok: false, message: "Every shop has the website and the stockroom now." };
      fields.plan = text === "" ? "" : "both";
      continue;
    }
    if (key === "moving" && !MOVING_CHOICES.includes(text)) return { ok: false, message: "Pick one of the choices." };
    if (key === "language" && !LANGUAGE_CHOICES.includes(text)) return { ok: false, message: "Pick automatic, French or English." };
    if (key === "cardProvider" && !CARD_PROVIDER_CHOICES.includes(text)) return { ok: false, message: "Pick Stripe or Square." };
    // Square only where it works with the shop's checkout; a country changed afterwards is checked again at Open my shop.
    const country = typeof change?.country === "string" ? change.country.trim() : current.country;
    if (key === "cardProvider" && text === "square" && country && !SQUARE_COUNTRIES.includes(country)) return { ok: false, message: squareWords(country) };
    if (key === "sellingToday" && text !== "" && !QUESTION.options.some((o) => o.id === text)) return { ok: false, message: "Pick one of the choices." };
    if (key === "domainChoice" && !DOMAIN_CHOICES.includes(text)) return { ok: false, message: "Pick one of the choices." };
    if (key === "freeName") {
      // The press's own pick for its free address (services/domains/freeAddress.js); "" goes back to its press name.
      const handle = cleanHandle(text);
      const problem = text && handleProblem(handle);
      if (problem) return { ok: false, message: problem };
      fields[key] = handle;
      continue;
    }
    fields[key] = text;
  }
  return { ok: true, fields };
}

/** Why a design can't be kept (plain words), or "" when it can: null, or a plain object of a size that fits. */
export function designProblem(value) {
  if (value === null) return "";
  if (!value || typeof value !== "object" || Array.isArray(value)) return "That design couldn't be read. Try saving it again.";
  let text;
  try { text = JSON.stringify(value); } catch { return "That design couldn't be read. Try saving it again."; }
  if (Buffer.byteLength(text, "utf8") > MAX_DESIGN_BYTES) return "Your design is too large to keep. Remove a few sections or pictures, then save again.";
  return "";
}

// The only status changes: the platform's own launch steps call this, never the press.
export function advanceStatus(current, to) {
  if (NEXT_STATUS[current.status] !== to) return { ok: false, message: `A press can't go from ${current.status} to ${to}.` };
  return { ok: true, status: to };
}

// Setup records not seen for 60 days are removed with any staged file (18.11). A record whose last visit can't be read
// counts as not seen, so a bad or missing date can never keep a record forever.
export const SETUP_EXPIRY_DAYS = 60;
export function setupExpired(record, now) {
  if (record.status !== "setup") return false;
  const seen = Date.parse(record.lastSeenAt);
  return !Number.isFinite(seen) || now - seen > SETUP_EXPIRY_DAYS * 86_400_000;
}
