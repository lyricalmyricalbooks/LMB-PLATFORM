// Builds one release once, for every shop (plan 4.1). The release is the git tag `release-<version>` of this repo;
// its build lives in `<root>/<version>`, a git worktree of that tag, which clients/deploy.js deploys from.
//
// Only what is the same for every shop is built here: the shop's pages (`vite build`), the shop's server code
// packages, and the stockroom's pages. What differs per shop is added at deploy time: the owner in the rules
// (deployConfig.mjs), the server settings file and the shop profile (clients/deploy.js). The shop's full `build`
// script also writes a catalogue file, a sitemap and ready-made pages from one shop's own books; those would carry the
// test shop's books to every press, so they are left out and each shop's pages read its own books from its database.
//
// A finished build is marked with `.lmb-built`, so a re-run or a rollback to that release reuses it. A half-made one
// is checked out again and rebuilt, never deleted.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BUILT_MARK = ".lmb-built";
export const tagOf = (version) => `release-${version}`;

/** `releaseBuilder({ run, root, source })`: `run(command, args, { cwd })` runs a command; `source` is this repo. */
export function releaseBuilder({ run, root, source, exists = existsSync, writeText = writeFile }) {
  const dir = (version) => join(root, version);
  return {
    dir,
    async build(version) {
      const out = dir(version);
      if (exists(join(out, BUILT_MARK))) return out;
      if (exists(out)) await run("git", ["checkout", "--detach", tagOf(version)], { cwd: out });
      else await run("git", ["worktree", "add", "--detach", out, tagOf(version)], { cwd: source });
      const shop = join(out, "apps", "shop");
      const stockroom = join(out, "apps", "stockroom");
      await run("pnpm", ["install", "--frozen-lockfile"], { cwd: shop });
      await run("pnpm", ["exec", "vite", "build"], { cwd: shop });
      await run("npm", ["ci"], { cwd: join(shop, "functions") });
      await run("npm", ["ci"], { cwd: stockroom });
      await run("npm", ["run", "build"], { cwd: stockroom });
      await writeText(join(out, BUILT_MARK), `${version}\n`);
      return out;
    },
  };
}
