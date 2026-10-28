// The settings sign-up reads at the moment it runs: whether sign-up is open, the daily cap on new shops, the founding
// offer and pay as you sell. The control room changes them without a redeploy; its `liveSettings({ env, store })` in
// services/settings.js is the real one. Until that is on main this file stands in for it with the same name, the same
// shape and the same defaults, so swapping the import is the whole merge.
//
//   SIGNUP_OPEN                      "on" opens sign-up on the waitlist page          default off
//   SIGNUP_DAILY_CAP                 new shops started a day (invites don't count)    default 10
//   FOUNDING_PERCENT_OFF             the founding price's percent off, 0 for none     default 0 (no founding price)
//   FOUNDING_PRESSES                 how many presses get it                          default 25
//   PAY_AS_YOU_SELL_BASIS_POINTS     the second way to pay, in hundredths of a %      default 0 (not offered)
//
// `store` (optional): get() -> the control room's saved values, which win over the environment.

export const LIVE_DEFAULTS = Object.freeze({
  signupOpen: false,
  signupDailyCap: 10,
  foundingOffer: Object.freeze({ percentOff: 0, presses: 25 }),
  payAsYouSell: Object.freeze({ basisPoints: 0 }),
});

const whole = (value, fallback, max) => {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
};
const on = (value, fallback) => (typeof value === "boolean" ? value : typeof value === "string" ? /^(on|true|1|yes)$/i.test(value.trim()) : fallback);

export async function liveSettings({ env = process.env, store = null } = {}) {
  let saved = {};
  try {
    saved = (await store?.get?.()) ?? {};
  } catch {
    saved = {};
  }
  const pick = (key, envName) => (saved[key] !== undefined ? saved[key] : env[envName]);
  return {
    signupOpen: on(pick("signupOpen", "SIGNUP_OPEN"), LIVE_DEFAULTS.signupOpen),
    signupDailyCap: whole(pick("signupDailyCap", "SIGNUP_DAILY_CAP"), LIVE_DEFAULTS.signupDailyCap, 10_000),
    foundingOffer: {
      percentOff: whole(saved.foundingOffer?.percentOff ?? env.FOUNDING_PERCENT_OFF, LIVE_DEFAULTS.foundingOffer.percentOff, 100),
      presses: whole(saved.foundingOffer?.presses ?? env.FOUNDING_PRESSES, LIVE_DEFAULTS.foundingOffer.presses, 100_000),
    },
    payAsYouSell: { basisPoints: whole(saved.payAsYouSell?.basisPoints ?? env.PAY_AS_YOU_SELL_BASIS_POINTS, LIVE_DEFAULTS.payAsYouSell.basisPoints, 10_000) },
  };
}
