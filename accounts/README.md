# Accounts

One account, many shops (code plan 2.7). A person signs in once on the platform, with Google or an emailed link, and
sees every shop they belong to. Owners invite people by email with a role.

## The page (`index.html`, `app.js`)

Plain HTML and browser JavaScript, no framework and no build step, like the sign-up page. It reuses the sign-up page's
settings (`../signup/config.js`) and sign-in.

- **Choose a shop**: each shop with the person's role. **Open** goes to the shop's admin (a bookkeeper sees only its
  Bookkeeping page there), or to the stockroom for an author. A paused or closed plan and a shop still being made are shown in words.
- **Team** (owners only): the people and their roles, invites waiting to be accepted, and **Invite someone** with a
  role. A role changes from its menu; **Remove** asks first.
- **An invite link** (`/accounts/?invite=…`): the page keeps the invite while the person signs in, then accepts it.
  An emailed sign-in link brings them back here (`page: "accounts"` on `POST /api/signin-link`).

- **Get help from Colophon**: a request to the platform team (`services/support/`), about one of the person's shops or
  none, and every earlier request with its answers. Answers also come by email; the person can add to a request.

## Plan & billing (`billing.html`, `billing.js`, `billingWords.js`, `billingRoutes.js`)

The page every billing email links to, `/account/billing?shop=<id>` (Hosting serves `accounts/billing.html` there; its
script loads from `/accounts/billing.js`). Code plan 6.4 and 6.5. The shop card on the account page links to it for
owners.

- The plan and price ("plus tax" when `BILLING_TAX` is on), and where it stands: trial days left, the next payment,
  cancelled until a date, paused, a payment problem or closed.
- The card on file (brand, last four, expiry) with **Add a card** / **Change card** (Stripe's own page).
- **Change plan**: **See what changes** first (apps opening and closing, when, the prorated amount), then **Change my
  plan**.
- Invoices with their PDFs; **Cancel plan** / **Keep my plan**.
- Loading, error, signed-out and no-plan states. A marked spot, `<section id="payment-way">`, waits for row 6.19's
  "Two ways to pay" switch.

The calls, each for the shop's owner only (the shop's own team, `accounts.roleIn`), each reaching `services/billing`
once and logged (done, refused or failed) in the registry and the shop's audit log:

| Route | Body | Answer |
| --- | --- | --- |
| `POST /api/billing/status` | `{ shopId }` | `{ billing }` (null: no plan yet) |
| `POST /api/billing/card` | `{ shopId }` | `{ url }`: Stripe's card page, coming back only to this shop's Plan & billing page |
| `POST /api/billing/cancel` | `{ shopId }` | `{ cancelAtPeriodEnd }` |
| `POST /api/billing/keep` | `{ shopId }` | `{ cancelAtPeriodEnd }` |
| `POST /api/billing/change-plan` | `{ shopId, plan, preview? }` | `{ preview }`, or `{ plan, changed }` |
| `POST /api/billing/invoices` | `{ shopId }` | `{ invoices }` |

The web door adds them with `routes: { ...accountRoutes(accounts), ...billingRoutes({ billing, accounts, registry,
auditLog, settings }) }`.

## Roles

The shop's own roles (`apps/shop/functions/roles.js`), named in `roles.js`:

| Role | Can use |
| --- | --- |
| Owner | everything, including billing and the team |
| Staff | the shop's admin, without billing, payment and email connections, or the team |
| Author | their own books, in the stockroom only |
| Bookkeeper | reads orders, sales, tax collected, payouts and the bookkeeping downloads (the admin's Bookkeeping page), and the stockroom's tax centre expenses; changes nothing, and sees no books, settings, customer list or team |

The shop decides access, not the platform. Accepting an invite writes the person's `members/<email>` document in the
shop's own database, which the shop copies onto their sign-in; changing a role rewrites it, and removing someone deletes
it. The platform keeps its own copy (`memberships`) only to list a person's shops. The account's list of shops started
at sign-up is never trusted for a role.

The shop's own owner address (the person who signed up) is always an owner and can't be invited, changed or removed
here. A shop always keeps at least one owner.

## The server (`accounts.js`, `routes.js`)

`createAccounts({ accounts, memberships, invites, registry, shopData, auditLog, email, settings })`. The calls are added
to the platform's one web door: `createApi({ …, routes: accountRoutes(accounts) })`.

| Route | Who | What |
| --- | --- | --- |
| `GET /api/accounts/shops` | signed in | every shop the person belongs to, with their role |
| `POST /api/accounts/switch` | on the team | `{ shopId }`: the address to open |
| `POST /api/accounts/team` | owner | the team and open invites |
| `POST /api/accounts/invite` | owner | `{ shopId, email, role }`: emails an invite that works for 7 days |
| `POST /api/accounts/cancel-invite` | owner | `{ shopId, id }` |
| `POST /api/accounts/accept` | the invited address, confirmed | `{ invite }` |
| `POST /api/accounts/role` | owner | `{ shopId, email, role }` |
| `POST /api/accounts/remove` | owner | `{ shopId, email }` |

- Only the invited address, confirmed by Google or an email link, can accept. Accepting twice is fine.
- The invite's secret is only in the email: the platform keeps its hash. Inviting the same address again replaces the
  open invite. A shop can have 20 open invites at once.
- Every invite, acceptance, role change and removal is logged in the registry and the shop's audit log.
- The invite email comes from the platform (`services/email`, kind `invite`).

## People added in the shop's own Team (`teamSync.js`)

An owner can also add people in the shop's admin (Settings › Team), which writes `members/<email>` in the shop's own
database. `createTeamSync({ memberships, registry, shopData, auditLog })` makes the switcher's copy match that list,
one shop at a time (code plan 5.11):

- `syncShop(shopId)` reads only that shop's `members` (`shopData.list`) and adds, re-roles or removes that shop's
  `memberships` rows to match. The shop's list is the truth; the copy only feeds the switcher. Every row it writes
  carries that shop id, so one shop's list never touches another shop's people.
- Roles are the shop's own list (`roles.js` `ROLES`, kept equal to `apps/shop/functions/roles.js` by a test): a
  document with any other role is skipped, as the shop skips it. The shop's own owner address is never copied.
- Safe to run again: a second run writes and logs nothing. Each change is logged once in the registry and the shop's
  audit log (`member-added-in-shop`, `role-changed-in-shop`, `member-removed-in-shop`).
- `syncAll()` runs every live shop; one shop that can't be read doesn't stop the others.
- The shop's door, `handleTeamChanged` (`POST /team-changed`, `X-Shop-Id` + the shop's service key): the shop's
  `syncMemberRole` trigger calls it on each Team change when its settings have `PLATFORM_ACCOUNTS_URL`. The body is
  never read; the platform re-reads that shop's list.

