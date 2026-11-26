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
      { version: 3, date: "2026-11-26", note: "The sample announcement bar now reads like a real shop's (for example a free delivery line) instead of asking you to write one." },
      { version: 4, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links." },
      { version: 5, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 6, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 7, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { terracotta: "154swpr", sage: "idno0u", night: "1b1u1l2" },
  },
  "juniper-catalogue": {
    releases: [
      { version: 1, date: "2026-11-24", note: "The first version, in Acid, Blueprint and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: links behind a Menu button, numbered products, a list shop page, the title first on product pages and your email large in the footer, on cool grey paper." },
      { version: 3, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 4, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { acid: "1s6k9jg", blueprint: "5x9ycr", night: "1wr2rzi" },
  },
  "aurel-editorial": {
    releases: [
      { version: 1, date: "2026-11-24", note: "The first version, in Cobalt, Sand and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: links in a row under your name, a staggered shop page, your name huge across the footer and a bag that fills the screen." },
      { version: 3, date: "2026-11-26", note: "The sample announcement bar now reads like a real shop's (for example a free delivery line) instead of asking you to write one." },
      { version: 4, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links, and the opening photo comes first." },
      { version: 5, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 6, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { cobalt: "2ok40f", sand: "qp6jvv", night: "m7q0rn" },
  },
  "starter-gallery": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Linen, Stone and Night." },
      { version: 2, date: "2026-11-26", note: "Your name now sits in the middle of the header, above a photo that fills the screen." },
      { version: 3, date: "2026-11-26", note: "A new frame: links behind a Menu button, a big photo on top of each product page, centred product names, a staggered shop page and a centred footer." },
      { version: 4, date: "2026-11-26", note: "A redesign: words in light type over the opening photo, two products shown large then three smaller, an open product page with your photos side by side and a breadcrumb, and a slim announcement bar." },
      { version: 5, date: "2026-11-26", note: "The sample announcement bar now reads like a real shop's (for example a free delivery line) instead of asking you to write one." },
      { version: 6, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 7, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 8, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { linen: "twfzan", stone: "1llnv7x", night: "d0o7de" },
  },
  "starter-warehouse": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Signal, Cobalt and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: a big masthead header, half-and-half product pages, framed products and a bag that opens from the left." },
      { version: 3, date: "2026-11-26", note: "A redesign: a search bar in the header, a huge headline beside one photo, the page running wider, a moving band and a bright story band." },
      { version: 4, date: "2026-11-26", note: "Tidier on phones: categories two to a row and your promises one under another. The headline fits beside the photo on smaller screens." },
      { version: 5, date: "2026-11-26", note: "The sample announcement bar now reads like a real shop's (for example a free delivery line) instead of asking you to write one." },
      { version: 6, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links, and the opening photo comes first." },
      { version: 7, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 8, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 9, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { signal: "1hs3mgp", cobalt: "1cm3rg", night: "thskgj" },
  },
  "starter-larder": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Harvest, Olive and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: links in a row under your name, the title first on product pages, framed products and your email large in the footer." },
      { version: 3, date: "2026-11-26", note: "A redesign: a golden card beside a rounded photo, round photo links, rounded shelf cards, a dark gift band and your story." },
      { version: 4, date: "2026-11-26", note: "Tidier on phones: round photo links three to a row." },
      { version: 5, date: "2026-11-26", note: "The sample announcement bar now reads like a real shop's (for example a free delivery line) instead of asking you to write one." },
      { version: 6, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links, and the opening photo comes first." },
      { version: 7, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 8, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 9, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { harvest: "15ddqd", olive: "kqoxj9", night: "1wa0142" },
  },
  "starter-salon": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Blush, Sage and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: a side menu on computers, a big photo on product pages, a centred footer, new type and a blush background." },
      { version: 3, date: "2026-11-26", note: "A redesign: light words over a full photo, a wider price list, your space on a soft band and open times on a dark band." },
      { version: 4, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links." },
      { version: 5, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 6, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 7, date: "2026-11-26", note: "On phones the menu button opens a full-screen menu with big links, and Book a time sits right in it." },
    ],
    looks: { blush: "1bs2s8r", sage: "13qfibv", night: "1a9rbxj" },
  },
  "starter-workshop": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Sunny, Mint and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: half-and-half product pages, centred product names, a list shop page, your name huge in the footer, new type and a sunny background." },
      { version: 3, date: "2026-11-26", note: "A redesign: what every class includes on a sunny band, and a dark newsletter band. On phones the promises sit one under another." },
      { version: 4, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links." },
      { version: 5, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 6, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 7, date: "2026-11-26", note: "On phones the menu button opens a full-screen menu with big links, and Book a time sits right in it." },
    ],
    looks: { sunny: "42s3kp", mint: "w0psjv", night: "1kqarlf" },
  },
  "starter-commission": {
    releases: [
      { version: 1, date: "2026-11-25", note: "The first version, in Walnut, Chalk and Night." },
      { version: 2, date: "2026-11-26", note: "A new frame: a side menu on computers, open product pages, numbered work, a staggered shop page, a one-line footer and new type." },
      { version: 3, date: "2026-11-26", note: "A redesign: a big serif headline beside a tall photo, recent work in three, how it works on a dark band, four pieces and the enquiry form on a warm band. On phones the steps sit one under another." },
      { version: 4, date: "2026-11-26", note: "On phones the header is one tidy row (a menu button, your name, search and the bag) instead of a second row of links, and the opening photo comes first." },
      { version: 5, date: "2026-11-26", note: "Calmer product pages: no glow or tag behind the product, a full-width Add to bag button, a taxes and shipping line under the price, the description beside the photos, and on phones the photo comes first." },
      { version: 6, date: "2026-11-26", note: "A second pair of fonts in the calm colour version, so it feels like its own design and not only new colours." },
      { version: 7, date: "2026-11-26", note: "A Shop link leads the menu with your categories in a drop-down, and on phones the menu button opens a full-screen menu with big links." },
    ],
    looks: { walnut: "1kmi2np", chalk: "1uw3x32", night: "16zjo7g" },
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
