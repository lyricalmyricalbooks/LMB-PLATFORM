# New GitHub tools that could improve Colophon

3 November 2026 · for Julian

**Short answer:** I searched GitHub for open-source tools that came out or matured since the 27 October scan. Four were
worth building straight away, and they are in one pull request: random-cart checks on discount money, a security check
on the platform's automatic checks, a check on every new package (security and licence), and a one-week wait before
package updates. Nine more are ranked below with what each would take. Every tool listed is free, open source and was
updated in the last few weeks unless noted.

How I checked: each tool's GitHub page for its licence, its star count (a rough sign of how many people rely on it) and
the date of its last change. "Safe licence" means the shop can use it without having to publish its own code.

## Built now (in the pull request)

### 1. Random-cart checks on discount money (fast-check)
**What it is:** a testing tool that makes up hundreds of random bags and discount codes and checks rules that must
always hold. When it finds a bag that breaks a rule, it boils it down to the smallest one that still breaks it.

**What I added:** four rules, checked against 400 random bags each time the checks run:
- the discount the shop shows always equals what the server charges;
- a discount is never below zero, never more than the bag, and never over its "maximum discount";
- the order of items in the bag never changes the discount;
- automatic discounts always pick the biggest saving.

All four pass today. To prove the check works, I broke the buy-one-get-one sum on purpose. It caught the change at
once and reduced it to a two-item bag.

**Why it matters:** before this, the money rules were tested against five hand-picked bags. A rounding mistake on an
unusual bag would slip through, and here a slip means a wrong charge.

