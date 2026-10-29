# Google link

**Connect Google** (code plan 6.17 and 6.20). The press signs in with their Google account and allows Colophon once.
One connect job then links everything Google for their shop. One teardown job undoes it on the closing timeline
(plan 6.8). Plain Node 22 ES modules, no packages. Google is called over its REST services with an injected `fetch`.
Tests use a pretend Google (`fakes.js`). **Off unless `GOOGLE_CONNECT_ENABLED=true`.** While it is off, every shop keeps
its older Google Analytics card.

## What one sign-in connects (`connect.js`)

| Step | What happens | Where it is kept |
| --- | --- | --- |
| `firebase` | The shop's own project (made and owned by Colophon) is ready, and its reporting account is named | `google.firebase` |
| `analytics` | A property and web stream in the press's own Analytics account. The measurement ID goes to the shop, where the existing tag and consent rules take over. The property number goes to the admin-only settings. The shop's reporting account becomes a Viewer, so the Overview shows Google's figures | `google.analytics`; the shop's `settings/website.analytics.ga4MeasurementId` and `adminSecrets/googleAnalytics.propertyId` |
| `domain` | The press's own address, once one opens the shop (`services/domains`) | `google.domain` |
| `searchConsole` | The shop's address, verified through a file on its own pages. The own address too, verified through a record that the domain's Allow step adds (plan 6.15). The shop's reporting account becomes an owner, so the existing Search Console code in the shop (`apps/shop/functions/searchConsole.js`) reads it. The sitemap is sent | `google.searchConsole`; the shop's `adminSecrets/googleAnalytics.searchConsoleSite` |
| `merchantCenter` | The press's Merchant Center account (made in their name when they have none), the shop's book feed (`/google-merchant-feed.xml`) as its daily product source, and free listings | `google.merchantCenter` |
| `email` | The press's Gmail, once Julian switches that on. Otherwise orders@ their own domain (`services/email/ownDomain.js`). Otherwise Colophon's sender with the press's name | `google.email`, `gmailSender`, `emailSender` |
| `drive`, `youtube`, `calendar`, `businessProfile`, `ads` | The extras, each one tick box on the same Allow page: nightly backups to a folder the press owns, trailers from their channel, an events calendar, their Maps listing, a link from the book feed to Google Ads (never spends) | `google.<extra>` |

The registry row's `google` also holds `accountEmail`, `connectedAt`, `closedAt`, `deletedAt` and
`steps: [{ step, state: "done" | "failed" | "waiting", at, detail }]`. Each step is also written to the shop's audit log
(`record.js`).

- **Re-runnable.** Each step first reads the registry row and Google, and changes only what is missing. A re-run that
  finds nothing to do writes nothing, not even to the audit log.
- **Skippable.** Google lets the press untick any part on its Allow page. A part whose permission wasn't given waits and
  changes nothing. "No" on the whole page leaves the shop exactly as it was.
- **Plain words.** Every step's `detail` is shown to the press and in the control room, so it never names a technical
  term.

## What the shop can ask for after connecting (plan 16.1, 16.2)

| Door call | What it does | Permission |
| --- | --- | --- |
| `google.productProblems` | Lists the books Google Shopping turned down or demoted, with the reason (Merchant API v1 product status). Reads only | `content`, already asked |
| `google.sheetSync { rows }` | Makes one spreadsheet, "<press> stock from Colophon", in the press's own Drive the first time and rewrites its Stock tab after that. Cells are written as plain text (never formulas). A sheet the press deleted is made again on the next send. Never deleted by the platform | `drive.file` (Google labels it non-sensitive), the Drive box |

The shop's server builds the rows itself from the stockroom (`apps/shop/functions/googleConnect.js`); the browser never supplies them.

## Teardown (`teardown.js`)

| Stage | Steps |
| --- | --- |
| pause | nothing |
| closing (60 days paused, the press leaves, or the press presses Disconnect) | `stopFeed` (the book feed leaves Merchant Center, the Ads link goes), `stopTag` (the tag stops; the shop's reporting account leaves Analytics and Search Console), `stopGmail`, `stopExtras`, `giveBackAccess` (Google revokes Colophon's grant) |
| deletion (after the 90 days and the 30- and 7-day emails) | `removeDomain` (the own address and its email records, through `domainsCall`), `deleteFirebase` |

The press's own Analytics, Search Console, Merchant Center, Drive, YouTube, Calendar, Business Profile and Ads accounts
are never deleted, so their history leaves with them.

