# What Julian does with real accounts for the start

Written 2 November 2026 (code plan 17.17). The build of Get started uses pretend accounts until these steps are done.
This page is the one place that lists, stage by stage, what needs a real account, who does it and by when. The dates
come from Phase 15 of `docs/code-plan.md` (make it real). Each stage line is checked by `start-real-accounts.test.js`,
so a stage that is added to the build also needs a line here.

## Dates at a glance

- **13 November 2026:** Stripe's platform profile for Colophon. Stripe needs it before the Get paid stage can be tested
  on real accounts (plan 15.2 and 15.10).
- **1 December 2026:** Google's sign-in review. The permission list goes in (plan 15.3 and 15.12). Julian reads which
  permissions Google calls sensitive in the Cloud console, as `docs/google-verification.md` says.
- **Before launch, no date set:** the lawyer's written answer on payments (plan 15.22). It has to be recorded in
  `docs/decisions.md` before the first press takes real money.
- **Before the import stages can be built:** a real sample file from each shop builder (plan 17.5 and 17.6). No date
  yet. Nothing is built for those layouts until the files arrive.

## Stage by stage

- **Sign-up** (plan 6.2, built): Julian signs up once on the live sign-up page with his own Google account, and
  checks that the welcome email arrives. Nothing else is needed until the first press.
- **Your press** (plan 17.2): no real account is needed. Julian checks the name, contact email and address that go on
  receipts. Status: built, tested with pretend data.
- **Bring your shop** (plan 17.3 and 17.4): Julian exports a product file from one real old shop he uses, and imports
  it into the test shop (plan 15.7). This tests the import on real data. Status: built on pretend files; the real
  export is still to do.
- **Sample import** (plan 17.5 and 17.6): Julian gets a real sample file from each shop builder the importer should
  handle, with at least two photos given as web links. He needs his own login to each builder's admin to export them.
  Status: waiting for the files. Nothing is built for these layouts yet.
- **The look** (plan 17.8): no real account is needed. Julian looks at the chosen look on a phone and on a computer
  at the live site before the first press sees it. Status: built.
- **Google** (plan 17.9, 15.4, 15.5, 15.12): Google approves the sign-in screen (submission 1 December). Until then the
  step says Google is coming soon and the run carries on. Once it is approved, Julian connects his own Google account
  to the test shop and checks what was linked: search, shopping listings, visitor statistics and order email. Then,
  in Settings › Google, he switches Drive on and saves with Google, uses Try again on any part that didn't work, and
  disconnects at the end. With Drive on, he opens the stockroom's Settings › Google Sheet, presses **Make my sheet**, and
  checks the Stock, Sales and Expenses tabs in Drive. He voids a test sale, sends again, and checks that it is gone.
  Status: built behind the switch that is still off.
- **Pay what you use** (10 November 2026): Julian (or his accountant) checks the unit prices in
  `services/billing/runningCost.js` against Google's current price list for the region the shops run in, in CAD, and the
  email sender's price. Then, on the test shop with test-mode Stripe and a paid month behind it, he runs the
  `running-costs` job from the control room and checks the next bill in Stripe shows one "Running cost" line, not
  discounted by the founding offer, and that Settings › Billing shows the same amount. Status: built, tested with a
  pretend Stripe.
- **Get paid** (plan 17.10, 15.2, 15.10, 15.22): Stripe's platform profile is due 13 November. Then Julian connects
  the test shop to Stripe's test mode and buys one practice book, with no money moving. The lawyer's written answer
  (plan 15.22) comes before any real card is taken. Status: built on pretend Stripe states; the real connection is
  still to do.
