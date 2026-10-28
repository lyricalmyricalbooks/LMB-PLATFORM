// The emergency payments switch (code plan 8.5). If the platform's Stripe account is ever paused, a platform admin
// moves one shop, or every shop, off it from the control room: to the press's own Stripe keys (the shop's own-key
// path, SHOP_PAYMENT_MODE "own") or to Square through the platform. "Back" undoes it from what was saved. The press is
// emailed at once with what changed and what they need to do. Nothing changes unless an admin uses it.
//
// For each shop, in this order (safe to run again after a failure: each part is written only if it differs):
//   1. a log entry in the registry and the shop's audit log;
//   2. the registry row's `paymentsEmergency` ({ to, by, reason, at, before }) and, for Square, its `payments`, which
//      the payment service routes by;
//   3. the shop's server settings file (SHOP_PAYMENT_PROVIDER, SHOP_PAYMENT_MODE), then its server code deployed again
//      at the release it is on;
//   4. the profile's `payments` (what the admin and the card form read), then its pages deployed again;
//   5. the email to the press.
//
// Clients passed in: registry (getShop, listShops, updateShop, getProfile, saveProfile), envFiles and profileFiles
// (read, write), deploy (deployed, functions), build(version) (the release builder, skips a release already built),
// publish (controlRoom.js profilePublisher), shopData (get: to see whether the press has saved its own keys),
// squareAccount(shopId) (optional: the press's connected Square account or null), email (sendPlatform), log (the
// control room's), now.
import { isDeepStrictEqual } from "node:util";
import { PLANS, REGION } from "../setup/steps.js";
import { profileProblems, profileScript } from "../profile/profile.js";

/** Where a shop's card payments can be moved: the press's own Stripe keys, Square, or back to the platform's Stripe. */
export const PAYMENT_ROUTES = Object.freeze(["own", "square", "platform"]);

const MOVES = Object.freeze({
  own: { provider: "stripe", mode: "own" },
  square: { provider: "square", mode: "platform" },
});

const quoted = (line) => /^"(.*)"$/.exec(line?.trim() ?? "")?.[1] ?? line?.trim() ?? "";

/** The provider and mode a shop's server settings file names (empty when a line is missing). */
export function envPayments(text) {
  const value = (name) => quoted(String(text ?? "").split("\n").find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1));
  return { provider: value("SHOP_PAYMENT_PROVIDER"), mode: value("SHOP_PAYMENT_MODE") };
}

/** The server settings file with these payments; every other line is kept as it is. */
export function envWithPayments(text, { provider, mode }) {
  const lines = String(text ?? "").split("\n");
  for (const [name, value] of [["SHOP_PAYMENT_PROVIDER", provider], ["SHOP_PAYMENT_MODE", mode]]) {
    const at = lines.findIndex((line) => line.startsWith(`${name}=`));
    const line = `${name}="${value}"`;
    if (at >= 0) lines[at] = line;
    else lines.splice(Math.max(0, lines.length - 1), 0, line);
  }
  return lines.join("\n");
}

const usable = (version) => typeof version === "string" && version && version !== "unknown" && !version.includes("+");

