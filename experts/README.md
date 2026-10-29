# Experts

A static page of independent people a press can hire for the work Colophon's help doesn't cover: design, photos, packing
and shipping, bookkeeping, writing (plan 12.13). Support stays free of design work, data entry and setup calls (plan 8.2);
this is where those requests go instead of to Julian.

- **The list** is `EXPERTS` in `directory.js`. Add a person by adding an entry in a pull request; `problemsWith()` says what an
  entry is missing and the page skips an entry that has a problem. It is empty until the first expert joins.
- **No booking, no payment, no fee.** The page links to the expert's own page and says so. Nothing here takes a message
  or money, and a test fails if the page grows a form or a payment word.
- **How an expert asks to be listed** is `APPLY_URL` in `directory.js`; empty until Julian chooses an address, and the page
  says listings open soon.
- **The page** (`page.js`, `index.html`) filters by kind of work and by search words. Plain words, never a rival's name
  (`experts.test.js`).

## Publishing it

Like the help page: a deliberate step on the owner's machine, never from CI. It sits next to `help/`.

## Not yet

- Julian's checks for who may be listed (a few past jobs, a named contact) and the first entries.
- A Hosting address, and links from each shop's admin and from the help page's "Still stuck?" box.
