# LMB Platform

The platform behind the press shop and stockroom subscription. It creates and runs one Firebase copy per press.

The shop and the stockroom used by the platform are copies in `apps/`:

- `apps/shop/`: the product's shop, a copy of [LyricalmyricalWebsite](https://github.com/lyricalmyricalbooks/LyricalmyricalWebsite).
- `apps/stockroom/`: the product's stockroom, a copy of [lyrical-inventory](https://github.com/lyricalmyricalbooks/lyrical-inventory).

Julian's own website and stockroom repos are never changed for the platform; they must keep working in all circumstances.



## What lives here

| Folder | What it does |
| --- | --- |
| `apps/` | Copies of the shop and the stockroom for the platform. Julian's own repos are never changed. |
| `setup/` | The shop maker. It creates a press's Firebase copy in numbered steps, each safe to re-run. |
| `clients/` | The platform's real connections to Google (Firestore, the registry, sign-in for the test owner), each tested with a fake `fetch`. |
| `release-check/` | The full purchase every update must pass on the test shop: buy, stock drop in the shop and stockroom, email, refund. |
| `releases/` | Sends a new shop and stockroom version to every press, starting with a test shop. |
| `control-room/` | Platform admin: every shop's health, plan and version, plus a logged "act as this shop" button. |
| `services/payments/` | The one service that holds the Stripe platform key. It handles checkout and Stripe events for all shops. |
| `services/email/` | The one service that holds the email sender key. |
| `signup/` | Sign-up, plan choice and billing. |
| `waitlist/` | The public waitlist page. |
| `profile/` | The shop profile format: what differs between shops, read by both apps when the page opens. |
| `docs/` | Decisions and plans: `code-plan.md` (the build order, one pull request per line), `shop-setup.md`, `payments.md`, `test-shop.md`, `name-and-domain.md`, `decisions.md`. |

The plan behind all of this is the "Press platform build plan" doc.

## Checks

```bash
npm test
```

CI runs the same check on every pull request.

> This repo is public for now. Make it private before the first paying press.
