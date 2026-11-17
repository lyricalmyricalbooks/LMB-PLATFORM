// Text-message reminders' settings (Services plan phase 7, 17 November 2026), from the platform's own environment only.
// The text company's keys (Twilio) are read here and nowhere else; no shop ever holds them. **Off unless TEXTS is
// "on"** and the keys are there: until then every shop's Bookings page says "Opening soon" and nothing is sent.
//
//   TEXTS                    "on" opens text reminders to every shop
//   TWILIO_ACCOUNT_SID       the platform's Twilio account (AC…)
//   TWILIO_AUTH_TOKEN        its auth token
//   TWILIO_FROM              who the texts come from: the platform's verified toll-free number (+1…) or a Twilio
//                            messaging service (MG…), which works in Canada and the US
//   TEXT_PART_MICROS_CAD / _USD   what one text part costs the platform, in millionths of a dollar, passed on at cost
//                            (default 16000 / 11600: Twilio's price for Canada and the US plus the US carriers' fee,
//                            November 2026; check Twilio's price list before going live)
const text = (value) => (typeof value === "string" ? value.trim() : "");

function micros(env, name, fallback) {
  const raw = text(env[name]);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new Error(`${name} must be a whole number of millionths of a dollar`);
  return n;
}

export function readTextConfig(env = {}) {
  const sid = text(env.TWILIO_ACCOUNT_SID);
  const token = text(env.TWILIO_AUTH_TOKEN);
  const from = text(env.TWILIO_FROM);
  if (sid && !/^AC[0-9a-fA-F]{32}$/.test(sid)) throw new Error("TWILIO_ACCOUNT_SID must look like AC followed by 32 letters and numbers");
  if (Boolean(sid) !== Boolean(token)) throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN go together");
  if (from && !/^(\+1[2-9]\d{9}|MG[0-9a-fA-F]{32})$/.test(from)) throw new Error("TWILIO_FROM must be a +1 number or a messaging service (MG…)");
  if (sid && !from) throw new Error("TWILIO_FROM is needed with the Twilio keys");
  return Object.freeze({
    on: text(env.TEXTS).toLowerCase() === "on" && Boolean(sid),
    sid, token, from,
    partMicros: Object.freeze({ CAD: micros(env, "TEXT_PART_MICROS_CAD", 16_000), USD: micros(env, "TEXT_PART_MICROS_USD", 11_600) }),
  });
}

/** The Launch page's line (control-room/platformControls.js): a setting, not a secret. */
export const TEXTS_SETTING = Object.freeze({ env: "TEXTS", value: "on" });

/** The Twilio keys as Secret Manager secrets in the platform project (server/deploy.js). All optional. */
export const TEXTS_SECRETS = Object.freeze([
  { env: "TWILIO_ACCOUNT_SID", secret: "twilio-account-sid", api: true, jobs: true },
  { env: "TWILIO_AUTH_TOKEN", secret: "twilio-auth-token", api: true, jobs: true },
]);

/** "1.6¢" for the pages: one text part's price in cents, one decimal at most. Pure. */
export function partPriceText(partMicros) {
  const cents = Math.round(partMicros / 1000) / 10;
  return `${Number.isInteger(cents) ? cents : cents.toFixed(1)}¢`;
}

/** What `parts` text parts cost in cents, rounded once for the whole month. Pure. */
export function textCents(config, currency, parts) {
  if (!(parts > 0)) return 0;
  return Math.round((parts * config.partMicros[currency === "USD" ? "USD" : "CAD"]) / 10_000);
}