A removal ends in both places either way: **Remove** here deletes the shop's document and the copy together; a removal
in the shop deletes the document and the next sync removes the copy.

## New-device alerts (`devices.js`)

Every platform page (sign-up, this page, the control room) keeps a random device id in the browser
(`signup/device.js`) and sends it with each signed-in call as `X-Device-Id`. The web door (`signup/api.js`
`onSignedIn`) hands each signed-in call to `deviceWatch`:

- The first device an account is used from is remembered without an email.
- Each later new device emails the account's address once (kind `new-device`): the browser in plain words and the time.
- Only a hash of the device id is kept (`devices/<accountId>` in the platform project), with when it was first and last
  seen. Last-seen is written at most hourly. The 50 most recent devices are kept.
- A call without a device id counts as one device of its own, so leaving the header off doesn't hide a sign-in.
- A failure here is logged and never stops the call.

## Account recovery (`recovery.js`, `recoveryRoutes.js`)

For someone who has lost the email address their account uses. Nothing moves on a request alone.

1. **Ask.** Signed in with the new address, the person names the old one and says how we can check it's them
   (**Lost access to the email your shops use?** on this page). The old address is emailed at once
   (`recovery-asked`); the person asking gets a copy (`recovery-received`); the support address gets a note
   (`recovery-new`). The person asking is never told whether the old address has an account. Three requests a week
   per person; asking twice for the same address gives the same request.
2. **Stop.** The old address's owner sees a warning at the top of this page with **Stop this request**, any time before
   the move. The person asking can withdraw.
3. **Check.** A platform admin approves (with a note on how they checked) or denies (with the reason the person is
   sent) from the control room's **Account recovery**. Approving starts a 72-hour wait, and both addresses are told.
4. **Move.** After the wait, the admin moves the account by hand (below), ticks **I've moved it by hand** and records
   it. Both addresses are told. The shops the old address owns are looked up again at this point.

Every step is kept on the request (`recoveries/<id>`) and logged in the registry and the audit log of each shop the
old address owns.

### Recovery: applying

Until the move is automatic (`recoveryByHand` stands in for it), the admin does this, in order:

1. In the platform project's Firebase Authentication, change the account's email (the request's account id) to the
   new address, and mark it confirmed. If the new address already has its own account, move the shops to that one
   instead and leave the old account alone.
2. In the registry, set `ownerEmail` to the new address on each shop the old address owns, and update the platform's
   `memberships` rows for the old address.
3. In each of those shops' own databases, add `members/<new address>` as owner, then remove `members/<old address>`.
4. Redeploy each of those shops' rules and settings file at their current release (`services/release-runner`), so the
   new owner address is the one the shop trusts.
5. Record it in the control room (**I've moved it by hand**, then **Record as moved**).

## Not yet

- The real stores (Firestore in the platform project: `memberships`, `invites`) and the real `shopData` writes into
  each shop's project.
- Moving a recovered account automatically (`applyRecovery` is `recoveryByHand` for now).
- Wiring the device and recovery stores (`clients/stores.js` `firestoreDevices`, `firestoreRecoveries`) and the
  Firebase account lookup (`findAccount`) into the hosted web door.
- Hosting the team door and running `syncAll` on a schedule (each night, to catch a missed notice), then writing
  `PLATFORM_ACCOUNTS_URL` into the shops' settings (setup step 8 does it once `config.platformAccountsUrl` is set).
