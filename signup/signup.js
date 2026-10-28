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
//   invites    optional: isInvited(email) -> boolean; markUsed(email, shopId) (the control room's waitlist invites,
//              waitlist/invites.js createInvites)
//   live       optional: () -> liveSettings (the daily cap, `signupDailyCap`; services/settings.js)
//
// Daily cap (plan 6.13): at most `signupDailyCap` new shops start each Toronto day. A press over the cap is put "in-line"
// (its trial doesn't start, so no days are lost) and `admitFromLine()` (run by the shop maker's sweep) lets the oldest
// in first as room opens, starts its trial and emails it (`shop-starting`). An invited email skips the cap and the line,
// and doesn't count towards it.
//
// Screen 2 (plan 6.2): the press may choose its web address (`checkAddress` rules, free in the registry and among
// sign-ups), answers "What do you sell?" (skippable) and ticks the terms box. The terms' version and the date are
// stored on the sign-up row once (terms/terms.js acceptanceRecord); signing up again keeps the first agreement.
import { createHash, randomBytes } from "node:crypto";
import { ADDRESS_SUFFIX, checkAddress, checkSignup, isEmail, slugFromPressName } from "./form.js";
import { acceptanceRecord, currentTermsVersion } from "../terms/terms.js";
import { liveSettings } from "./live.js";

/** The press's words while its shop waits for the day's room (plan 6.13). */
export const IN_LINE_WORDS = "We're making a few shops a day. You're next in line, and we'll email you when yours starts.";

const torontoDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

export const MAX_SHOPS_PER_ACCOUNT = 5;
export const LINKS_PER_HOUR = 5;
/** The platform pages a sign-in link may bring the person back to. */
export const SIGN_IN_PAGES = Object.freeze(["signup", "accounts"]);

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

