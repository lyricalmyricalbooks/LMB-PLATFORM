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
  to the test shop and checks what was linked: search, shopping listings, visitor statistics and order email. Status:
  built behind the switch that is still off.
- **Get paid** (plan 17.10, 15.2, 15.10, 15.22): Stripe's platform profile is due 13 November. Then Julian connects
  the test shop to Stripe's test mode and buys one practice book, with no money moving. The lawyer's written answer
  (plan 15.22) comes before any real card is taken. Status: built on pretend Stripe states; the real connection is
  still to do.
- **Plan and billing in the admin** (plan 22.1-22.5): in Stripe's test mode on the platform account, Julian adds the
  events `invoice.paid` and `invoice.payment_action_required` to the billing events address, and turns on Stripe's
  emailed receipts (Stripe's settings, Customer emails, "Successful payments" and "Finalized invoices"), so every press
  gets its bill by email for its bookkeeper. Do this test payment before the first real press pays. Then, in the test shop's Settings › Billing, he adds Stripe's test card,
  adds a second, makes it primary, removes the first, saves a GST/HST number, and checks the bill shows it and the
  founding 25% off. Stripe's "3D Secure required" test card checks the "Confirm the payment" step, and a test card that
  runs out next month shows the "card runs out" warning on Settings › Billing. Status: built on pretend Stripe; nothing
  real is connected.
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
