// The run book's actions (code plan 8.7): what the backup person may do when Julian can't be reached, and what a
// platform admin can do the same way. Three things, nothing else:
//
//   pause releases     no release starts, and a running one stops before its next shop (services/release-runner reads
//                      it through `releasesPaused`); resume undoes it
//   roll back a shop   one shop back to an earlier release (release-runner `rollBackShop`)
//   post a status note a note about a known problem on the public status page (status/publish.js), or none
//
// Clients passed in: state (clients/stores.js firestorePlatformState: get(name), set(name, value)), registry
// (listShops, for the status page), platform (the platform project's Firestore client, where the status page reads),
// rollBack({ shopId, version, by, reason }) (rollBackShop with the release runner's real clients), now.
import { publishStatus } from "../status/publish.js";

export const NOTE_MAX = 500;

/** The release pause ({ by, reason, at }) while releases are paused, else null. */
export async function releasesPaused(state) {
  const pause = await state.get("releasePause");
  return pause?.paused === true ? pause : null;
}

export function runBook({ state, registry, platform, rollBack, now = () => new Date() }) {
  const at = () => now().toISOString();
  return {
    releasesPaused: () => releasesPaused(state),
    async statusNote() {
      const note = await state.get("statusNote");
      return note?.text ? note : null;
    },
    async pauseReleases({ by, reason }) {
      const pause = { paused: true, by, reason, at: at() };
      await state.set("releasePause", pause);
      return { releasesPaused: pause };
    },
    async resumeReleases({ by, reason }) {
      await state.set("releasePause", { paused: false, by, reason, at: at() });
      return { releasesPaused: null };
    },
    async rollBack({ shopId, version, by, reason }) {
      if (!rollBack) throw new Error("rolling back isn't set up here");
      return rollBack({ shopId, version, by, reason });
    },
    /** Posts the note (empty text takes it down) and puts it on the status page straight away. */
    async postStatusNote({ text, by }) {
      const words = typeof text === "string" ? text.trim().slice(0, NOTE_MAX) : "";
      const note = { text: words, by, at: at() };
      await state.set("statusNote", note);
      await publishStatus({ registry, platform, now, note });
      return { statusNote: words ? note : null };
    },
  };
}
