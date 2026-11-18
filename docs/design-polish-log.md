# Daily design polish log

One entry per daily polish run (the scheduled "Daily design polish pass", set up 17 November 2026). Each run reads this
first and picks screens not covered lately. Screenshots: project files `design-polish/<date>/`.

## 17 November 2026

**Screens reviewed** (walkthrough, desktop 1440 and phone 390): Your shops, Plan & billing (paused and trial), sign-up,
control room (Shops, Sign-ups, Support), help, status, join, waitlist, trust, terms.

**Fixed**
- Phone top bar: the links sit on the wordmark's row while they fit, instead of always dropping to a row of their own.
- Your shops: each shop card no longer repeats "Website and stockroom plan" (every shop is on that one plan); an older
  plan still shows.
- Plan & billing, paused shop: the plan card no longer repeats the red line's words; the cancel card no longer says the
  shop "stays open until" a date, since a paused shop is already closed to shoppers.
- Tables on platform pages: the date never breaks over two lines.

**Noticed, left for later**
- Plan & billing: the email language choices look like empty text boxes rather than choices.
- Plan & billing: the Invoices table has an empty Invoice column until a bill has a number.
- Control room Shops table: the Plan and Health columns wrap into tall rows on a laptop (control room views thread is
  active there).
- Sign-up page: very long on a phone (two long lists of choices); left alone while services sign-up work is in flight.

## 18 November 2026

**Screens reviewed** (shop admin fixture, desktop 1440 and phone 390): Customers, Discounts, Gift cards, Reviews,
Messages, Settings › Shipping, Taxes and Team, Stockroom › Invoices, Bookkeeping › Expenses and Overview, Tax centre,
Stockists, and the phone search box.

**Fixed** (one PR, shared admin look plus three small screen fixes)
- Phone top bar: the shop name was cut to "Yo…" on every admin page (the hidden search box kept its desktop width).
- Phone cards made of a title and a body (Bookkeeping, Tax centre, Customers…) had a double margin, and the fold arrow
  dropped to a row of its own; they now use the full card, with the arrow beside the title.
- Plain buttons inside white cards ("Try again" and others) had no fill or edge and read as text; they are now the
  cream pill Settings already used.
- Phone search: "Ctrl K" no longer sits on top of the close button.
- Customers: "Nov 18 (0d ago)" now says "today", "yesterday" or "N days ago".
- Gift cards: a disabled card shows its status as a tag, like Discounts.

**Noticed, left for later**
- Bookkeeping › Expenses: "Costs that may be missing" writes money without a currency sign ("You have 2167.00 of
  website sales"); the stockroom's wording code doesn't know the shop's currency yet.
- Customers: the table card's title "Customers" repeats the page title.
- Settings › Shipping: the Profiles tab says 1 while the Profiles tile says 0, and "Go to Profiles" and "Manage
  profiles" do the same thing in one card.
- Reviews: the Hidden tile has no line under its number, so the three tiles sit unevenly.
- Row actions such as "Remind me later" and "Mark paid" are plain text; the v4 mockup draws them as chip-buttons.

## 18 November 2026 (second pass, desktop only)

**Screens reviewed** (shop admin fixture, desktop 1440): Home, Analytics, Orders, Books, Inventory, Sales channels,
Social posts, Settings › General, Payments, Google, Apps, Security, Plan.

**Fixed** (one PR)
- Off switches had a cream track on the cream page, so "Show test orders" looked like a lone white dot; off is now a
  grey track everywhere.
- Sales channels: TikTok's Connect sat further right than every other row's tag; a gap where the ⋯ menu sits lines it up.
- Inventory: untracked rows said "Not tracked" twice (On hand and Status); On hand now shows a dash.
- Inventory and every filter row: a search box beside labelled choices now lines up with their boxes, not their labels.
- Settings › Google and Apps had no line under the title, so the settings menu jumped up when you opened them.
- Payments: "Test (sandbox) mode" says "Test mode".

**Noticed, left for later**
- Settings tabs (Your shop, Shop status…) are bigger and lighter than the tabs on every other page.
- Analytics: period chips (Today, 7 days…) look like the page tabs above them but larger.
- Orders: the footer row scatters "3 of 3", "Bring past orders over" and the switch across the width.
- Google settings error box: "Try again" reads as plain text.
- Security page is blank in the local preview (needs a signed-in user), so it wasn't reviewed.
