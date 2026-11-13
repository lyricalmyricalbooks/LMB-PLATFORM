// The bank feed's settings (beta, 13 November 2026), from the platform's own environment only. The Plaid keys are read
// here and nowhere else; no shop ever holds them. **Off unless BANK_FEED is "on"** and the keys are there: until then
// every shop's Bookkeeping page says "Opening soon" and the Plan page shows no add-on.
//
//   BANK_FEED                 "on" opens the bank feed add-on to every shop
//   PLAID_ENV                 "sandbox" (pretend banks, free; the default) or "production" (real banks, once Plaid has
//                             approved Colophon). Sandbox keys only work on sandbox, so a mix-up fails closed.
//   PLAID_CLIENT_ID           the platform's Plaid client id
//   PLAID_SECRET              the Plaid secret for PLAID_ENV
//   BANK_FEED_TOKEN_KEY       32 random bytes in Base64: seals each shop's bank access (../payments/tokenSeal.js)
//   BANK_FEED_PRICE_CAD / _USD        the add-on's monthly price in cents          default 400 / 300
//   BANK_FEED_EXTRA_CAD / _USD        each bank past the included ones, in cents   default 150 / 100
//   BANK_FEED_INCLUDED_BANKS          banks the price covers                       default 2
import { sealingKey } from "../payments/tokenSeal.js";

const text = (value) => (typeof value === "string" ? value.trim() : "");
export const PLAID_HOSTS = Object.freeze({ sandbox: "https://sandbox.plaid.com", production: "https://production.plaid.com" });
/** The most banks one shop may connect: each one costs the platform a monthly fee. */
export const MAX_BANKS = 6;

function cents(env, name, fallback) {
  const raw = text(env[name]);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new Error(`${name} must be a whole number of cents`);
  return n;
}

export function readBankFeedConfig(env = {}) {
  const plaidEnv = text(env.PLAID_ENV).toLowerCase() || "sandbox";
  if (!Object.hasOwn(PLAID_HOSTS, plaidEnv)) throw new Error('PLAID_ENV must be "sandbox" or "production"');
  const clientId = text(env.PLAID_CLIENT_ID);
  const secret = text(env.PLAID_SECRET);
  if (Boolean(clientId) !== Boolean(secret)) throw new Error("PLAID_CLIENT_ID and PLAID_SECRET go together");
  const keyText = text(env.BANK_FEED_TOKEN_KEY);
  if (clientId && !keyText) throw new Error("BANK_FEED_TOKEN_KEY is needed with the Plaid keys");
  const included = cents(env, "BANK_FEED_INCLUDED_BANKS", 2);
  if (included < 1 || included > MAX_BANKS) throw new Error(`BANK_FEED_INCLUDED_BANKS must be 1 to ${MAX_BANKS}`);
  return Object.freeze({
    on: text(env.BANK_FEED).toLowerCase() === "on" && Boolean(clientId),
    plaidEnv, host: PLAID_HOSTS[plaidEnv], clientId, secret,
    tokenKey: keyText ? sealingKey(keyText, "BANK_FEED_TOKEN_KEY") : null,
    included,
    prices: Object.freeze({
      CAD: Object.freeze({ base: cents(env, "BANK_FEED_PRICE_CAD", 400), extra: cents(env, "BANK_FEED_EXTRA_CAD", 150) }),
      USD: Object.freeze({ base: cents(env, "BANK_FEED_PRICE_USD", 300), extra: cents(env, "BANK_FEED_EXTRA_USD", 100) }),
    }),
  });
}

/** The Launch page's line (control-room/platformControls.js): a setting, not a secret. */
export const BANK_FEED_SETTING = Object.freeze({ env: "BANK_FEED", value: "on" });

/** The Plaid keys as Secret Manager secrets in the platform project (server/deploy.js). All optional. */
export const BANK_FEED_SECRETS = Object.freeze([
  { env: "PLAID_CLIENT_ID", secret: "plaid-client-id", api: true, jobs: true },
  { env: "PLAID_SECRET", secret: "plaid-secret", api: true, jobs: true },
  { env: "BANK_FEED_TOKEN_KEY", secret: "bank-feed-token-key", api: true, jobs: true },
]);

/** "CA$4" or "US$3.50" for the pages: whole dollars with no cents. Pure. */
export function priceText(amountCents, currency) {
  const sign = currency === "USD" ? "US$" : "CA$";
  return `${sign}${amountCents % 100 === 0 ? String(amountCents / 100) : (amountCents / 100).toFixed(2)}`;
}

/** What a month with `banks` connected costs, in cents: nothing with no bank, else the price plus each extra bank. Pure. */
export function monthCents(config, currency, banks) {
  const price = config.prices[currency === "USD" ? "USD" : "CAD"];
  if (!(banks > 0)) return 0;
  return price.base + Math.max(0, banks - config.included) * price.extra;
}
