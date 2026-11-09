// Closing a shop whose plan stopped (code plan 6.8). Decided by Julian, 28 October 2026: 60 days paused, then 90 days
// to download everything, then deleted, with emails 30 and 7 days before.
//
// A daily sweep walks the registry. Each shop's stage lives on its registry row as `closing`, so the control room sees
// it and another job (the Google teardown, row 6.20) can follow it:
//
//   closing: {
//     stage          "paused" | "closed" | "deleted", or "reopening" (with `from`) while an open shop's plan copy is
//                    rewritten: the closing is cleared only once that copy says open
//     pending        what the stage still owes, tried again each run until done: "shop-closed" / "shop-deleted" (the
//                    email) and "plan" (billing.publishPlan)
//     pausedAt       when the sweep first saw the plan paused
//     closedAt       when the shop closed (60 days paused, or the plan ended)
//     downloadUntil  the last day the press can download everything (closedAt + 90 days)
//     deleteAfter    the day the project may be deleted: downloadUntil, pushed later when a warning went out late, so
//                    the press always gets its full 30 and 7 days' notice
//     warned30At     when the 30-day warning went out (null until then)
//     warned7At      when the 7-day warning went out (null until then)
//     hooks          { onPause, onReopen, onClose, beforeDelete: doneAt }: the hooks below, once they have all succeeded
//     deletedAt      when the project was deleted
//     problem        the last thing that went wrong, in plain words (cleared when the step works)
//   }
//
// What happens:
//   - Plan paused (billing.access "paused"): stage "paused" from that day. A card in the 60 days opens the shop again
//     (billing.js resumes the plan) and the sweep clears `closing`.
//   - 60 days paused, or the plan ended (access "closed"): the sweep ends the Stripe plan (billing.endPlan, so no
//     card can bill a closed shop), sets stage "closed", emails `shop-closed`, runs the onClose hooks and rewrites the
//     shop's platform/plan (billing.publishPlan): the shop shows its closed page, the admin opens on Plan & billing with
//     the downloads, the stockroom opens read-only. Starting a plan again before deletion opens it as it was.
//   - 30 and 7 days before deleteAfter: `shop-deletion-warning`, once each.
//   - On deleteAfter, with both warnings sent long enough ago: the beforeDelete hooks, then the project is deleted through
//     the injected `projects` client, then `shop-deleted`. `deletionAllowed` is checked again right before the call,
//     so nothing reaches the client before the dates and the emails.
//
// Every step is safe to run twice: each one is recorded on the row before the next, emails carry idempotency keys,
// and a deleted shop is never touched again. Every change is logged in the registry (and the shop's audit log while
// the shop's database exists).
//
// Clients:
//   registry   listShops(); getShop(shopId); updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog   ready(shopId); write(shopId, id, entry)
//   billing    endPlan({ shopId }); publishPlan(shopId)   (billing.js)
//   email      sendPlatform({ kind, to, data, idempotencyKey, shopId })   (services/email)
//   projects   deleteProject(projectId) -> anything: deletes the shop's Google Cloud project (the row's projectId, else
//              its shopId). The real client treats a
//              project that is already gone as done. Tests pass a pretend one (closingFakes.js fakeProjects).
//   hooks      { onClose: [fn], beforeDelete: [fn] }, each fn(shop, { at }) -> promise. None by default.
//   settings   platformSettings(env): platformUrl, for the links
import { dateText } from "./billing.js";
import { mailLanguage } from "../email/templatesFr.js";

const DAY = 86400_000;
export const PAUSED_DAYS = 60;
export const DOWNLOAD_DAYS = 90;
export const WARNING_DAYS = Object.freeze([30, 7]);

/**
 * The hooks the sweep calls, by name. `onPause(shop)` runs once the shop is paused and `onReopen(shop)` when a paused shop
 * opens again (plan 15.16: a paused shop's scheduled jobs are deleted and come back on reopening). `onClose(shop)` runs once the shop is closed (after its emails and plan copy);
 * `beforeDelete(shop)` runs before the project is deleted, and a hook that throws or answers `{ refused: true }` stops
 * the deletion until the next run. Both are retried on the next run until they all succeed, so each must be safe to run twice. Defaults: none.
 */
export const HOOK_NAMES = Object.freeze(["onPause", "onReopen", "onClose", "beforeDelete"]);
export const noHooks = () => ({ onPause: [], onReopen: [], onClose: [], beforeDelete: [] });

/** The registry field that records one warning: warned30At, warned7At. */
export const warnedField = (days) => `warned${days}At`;

const iso = (ms) => new Date(ms).toISOString();
const ms = (time) => (time ? Date.parse(time) : NaN);
const later = (a, b) => (ms(a) >= ms(b) ? a : b);

/**
 * Whether the shop's project may be deleted at `nowMs`: closed, past deleteAfter, the 30-day warning sent at least 30
 * days ago and the 7-day one at least 7 days ago. The sweep checks it, and checks it again right before the call.
 */
