// One teardown job for everything Google (code plan 6.20), on the closing timeline of plan 6.8:
//
//   pause     nothing is disconnected: a card reopens the shop as it was
//   closing   (60 days paused, or the press leaves; also the press's own Disconnect)
//             stopFeed        the shop's book feed leaves Merchant Center, and the Ads link goes
//             stopTag         the shop's Google tag stops sending; the shop's reporting account leaves Analytics and
//                             Search Console
//             stopGmail       the shop's emails stop going from the press's Gmail
//             stopExtras      Drive backups, YouTube trailers, the events calendar and Business Profile stop
//             giveBackAccess  Colophon gives back its access to the press's Google account
//   deletion  (after the 90 days to download and the 30- and 7-day emails; billing is already cancelled)
//             removeDomain    the press's own address comes off hosting and its records are removed (services/domains,
//                             through domainBridge.js), and the email sending records with it
//             deleteFirebase  the shop's Firebase project is deleted
//
// The press's own Analytics, Search Console, Merchant Center, Drive, YouTube, Calendar, Business Profile and Ads
// accounts are theirs and are never deleted, so their history leaves with them. Every step is safe to run again and is
// recorded like the connect job's (record.js).
//
// For the closing sweep (services/billing): `createGoogleTeardown(deps)` gives `teardownOnClose(shop)` and
// `teardownBeforeDelete(shop)`, to pass as its `onClose` and `beforeDelete` hooks. `teardownBeforeDelete` refuses
// unless the registry row shows the deletion is due: `closing: { closedAt, deleteAfter, warned30At, warned7At }`.
import { GoogleError } from "./googleApi.js";
import { createRecorder } from "./record.js";
import { plainProblem } from "./connect.js";

export const CLOSE_STEPS = Object.freeze(["stopFeed", "stopTag", "stopGmail", "stopExtras", "giveBackAccess"]);
export const DELETE_STEPS = Object.freeze(["removeDomain", "deleteFirebase"]);
export const TEARDOWN_STEPS = Object.freeze([...CLOSE_STEPS, ...DELETE_STEPS]);
const EXTRAS = ["drive", "youtube", "calendar", "businessProfile"];
const TAG_STOPPED = "Your shop no longer sends visits to Google, and Colophon left your Analytics and Search Console.";

/** Whether plan 6.8 says the shop may be deleted now: closed, both warning emails sent, and its date reached. */
export function deletionDue(row, now = Date.now()) {
  const c = row?.closing;
  if (!c?.closedAt || !c.warned30At || !c.warned7At || !c.deleteAfter) return false;
  const after = Date.parse(c.deleteAfter);
  return Number.isFinite(after) && after <= now && Date.parse(c.warned7At) <= now;
}

// Google answers 404 when the thing is already gone, which is what we wanted.
const gone = (err) => err instanceof GoogleError && err.status === 404;
async function quietly(run) {
  try { return await run(); } catch (err) { if (!gone(err)) throw err; return null; }
}

