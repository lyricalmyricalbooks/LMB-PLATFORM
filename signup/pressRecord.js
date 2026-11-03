import { PLAN_CHOICES } from "./form.js";

// The setup record for one press (code plan 18.2): the only thing made for a press before it launches. One document per
// press in the platform's own project, `presses/{pressId}`. It holds what the press typed during setup and nothing that
// needs a live shop. Status moves one way: setup, then opening, then open (or expired, which a timer sets).

export const PRESS_STATUSES = Object.freeze(["setup", "opening", "open", "expired"]);
// Only these come from the press. The staged import file and the timestamps are written by the platform.
// `plan` is what the press wants to set up (shop, stockroom or both; billing's plan ids), asked first at the front door
// and picked again at Open my shop (18.8). `look` is the website's theme and `adminLook` the admin's look, both chosen
// in the welcome inside setup mode (18.6).
export const SETUP_FIELDS = Object.freeze(["plan", "pressName", "sells", "country", "look", "adminLook"]);
const TEXT_LIMITS = Object.freeze({ plan: 9, pressName: 120, sells: 300, country: 2, look: 40, adminLook: 40 });
// A look is stored by its id. The platform checks only the shape, not a list: the shop and the stockroom own their lists
// and grow them, and the shop maker (18.9) applies a look the new shop knows and falls back to the default otherwise.
const LOOK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const NEXT_STATUS = Object.freeze({ setup: "opening", opening: "open", open: null, expired: null });

// Sign-up makes this one document and nothing else (18.3).
export function newPressRecord({ pressId, ownerUid, email, now }) {
  if (!/^[a-z0-9-]{8,40}$/.test(pressId)) throw new Error("A press needs a short id.");
  if (!ownerUid || !email) throw new Error("A press needs an owner.");
  const at = now.toISOString();
  return { pressId, ownerUid, ownerEmail: email.toLowerCase(), status: "setup", plan: "", pressName: "", sells: "", country: "",
    look: "", adminLook: "", stagedImportPath: "", createdAt: at, lastSeenAt: at };
}

// Checks a change a press makes through the platform's door. Returns the fields to write, or a plain-words refusal.
export function setupChange(current, change) {
  if (current.status !== "setup") return { ok: false, message: "Your shop is already opening, so setup is locked." };
  const fields = {};
  for (const [key, value] of Object.entries(change ?? {})) {
    if (!SETUP_FIELDS.includes(key)) return { ok: false, message: `"${key}" can't be set here.` };
    if (key in TEXT_LIMITS) {
      if (typeof value !== "string" || value.length > TEXT_LIMITS[key]) {
        return { ok: false, message: `${key} is too long. Keep it under ${TEXT_LIMITS[key]} characters.` };
      }
    }
    const text = typeof value === "string" ? value.trim() : value;
    if ((key === "look" || key === "adminLook") && text !== "" && !LOOK_ID.test(text)) {
      return { ok: false, message: "Pick a look from the choices." };
    }
    if (key === "plan" && text !== "" && !PLAN_CHOICES.includes(text)) return { ok: false, message: "Pick the shop, the stockroom or both." };
    fields[key] = text;
  }
  return { ok: true, fields };
}

// The only status changes: the platform's own launch steps call this, never the press.
export function advanceStatus(current, to) {
  if (NEXT_STATUS[current.status] !== to) return { ok: false, message: `A press can't go from ${current.status} to ${to}.` };
  return { ok: true, status: to };
}

// Setup records not seen for 60 days are removed with any staged file (18.11).
export const SETUP_EXPIRY_DAYS = 60;
export function setupExpired(record, now) {
  return record.status === "setup" && now - Date.parse(record.lastSeenAt) > SETUP_EXPIRY_DAYS * 86_400_000;
}