export function deletionAllowed(closing, nowMs) {
  if (closing?.stage !== "closed") return false;
  const w30 = ms(closing.warned30At);
  const w7 = ms(closing.warned7At);
  return nowMs >= ms(closing.deleteAfter)
    && Number.isFinite(w30) && nowMs >= w30 + 30 * DAY
    && Number.isFinite(w7) && nowMs >= w7 + 7 * DAY;
}

export class DeletionRefused extends Error {}

export function createClosingSweep({ registry, auditLog, billing, email, projects, hooks = {}, settings, now = () => Date.now() }) {
  const allHooks = { ...noHooks(), ...hooks };
  for (const name of Object.keys(allHooks)) {
    if (!HOOK_NAMES.includes(name)) throw new Error(`the closing sweep has no hook called ${name}`);
  }
  const link = (shopId) => `${settings.platformUrl}/account/billing?shop=${encodeURIComponent(shopId)}`;

  async function log(shopId, what, detail = {}) {
    const at = iso(now());
    const entry = { id: `closing-${at}-${what}`, source: "closing", at, what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  async function setClosing(shopId, closing) {
    await registry.updateShop(shopId, { closing });
    return closing;
  }

  async function send(shop, kind, data, key) {
    if (!shop.ownerEmail) return;
    await email.sendPlatform({
      kind, to: shop.ownerEmail, shopId: shop.shopId, idempotencyKey: `closing/${shop.shopId}/${key}`,
      // The billing row's language and province, mirrored on the registry (billing.js mirror; templatesFr.js).
      language: mailLanguage(shop.billing ?? {}),
      data: { pressName: shop.pressName || shop.shopId, link: link(shop.shopId), ...data },
    });
  }

  /** Runs every hook of one name; true once all of them have succeeded (recorded, so they don't run again). */
  async function runHooks(shop, closing, name) {
    if (closing.hooks?.[name]) return true;
    const at = iso(now());
    try {
      for (const hook of allHooks[name]) {
        const answer = await hook(structuredClone({ ...shop, closing }), { at });
        if (answer?.refused) throw new Error(answer.reason || "not ready yet");
      }
    } catch (error) {
      await setClosing(shop.shopId, { ...closing, problem: `${name}: ${error.message}` });
      await log(shop.shopId, `${name}-failed`, { message: error.message });
      return false;
    }
    closing = await setClosing(shop.shopId, { ...closing, hooks: { ...closing.hooks, [name]: at }, problem: null });
    return true;
  }

  // What a stage still owes once it is recorded (`pending` on the row): the stage's email and the shop's plan copy.
  // Each is done in order and taken off the list once it worked, so one that failed is tried again on the next run.
  const OWED = {
    "shop-closed": (shop, c) => send(shop, "shop-closed", { date: dateText(c.downloadUntil), on: c.downloadUntil }, `closed/${c.closedAt}`),
    plan: (shop) => billing.publishPlan(shop.shopId),
    "shop-deleted": (shop, c) => send(shop, "shop-deleted", {}, `deleted/${c.closedAt}`),
  };

  /** Does what the stage still owes; true once nothing is left. */
  async function settle(shop, closing) {
    for (const what of closing.pending ?? []) {
      try {
        await OWED[what](shop, closing);
      } catch (error) {
        await setClosing(shop.shopId, { ...closing, problem: `${what}: ${error.message}` });
        await log(shop.shopId, `${what}-failed`, { message: error.message });
        return false;
      }
      closing = await setClosing(shop.shopId, { ...closing, pending: closing.pending.filter((p) => p !== what), problem: null });
    }
    return true;
  }

  async function close(shop, closing) {
    const at = now();
    // The plan ends in Stripe first, so no card can bill a closed shop. A plan Stripe already ended is left as it is.
    if (shop.billing?.access !== "closed") await billing.endPlan({ shopId: shop.shopId });
    const downloadUntil = iso(at + DOWNLOAD_DAYS * DAY);
    const next = await setClosing(shop.shopId, {
      stage: "closed", pausedAt: closing?.pausedAt ?? null, closedAt: iso(at), downloadUntil, deleteAfter: downloadUntil,
      warned30At: null, warned7At: null, hooks: {}, problem: null, pending: ["shop-closed", "plan"],
    });
    await log(shop.shopId, "closed", { downloadUntil });
    if (await settle(shop, next)) await runHooks(shop, (await registry.getShop(shop.shopId)).closing, "onClose");
  }

  async function warn(shop, closing, days) {
    const at = iso(now());
    // A warning sent late pushes the deletion back, so the press always has its full notice.
    const deleteAfter = later(closing.deleteAfter, iso(now() + days * DAY));
    // The email first: a warning is recorded as sent (which lets the deletion come) only once it went.
    await send(shop, "shop-deletion-warning", { date: dateText(deleteAfter), on: deleteAfter, days }, `warning-${days}/${closing.closedAt}`);
    const pending = deleteAfter !== closing.deleteAfter ? [...new Set([...(closing.pending ?? []), "plan"])] : closing.pending ?? [];
    const next = await setClosing(shop.shopId, { ...closing, deleteAfter, [warnedField(days)]: at, pending });
    await log(shop.shopId, `warning-${days}`, { deleteAfter });
    await settle(shop, next);
    return next;
  }

  async function remove(shop, closing) {
    if (!(await runHooks(shop, closing, "beforeDelete"))) return;
    closing = (await registry.getShop(shop.shopId)).closing;
    if (!deletionAllowed(closing, now())) throw new DeletionRefused(`${shop.shopId} isn't due for deletion`);
    try {
      await projects.deleteProject(shop.projectId ?? shop.shopId);
    } catch (error) {
      await setClosing(shop.shopId, { ...closing, problem: `deleting the project: ${error.message}` });
      await log(shop.shopId, "delete-failed", { message: error.message });
      return;
    }
    const deletedAt = iso(now());
    const next = await setClosing(shop.shopId, { ...closing, stage: "deleted", deletedAt, problem: null, pending: ["shop-deleted"] });
    await registry.recordEvent(shop.shopId, { id: `closing-${deletedAt}-deleted`, source: "closing", at: deletedAt, what: "deleted" });
    await settle(shop, next);
  }

  /** A shop opened again: its jobs come back, its plan copy says open, and only then is the closing cleared. */
  async function reopen(shop, closing) {
    // What a pause or closing took away (the scheduled jobs) comes back first; a failure is tried again next run.
    if (!(await runHooks(shop, closing, "onReopen"))) return closing.stage;
    let current = (await registry.getShop(shop.shopId)).closing;
    // "reopening" is no longer closed (shopPlan.js shopAccess), so the plan copy written now says open; the closing
    // stays on the row until that copy is written, and a failed one is written again next run.
    if (current.stage !== "reopening") current = await setClosing(shop.shopId, { ...current, stage: "reopening", from: current.stage });
    try {
      await billing.publishPlan(shop.shopId);
    } catch (error) {
      await setClosing(shop.shopId, { ...current, problem: `plan: ${error.message}` });
      await log(shop.shopId, "plan-failed", { message: error.message });
      return "reopening";
    }
    await setClosing(shop.shopId, null);
    await log(shop.shopId, "reopened", { from: current.from });
    return null;
  }

  /** One shop's next step, if one is due. Returns the stage it is in afterwards (or null: nothing to do). */
  async function step(shop) {
    let closing = shop.closing ?? null;
    if (closing?.stage === "deleted") {
      if (closing.pending?.length) await settle(shop, closing); // the "deleted" email, if it didn't go
      return "deleted";
    }
    const access = shop.billing?.access;
    if (!access) return null;

    if (access === "open") return closing ? reopen(shop, closing) : null;

    if (closing?.stage === "reopening") {
      // The plan stopped again before the reopening was finished: back to the stage it came from, with its hooks to run
      // again (the jobs onReopen brought back go again with onPause or onClose).
      const { from, ...rest } = closing;
      const { onReopen: _r, onPause: _p, onClose: _c, ...hooks } = closing.hooks ?? {};
      closing = await setClosing(shop.shopId, { ...rest, stage: from ?? "paused", hooks });
    }

    if (!closing) {
      if (access === "closed") {
        await close(shop, null);
        return "closed";
      }
      const paused = await setClosing(shop.shopId, { stage: "paused", pausedAt: iso(now()) });
      await log(shop.shopId, "paused");
      await runHooks(shop, paused, "onPause");
      return "paused";
    }

    if (closing.stage === "paused") {
      if (access === "closed" || now() >= ms(closing.pausedAt) + PAUSED_DAYS * DAY) {
        await close(shop, closing);
        return "closed";
      }
      await runHooks(shop, closing, "onPause"); // a hook that failed last time is tried again
      return "paused";
    }

    // Closed: what closing still owes (its email, the plan copy), hooks that failed last time, the two warnings, then
    // the deletion.
    let current = closing;
    if (!(await settle(shop, current))) return "closed";
    current = (await registry.getShop(shop.shopId)).closing;
    if (!(await runHooks(shop, current, "onClose"))) return "closed";
    current = (await registry.getShop(shop.shopId)).closing;
    for (const days of WARNING_DAYS) {
      if (current[warnedField(days)]) continue;
      if (now() < ms(current.deleteAfter) - days * DAY) break;
      current = await warn(shop, current, days);
      // One warning a run: a sweep that missed the 30-day one doesn't send both on the same day.
      return "closed";
    }
    if (deletionAllowed(current, now())) {
      await remove(shop, current);
      return (await registry.getShop(shop.shopId)).closing?.stage ?? null;
    }
    return "closed";
  }

  return {
    step,
    /** Every shop in the registry. One shop's failure is recorded on its row and never stops the others. */
    async sweep() {
      const results = [];
      for (const shop of await registry.listShops()) {
        try {
          results.push({ shopId: shop.shopId, stage: await step(shop) });
        } catch (error) {
          results.push({ shopId: shop.shopId, error: error.message });
        }
      }
      return results;
    },
  };
}