- **Plan and billing in the admin** (plan 22.1-22.5): in Stripe's test mode on the platform account, Julian adds the
  events `invoice.paid` and `invoice.payment_action_required` to the billing events address, and leaves Stripe's own
  emailed receipts off (Stripe's settings, Customer emails, "Successful payments" and "Finalized invoices"): Colophon
  sends every press its own receipt for each paid bill (plan 25.1), and with Stripe's on too a press gets two. Do this
  test payment before the first real press pays. Then, in the test shop's Settings › Billing, he adds Stripe's test card,
  adds a second, makes it primary, removes the first, saves a GST/HST number, and checks the bill shows it and the
  founding 25% off. Stripe's "3D Secure required" test card checks the "Confirm the payment" step, and a test card that
  runs out next month shows the "card runs out" warning on Settings › Billing. Status: built on pretend Stripe; nothing
  real is connected.
- **The bill receipt** (plan 25.1, about 10 minutes, Stripe's test mode): put the test shop on a paid test plan and
  let its first bill be paid with Stripe's test card. Then check the inbox of the test shop's owner address:
  1. One "receipt" email arrives for the bill, and only one. A second one from Stripe means Stripe's own receipts are
     still on (see the step above): turn them off.
  2. The amount matches the bill in Stripe, and the tax line matches the bill's tax (GST/HST for the test shop's
     province). A press with a saved GST/HST number sees it on the bill.
  3. The month it covers is the right one, and both buttons open: the bill itself, and Settings › Billing.
  4. With the test shop's email language set to French (Settings › Billing), the next bill's receipt comes in French.
  Status: built and tested with pretend Stripe; nothing real has run yet.
- **Two-step sign-in in the shop admin** (plans 22.6, 22.9, 22.10, setup step 19). About 15 minutes, with your phone
  and an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password). Use the test shop only, never a
  paying press's shop. Status: built against pretend Google and Firebase; nothing real has run yet.
  1. Run the test shop's setup steps again (the deploy tool's "run setup" for the test shop). Step 19 should say
     "done". The first real run checks Google's answer to both of its calls. If it stops, send the message it shows.
  2. Sign in to the test shop's admin with Google. Open Settings › Security and press **Set up two-step sign-in**.
  3. Scan the picture with the authenticator app, type the 6-digit code it shows, and press **Turn on two-step
     sign-in**. The page should then show ten backup codes. Press **Download codes** and keep the file.
  4. Sign out, then sign in with Google again. The admin should ask for the code. Type a wrong one first (it should
     say so in plain words), then the right one.
  5. Sign out again. At the code step press **Lost your phone? Use a backup code** and type one code from the file.
     You should land on Settings › Security with a note that the app was taken off. Set it up again (step 3).
  6. Put the test shop on a paid test plan (Stripe's test mode), then change its plan in Settings › Plan. It should go
     through without sending you to the account page. Before you turn two-step on for this step, the admin home should
     show the "Turn on two-step sign-in" reminder.
  7. Check the shop's history (Settings › audit log) shows the backup codes being made and the backup code being used.
  8. After step 5, check your inbox: an email should say a backup code was used, with what to do if it wasn't you.
  9. Once the control room reaches the test shop's sign-in (the same access the support sign-in needs), open the test
     shop's drawer, press **Turn off two-step for someone**, type your address and how you checked it was you. Sign in
     again: Google alone should let you in, and Settings › Security should show two-step as off.
- **Shipping and your address** (plan 17.11): Julian confirms the shipping starter for Canada with his own prices and
  checks the web address shown on the shop. Nothing needs a carrier account for the starter. Status: built.
- **Your stockroom** (plan 17.12, setup step 16): the full test shop run (plan 15.7) turns the stockroom link on, and
  Julian checks that the stockroom opens with the press's books. Status: built; the real run is still to do.
- **Nudges** (plan 17.14): the trial emails for an unfinished start are sent from Colophon's real sender address
  (plan 15.8). Julian decides how the nudges sit with the setup tips that already go out on days 2, 4, 7, 21 and 60.
  Status: the rules are merged and not wired in until he decides.
- **Help** (plan 17.15): no real account is needed. Julian reads each stage's help answer once on a phone. Status:
  built.
- **Final check and open** (plan 17.13, 15.10): Julian runs one practice order in the test shop, then the first real
  order is watched from start to finish, with the steps to stop it written down (plan 15.10). Status: built;
  the real order is still to do.
- **The first-hour test** (plan 17.18, 3.6): five presses each spend an hour going through Get started. This needs the
  hosting (plan 15.6) and the real test shop (plan 15.7) first. Status: after Phase 15.

- **Social media channels** (plan 27.9): about an hour of forms per network, then a wait for each review. Julian
  makes Colophon's developer apps: a Meta app (Facebook Login for Business with Pages posting, Instagram posting and
  catalogs; Meta's app review and business verification), a Pinterest app (pins, boards and catalogs; Pinterest
  approves standard access) and a TikTok app (photo posting; TikTok's audit, and the shop addresses' site check so
  TikTok can fetch photos). The keys go in the social service's own settings (`services/social/README.md`). Then, on
  the test shop, Julian connects his own Facebook Page and Instagram account, Pinterest and TikTok from Sales channels,
  sends the products, posts one book now and schedules one for later, and checks each arrives once. Until TikTok's
  audit, its posts are visible only to the account itself. Status: built behind the switch that is still off.
  Ready to paste: every form's words, the permission uses and a 2-minute recording script are in
  `docs/social-approvals.md`.

## Legal (review of 3 November 2026)

The review is in the project files, `research/2026-11-03-legal-readiness.md`. It is not legal advice. Status: the code
side is built; these steps need Julian, a lawyer or an accountant.

- **Contact address (done 3 November 2026):** Julian chose his shop's Gmail address (`OPERATOR_EMAIL` in
  `terms/terms.js`) for privacy questions and reports about shops; the control room's privacy contact defaults to it.
  It must stay an inbox someone reads.
- **The lawyer reads the terms (Julian, before the first paid plan):** English and French, especially the liability
  cap, "made for businesses", closing a shop, the 72-hour breach promise and Ontario as the governing law for Quebec
  presses. Then `DRAFT = false` and a new `TERMS_VERSION`.
- **French (done 3 November 2026):** Julian accepted the French terms and the shops' French words as they are; no
  translator check.
- **The lawyer's other answers:** payments role (already plan 15.22); whether abandoned-bag reminder emails need the
  shopper's consent first (Canada's anti-spam law); a written privacy impact assessment for the US helper companies
  (Quebec's Law 25); a trademark search for "Colophon"; whether Colophon's own invoices to Quebec presses are French
  enough (Stripe writes them in French for those presses, and the plan's name is printed in both languages,
  "Shop and stockroom / Boutique et réserve").
- **French invoice in Stripe's test mode (Julian):** set a test press's email language to French on its Plan page,
  then open its invoice from Settings › Plan and check it reads in French.
- **Data agreements with the helpers (Julian, in each console):** accept Google Cloud's, Stripe's and Resend's
  standard data processing terms, and confirm Shippo's.
- **The accountant:** when Colophon registers for GST/HST, QST and BC PST (plan 15.9), and which US states tax a
  software plan.
- **Promised notices:** the terms promise 30 days' email notice before a price rise or a new helper company. The
  control room's Messages to presses form has "Is this a notice the terms promise?": it emails every press and refuses a date less than 30 days away. Julian uses it before changing a price or adding a helper.
