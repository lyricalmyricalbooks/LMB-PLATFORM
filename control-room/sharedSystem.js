// The shared system in the control room (docs/shared-system.md, phase 7): how each shared release run went, project by
// project, and each shared shop's month of use. Read only.
//
//   releases  the registry's release runs of kind "shared-release" (services/release-runner/shared.js) and
//             "shared-first-release", newest first: version, when, worked or stopped and why, and per project whether it
//             shipped, was already on it, went back, or wasn't run, with how many shops' pages went out or failed
//   usage     usage/{shopId}_{YYYY-MM} (services/usage/meters.js) for every shop in the shared project, for one month:
//             server work, pages served, files kept, emails, and once the month's bill is in, each shop's share of it
//
// Clients passed in:
//   registry  listShops(); listReleases()
//   meters    optional: get(shopId, month) (firestoreUsageMeters); null while the shared system isn't switched on
import { ControlError, adminOf } from "./controlRoom.js";
import { monthOf } from "../services/costs/costs.js";

/** The release kinds a shared run records. */
export const SHARED_RELEASE_KINDS = Object.freeze(["shared-release", "shared-first-release"]);
/** How many runs the page lists. */
export const RUNS_SHOWN = 20;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** One run as the page shows it. */
export function sharedRun(run) {
  return {
    kind: run.kind,
    version: run.version ?? null,
    runId: run.runId ?? null,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    ok: run.ok === true,
    error: run.error ?? null,
    projects: (Array.isArray(run.projects) ? run.projects : []).map((p) => ({
      projectId: p.projectId ?? "",
      status: p.status ?? "not-run",
      error: p.error ?? null,
      pagesDone: Array.isArray(p.pages?.done) ? p.pages.done.length : 0,
      pagesFailed: Array.isArray(p.pages?.failed) ? p.pages.failed.map((f) => ({ shopId: f.shopId, error: f.error ?? "" })) : [],
    })),
  };
}

/** One shop's month of use; null numbers mean nothing was measured yet. */
export function usageRow(row, record) {
  const n = (key) => (record && Number.isFinite(Number(record[key])) ? Number(record[key]) : null);
  return {
    shopId: row.shopId,
    pressName: row.pressName ?? row.shopId,
    measured: Boolean(record),
    invocations: n("invocations"),
    computeGbSeconds: n("computeGbSeconds"),
    egressGb: n("egressGb"),
    storageGb: n("storageGb"),
    emails: n("emails"),
    reconciled: record?.reconciled === true,
    costCents: record?.reconciled === true ? n("costCents") : null,
    updatedAt: record?.updatedAt ?? null,
  };
}

export function createSharedSystemDesk({ admins, registry, meters = null, now = () => new Date() }) {
  return {
    /** The newest shared release runs. */
    async releases(claims) {
      adminOf(claims, admins, now().getTime());
      const runs = registry.listReleases ? await registry.listReleases() : [];
      return {
        runs: runs.filter((r) => SHARED_RELEASE_KINDS.includes(r.kind))
          .sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")))
          .slice(0, RUNS_SHOWN).map(sharedRun),
      };
    },

    /** Every shared shop's use for one month (this month by default), the busiest first. */
    async usage(claims, { month } = {}) {
      adminOf(claims, admins, now().getTime());
      const wanted = month ?? monthOf(now().getTime());
      if (typeof wanted !== "string" || !MONTH.test(wanted)) throw new ControlError(400, "The month must look like 2026-11.");
      if (!meters?.get) return { month: wanted, connected: false, shops: [] };
      const rows = (await registry.listShops()).filter((row) => row.shared === true && row.status !== "abandoned");
      const shops = [];
      for (const row of rows) shops.push(usageRow(row, await meters.get(row.shopId, wanted)));
      shops.sort((a, b) => (b.computeGbSeconds ?? -1) - (a.computeGbSeconds ?? -1) || a.shopId.localeCompare(b.shopId));
      const sum = (key) => shops.reduce((total, s) => total + (s[key] ?? 0), 0);
      return {
        month: wanted, connected: true, shops,
        reconciled: shops.length > 0 && shops.every((s) => s.reconciled),
        totals: { invocations: sum("invocations"), computeGbSeconds: sum("computeGbSeconds"), egressGb: sum("egressGb"), storageGb: sum("storageGb"), emails: sum("emails"), costCents: sum("costCents") },
      };
    },
  };
}

//   GET  /api/control/shared-releases   the newest shared release runs (read only)
//   POST /api/control/usage             { month? }: each shared shop's use that month (read only)
export function sharedSystemRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/shared-releases": (claims) => desk.releases(claims),
    "POST /api/control/usage": (claims, request) => desk.usage(claims, body(request)),
  };
}
