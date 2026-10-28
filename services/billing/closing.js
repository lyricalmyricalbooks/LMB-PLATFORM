// Closing a shop whose plan stopped (code plan 6.8). Decided by Julian, 28 October 2026: 60 days paused, then 90 days
// to download everything, then deleted, with emails 30 and 7 days before.
//
// A daily sweep walks the registry. Each shop's stage lives on its registry row as `closing`, so the control room sees
// it and another job (the Google teardown, row 6.20) can follow it:
//
//   closing: {
//     stage          "paused" | "closed" | "deleted"
//     pausedAt       when the sweep first saw the plan paused
//     closedAt       when the shop closed (60 days paused, or the plan ended)
//     downloadUntil  the last day the press can download everything (closedAt + 90 days)
//     deleteAfter    the day the project may be deleted: downloadUntil, pushed later when a warning went out late, so
//                    the press always gets its full 30 and 7 days' notice
//     warned30At     when the 30-day warning went out (null until then)
//     warned7At      when the 7-day warning went out (null until then)
//     hooks          { onClose: doneAt, beforeDelete: doneAt }: the hooks below, once they have all succeeded
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

const DAY = 86400_000;
export const PAUSED_DAYS = 60;
export const DOWNLOAD_DAYS = 90;
export const WARNING_DAYS = Object.freeze([30, 7]);

/**
 * The hooks the sweep calls, by name. `onClose(shop)` runs once the shop is closed (after its emails and plan copy);
 * `beforeDelete(shop)` runs before the project is deleted, and a hook that throws or answers `{ refused: true }` stops
 * the deletion until the next run. Both are retried on the next run until they all succeed, so each must be safe to run twice. Defaults: none.
 */
export const HOOK_NAMES = Object.freeze(["onClose", "beforeDelete"]);
export const noHooks = () => ({ onClose: [], beforeDelete: [] });

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

  async function close(shop, closing) {
    const at = now();
    // The plan ends in Stripe first, so no card can bill a closed shop. A plan Stripe already ended is left as it is.
    if (shop.billing?.access !== "closed") await billing.endPlan({ shopId: shop.shopId });
    const downloadUntil = iso(at + DOWNLOAD_DAYS * DAY);
    const next = await setClosing(shop.shopId, {
      stage: "closed", pausedAt: closing?.pausedAt ?? null, closedAt: iso(at), downloadUntil, deleteAfter: downloadUntil,
      warned30At: null, warned7At: null, hooks: {}, problem: null,
    });
    await log(shop.shopId, "closed", { downloadUntil });
    await send(shop, "shop-closed", { date: dateText(downloadUntil) }, `closed/${next.closedAt}`);
    await billing.publishPlan(shop.shopId);
    await runHooks(shop, next, "onClose");
  }

  async function warn(shop, closing, days) {
    const at = iso(now());
    // A warning sent late pushes the deletion back, so the press always has its full notice.
    const deleteAfter = later(closing.deleteAfter, iso(now() + days * DAY));
    const next = await setClosing(shop.shopId, { ...closing, deleteAfter, [warnedField(days)]: at });
    await log(shop.shopId, `warning-${days}`, { deleteAfter });
    await send(shop, "shop-deletion-warning", { date: dateText(deleteAfter), days }, `warning-${days}/${closing.closedAt}`);
    if (deleteAfter !== closing.deleteAfter) await billing.publishPlan(shop.shopId);
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
    await setClosing(shop.shopId, { ...closing, stage: "deleted", deletedAt, problem: null });
    await registry.recordEvent(shop.shopId, { id: `closing-${deletedAt}-deleted`, source: "closing", at: deletedAt, what: "deleted" });
    await send(shop, "shop-deleted", {}, `deleted/${closing.closedAt}`);
  }

  /** One shop's next step, if one is due. Returns the stage it is in afterwards (or null: nothing to do). */
  async function step(shop) {
    const closing = shop.closing ?? null;
    if (closing?.stage === "deleted") return "deleted";
    const access = shop.billing?.access;
    if (!access) return null;

    if (access === "open") {
      // A card (or a new plan) came before the deletion: the shop is open again.
      if (closing) {
        await setClosing(shop.shopId, null);
        await log(shop.shopId, "reopened", { from: closing.stage });
        await billing.publishPlan(shop.shopId);
      }
      return null;
    }

    if (!closing) {
      if (access === "closed") {
        await close(shop, null);
        return "closed";
      }
      await setClosing(shop.shopId, { stage: "paused", pausedAt: iso(now()) });
      await log(shop.shopId, "paused");
      return "paused";
    }

    if (closing.stage === "paused") {
      if (access === "closed" || now() >= ms(closing.pausedAt) + PAUSED_DAYS * DAY) {
        await close(shop, closing);
        return "closed";
      }
      return "paused";
    }

    // Closed: hooks that failed last time, the two warnings, then the deletion.
    let current = closing;
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
