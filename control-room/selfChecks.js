// Self-checks after every change (code plan 2.11). After the platform changes a shop (a switch, the shop maker, a
// release, a billing change) and on a daily sweep, these look at the shop as the platform left it:
//
//   profile       a live shop has a saved profile with no problems, every switch written down
//   profile-file  the /shop-profile.js the platform keeps matches the saved profile     (fixes itself)
//   release       its rules, server code and pages are all on the release the registry says
//   service-key   a shop with a shop app has its service key, matching the registry's hash
//   plan          a shop whose plan ended is not still marked live
//   closed        a shop the platform closed (plan 8.4) still has its pause page on      (fixes itself; needs shopData)
//
// A check only looks. A failing check with a safe fix (rewriting a file from the saved profile and publishing it, the
// same thing a switch change does) is fixed once and checked again; anything else goes to the repair queue for a
// person. A check that passes closes its earlier repair items. Each run is logged in the registry.
//
// Services/health (every five minutes) watches whether the pages and checkout answer; this watches whether the shop is
// set up the way the platform thinks it is.
//
// Clients passed in: registry (getShop, getProfile, saveProfile, listShops, recordEvent), profileFiles (read, write),
// deploy (deployed), publish (controlRoom.js profilePublisher), repairs (repairs.js), google (secrets.latest; optional:
// without it the service-key check only looks for the registry's hash), shopData (get, set: the shop's own database;
// optional: without it the closed check isn't run).
import { PLANS, SWITCHES, shopSwitches } from "../setup/steps.js";
import { hasServiceKey } from "../setup/serviceKey.js";
import { profileProblems, profileScript } from "../profile/profile.js";
import { closedShopCheck } from "./closure.js";

const appsOf = (row) => Object.keys(PLANS[row.plan] ?? {}).filter((app) => PLANS[row.plan][app]);

export function selfChecks({ registry, profileFiles, deploy, publish, google, shopData }) {
  return [
    {
      name: "profile",
      async run({ row, profile }) {
        if (!profile) return { ok: false, problem: "the shop is live but has no saved profile" };
        const problems = profileProblems(profile);
        if (problems.length) return { ok: false, problem: `the saved profile has problems: ${problems.join("; ")}` };
        const missing = SWITCHES.filter((name) => typeof profile.switches?.[name] !== "boolean");
        if (missing.length) {
          return {
            ok: false, problem: `the saved profile doesn't say whether these are on: ${missing.join(", ")}`,
            // Writing them down as off is what setup does for a new shop (setup/steps.js shopSwitches).
            fix: async () => {
              const fixed = { ...profile, switches: shopSwitches(profile.switches) };
              await registry.saveProfile(row.shopId, fixed);
              await profileFiles.write(row.shopId, profileScript(fixed));
              await publish(row.shopId);
              return "wrote the missing switches down as off and published the profile";
            },
          };
        }
        if (profile.shopId !== row.shopId) return { ok: false, problem: `the saved profile is for ${profile.shopId}` };
        return { ok: true };
      },
    },
    {
      name: "profile-file",
      async run({ row, profile }) {
        if (!profile || profileProblems(profile).length) return { ok: true, skipped: "no good profile to compare with" };
        const text = profileScript(profile);
        if ((await profileFiles.read(row.shopId)) === text) return { ok: true };
        return {
          ok: false, problem: "the shop's /shop-profile.js doesn't match its saved profile",
          fix: async () => {
            await profileFiles.write(row.shopId, text);
            const { apps } = await publish(row.shopId);
            return `rewrote /shop-profile.js from the saved profile${apps.length ? ` and deployed the ${apps.join(" and ")} pages again` : ""}`;
          },
        };
      },
    },
    {
      name: "release",
      async run({ row }) {
        const version = row.release?.version;
        if (!version) return { ok: true, skipped: "no release recorded yet" };
        const parts = ["rules", ...(appsOf(row).includes("shop") ? ["functions"] : []), ...appsOf(row).map((app) => `pages:${app}`)];
        const off = [];
        for (const part of parts) {
          const live = await deploy.deployed(row.shopId, part);
          const label = part === "rules" ? "the rules" : part === "functions" ? "the server code" : `the ${part.slice(6)} pages`;
          if (live?.version !== version) off.push(`${label}: ${live ? live.version : "not deployed"}`);
        }
        return off.length ? { ok: false, problem: `not all on release ${version}: ${off.join("; ")}` } : { ok: true };
      },
    },
    {
      name: "service-key",
      async run({ row }) {
        if (!appsOf(row).includes("shop")) return { ok: true, skipped: "a stockroom alone has no server code" };
        if (!row.serviceKeyHash) return { ok: false, problem: "the registry has no service key for this shop" };
        if (google && !(await hasServiceKey({ google, registry }, row.shopId))) return { ok: false, problem: "the shop's service key doesn't match the registry's" };
        return { ok: true };
      },
    },
    {
      name: "plan",
      async run({ row }) {
        if (row.billing?.access === "closed") return { ok: false, problem: "the plan has ended but the shop is still marked live; a person decides whether to close it" };
        return { ok: true };
      },
    },
    ...(shopData ? [closedShopCheck({ shopData })] : []),
  ];
}

