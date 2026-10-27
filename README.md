# LMB Platform

The platform behind the press shop and stockroom subscription. It creates and runs one Firebase copy per press.

The shop and the stockroom themselves live in their own repos:

- [LyricalmyricalWebsite](https://github.com/lyricalmyricalbooks/LyricalmyricalWebsite): the shop and its admin.
- [lyrical-inventory](https://github.com/lyricalmyricalbooks/lyrical-inventory): the stockroom app.

Lyricalmyrical is one shop on the platform, not a special case.

## What lives here

| Folder | What it does |
| --- | --- |
| `setup/` | The shop maker. It creates a press's Firebase copy in numbered steps, each safe to re-run. |
| `releases/` | Sends a new shop and stockroom version to every press, starting with a test shop. |
| `control-room/` | Platform admin: every shop's health, plan and version, plus a logged "act as this shop" button. |
| `services/payments/` | The one service that holds the Stripe platform key. It handles checkout and Stripe events for all shops. |
| `services/email/` | The one service that holds the email sender key. |
| `signup/` | Sign-up, plan choice and billing. |
| `waitlist/` | The public waitlist page. |
| `profile/` | The shop profile format: what differs between shops, read by both apps when the page opens. |
| `docs/` | Decisions and plans: `code-plan.md` (the build order, one pull request per line), `shop-setup.md`, `payments.md`, `test-shop.md`, `decisions.md`. |

The plan behind all of this is the "Press platform build plan" doc.

## Checks

```bash
npm test
```

CI runs the same check on every pull request.

> This repo is public for now. Make it private before the first paying press.
