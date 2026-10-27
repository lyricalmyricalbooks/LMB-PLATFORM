# CLAUDE.md — LMB Platform

The platform that creates and runs one Firebase copy per press shop. The shop and stockroom code is not here (see README).

## Rules

- **One copy per shop.** Never put two presses' data in one Firebase project or database.
- **Platform keys stay here.** The Stripe platform key and the email sender key live only in `services/payments` and `services/email`. Never copy them into a shop project or into client code.
- **Every step can be re-run.** Setup steps and data changes must be safe to run twice and must record what they did, per shop, in that shop's `audit-log` and in the shop registry.
- **Prefer retry over delete.** Never delete a half-made Google Cloud project to start over: deleted projects linger 30 days and their names can't be reused.
- **Real money and real shops.** Never point tests at live keys or a paying press's project. Use the test shop.
- **Customer-facing words never name a rival** (say "Bring your shop with you").
- Node 22, plain ES modules. No framework is chosen yet; decide per folder when its work starts, and record it in `docs/decisions.md`.

## Pull requests

- Run `npm test` before pushing.
- After a change, end the reply with a "Next moves" list written for the shop owner, in plain words, same format as the shop repo's CLAUDE.md.
- **Merge your own PRs automatically (owner's instruction, 27 October 2026).** Open PRs ready for review, wait for every
  check to pass, then merge (merge commit, pinned to the head SHA) when GitHub reports no conflict. Never merge with a
  red, pending or missing check: fix it first.