export function createSelfChecks({ registry, profileFiles, deploy, publish, repairs, google, shopData, checks = selfChecks({ registry, profileFiles, deploy, publish, google, shopData }), now = () => new Date() }) {
  async function check(shopId, { why = "check" } = {}) {
    const row = await registry.getShop(shopId);
    if (!row) return { shopId, ok: false, skipped: "no such shop", results: [] };
    // A shop still being made is the shop maker's job (it reports its own trouble).
    if (row.status !== "live") return { shopId, ok: true, skipped: `not live (${row.status ?? "being made"})`, results: [] };
    const results = [];
    for (const one of checks) {
      let result;
      try {
        // Each check reads afresh: an earlier check's fix may have changed what it looks at.
        result = await one.run({ row: await registry.getShop(shopId), profile: await registry.getProfile(shopId) });
      } catch (error) {
        result = { ok: false, problem: `couldn't check: ${error?.message ?? error}` };
      }
      if (!result.ok && result.fix) {
        try {
          const fixed = await result.fix();
          const again = await one.run({ row: await registry.getShop(shopId), profile: await registry.getProfile(shopId) });
          if (again.ok) result = { ok: true, fixed };
          else result = { ok: false, problem: again.problem, tried: fixed };
        } catch (error) {
          result = { ok: false, problem: result.problem, tried: `the fix failed: ${error?.message ?? error}` };
        }
      }
      if (result.ok) await repairs.passed(shopId, one.name);
      else await repairs.report({ shopId, check: one.name, problem: result.problem, ...(result.tried ? { detail: result.tried } : {}) });
      results.push({ check: one.name, ok: result.ok, ...(result.problem && !result.ok ? { problem: result.problem } : {}), ...(result.fixed ? { fixed: result.fixed } : {}), ...(result.skipped ? { skipped: result.skipped } : {}) });
    }
    const ok = results.every((r) => r.ok);
    const stamp = now().toISOString();
    await registry.recordEvent(shopId, {
      id: `self-check-${stamp}-${shopId}`, source: "self-check", at: stamp, what: "self-check", why: String(why).slice(0, 120), ok,
      results: results.map(({ check: name, ok: passed, problem, fixed }) => ({ check: name, ok: passed, ...(problem ? { problem } : {}), ...(fixed ? { fixed } : {}) })),
    });
    return { shopId, ok, results };
  }

  return {
    check,
    /** The daily sweep: every live shop. One shop's trouble never stops the others. */
    async sweep({ why = "daily sweep" } = {}) {
      const out = [];
      for (const row of await registry.listShops()) {
        if (row.status !== "live") continue;
        try {
          out.push(await check(row.shopId, { why }));
        } catch (error) {
          out.push({ shopId: row.shopId, ok: false, error: error?.message ?? String(error), results: [] });
        }
      }
      return out;
    },
  };
}
