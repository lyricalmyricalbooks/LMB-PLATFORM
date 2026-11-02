// The setup record for one press (code plan 18.2): the only thing made for a press before it launches. One document per
// press in the platform's own project, `presses/{pressId}`. It holds what the press typed during setup and nothing that
// needs a live shop. Status moves one way: setup, then opening, then open (or expired, which a timer sets).

export const PRESS_STATUSES = Object.freeze(["setup", "opening", "open", "expired"]);
// Only these four come from the press. The staged import file and the timestamps are written by the platform.
export const SETUP_FIELDS = Object.freeze(["pressName", "sells", "country", "look"]);
const TEXT_LIMITS = Object.freeze({ pressName: 120, sells: 300, country: 2, look: 40 });

const NEXT_STATUS = Object.freeze({ setup: "opening", opening: "open", open: null, expired: null });

// Sign-up makes this one document and nothing else (18.3).
export function newPressRecord({ pressId, ownerUid, email, now }) {
  if (!/^[a-z0-9-]{8,40}$/.test(pressId)) throw new Error("A press needs a short id.");
  if (!ownerUid || !email) throw new Error("A press needs an owner.");
  const at = now.toISOString();
  return { pressId, ownerUid, ownerEmail: email.toLowerCase(), status: "setup", pressName: "", sells: "", country: "",
    look: "", stagedImportPath: "", createdAt: at, lastSeenAt: at };
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
    fields[key] = typeof value === "string" ? value.trim() : value;
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
