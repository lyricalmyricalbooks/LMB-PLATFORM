// Starter versions (next starters plan phase 4): every whole-website starter carries a version number and a short note
// for each release. Use this look records the version a shop started from (`design.themeBase.version`, themeSwitch.ts),
// so Studio can say "A new version of Aurel is ready", list what changed since, preview it in the canvas and take it with
// every one of the owner's own changes laid back on top (`updateLookKeepingEdits`). The control room counts which
// version live shops are on (control-room/shopLooks.js, its STARTERS mirror keeps the numbers in step).
//
// Changing a starter's look (its colours, fonts or any key Studio › Themes applies, in any style) changes its signature,
// and starterVersions.test.ts then fails until the change is shipped on purpose:
//   1. add a release below (the next number, today's date, one plain sentence an owner understands), and
//   2. copy the new signatures the test prints into `looks`.
// Every shop on the starter is then offered the update. A shop never changes until its owner presses Update and Publish.

export type StarterRelease = { version: number; date: string; note: string };
export type StarterVersions = {
  releases: StarterRelease[];
  /** Each style's signature (themeSwitch `lookSignature`) as the newest release ships it. */
  looks: Record<string, string>;
};

export const STARTER_VERSIONS: Record<string, StarterVersions> = {
  "juniper-slow-season": {
    releases: [{ version: 1, date: "2026-11-24", note: "The first version, in Terracotta, Sage and Night." }],
    looks: { terracotta: "12cxxy7", sage: "19tuzg2", night: "ho5qw6" },
  },
  "juniper-catalogue": {
    releases: [{ version: 1, date: "2026-11-24", note: "The first version, in Acid, Blueprint and Night." }],
    looks: { acid: "kjugmm", blueprint: "jc2v3a", night: "11me1vt" },
  },
  "aurel-editorial": {
    releases: [{ version: 1, date: "2026-11-24", note: "The first version, in Cobalt, Sand and Night." }],
    looks: { cobalt: "1e53ebw", sand: "1jgi7m0", night: "1itwz40" },
  },
  "starter-gallery": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Linen, Stone and Night." },
      { version: 2, date: "2026-11-26", note: "Your name now sits in the middle of the header, above a photo that fills the screen." },
    ],
    looks: { linen: "1x1ro7z", stone: "1yhk7nt", night: "1334736" },
  },
  "starter-warehouse": {
    releases: [{ version: 1, date: "2026-11-25", note: "The first version, in Signal, Cobalt and Night." }],
    looks: { signal: "1d5vrl", cobalt: "twfkp4", night: "17vz93f" },
  },
  "starter-larder": {
    releases: [{ version: 1, date: "2026-11-25", note: "The first version, in Harvest, Olive and Night." }],
    looks: { harvest: "fouwec", olive: "184v4kg", night: "1pey3xd" },
  },
  "starter-salon": {
    releases: [{ version: 1, date: "2026-11-25", note: "The first version, in Blush, Sage and Night." }],
    looks: { blush: "2vsywz", sage: "1qe0ixp", night: "81pqk" },
  },
  "starter-workshop": {
    releases: [{ version: 1, date: "2026-11-25", note: "The first version, in Sunny, Mint and Night." }],
    looks: { sunny: "sztiw6", mint: "xuzb8y", night: "2rdqgg" },
  },
  "starter-commission": {
    releases: [{ version: 1, date: "2026-11-25", note: "The first version, in Walnut, Chalk and Night." }],
    looks: { walnut: "1vv80ze", chalk: "w4fysz", night: "13451kh" },
  },
};

/** The newest version of a starter, or null for a look that isn't a versioned starter. */
export function starterVersion(id: string | undefined | null): number | null {
  const releases = id ? STARTER_VERSIONS[id]?.releases : undefined;
  return releases?.length ? releases[releases.length - 1].version : null;
}

/**
 * What changed since `from` (a shop that started before versions were recorded counts as version 1), newest first.
 * A look changed with no newer release (it can't ship that way: the test fails) still gets one plain line.
 */
export function releasesSince(id: string, from: number | undefined | null): StarterRelease[] {
  const releases = STARTER_VERSIONS[id]?.releases || [];
  const newer = releases.filter((r) => r.version > (from || 1)).reverse();
  return newer.length ? newer : [{ version: starterVersion(id) || 1, date: "", note: "Colours and type were refined." }];
}
