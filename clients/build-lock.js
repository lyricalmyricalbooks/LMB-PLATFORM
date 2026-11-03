// One shop at a time per release build folder.
//
// A release is built once and shared by every shop (services/release-runner/builder.js), and each deploy writes that
// shop's own files into it just before running `firebase deploy`: its /shop-profile.js, its firebase.deploy.json and
// rules (deployConfig.mjs), its server settings, and, for a shop with both apps, the copy of the stockroom under the
// shop's pages (clients/deploy.js `pages`). Two deploys into the same folder at once, from this process or another
// (the release runner, the shop maker's sweep, the control room), could send one shop's files with another's.
// `withBuildLock(dir, work)` holds a lock file in the folder for the length of `work`, so the deploys queue instead.
//
// The lock is a file made with the "wx" flag (only one maker wins), holding who took it and when. A lock left behind
// by a process that died, or older than `staleMs`, is taken over, so a crash never blocks releases for good.
import { open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const LOCK_FILE = ".lmb-deploy.lock";

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
};

export function buildLock({ now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pid = process.pid, isAlive = alive, staleMs = 45 * 60_000, waitMs = 60 * 60_000, pollMs = 2_000 } = {}) {
  async function take(path) {
    const started = now();
    for (;;) {
      try {
        const file = await open(path, "wx");
        await file.writeFile(JSON.stringify({ pid, at: now() }));
        await file.close();
        return;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      let text = null;
      let holder = null;
      try {
        text = await readFile(path, "utf8");
        holder = JSON.parse(text);
      } catch {
        // Half written, or just released: look again.
      }
      const stale = holder && (!isAlive(holder.pid) || now() - Number(holder.at) > staleMs);
      if (stale) {
        // Only the lock judged stale is removed: one another waiter has just taken over is left alone.
        if ((await readFile(path, "utf8").catch(() => null)) === text) await rm(path, { force: true });
        continue;
      }
      if (now() - started > waitMs) throw new Error(`another deploy has held the release build folder for too long (${path}); check it and remove the lock if nothing is running`);
      await sleep(pollMs);
    }
  }

  return async function withBuildLock(dir, work) {
    const path = join(dir, LOCK_FILE);
    await take(path);
    try {
      return await work();
    } finally {
      await rm(path, { force: true });
    }
  };
}
