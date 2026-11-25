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

## 18 November 2026 (third pass, desktop only)

**Screens reviewed** (shop admin fixture, desktop 1440 and 1280, the stockroom side): Stock and sales, Count, Reorder,
All sales, Record a sale, Parcels, Buyers in person, Quotes, Repeating invoices, Bills to pay, Receipts, Artist payouts,
Reports, Backups.

**Fixed** (one PR)
- All sales: "Money taken" broke a sum in the middle ("CA$4,990.0 / 0 · US$25.00"); each currency now has its own line
  and the figures fit their tile. On a laptop the three tiles stay in one row instead of leaving a hole.
- Stock and sales: "Add book" floated alone as plain text between two cards; it is the page's button by the title now.
- Repeating invoices: "Start again" and "Delete" stacked on one row while the others sat side by side, and the table
  squeezed every column on a laptop; how each invoice is sent now sits under the customer's name.
- Artist payouts: the table had square top corners and no edge; it sits in the same card as Bills to pay, and "Settle"
  is a button like "Mark paid".
- Parcels: the status column had no heading.
- Reorder: "Download Excel" comes before "Download CSV", as on every other download.
- Count: a product with no format showed a lone dash under its name.

**Noticed, left for later**
- Stock and sales and Count: the search box sits further from its table than on other pages.
- Stock and sales: the Sold and Out at stores tiles have no line under the number, so the tiles sit unevenly.
- All sales: "Best channel" has no line under it (its share of sales would fit).
- Backups and Receipts: row actions ("Open", "Choose", "Check and add") are still plain text, unlike "Mark paid".
- Quotes, Bills and Repeating draw their table inside a padded card; Parcels and All sales run the rows to the card's edge.

## 24 November 2026 (desktop only)

**Screens reviewed** (shop admin fixture, desktop 1440, phone glanced at): Backups, QR codes, Bookkeeping › Receipts and
Bills to pay, Orders, Customers, Reviews, Analytics, Online store, Stock and sales, Count, Inventory, Settings › Your
shop and Emails.

**Fixed** (one PR)
- Backups, QR codes, Online store and Receipts by email: "Open", "Choose", "Download", "Print", "Check now" and
  "Check and add" were plain words; they are the cream pill buttons every other card uses (white on a cream receipt).
- Customers, Reviews, Stock and sales and every page that stacks a search row over its table: the search row sat twice
  as far from its table as anything else on the page.
- Orders: the footer scattered "3 of 3", "Bring past orders over" and the test switch across the width; the link and
  switch now sit together on the right.
- Reviews: the Hidden tile has a line under its number ("Not on your website") like its neighbours.
- Stock and sales: Sold ("All time") and Out at stores ("Left with stores to sell") have their line too.
- Customers: Export CSV and Bring customers over drop their icons, matching Orders next door and the v4 mockup.

**Noticed, left for later**
- Receipts by email: three receipt cards leave an empty fourth column on a wide screen.
- Online store: "Unpublished changes" shows a lone dash as its number when Studio has nothing waiting.
- Settings › Emails: the loading box has a dashed edge, so it reads like a drop zone.
- Customers: the table card's title still repeats "Customers"; Backups' card title repeats "Backups" too, but the
  mockup draws it that way.

## 25 November 2026 (desktop only)

**Screens reviewed** (walkthrough control room, desktop 1440, phone glanced at): Today, Shops, Inbox › Support, Money ›
Income, Failed payments, Why brands leave, Costs, Prices and sign-up, Platform, Run book, Ways to sell.

**Fixed** (one PR)
- Today: the snooze menus were narrower than "Snooze 30 days", so Note and Open shop jumped sideways on one row; every
  row's last button is one width now and the buttons line up down the list.
- Money: Income and Why brands leave had no line under the title, so the tab row jumped up when you opened them; each
  has one short line like the other Money tabs.
- Money › Fair till by month: months read "November 2026" instead of "2026-11", and the money is in the same type as the
  other numbers.
- Money › Income chart: the last month's figure sat on top of the line when income fell; it goes under the point then.
- Why brands leave: the counts sat tight under the card title and floated mid-card; they have room and line up on the
  right.
- Run book: the shop and release boxes had no fill on the white card, so they read as plain words; the close date says
  "Nov 27, 2026, 8:00 PM" instead of "11/27/2026, 8:00:00 PM"; its buttons match Today's height.
- Inbox: Send reply, Send and close and Open shop were smaller than every other button in the control room.
- Ways to sell: six tiles sat as five and one left alone; they are two rows of three. Page Refresh buttons (Ways to sell,
  Bookings, Setting up, Jobs) have the same outline as the top bar's Refresh instead of reading as plain words.

**Noticed, left for later**
- Prices and sign-up: tick boxes and number boxes share one four-column grid, so the form zigzags; labels stack two
  bracketed units ("(CAD; running cost comes on top) ($)").
- Costs: the empty card names a file ("services/costs/README.md") instead of saying what to do.
- Shops table: Plan and Health still wrap into tall rows on a laptop (also noted 17 November).
- Failed payments: the Reminder column is empty with no dash or button.
- Today: lines with no snooze (repair queue, support) end their buttons further right than the shop lines.