export function emergencyPayments({ registry, envFiles, profileFiles, deploy, build = async () => {}, publish, shopData, squareAccount, email, log, now = () => new Date() }) {
  const at = () => now().toISOString();

  // Whether the press can take cards the new way straight away, for the email and the control room.
  async function readiness(shopId, to) {
    if (to === "own") {
      const keys = shopData ? await shopData.get(shopId, "adminSecrets/stripe") : null;
      return Boolean(keys?.secretKey);
    }
    if (to === "square") return Boolean(squareAccount && (await squareAccount(shopId)));
    return true;
  }

  // Puts the server code live again with the new settings file, at the release it is already on.
  async function redeployServer(shopId, row, envFile) {
    const live = await deploy.deployed(shopId, "functions");
    // Not deployed yet: setup step 8 deploys it with this file.
    if (!live) return false;
    if (!usable(live.version)) throw new Error(`its server code is on "${live.version}", so a person deploys it by hand`);
    await build(live.version);
    const region = live.region && !live.region.includes("+") ? live.region : row.region ?? REGION;
    await deploy.functions(shopId, { version: live.version, region, envFile });
    return true;
  }

  /** Moves one shop. Resolves to its line in the answer: { shopId, to, changed, ready?, skipped?, error? }. */
  async function moveShop(row, to, { by, reason }) {
    const shopId = row.shopId;
    if (!PLANS[row.plan]?.shop) return { shopId, to, changed: false, skipped: "a stockroom alone has no checkout" };
    const current = row.paymentsEmergency?.to ?? "platform";
    if (to === "platform" && !row.paymentsEmergency) return { shopId, to, changed: false, skipped: "already on the platform's payments" };
    if (to !== "platform" && current === "platform" && row.payments?.provider !== "stripe") {
      return { shopId, to, changed: false, skipped: "it doesn't take payments through the platform's Stripe" };
    }
    const envText = await envFiles.read(shopId);
    if (!envText) return { shopId, to, changed: false, error: "its server settings file is missing from the registry (setup step 8)" };
    const profile = await registry.getProfile(shopId);
    if (!profile) return { shopId, to, changed: false, error: "it has no saved profile (setup step 6)" };

    // What the shop had on the platform's payments, kept until it goes back.
    const before = row.paymentsEmergency?.before ?? { payments: row.payments ?? null, profilePayments: profile.payments ?? null, env: envPayments(envText) };
    const env = to === "platform" ? before.env : MOVES[to];
    const profilePayments = to === "platform" ? before.profilePayments : MOVES[to];
    const nextProfile = { ...profile };
    if (profilePayments) nextProfile.payments = profilePayments;
    else delete nextProfile.payments;
    const problems = profileProblems(nextProfile);
    if (problems.length) return { shopId, to, changed: false, error: `its profile would have problems: ${problems.join("; ")}` };

    await log(shopId, "payments-moved", { by, from: current, to, reason });
    const emergency = to === "platform" ? row.paymentsEmergency : { to, by, reason, at: current === to ? row.paymentsEmergency.at : at(), before };
    // The payment service routes by the registry's `payments`: Square for a Square move, the old account otherwise.
    // Going back, `paymentsEmergency` is cleared only at the end, so a run that stops half-way can be run again.
    await registry.updateShop(shopId, {
      payments: to === "square" ? { provider: "square", mode: before.payments?.mode ?? "live" } : before.payments,
      ...(to === "platform" ? {} : { paymentsEmergency: emergency }),
    });

    const nextEnv = envWithPayments(envText, env);
    let server = false;
    if (nextEnv !== envText) {
      await envFiles.write(shopId, nextEnv);
      server = await redeployServer(shopId, row, nextEnv);
    }
    let pages = [];
    if (!isDeepStrictEqual(profile, nextProfile)) await registry.saveProfile(shopId, nextProfile);
    const script = profileScript(nextProfile);
    if ((await profileFiles.read(shopId)) !== script) {
      await profileFiles.write(shopId, script);
      ({ apps: pages } = await publish(shopId));
    }
    if (to === "platform") {
      await registry.updateShop(shopId, { paymentsEmergency: null, lastPaymentsEmergency: { ...emergency, endedBy: by, endedAt: at(), endReason: reason } });
    }

    // The press hears at once. One email per move, however often it is run (the email service keeps the key).
    const ready = await readiness(shopId, to);
    if (row.ownerEmail) {
      await email.sendPlatform({
        kind: "payments-moved", to: row.ownerEmail, shopId,
        data: { pressName: row.pressName ?? shopId, to, ready },
        idempotencyKey: `payments-moved-${shopId}-${to}-${emergency.at}`,
      });
    }
    const changed = current !== to;
    return { shopId, to, changed, ready, server, pages };
  }

  return {
    moveShop,
    /** One shop, or every live shop with checkout (`all`). One shop's trouble never stops the others. */
    async move({ by, reason, to, shopId, all }) {
      const rows = all ? (await registry.listShops()).filter((row) => row.status === "live") : [await registry.getShop(shopId)];
      const shops = [];
      for (const row of rows) {
        try {
          shops.push(await moveShop(row, to, { by, reason }));
        } catch (error) {
          shops.push({ shopId: row.shopId, to, changed: false, error: error?.message ?? String(error) });
        }
      }
      return { to, shops };
    },
  };
}
