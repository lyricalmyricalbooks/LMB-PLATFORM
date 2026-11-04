# Social media sales channels (code plan Phase 27)

Like Shopify's sales channels: a press connects Facebook & Instagram, Pinterest and TikTok from its shop admin, sends
its products to their catalogs, and posts a product now or later. Product pages get share links. Google & YouTube stay
on the one Google sign-in in Settings › General.

## Who does what

| Part | Where | Job |
| --- | --- | --- |
| Social service | `services/social` (platform) | Holds the platform's Meta, Pinterest and TikTok app keys and every press's sealed tokens. Signs in, finds Pages, Instagram accounts and boards, sends catalogs, publishes posts, disconnects. |
| Shop link | `apps/shop/functions/socialLink.js` | Passes the admin's steps on with the shop's service key. Keeps posts in `socialPosts` (server only) and posts what is due every 5 minutes (`socialPostSweep`). |
| Admin | `SalesChannels.tsx`, `SocialPosts.tsx`, `socialChannels.ts` | Sales channels (under Books) and Social posts (under Orders; Marketing in the combined admin). Each book row has Post to social. |
| Storefront | `features/site/ShareMenu.tsx`, `shareLinks.ts` | The product page's share button: the phone's share sheet on phones, a menu (Facebook, Pinterest, X, WhatsApp, email, Copy link) elsewhere. |

## Doors (social service)

| Door | Who knocks | What it checks |
| --- | --- | --- |
| `POST /shop` | the shop's server | `X-Shop-Id` plus `Authorization: Bearer <shop service key>`, like the other platform services |
| `GET /<network>/oauth` | Meta, Pinterest or TikTok sending the press back | the one-use state (15 minutes); the return address must be one of the shop's own addresses |

Shop steps: `status`, `connect`, `disconnect`, `sendCatalog`, `publish`. The control room reads `controlRoom(shopId)`:
connections, catalogs and recent post failures, with no tokens.

## Rules

- **Off unless `SOCIAL_ENABLED=true`** and the network's app keys are set. While off, every channel shows Coming soon
  and Facebook, Instagram and Pinterest keep the by-hand product file steps (plan 24.7).
- Tokens are sealed with AES-256-GCM (`../payments/tokenSeal.js`, key `SOCIAL_TOKEN_KEY`), bound to shop and network.
- Never twice: one `sent` claim per shop, post and place (stale after 10 minutes). The shop claims a due post in a
  transaction (stale after 15 minutes) before asking the service.
- A refused token (Meta code 190, a 401, TikTok's invalid token) marks the connection lost; the page asks to connect again.
- Every product link carries `utm_source` (the place) so visits from posts and shares show in the visit sources.
- Catalogs read the shop's product file (`/social-product-feed.csv`) daily, so published changes follow on their own.
- TikTok posts stay private (`SELF_ONLY`) until TikTok audits the platform's app.

## Settings (platform)

`SOCIAL_ENABLED`, `SOCIAL_REDIRECT_BASE` (https), `SOCIAL_TOKEN_KEY`, `META_APP_ID`/`META_APP_SECRET`,
`PINTEREST_APP_ID`/`PINTEREST_APP_SECRET`, `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`, optional `META_GRAPH_VERSION`
(default v23.0). Each shop needs `platformSocialUrl` in its config. Approvals: `docs/start-real-accounts.md`.
