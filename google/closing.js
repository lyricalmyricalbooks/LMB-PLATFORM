// The Google teardown (code plan 6.20) on the closing sweep's timeline (plan 6.8, services/billing/closing.js). The
// hosted sweep is built with both:
//
//   const google = googleClosing({ teardown: link.teardown, registry, shopFirebase });
//   createClosingSweep({ ..., hooks: google.hooks, projects: google.projects });
//
// onClose       the closing steps (feed, tag, Gmail, extras, access). A step that fails is recorded on the row and shown
//               in the control room with Run again; it never holds up the warning emails or the deletion date.
// beforeDelete  the domain comes off and the shop's project is deleted, through the teardown, which refuses until the
//               row's `closing` says the deletion is due. A deletion step that failed refuses too, so the sweep tries
//               again on its next run; a domain step still waiting for the domain service doesn't hold it up.
// projects      the sweep's own project deleter: the teardown has already deleted the project and recorded it, so this
//               deletes only a project the teardown hasn't (a shop the registry has no Google record for).
import { DELETE_STEPS } from "./teardown.js";

export function googleClosing({ teardown, registry, shopFirebase }) {
  return {
    hooks: {
      onClose: [async (shop) => { await teardown.teardownOnClose(shop.shopId); }],
      beforeDelete: [async (shop) => {
        const result = await teardown.teardownBeforeDelete(shop.shopId);
        if (result.refused) return result;
        const failed = result.steps.find((s) => DELETE_STEPS.includes(s.step) && s.state === "failed");
        if (failed) return { refused: true, reason: `Google ${failed.step}: ${failed.detail}` };
        return result;
      }],
    },
    projects: {
      async deleteProject(projectId) {
        const row = (await registry.listShops()).find((s) => (s.projectId ?? s.shopId) === projectId);
        if (row?.google?.firebaseDeletedAt) return;
        await shopFirebase.deleteProject(projectId);
      },
    },
  };
}
