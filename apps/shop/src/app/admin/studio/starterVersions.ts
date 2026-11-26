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
    releases: [
      { version: 1, date: "2026-11-24", note: "The first version, in Terracotta, Sage and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: product pages open out across the page, a caption line under each product and a one-line footer." },
    ],
    looks: { terracotta: "jc620e", sage: "ag8gip", night: "12gkm51" },
  },
  "juniper-catalogue": {
    releases: [
      { version: 1, date: "2026-11-24", note: "The first version, in Acid, Blueprint and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: links behind a Menu button, numbered products, a list shop page, the title first on product pages and your email large in the footer, on cool grey paper." },
    ],
    looks: { acid: "gdf8mj", blueprint: "1inuvnu", night: "qjngtp" },
  },
  "aurel-editorial": {
    releases: [
      { version: 1, date: "2026-11-24", note: "The first version, in Cobalt, Sand and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: links in a row under your name, a staggered shop page, your name huge across the footer and a bag that fills the screen." },
    ],
    looks: { cobalt: "15c8s0r", sand: "1w6iyrb", night: "179sjxr" },
  },
  "starter-gallery": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Linen, Stone and Night." },
      { version: 2, date: "2026-11-26", note: "Your name now sits in the middle of the header, above a photo that fills the screen." },
      { version: 3, date: "2026-11-26", note: "A new frame: links behind a Menu button, a big photo on top of each product page, centred product names, a staggered shop page and a centred footer." },
    ],
    looks: { linen: "uxwjhf", stone: "8232jx", night: "ai06py" },
  },
  "starter-warehouse": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Signal, Cobalt and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: a big masthead header, half-and-half product pages, framed products and a bag that opens from the left." },
    ],
    looks: { signal: "18xloh2", cobalt: "wjdjul", night: "1ehsfsw" },
  },
  "starter-larder": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Harvest, Olive and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: links in a row under your name, the title first on product pages, framed products and your email large in the footer." },
    ],
    looks: { harvest: "1mw54g8", olive: "gih6xw", night: "1nn8r8l" },
  },
  "starter-salon": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Blush, Sage and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: a side menu on computers, a big photo on product pages, a centred footer, new type and a blush background." },
    ],
    looks: { blush: "ywxb1h", sage: "1npmds2", night: "1u79fip" },
  },
  "starter-workshop": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Sunny, Mint and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: half-and-half product pages, centred product names, a list shop page, your name huge in the footer, new type and a sunny background." },
    ],
    looks: { sunny: "158ym2", mint: "1rj76ra", night: "1gmivo4" },
  },
  "starter-commission": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Walnut, Chalk and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: a side menu on computers, open product pages, numbered work, a staggered shop page, a one-line footer and new type." },
    ],
    looks: { walnut: "qq10jg", chalk: "1eiva9h", night: "4zfioj" },
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