export function createSignup({ accounts, signups, registry, billing, email, auth, throttle, settings, invites = null, live = () => liveSettings(), now = () => new Date(), suffix = randomSuffix }) {
  const at = () => now().toISOString();

  /** Is this address free for this account? Taken in the registry, or by another person's sign-up, means no. */
  async function isFree(address, accountId) {
    if (await registry.getShop(address)) return false;
    const row = await signups.get(address);
    return !row || row.accountId === accountId;
  }

  async function freeShopId(pressName) {
    const base = slugFromPressName(pressName);
    for (let i = 0; i < 8; i += 1) {
      const id = `${base}-${suffix()}`;
      if (!(await registry.getShop(id)) && !(await signups.get(id))) return id;
    }
    throw new SignupError(503, "We couldn't find a free web address for your press just now. Try again in a minute.");
  }

  const invited = async (address) => {
    if (!invites) return false;
    try {
      return (await invites.isInvited(address)) === true;
    } catch {
      return false;
    }
  };

  /** Shops let in today that count towards the cap (invited ones don't). */
  async function startedToday() {
    const today = torontoDay(now());
    return (await signups.list()).filter((row) => {
      if (row.invited || row.status === "in-line") return false;
      const when = row.admittedAt ?? row.createdAt;
      return typeof when === "string" && torontoDay(new Date(when)) === today;
    }).length;
  }

  /** Starts the trial (once) and makes the person the shop's owner on their account (once). */
  async function begin(row, person) {
    if (!row.trialStartedAt) {
      const plan = await billing.startTrial({ account: person, shopId: row.shopId, pressName: row.pressName, plan: row.plan });
      row = { ...row, trialStartedAt: at(), billingStatus: plan.status, trialEnd: plan.trialEnd ?? null };
      await signups.set(row.shopId, row);
    }
    const account = (await accounts.get(person.accountId)) ?? { ...person, createdAt: at(), shops: {} };
    if (account.shops?.[row.shopId] !== "owner") {
      await accounts.set(person.accountId, { ...account, email: person.email, shops: { ...(account.shops ?? {}), [row.shopId]: "owner" } });
    }
    return row;
  }

  const ownerOf = (row) => ({ accountId: row.accountId, email: row.ownerEmail, name: row.ownerName ?? "" });

  return {
    /**
     * Emails a sign-in link from the platform (not from a stranger's address). The answer is the same whether or not
     * the address has an account, and an address gets at most five links an hour.
     */
    async sendSignInLink({ email: address, page }) {
      if (!isEmail(address)) throw new SignupError(400, "Enter your email address.", { email: "Enter your email address." });
      const to = address.trim().toLowerCase();
      const key = `signin/${createHash("sha256").update(to).digest("hex").slice(0, 32)}`;
      const since = new Date(now().getTime() - 3600_000).toISOString();
      if ((await throttle.count(key, since)) >= LINKS_PER_HOUR) {
        throw new SignupError(429, "We've sent a few links already. Check your inbox (and spam), or try again in an hour.");
      }
      await throttle.add(key, at());
      const link = await auth.signInLink(to, { url: `${settings.platformUrl}/${SIGN_IN_PAGES.includes(page) ? page : "signup"}/?finish=1` });
      await email.sendPlatform({ kind: "sign-in-link", to, data: { link }, idempotencyKey: `${key}/${at()}` });
      return { ok: true };
    },

    /** Starts the press's free trial and queues its shop. Returns { shopId, status, trialEnd }. */
    async start(claims, input) {
      const person = personOf(claims);
      const { ok, details, problems } = checkSignup(input);
      if (!ok) throw new SignupError(400, "Some details need another look.", problems);
      let agreement;
      try {
        agreement = acceptanceRecord(details.termsVersion, now());
      } catch (error) {
        throw new SignupError(409, error.message, { terms: error.message });
      }

      const mine = await signups.listByAccount(person.accountId);
      // The same press signed up again (a double click, a lost answer): the same shop, carried on from where it stopped,
      // with the first agreement to the terms kept.
      let row = mine.find((s) => s.pressName.toLowerCase() === details.pressName.toLowerCase());
      if (!row) {
        if (mine.length >= MAX_SHOPS_PER_ACCOUNT) throw new SignupError(429, `One account can start up to ${MAX_SHOPS_PER_ACCOUNT} shops. Write to us if you need more.`);
        if (details.address && !(await isFree(details.address, person.accountId))) {
          throw new SignupError(409, "That web address is taken.", { address: "That address is taken. Try another." });
        }
        const isInvited = await invited(person.email);
        const { signupDailyCap } = await live();
        const myTurn = isInvited || (await startedToday()) < signupDailyCap;
        row = {
          shopId: details.address ?? (await freeShopId(details.pressName)),
          accountId: person.accountId,
          ownerEmail: person.email,
          ownerName: person.name,
          pressName: details.pressName,
          plan: details.plan,
          country: details.country,
          currency: details.currency,
          answer: details.answer,
          publishes: details.publishes,
          ...agreement,
          paymentProvider: "stripe",
          invited: isInvited,
          status: myTurn ? "queued" : "in-line",
          ...(myTurn ? { admittedAt: at() } : { linedUpAt: at(), message: IN_LINE_WORDS }),
          createdAt: at(),
        };
        await signups.set(row.shopId, row);
        if (isInvited) await invites.markUsed(person.email, row.shopId);
      } else {
        if (!row.termsAcceptedAt) {
          row = { ...row, ...agreement };
          await signups.set(row.shopId, row);
        }
        // Invited while waiting in line: straight in.
        if (row.status === "in-line" && (await invited(person.email))) {
          row = { ...row, status: "queued", invited: true, admittedAt: at(), message: null };
          await signups.set(row.shopId, row);
          await invites.markUsed(person.email, row.shopId);
        }
      }

      if (row.status !== "in-line") row = await begin(row, person);
      return { shopId: row.shopId, pressName: row.pressName, plan: row.plan, status: row.status, trialEnd: row.trialEnd ?? null, ...(row.status === "in-line" ? { message: IN_LINE_WORDS } : {}) };
    },

    /**
     * Screen 2's web address preview (plan 6.2), checked as the press types. With `address`, says whether it can be
     * used; without, suggests one from `pressName` (the name itself when free, else the name and five characters).
     */
    async checkWebAddress(claims, { pressName, address } = {}) {
      const person = personOf(claims);
      let candidate = typeof address === "string" && address.trim() ? address : null;
      if (!candidate) {
        const base = slugFromPressName(typeof pressName === "string" ? pressName : "");
        candidate = checkAddress(base).ok && (await isFree(base, person.accountId)) ? base : await freeShopId(base);
      }
      const { ok, address: clean, problem } = checkAddress(candidate);
      if (!ok) return { address: clean, free: false, problem };
      const free = await isFree(clean, person.accountId);
      return { address: clean, url: `https://${clean}${ADDRESS_SUFFIX}`, free, problem: free ? null : "That address is taken. Try another." };
    },

    /**
     * Lets presses waiting in line in, oldest first, while today has room under the cap: starts each one's trial and
     * emails it that its shop is starting. Safe to run every minute; a press whose trial failed to start stays in line
     * for the next run. Returns the shop ids let in.
     */
    async admitFromLine() {
      const { signupDailyCap } = await live();
      let room = signupDailyCap - (await startedToday());
      if (room <= 0) return [];
      const line = (await signups.list())
        .filter((row) => row.status === "in-line")
        .sort((a, b) => String(a.linedUpAt ?? a.createdAt).localeCompare(String(b.linedUpAt ?? b.createdAt)) || a.shopId.localeCompare(b.shopId));
      const admitted = [];
      for (const waiting of line) {
        if (room <= 0) break;
        let row;
        try {
          row = await begin(waiting, ownerOf(waiting));
        } catch {
          continue; // The trial didn't start: the press keeps its place in line for the next run.
        }
        row = { ...row, status: "queued", admittedAt: at(), message: null };
        await signups.set(row.shopId, row);
        admitted.push(row.shopId);
        room -= 1;
        try {
          await email.sendPlatform({
            kind: "shop-starting", to: row.ownerEmail, shopId: row.shopId,
            data: { pressName: row.pressName, link: `${settings.platformUrl}/signup/` },
            idempotencyKey: `shop-starting/${row.shopId}`,
          });
        } catch {
          // The shop starts anyway, and the welcome email (setup step 14) follows when it's ready.
        }
      }
      return admitted;
    },

    /** The terms version the page shows next to the tick box. */
    termsVersion: () => currentTermsVersion(),

    /** The signed-in person's shops in the making, for the page to follow. */
    async mine(claims) {
      const person = personOf(claims);
      const rows = await signups.listByAccount(person.accountId);
      return rows.map(({ shopId, pressName, plan, status, trialEnd, message, canRetry, siteUrl }) => ({ shopId, pressName, plan, status, trialEnd, message: status === "in-line" ? IN_LINE_WORDS : message, canRetry, siteUrl }));
    },
  };
}