**Plugging it into the closing sweep (`closing.js`).** `googleClosing({ teardown, registry, shopFirebase })` gives the
two things the hosted sweep is built with: `hooks` (`onClose` runs the closing steps; `beforeDelete` runs the deletion
steps) and `projects` (the sweep's project deleter, which skips a project the teardown has already deleted):
`createClosingSweep({ ..., hooks: google.hooks, projects: google.projects })`. `teardownBeforeDelete` refuses
(`{ refused: true }`, nothing deleted) unless the registry row shows the deletion is due:
`closing: { closedAt, deleteAfter, warned30At, warned7At }`, with both emails sent and `deleteAfter` passed
(`deletionDue`). A failed deletion step refuses too, so the sweep tries again on its next run; a failed closing step is
recorded and shown in the control room with Run again, and never holds up the timeline.

## The control room (`status.js`)

`googleStatus(shopId)` gives the stage (not connected, connected, closed, deleted), the account, each part and every
step with `canRunAgain`. `runAgain(shopId, step)` runs one connect or teardown step again. A deletion step never runs
before `deletionDue`.

## Doors (`service.js`, `http.js`)

| Door | Who knocks | What it checks |
| --- | --- | --- |
| `POST /shop` | the shop's server (`apps/shop/functions/googleConnect.js`, `PLATFORM_GOOGLE_URL`) | `X-Shop-Id` plus `Authorization: Bearer <shop service key>`, like the other platform services |
| `GET /google/oauth` | Google, sending the press back with `code` and `state` | the one-use state (15 minutes) |

The shop's calls: `google.status`, `google.connectLink { returnUrl, extras }`, `google.tryAgain { step }`,
`google.disconnect`.

## Files

- `connect.js`, `teardown.js`, `status.js`, `record.js`: the jobs and how they record. `closing.js`: the teardown as the closing sweep's hooks.
- `service.js`, `http.js`: the doors. `index.js`: `createGoogleLink(...)` puts it all together.
- `googleApi.js`: the Google client. `endpoints.js`: every Google address and permission, with its reference page.
- `tokens.js`: the press's tokens, sealed with `../services/payments/tokenSeal.js` (key `GOOGLE_TOKEN_KEY`) and bound
  to the shop.
- `domainBridge.js`: `domainsCall`, the one way in to `services/domains`. Until the domain service can add records
  (plan 6.15), it answers `{ waiting: true }` and the part that asked waits.
- `gmail.js`: `gmailSend` for the email service, once Gmail sending is switched on.
- `config.js`: the settings. `fakes.js`: pretend Google, shop project, domain service and stores. `google.test.js`.

## Settings

`GOOGLE_CONNECT_ENABLED`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`, `GOOGLE_TOKEN_KEY`,
`GOOGLE_GMAIL_SENDING` (off), `GOOGLE_BUSINESS_PROFILE` (off), `GOOGLE_ADS_DEVELOPER_TOKEN` (none: no Ads box). They
live in this service's environment only.

### The "is Google ready" check (plan 15.4)

`readiness.js` lists what only Julian can do outside the code, in plain words: Google approved the sign-in screen
(`GOOGLE_SIGNIN_APPROVED=yes`), Colophon's Merchant Center account registered and its number saved
(`GOOGLE_MERCHANT_REGISTERED=yes` and `GOOGLE_MERCHANT_PROVIDER_ID`), the service versions checked in the last 90 days
(`VERSION_CHECKS` in `endpoints.js`, automatic) and a separate test project (`GOOGLE_TEST_CLIENT_ID`). **With
`GOOGLE_CONNECT_ENABLED=true` the settings refuse to load until every item is done** and name what is missing;
`GOOGLE_READY_CHECKS=off` skips the check for practice runs with the pretend Google. The control room's Switches page
shows the same list (`GET /api/control/google-ready`). `registerMerchantDeveloper` makes the one-time Merchant
registration call (account and developer email); its path and body follow Google's guide and are confirmed by the
first real run (plan 15.7).

### Switched on by Julian

1. Make Colophon's Google app (a Web sign-in client). Turn on Analytics Admin, Site Verification, Search Console,
   Merchant, Drive, YouTube Data and Calendar in the platform project.
2. Have Google approve the sign-in screen for those permissions (Go-live plan). Then set the keys and
   `GOOGLE_CONNECT_ENABLED=true`.
3. Gmail sending: sending is a "sensitive" permission, so it goes through the same review of the sign-in screen (no
   yearly outside review). Once that is approved, set `GOOGLE_GMAIL_SENDING=on`.
4. Google Shopping: make Colophon's own Merchant Center account (home page verified), register the platform project
   with it once (`registerGcp`), then set `GOOGLE_MERCHANT_PROVIDER_ID` to that account's number. Without it Google
   Shopping waits.
5. The second round of extras (YouTube, Calendar, Business Profile, Ads) is off at launch so the first review asks for
   as few permissions as possible. After it, set `GOOGLE_LATER_EXTRAS=on`.
6. Business Profile: once Google grants Colophon access to its Business Profile tools, set `GOOGLE_BUSINESS_PROFILE=on`.
7. Ads: Google ended developer tokens on 9 September 2026. Once the platform project has an Ads access level, set
   `GOOGLE_ADS_ACCESS` to `explorer`, `basic` or `standard`.

## Not yet

- Hosting (one function in the platform project) and the Firestore stores `googleConnections` and `googleStates`.
- The real `shopFirebase` client (Admin SDK writes into the shop's project, the verification file on its Hosting, and
  project deletion), and the nightly Drive backup and the calendar's events on the website.
- Hosting the domain service, so `domainsCall` reaches `applyRecords` / `removeRecords` / `removeDomain` for real (plan
  6.15 built them in `services/domains`; teardown passes `deleting: true`).