Licence MIT (safe) · 5.2k stars · changed today · [dubzzz/fast-check](https://github.com/dubzzz/fast-check)

### 2. A security check on the platform's automatic checks (zizmor)
**What it is:** a scanner for GitHub's automatic check and deploy files. It looks for the known ways attackers take them
over: a pull request title run as a command, a sign-in token left on disk, a third-party add-on that can change without
notice.

**What I added:** it now runs on every pull request. I also fixed what it would have found: every check now has
read-only access to the code, no check leaves its sign-in token on disk, and the one outside add-on (pnpm's installer)
is now locked to an exact version.

**Why it matters:** the platform will soon create and deploy real shops from these files. A hijacked check file is
one of the easiest ways into a software company today.

Licence MIT (safe) · 6.9k stars · changed today · [zizmorcore/zizmor](https://github.com/zizmorcore/zizmor)

### 3. A check on every new package: known security holes and licence (GitHub dependency review)
**What it is:** GitHub's own check. When a pull request adds or upgrades a package, it fails if that version has a
known serious security hole, or if its licence would force us to publish the platform's code (GPL or AGPL).

**Why it matters:** the weekly update requests (already set up) only fix old problems. This stops new ones coming in,
and it checks licences, which nothing did before.

**Catch:** it is free only while the platform repository is public. When you make it private (before presses pay),
switch this job to Google's OSV-Scanner (Apache-2.0, 11.4k stars, changed today). I left a note in the file.

Licence MIT (safe) · [actions/dependency-review-action](https://github.com/actions/dependency-review-action)

### 4. A one-week wait before package updates
**What it is:** a GitHub setting for the weekly update requests. A new release of any package waits seven days before
it is offered to us.

**Why it matters:** in the last year several popular packages had poisoned releases published by attackers. Most were
caught and pulled within a few days. Waiting a week means we almost never install one.

## Worth doing next, ranked

### 5. Barcode scanning on iPhones (barcode-detector)
The shop admin's Scan button uses the browser's built-in barcode reader. iPhones and most desktop browsers don't have
one, so the button is hidden there, and that is where most presses will try it first. This package adds the same reader
to every browser, loaded only when someone taps Scan. Building it means also hosting the reader file ourselves rather
than loading it from another company's server.
Medium: about a day, plus a test on a real iPhone. Licence MIT · changed 30 October ·
[Sec-ant/barcode-detector](https://github.com/Sec-ant/barcode-detector)

### 6. Real speed numbers from shoppers' phones (web-vitals)
The checks already time the shop on a test machine. This small Google library measures how fast each page feels on
real shoppers' phones. The numbers could show in the control room, so a slow theme or a huge photo is spotted before
sales drop.
Medium: one to two days. Licence Apache-2.0 (safe) · 8.7k stars · changed 30 October ·
[GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals)

### 7. Blurry previews while photos load (ThumbHash)
It saves a tiny blurred version of each photo, about 25 letters long, next to the book. Shoppers on slow phones see the
cover's colours at once instead of an empty box. The photo resizing already done on upload can make it.
Quick to medium: about a day. Licence MIT · 4.2k stars · finished and stable (last change May 2024, a small library
that needs no updates) · [evanw/thumbhash](https://github.com/evanw/thumbhash)

### 8. Selling inside AI chat assistants (Agentic Commerce Protocol)
A new open standard from Stripe and OpenAI lets shoppers buy from a shop inside a chat assistant, paid through Stripe.
It is early, but it fits Colophon well: each shop already has a clean product list and Stripe. Worth watching for now,
and building once a few large shops use it.
Larger: a multi-day feature. Licence Apache-2.0 · 1.6k stars · last changed July 2026 ·
[agentic-commerce-protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)

### 9. Finding leftover code (Knip)
The shop and stockroom copies in the platform still carry code from Lyricalmyrical's own versions. Knip lists files,
packages and functions that nothing uses. Removing them makes every check faster and the shop download smaller.
Medium: a report in an hour, then careful removal over a few small pull requests. Licence ISC (safe) · 12.6k stars ·
changed today · [webpro-nl/knip](https://github.com/webpro-nl/knip)

### 10. One list of colours and fonts for every design (Style Dictionary)
There are now four admin looks and several shop styles. This tool keeps each design's colours, fonts and spacing in one
list and writes the files each app needs. Adding a fifth look then means filling in one list.
Medium: a few days. Licence Apache-2.0 (safe) · 4.9k stars · changed 28 October ·
[style-dictionary](https://github.com/style-dictionary/style-dictionary)

### 11. French (and other languages) for the admin and shop (Lingui)
French was on the earlier ideas list for Canadian presses. Lingui is a small, well-kept tool for translating a React
app. The stockroom would need a lighter approach because it has no framework.
Larger: about a week for the shop admin. Licence MIT · 5.9k stars · changed today ·
[lingui/js-lingui](https://github.com/lingui/js-lingui)

### 12. A weekly security grade for the repository (OpenSSF Scorecard)
A free weekly report card from the Open Source Security Foundation: branch protection, signed releases, pinned tools.
Useful later on the trust page ("our code is graded weekly").
Quick: an hour. Licence Apache-2.0 · changed 1 November ·
[ossf/scorecard-action](https://github.com/ossf/scorecard-action)

### 13. Faster search for very big shops (Orama)
Searching the shop already ignores accents and allows a typo, which is plenty for a press's catalogue. Orama would only
matter for a shop with thousands of products (for example a general store type). The Typesense add-on for Firebase does
the same but needs a paid search server per shop, so Orama, which runs in the shopper's browser, is the better fit.
Only when a big shop arrives. Licence Apache-2.0 · 10.6k stars · changed 18 October ·
[oramasearch/orama](https://github.com/oramasearch/orama)

## Looked at and not recommended

- **Stripe's test server (stripe-mock, MIT):** the payment tests already use fakes that do the same job.
- **A money library (Dinero.js, MIT):** switching every sum to it would be a big, risky change. The random-cart checks
  above now guard the sums instead.
- **Self-hosted visitor counts (Umami, MIT, 39.9k stars):** it needs its own database server per shop. The Google
  Analytics link already covers this.
- **Whole shop engines (Saleor, Spree, Vendure, Medusa):** still one shared database for every shop, as the 27 October
  scan found. Nothing to take from them.
- **Most "new e-commerce" projects of 2026** are AI prompt collections for Amazon or TikTok sellers. Nothing useful for
  Colophon.
