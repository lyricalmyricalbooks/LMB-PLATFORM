// Sign-up on the platform (code plan 2.5): a press signs in (an email link or Google), names its press, picks a plan,
// answers one question it may skip, and gets its free trial with no card. The shop maker then makes the shop (2.6).
//
// Self-serve only: nothing here waits for a person. Every step is safe to repeat: signing up twice (a double click, a
// lost answer) gives back the same shop and the same trial.
//
// Clients passed in (fakes.js has in-memory ones):
//   accounts   get(accountId) -> { accountId, email, name, createdAt, shops: { [shopId]: role } } | null; set(accountId, row)
//   signups    get(shopId) -> row | null; set(shopId, row); listByAccount(accountId) -> rows
//   registry   getShop(shopId) -> row | null (a shop id the registry has is taken)
//   billing    startTrial({ account, shopId, pressName, plan }) (services/billing)
//   email      sendPlatform({ kind, to, data, idempotencyKey }) (services/email)
//   auth       signInLink(email, { url }) -> link (Firebase Admin's generateSignInWithEmailLink, in the platform project)
//   throttle   count(key, sinceIso) -> number; add(key, atIso)
import { createHash, randomBytes } from "node:crypto";
import { checkSignup, isEmail, slugFromPressName } from "./form.js";

export const MAX_SHOPS_PER_ACCOUNT = 5;
export const LINKS_PER_HOUR = 5;

export class SignupError extends Error {
  constructor(status, message, problems) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

/** Five lowercase letters and digits, so a shop id is unique across Google (project ids are global). */
export const randomSuffix = () => [...randomBytes(5)].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

/** The signed-in person, from a checked ID token. Only a verified email can own a shop. */
export function personOf(claims) {
  if (!claims?.uid) throw new SignupError(401, "Sign in first.");
  if (!claims.email || claims.email_verified !== true) throw new SignupError(403, "Confirm your email address first: use the link we sent, or sign in with Google.");
  return { accountId: claims.uid, email: String(claims.email).toLowerCase(), name: typeof claims.name === "string" ? claims.name.slice(0, 120) : "" };
}

export function createSignup({ accounts, signups, registry, billing, email, auth, throttle, settings, now = () => new Date(), suffix = randomSuffix }) {
  const at = () => now().toISOString();

  async function freeShopId(pressName) {
    const base = slugFromPressName(pressName);
    for (let i = 0; i < 8; i += 1) {
      const id = `${base}-${suffix()}`;
      if (!(await registry.getShop(id)) && !(await signups.get(id))) return id;
    }
    throw new SignupError(503, "We couldn't find a free web address for your press just now. Try again in a minute.");
  }

  return {
    /**
     * Emails a sign-in link from the platform (not from a stranger's address). The answer is the same whether or not
     * the address has an account, and an address gets at most five links an hour.
     */
    async sendSignInLink({ email: address }) {
      if (!isEmail(address)) throw new SignupError(400, "Enter your email address.", { email: "Enter your email address." });
      const to = address.trim().toLowerCase();
      const key = `signin/${createHash("sha256").update(to).digest("hex").slice(0, 32)}`;
      const since = new Date(now().getTime() - 3600_000).toISOString();
      if ((await throttle.count(key, since)) >= LINKS_PER_HOUR) {
        throw new SignupError(429, "We've sent a few links already. Check your inbox (and spam), or try again in an hour.");
      }
      await throttle.add(key, at());
      const link = await auth.signInLink(to, { url: `${settings.platformUrl}/signup/?finish=1` });
      await email.sendPlatform({ kind: "sign-in-link", to, data: { link }, idempotencyKey: `${key}/${at()}` });
      return { ok: true };
    },

    /** Starts the press's free trial and queues its shop. Returns { shopId, status, trialEnd }. */
    async start(claims, input) {
      const person = personOf(claims);
      const { ok, details, problems } = checkSignup(input);
      if (!ok) throw new SignupError(400, "Some details need another look.", problems);

      const account = (await accounts.get(person.accountId)) ?? { ...person, createdAt: at(), shops: {} };
      const mine = await signups.listByAccount(person.accountId);
      // The same press signed up again (a double click, a lost answer): the same shop, carried on from where it stopped.
      let row = mine.find((s) => s.pressName.toLowerCase() === details.pressName.toLowerCase());
      if (!row) {
        if (mine.length >= MAX_SHOPS_PER_ACCOUNT) throw new SignupError(429, `One account can start up to ${MAX_SHOPS_PER_ACCOUNT} shops. Write to us if you need more.`);
        row = {
          shopId: await freeShopId(details.pressName),
          accountId: person.accountId,
          ownerEmail: person.email,
          ...details,
          paymentProvider: "stripe",
          status: "queued",
          createdAt: at(),
        };
        await signups.set(row.shopId, row);
      }

      if (!row.trialStartedAt) {
        const plan = await billing.startTrial({ account: person, shopId: row.shopId, pressName: row.pressName, plan: row.plan });
        row = { ...row, trialStartedAt: at(), billingStatus: plan.status, trialEnd: plan.trialEnd ?? null };
        await signups.set(row.shopId, row);
      }
      if (account.shops?.[row.shopId] !== "owner") {
        await accounts.set(person.accountId, { ...account, email: person.email, shops: { ...(account.shops ?? {}), [row.shopId]: "owner" } });
      }
      return { shopId: row.shopId, pressName: row.pressName, plan: row.plan, status: row.status, trialEnd: row.trialEnd };
    },

    /** The signed-in person's shops in the making, for the page to follow. */
    async mine(claims) {
      const person = personOf(claims);
      const rows = await signups.listByAccount(person.accountId);
      return rows.map(({ shopId, pressName, plan, status, trialEnd, message, canRetry, siteUrl }) => ({ shopId, pressName, plan, status, trialEnd, message, canRetry, siteUrl }));
    },
  };
}
