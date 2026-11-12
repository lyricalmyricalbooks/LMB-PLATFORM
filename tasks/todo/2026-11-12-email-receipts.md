# Receipts by email (beta), 12 November 2026

Julian: "yes build it as a beta feature but I didn't like the design of the gmail receipt finder so you will have to
redesign it from the bottom up for this platform."

## What it is

Every shop can get its own receipts address (`receipts+<shop>.<8 letters>@<platform domain>`). The owner forwards a
receipt to it, by hand or with their mail's own forwarding. A few minutes later it waits in Bookkeeping > Receipts,
already read (shop, date, amount, tax). Nothing becomes an expense until the owner checks it and adds it; the receipt
copy is filed on the expense in the same save. Off until the owner sets it up. Marked Beta.

## Why a forwarding address and not "connect Gmail"

Reading a shop owner's Gmail needs Google's restricted permission: a paid outside security review every year, and the
owner hands over their whole inbox. A forwarding address works with every mail service, shows us only what the owner
chose to send, and needs nothing from Google beyond Colophon's own mailbox.

## How it works

- The address lives on Colophon's own Google mailbox (plus-addressing, no new mailbox per shop). `services/receipts`
  reads only the messages addressed to the asking shop's address and checks each message's own headers again before
  handing it over, so one shop can never get another's mail. The 8 letters are random, and the owner can ask for a new
  address, which stops the old one.
- The shop's own server (`apps/shop/functions/receiptInbox.js`) asks the platform's receipts door every 15 minutes
  while the shop has it on, and when the owner presses Check now. It reads each email with the shop's AI (the same
  helper as receipt photos), and keeps a waiting entry in the shop's own folder (`receiptInbox`, server-only).
- Gmail's "confirm this forwarding address" email is recognised: its code is shown in the setup steps.
- Adding it: the Log expense page opens filled in. On save the receipt copy (the attachment, or a PDF made of the
  email's words) is uploaded with the shop's other receipts and attached, and the email is binned in the mailbox.
  "Not a receipt" bins it without adding anything.
- No new database rule: the browser reaches all of it through the shop's server, admin only.

## Steps

- [x] Read receipts (#730), the email service, the shop doors, the shared system
- [x] services/receipts: mailbox reader, per-shop address, shop door, tests on pretend Google
- [x] Server: `/api/receipts/shop` in both worlds, `PLATFORM_RECEIPTS_URL` for the shared shop server, settings
- [x] Shop server: receiptInbox action, 15-minute check, AI reading of an email, email-as-PDF, tests
- [x] Shop admin: Receipts by email card (Beta), setup steps, waiting receipts, Log expense prefilled + receipt filed
- [x] Control room: the shop record shows whether receipts by email is on
- [x] Tests, screenshots (computer + phone), release note

## Only Julian can do

1. Google Workspace admin > Security > API controls > Domain-wide delegation: on the `platform-mail` line add the
   permission `https://www.googleapis.com/auth/gmail.modify` beside the sending one.
2. Google Workspace admin > Users > the notifications mailbox > add the alternate address `receipts@<domain>`.
3. Add `RECEIPT_MAIL: "on"` to the server settings (GitHub variable `SERVER_SETTINGS`).

Until then shops see the card with "Opening soon".

## Review

(filled in at the end)
