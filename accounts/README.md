# Accounts

One account, many shops (code plan 2.7). A person signs in once on the platform, with Google or an emailed link, and
sees every shop they belong to. Owners invite people by email with a role.

## The page (`index.html`, `app.js`)

Plain HTML and browser JavaScript, no framework and no build step, like the sign-up page. It reuses the sign-up page's
settings (`../signup/config.js`) and sign-in.

- **Choose a shop**: each shop with the person's role. **Open** goes to the shop's admin, or to the stockroom for an
  author. A paused or closed plan and a shop still being made are shown in words.
- **Team** (owners only): the people and their roles, invites waiting to be accepted, and **Invite someone** with a
  role. A role changes from its menu; **Remove** asks first.
- **An invite link** (`/accounts/?invite=…`): the page keeps the invite while the person signs in, then accepts it.
  An emailed sign-in link brings them back here (`page: "accounts"` on `POST /api/signin-link`).

## Roles

The shop's own roles (`apps/shop/functions/roles.js`), named in `roles.js`:

| Role | Can use |
| --- | --- |
| Owner | everything, including billing and the team |
| Staff | the shop's admin, without billing, secret keys or the team |
| Author | their own books, in the stockroom only |

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

## Not yet

- The real stores (Firestore in the platform project: `memberships`, `invites`) and the real `shopData` writes into
  each shop's project.
- People the owner adds in the shop's own admin (Settings › Team) are not copied back here yet, so they don't see that
  shop in the switcher until they are invited from this page.