export function createGoogleTeardown({ google, tokens, shopFirebase, domainsCall, ownDomain, registry, auditLog, now = () => Date.now() }) {
  const recorder = createRecorder({ registry, auditLog, now });
  const iso = recorder.iso;
  const record = (shopId, step, outcome) => recorder.recordStep(shopId, step, outcome, { source: "google-teardown" });

  const STEPS = {
    async stopFeed(ctx) {
      const merchant = ctx.google.merchantCenter;
      const ads = ctx.google.ads;
      if (!merchant?.dataSource && !ads?.linkName) return { state: "done", detail: "No book feed to stop." };
      if (!ctx.token && ((merchant?.dataSource && !merchant.feedStoppedAt) || (ads?.linkName && !ads.stoppedAt))) {
        return { state: "failed", detail: "Colophon's access ended before the book feed was stopped. The press can delete it in Merchant Center." };
      }
      if (ads?.linkName && !ads.stoppedAt) {
        await quietly(() => google.removeProductLink(ctx.token, ads.customerId, ads.linkName));
        await recorder.updateGoogle(ctx.shopId, { ads: { ...ads, stoppedAt: iso() } });
      }
      if (merchant?.dataSource && !merchant.feedStoppedAt) {
        // Only Colophon's feed goes; the press's Merchant Center account and its history stay theirs.
        await quietly(() => google.deleteDataSource(ctx.token, merchant.dataSource));
        return { state: "done", detail: "Your books are no longer sent to Google Shopping.", part: "merchantCenter", record: { feedStoppedAt: iso(), dataSource: null } };
      }
      return { state: "done", detail: "Your books are no longer sent to Google Shopping." };
    },

    async stopTag(ctx) {
      const analytics = ctx.google.analytics;
      const sc = ctx.google.searchConsole;
      if (analytics?.measurementId && !analytics.tagStoppedAt) {
        await shopFirebase.clearTag(ctx.row.projectId);
        if (ctx.token && analytics.viewer) {
          const property = `properties/${analytics.propertyId}`;
          for (const binding of await quietly(() => google.listAccessBindings(ctx.token, property)) ?? []) {
            if (binding.user === analytics.viewer) await quietly(() => google.deleteAccessBinding(ctx.token, binding.name));
          }
        }
        await recorder.updateGoogle(ctx.shopId, { analytics: { ...analytics, tagStoppedAt: iso() } });
      }
      if (sc?.sites && ctx.token) {
        const sites = { ...sc.sites };
        for (const [site, entry] of Object.entries(sites)) {
          if (!entry?.resourceId || !entry.owner) continue;
          const resource = await quietly(() => google.getWebResource(ctx.token, entry.resourceId));
          // The press stays the owner of their own site in Search Console; only the shop's reporting account leaves.
          if (resource?.owners?.includes(entry.owner)) await google.setOwners(ctx.token, entry.resourceId, { ...resource, owners: resource.owners.filter((o) => o !== entry.owner) });
          sites[site] = { ...entry, owner: null };
        }
        return { state: "done", detail: TAG_STOPPED, part: "searchConsole", record: { sites } };
      }
      return { state: "done", detail: TAG_STOPPED };
    },

    async stopGmail(ctx) {
      if (ctx.row.gmailSender?.on === true) await registry.updateShop(ctx.shopId, { gmailSender: { ...ctx.row.gmailSender, on: false, stoppedAt: iso() } });
      return { state: "done", detail: "Your shop's emails no longer go from your Gmail." };
    },

    async stopExtras(ctx) {
      const stopped = {};
      for (const part of EXTRAS) {
        const entry = ctx.google[part];
        if (entry && !entry.stoppedAt) stopped[part] = { ...entry, stoppedAt: iso() };
      }
      if (Object.keys(stopped).length) await recorder.updateGoogle(ctx.shopId, stopped);
      return { state: "done", detail: "Backups to your Drive, YouTube trailers, the events calendar and your Maps link stopped. What's in your Google account stays yours." };
    },

    async giveBackAccess(ctx) {
      await tokens.revoke(ctx.shopId);
      return { state: "done", detail: "Colophon gave back its access to your Google account." };
    },

    async removeDomain(ctx) {
      const names = (Array.isArray(ctx.row.domains) ? ctx.row.domains : []).map((d) => (typeof d === "string" ? d : d?.name)).filter(Boolean);
      if (ctx.row.emailSender?.resendDomainId) await ownDomain.disconnect(ctx.shopId);
      let waiting = false;
      for (const domain of names) {
        // `deleting`: the shop is being deleted, so even its main address comes off (services/domains removeDomain).
        const answer = await domainsCall("removeDomain", ctx.row, { domain, deleting: true });
        if (answer?.waiting) waiting = true;
      }
      if (waiting) return { state: "waiting", detail: "The web address still has to be taken off by hand." };
      return { state: "done", detail: names.length ? "Your own web address no longer opens the shop." : "No web address of your own to take off." };
    },

    async deleteFirebase(ctx) {
      if (ctx.google.firebaseDeletedAt) return { state: "done", detail: "The shop's project is deleted." };
      await shopFirebase.deleteProject(ctx.row.projectId);
      await recorder.updateGoogle(ctx.shopId, { firebaseDeletedAt: iso() });
      return { state: "done", detail: "The shop's project is deleted." };
    },
  };

  async function runSteps(shopId, steps) {
    const results = [];
    for (const step of steps) {
      const row = { ...(await registry.getShop(shopId)), shopId };
      const google = row.google ?? {};
      let outcome;
      try {
        const access = DELETE_STEPS.includes(step) || step === "stopGmail" || step === "stopExtras" ? null : await tokens.fresh(shopId).catch(() => null);
        outcome = await STEPS[step]({ shopId, row, google, token: access?.token ?? null });
      } catch (err) {
        console.error(`Google teardown ${step} for ${shopId} failed:`, err?.message || err);
        outcome = { state: "failed", detail: plainProblem(err) };
      }
      await record(shopId, step, outcome);
      results.push({ step, state: outcome.state, detail: outcome.detail });
    }
    return results;
  }

  const idOf = (shop) => (typeof shop === "string" ? shop : shop?.shopId);

  /** Closing: stop everything Google, give the access back. Nothing in the press's Google accounts is deleted. */
  async function teardownOnClose(shop) {
    const shopId = idOf(shop);
    const steps = await runSteps(shopId, CLOSE_STEPS);
    if (steps.every((s) => s.state === "done")) {
      const row = await registry.getShop(shopId);
      if (!row?.google?.closedAt) await recorder.updateGoogle(shopId, { closedAt: iso() });
    }
    return { stage: "closing", steps };
  }

  /** Deletion: only once plan 6.8 says it is due. Runs the closing steps first if they haven't all finished. */
  async function teardownBeforeDelete(shop) {
    const shopId = idOf(shop);
    const row = await registry.getShop(shopId);
    if (!row) throw new Error(`The registry has no shop ${shopId}`);
    if (!deletionDue(row, now())) return { stage: "deletion", refused: true, reason: "The shop isn't due to be deleted yet.", steps: [] };
    const closing = row.google?.closedAt ? [] : (await teardownOnClose(shopId)).steps;
    const steps = await runSteps(shopId, DELETE_STEPS);
    if (steps.every((s) => s.state === "done") && !(await registry.getShop(shopId))?.google?.deletedAt) await recorder.updateGoogle(shopId, { deletedAt: iso() });
    return { stage: "deletion", steps: [...closing, ...steps] };
  }

  return {
    teardownOnClose,
    teardownBeforeDelete,
    runSteps,

    /** The whole timeline by stage name. A pause disconnects nothing. */
    async teardown(shop, stage) {
      if (stage === "pause") return { stage: "pause", steps: [] };
      if (stage === "closing") return teardownOnClose(shop);
      if (stage === "deletion") return teardownBeforeDelete(shop);
      throw new Error(`There is no teardown stage ${stage}`);
    },

    /** The press pressed Disconnect in their shop: the closing steps, while the shop stays open. */
    disconnect: (shopId) => teardownOnClose(shopId),
  };
}
