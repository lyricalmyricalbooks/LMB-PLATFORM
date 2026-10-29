# Next phase: which path for Phase 14

Researched and written 29 October 2026 for Julian. Builds on `docs/code-plan.md` (Phases 0 to 13), `docs/decisions.md`,
`docs/payments.md`, `docs/run-book.md`, `docs/name-and-domain.md`, `docs/accounting.md` and the 28 October research
(`docs/research/2026-10-28-next-build-plan.md`). Every outside fact below was read on the company's or government's own
page on 29 October 2026. Each page's own "last updated" date is given where it shows one.

Labels used below:

- **Fact [n]**: read on the source's own page on 29 October 2026 (sources at the end).
- **Code**: seen in this repo on 29 October 2026, with the file.
- **Inference**: my reading of facts or code. It could be wrong.
- **Recommendation**: what I suggest.

This is a plan, not legal or tax advice. The tax, privacy and terms items need your accountant or lawyer.

---

## 1. Short version (for Julian)

**Recommended path: "Make it real", in a thin slice.** Phase 14 moves Colophon from pretend services to one real test shop
on real Google and Stripe test accounts. It starts the slow outside approvals now, because they set the launch dates, not
the code. Demand work (talking to presses on the waitlist) runs alongside it. That work is yours, not code.

**Why this path:**

1. **The slow part is outside approvals and accounts, not building.** Google's review of Colophon's sign-in screen, the
   project allowance, Stripe's platform activation and a lawyer's read of the terms each take days to weeks. All of them
   need a **domain**, so the domain comes first.
2. **Some code built against pretend Google is already out of date with real Google.** The Google Shopping link calls a
   version of Google's service that was **switched off in May 2026** [F12]. The Google Ads link calls a version that is
   no longer listed [F15]. Pretend tests can't catch this. Only a real run does, so a real run should come soon.
3. **Some news is good.** Sending email from a press's own Gmail needs Google's ordinary review, **not** the yearly
   outside security review the plan assumed [F2, F3]. The full Google link has no permission that needs that costly review.
4. **One rule decides the order.** The shop maker creates each shop's Google project under its own robot account. Google
   only lets such an account create projects **inside an organization** [F8], and an organization needs a domain with
   Google Workspace or Cloud Identity [F9]. So: domain, then organization, then a real shop.

**What only you can do, and by when** (these protect the 13 November "accounts" date and the December first press):

| By | You do | Why it can't wait |
| --- | --- | --- |
| 5 Nov | **Buy the domain** (`node waitlist/domain-check.js` on your computer, then a registrar). | Everything below needs it: Google's organization, the sign-in review, Merchant Center, email sending, the privacy page. |
| 7 Nov | **Turn on Google Workspace or the free Cloud Identity on that domain.** That gives Colophon a Google "organization". Make one "shops" folder in it and one billing account. | Without an organization, the shop maker can't create a single real shop [F8]. |
| 7 Nov | **Ask Google for more projects** on that billing account and organization (start with 50; asking for more than 50 means extra review) [F6, F7]. | Every shop is one project. A deleted project still counts for 30 days [F10]. Google says it usually answers within 2 business days [F6]. |
| 13 Nov | **Finish Stripe's platform set-up**: business details, platform profile, brand [F17]. | Needed before any live charge, including the December press. |
| 13 Nov | **A mailing address for Colophon** (a PO box is fine), and ask your accountant whether to **register for GST/HST now** or wait for the $30,000 line [F20]. | Canadian anti-spam law asks for a mailing address in marketing emails [F22]. Tax registration changes how prices read on the plan page. |
| 20 Nov | **Send the terms and privacy policy to a lawyer** (`terms/terms.js` is marked DRAFT). | Google's review needs a public privacy policy on your domain [F4]. Paying presses need final terms (step D). |
| 1 Dec | **Submit the Google sign-in screen for review**, once the privacy page is live on the domain. | Allow 1 to 3 weeks with questions back and forth [F4, F5]. Until it is approved, every press sees a "Google hasn't verified this app" warning (inference), and only 100 people can ever connect [F5]. |
| Nov | **Talk to five to ten presses on the waitlist** about the December first press. | Proves someone will pay before step D's work. |
| Nov | **Decide Quebec at launch: yes or not yet.** | Quebec presses need the terms in French first and a few privacy steps (section 4.6). |

**Dates at risk:** 13 Nov (A) holds only if the domain and organization are done in the first week. December (C) holds,
since the first press runs on their own Stripe. End of January (D) depends on the lawyer and the Google review. 8 March
(F) is safe if the review is submitted by early December. Quebec presses on day one would add French terms to F.

---

## 2. The paths

Four paths came out of the evidence. They are not exclusive. The question is which one leads Phase 14.

### Path 1: Make it real (recommended to lead)

From pretend services to one real test shop, then a first press by hand, following the go-live outline (A to F).

- **Pros.** It finds the problems pretend services hide. Two were found today: a switched-off Google Shopping version and
  an old Google Ads version (section 4.3). It is the only path that leads to money by December. Most of its outside
  waits (domain, organization, quota, Stripe activation) are short if started now.
- **Cons.** It needs your accounts and decisions first. The code can't move past the dry run until the organization
  exists. It spends small real money (domain, Workspace seat if chosen, Google usage on the test shop).
- **Blockers.** Domain, then organization [F8, F9]. Project allowance [F6]. Stripe platform activation [F17].
- **Effort.** Medium for code (about 8 to 10 pull requests). The owner steps are about one day of your time spread over
  November.

### Path 2: The Google auto-connect, for real

Turn on "Connect Google" (Analytics, Search Console, Google Shopping, email from Gmail, the extras) against real Google.

- **Pros.** It is the promise that sets Colophon apart ("all in on Google"). It is cheaper than feared: no permission it
  asks for needs Google's yearly outside security review. Gmail sending is "sensitive", not "restricted" [F2]. Drive is
  only the narrow "files this app made" permission, which is not even sensitive [F14].
- **Cons.** It can't start alone. It needs Path 1's domain, a live privacy page and a working platform. It also needs
  fixes first: Google Shopping on the switched-off version [F12], Google Ads on an old version [F15], and Colophon's own
  Merchant Center account registered with Google [F13]. Business Profile and Ads each need their own access request from
  Google (inference).
- **Blockers.** Google's review of brand and sensitive permissions: 3 to 5 business days on one Google page, "10
  business days" on another [F4, F5]. The 100-person lifetime cap before approval [F5].
- **Effort.** Medium: version fixes and a readiness check (quick to medium), then the review (weeks of waiting, a few
  hours of your time including a short screen recording).
- **Recommendation.** Don't lead with it. Fold its **long-lead items** into Phase 14 (version fixes, the permission
  list and its reasons, Merchant Center registration, the review submission) so it is ready for D and F.

### Path 3: Prove demand and first customers

Find the first paying presses before more building.

- **Pros.** There is little proof yet that presses will pay $29 to $39 a month. Phases 0 to 13 built a great deal on
  that bet. A short round of calls is cheap and could change the order of everything else.
- **Cons.** Without a real shop to show, calls rest on the waitlist page and the local demo. A press can't actually start.
- **Blockers.** None outside. It is your time.
- **Effort.** Owner time, about two weeks of calls. Little code: perhaps a "book a call" link on the waitlist and a
  design-partner discount code in billing.
- **Recommendation.** Run it **alongside** Path 1, by you, during November. It should feed the December first-press
  choice.

### Path 4: The paper path (compliance and owner foundations)

Tax registration, anti-spam wording, privacy officer, terms in French, the lawyer.

- **Pros.** Several items have long or fixed lead times (lawyer, French translation) and gate step D or F.
- **Cons.** It is mostly not code. A phase of only this would stall building.
- **Blockers.** Accountant and lawyer availability.
- **Effort.** Code is quick (email footer, consent wording, plan page tax line). Owner and professional time is medium.
- **Recommendation.** Fold the code parts into Phase 14 (rows 14.8 and 14.9). The rest goes on your list in section 1.

---

## 3. What the code asks Google for today

**Code** (`google/endpoints.js`, `SCOPES`). The base sign-in asks for `openid`, `email`, Analytics (`analytics.edit`,
`analytics.manage.users`), Search Console (`webmasters`, `siteverification`) and Google Shopping (`content`). Gmail
sending (`gmail.send`) is added only when `GOOGLE_GMAIL_SENDING` is on. The extras, each a tick box, are `drive.file`,
`youtube.readonly`, `calendar.app.created`, `business.manage` (only when switched on) and `adwords` (only with a
developer token).

**Code** (`setup/README.md`, `setup/real.js`). Projects are **not** made with the press's sign-in. The shop maker's own
account creates each project in a "shops" folder, links Colophon's billing account and owns the project. So the
press's sign-in never asks for Google Cloud or Firebase permissions. That is good: those would need the broad
`cloud-platform` permission ("See, edit, configure, and delete your Google Cloud data") [F1].

**Code** (`signup/`). Sign-up uses Firebase's own Google sign-in for identity only.

| Permission | Google's class | Source | Outside security review? |
| --- | --- | --- | --- |
| `openid`, `email` | not sensitive | inference (sign-in basics) | no |
| `gmail.send` | **sensitive** | Fact [F2] | **no** (only restricted permissions need it [F3]) |
| `drive.file` | not sensitive | Fact [F14] | no |
| `analytics.edit`, `analytics.manage.users`, `webmasters`, `siteverification`, `content`, `youtube.readonly`, `adwords`, `business.manage` | not published on the pages read. Google shows each permission's class in the Cloud console when it is added [F1] | **cannot establish here** | inference: none are on Google's restricted lists for Gmail or Drive [F2, F14]. Expect "sensitive" for most |
| `calendar.app.created` | not stated on Google's Calendar page [F16] | cannot establish | inference: no |

**Inference.** The whole sign-in needs Google's **brand check** plus **sensitive-permission review**, and nothing more.
The plan's wording in rows 6.18 and 6.20 and in `google/config.js` ("Google's yearly security review" for Gmail
sending) is wrong. Gmail sending can go in the same review as the rest.

---

## 4. Findings

### 4.1 Google's review of Colophon's sign-in screen

- **Fact [F3]** (page updated 19 Aug 2026): restricted permissions need a security assessment by a Google-approved
  assessor (CASA), repeated every 12 months, and "can potentially take several weeks".
- **Fact [F2]** (updated 10 Sep 2026): `gmail.send` is **sensitive**. Read, compose, modify and full access are restricted.
- **Fact [F4]** (updated 19 Aug 2026): sensitive-permission review needs a public home page that describes the app, a
  privacy policy **on the same domain** linked from the sign-in screen, the domain verified in Search Console by a project
  owner, a reason for each permission (and why a narrower one won't do), and an unlisted YouTube video showing the
  sign-in, the client id in the address bar and each permission in use. It "typically takes 3–5 business days". Brand
  checks usually finish in minutes.
- **Fact [F5]** (Google Cloud help FAQ): "unverified apps that are accessing restricted or sensitive scopes have a 100
  new-user cap". The cap "applies over the entire lifetime of the project, and it cannot be reset". It gives estimates of
  "10 Business days" for sensitive and "6 weeks" for restricted review.
- **Blocks or reshapes?** It **reshapes** Path 2: no costly yearly assessment, so Gmail sending can ship at launch.
  It **blocks** turning Connect Google on for presses until approval, because of the warning screen and the cap.
- **Threatens.** D (end Jan) and F (8 Mar) only if submission slips past early January. The review can't start without
  the domain and the privacy page.
- **Recommendation.** Keep test sign-ins on a **separate** Google project from the one that will be reviewed. Testing
  then never spends the 100-person lifetime cap of the real one (inference from [F5]: the cap is per project).

### 4.2 Making a Google project for each shop

- **Fact [F8]** (Resource Manager, updated 26 Oct 2026): "Service accounts are not allowed to create projects outside
  of an organization resource". The Project Creator role is given by default to a new organization's whole domain.
- **Fact [F9]** (updated 26 Oct 2026): an organization comes with Google Workspace or Cloud Identity tied to a domain.
  The page also mentions "standalone organizations" for plain Google accounts but gives no detail.
- **Fact [F10]** (updated 26 Oct 2026): every user or service account has a project limit. Inside an organization both
  the account's and the organization's limit are checked. Soft-deleted projects still count until they are removed after
  30 days. Folder creation is limited to 6 per minute, and a folder holds at most 300 folders.
- **Fact [F6]** (Google Cloud help): there is no published number. Limits depend on "usage history" and past abuse.
  Organizations ask on the Quotas page with a number and a reason. Google usually answers "within 2 business days". A
  request without an organization may need a **payment**, kept as a credit.
- **Fact [F7]** (billing-quota form): a separate request raises the "project quota associated with your Billing
  Account". Requests over 50 projects "might require additional review".
- **Fact [F11]** (Firebase, updated 21 Oct 2026): without billing, project creation is "usually around 5-10" projects.
  It "may increase with the linking of a Cloud Billing account in good standing". Firebase's limits are the same as
  Google Cloud's. At most 30 apps and 36 Hosting sites per project.
- **Fact [F18]** (Google Cloud terms): Colophon (the "Customer") may build Google services into "any Customer
  Application that has material value independent of the Services", must not "resell, sublicense … any or all of the
  Services", and answers for its End Users' use (sections 1.1, 3.1, 3.3).
- **Inference.** The design (Colophon owns each project and bills presses for a shop, not for raw Google) fits the terms.
  Selling bare Firebase projects would not. No Google page read says one-project-per-customer is discouraged, but the
  allowance is granted case by case. **Growth past about 50 shops is an ask, not a right.**
- **Blocks or reshapes?** **Blocks** B (November) until the organization exists. **Reshapes** F: the allowance must be
  raised ahead of launch-day sign-ups, and the daily sign-up cap (`signup/dailyCap`) should follow what is left of it.
- **Recommendation.** Ask for 50 now and more after the first ten shops. Never delete test projects casually: deletions
  count for 30 days.

### 4.3 Google Shopping (Merchant Center): wrong version in the code

- **Fact [F12]** (Merchant API updates, updated 28 Oct 2026): v1 has been generally available since July 2025. **v1beta
  was discontinued in May 2026**, and its reference pages were removed in October 2026. The old Content API for Shopping
  reached sunset on **18 August 2026**, with errors from 1 September 2026 [F12b].
- **Code** (`google/googleApi.js` lines 106 to 121): every Merchant call uses `/accounts/v1beta/…` and
  `/datasources/v1beta/…`. **These calls would fail on real Google today.** The code uses the newer Merchant API, not
  the Content API. Only the version is wrong.
- **Fact [F13]** (updated 26 Oct 2026): calling the Merchant API requires a **one-time developer registration**
  (`registerGcp`) linking Colophon's Google project to a **production Merchant Center account with a verified home page**.
  Unregistered projects get `401`. A third party managing many merchants registers only its own main account. The
  3P service-provider guide [F13b] (updated 24 Sep 2026) describes Colophon's own provider account and registration.
- **Code**: there is no `registerGcp` anywhere in `google/`.
- **Blocks or reshapes?** **Blocks** the Google Shopping part of Connect Google until it is fixed. A quick fix.
- **Same problem, Google Ads.** **Code** (`google/endpoints.js`): `googleads.googleapis.com/v18`. **Fact [F15]**: Google's
  version list now runs from v23 to v26. Inference: v18 is retired. Ads is an extra that is off by default.

### 4.4 Stripe for a Canadian platform

- **Fact [F16a]** (Stripe docs, 29 Oct 2026): the account types (Standard, Express, Custom) are now **"legacy"**. New
  platforms should use **Accounts v2**, or **v1 with controller properties**. With direct charges, the connected account
  carries the fees, refunds and disputes. Express and Custom are available in Canada.
- **Code** (`services/payments/service.js` line 161 onwards): accounts are already made with controller settings that
  match Standard, not the deprecated `type`. Good. This agrees with `docs/decisions.md` (28 Oct).
- **Fact [F16b]**: Stripe's SaaS guide recommends Accounts v2 so one press account can both take payments and pay
  Colophon's subscription (no separate "Customer"). Accounts v2 can't be used for OAuth connections to existing Stripe
  accounts.
- **Inference.** Stay on v1 with controller settings for launch. Presses who already have Stripe connect over OAuth, which
  v2 doesn't support. Moving billing to v2 is a later tidy-up, not a blocker.
- **Fact [F17]** (Stripe SaaS guide and go-live checklist): before live, register the platform, verify business
  details, **complete the platform profile**, set branding, **set the API version**, register live event addresses
  and use https return addresses.
- **Code** (`services/payments/stripeApi.js` lines 65 to 68): requests send no `Stripe-Version`. So live calls follow
  whatever version the Stripe account defaults to (inference). **Pin it before the first live charge.**
- **Fact [F19]** (Stripe pricing, Canada page): Billing pay-as-you-go is **0.7% of billing volume**. Cards are 2.9% +
  CA$0.30. Connect costs the platform **nothing** when Stripe bills connected accounts for their own payment fees, which
  is the direct-charge set-up.
- **Blocks or reshapes?** **Blocks** C and D only on your activation steps and the version pin. No Canadian rule against
  the design was found.

### 4.5 Sales tax on Colophon's own plan (GST/HST)

- **Fact [F20]** (CRA guide RC4022, modified 7 Jan 2026): the small-supplier line is **$30,000** of worldwide taxable
  sales, in **one calendar quarter or over the last four** quarters. Cross it in one quarter and you register from that
  sale, within 29 days. You may register **voluntarily** earlier, then claim input tax credits on what you buy (for
  example Google and Stripe fees).
- **Inference.** At $29 to $39 a month, Colophon stays under $30,000 until about 65 to 85 paying shops, but associated
  businesses' sales count too (does Lyricalmyrical count? ask your accountant). HST is charged at the **press's** province
  rate under the place-of-supply rules. That part of the guide wasn't fully read.
- **Reshapes** D: the plan page and invoices must say "plus GST/HST" (or include it) from the first live charge.

### 4.6 Anti-spam (CASL), privacy (PIPEDA) and Quebec

- **Fact [F22]** (CASL s. 6(6), current to 30 Sep 2026): messages that **only** confirm a transaction, give factual
  information about an ongoing subscription or account, or deliver a service the person is owed don't need consent.
  They still need sender identification and, for commercial ones, an unsubscribe.
- **Fact [F21]** (CRTC): implied consent from a purchase lasts **2 years**, from an inquiry or application **6 months**.
  Express consent is an opt-in. Every commercial message needs identification and an unsubscribe, honoured within
  **10 business days**.
- **Code.** Trial tips have a signed "turn tips off" link (`services/trial-tips/README.md`). That is good. The waitlist
  says "We'll only email you about the launch" but doesn't say who is asking or that people can withdraw.
  `services/email/templates.js` has **no mailing address** for Colophon.
- **Inference.** The launch email to the waitlist is a commercial message under express consent. It needs Colophon's name,
  **mailing address** and an unsubscribe. Trial tips are arguably factual account information (6(6)(d)) but should carry
  the same footer.
- **Fact [F23]** (OPC, modified 11 Aug 2025): report a breach to the federal privacy office when there's "real risk of
  significant harm", and **keep a record of every breach for 24 months**.
- **Fact [F24]** (Quebec's privacy commission, Law 25): the person in charge of personal information is the highest
  authority unless delegated in writing, and their title and contact go on the website. Keep an incident register.
  **Do a privacy impact assessment before sending personal information outside Quebec** (in force Sept 2023). Publish a
  plain-language privacy policy. Use the highest privacy settings by default. Provide data portability (from 22 Sep 2024).
- **Fact [F25]** (OQLF, updated 29 Sep 2026): since 1 June 2023 an adhesion contract (Colophon's terms) must be given
  **in French first** to a Quebec business. Online, that is met if the French terms are available. Contracts with parties
  outside Quebec are exempt.
- **Inference.** The shops and the platform sit in Montréal (`northamerica-northeast1`), which helps. But Stripe and the
  email sender (Resend) handle data outside Quebec, so a short impact assessment is needed before signing Quebec presses.
- **Reshapes** F if Quebec presses are wanted at launch: French terms and a privacy contact. Doesn't block C or D for a
  press outside Quebec.

---

## 5. Where sources disagree

- **How long Google's sensitive review takes.** The developer page says 3 to 5 business days [F4]. The help FAQ says 10
  business days [F5]. Plan for the longer one plus a week for questions back and forth.
- **Gmail sending's review.** The repo (`google/config.js`, code-plan rows 6.18 and 6.20) says it needs Google's yearly
  security review. Google classes `gmail.send` as sensitive [F2], and only restricted permissions need the yearly
  assessment [F3]. Trust Google's pages.
- **Merchant Center.** The repo's endpoint note cites the Merchant API reference generally, while the code calls v1beta.
  Google discontinued v1beta in May 2026 [F12].
- **Stripe account words.** `docs/decisions.md` says "Standard account". Stripe now calls that a legacy type [F16a]. The
  code already uses the replacement settings, so this is wording only.
- **How many projects you can make.** Firebase says "usually around 5-10" without billing [F11]. Google Cloud publishes
  no number [F6, F10]. Your real figure shows on the New Project page when fewer than 30 remain [F10].

## 6. What the evidence can't establish

- The exact class of `analytics.edit`, `analytics.manage.users`, `webmasters`, `siteverification`, `content`,
  `youtube.readonly`, `adwords`, `business.manage` and `calendar.app.created`. Google shows these only in the Cloud
  console when the permission is added [F1]. Check them there when the sign-in screen is set up.
- Your account's actual project allowance and how much Google will raise it.
- Whether Business Profile and Google Ads access requests will be granted, and how long they take (not researched today).
- How long each registrar takes to accept Colophon's Domain Connect template (plan 6.15). Not researched today.
- Demand: how many people are on the waitlist and whether any will pay. Nothing in the repo records it.
- Stripe Tax's price and whether it registers Colophon in each province. Not read today.
- Whether Lyricalmyrical's sales count towards Colophon's $30,000 line (an accountant question).
- Whether Google's "standalone organization" for a plain Google account [F9] would let the shop maker create projects
  without Workspace or Cloud Identity. The page gives no detail. Don't count on it.

## 7. Open questions that could change the recommendation

1. **Do waitlist presses say yes to $29 to $39?** If calls in November find no payer, Path 3 should lead and Phase 14
   should shrink to the version fixes.
2. **Workspace or free Cloud Identity?** Workspace also gives `you@domain` mail. Cloud Identity Free is enough for the
   organization (inference). Your choice.
3. **Quebec at launch?** Yes adds French terms and an impact assessment to F.
4. **Is the December press on its own Stripe keys (as the outline says) or on Connect in test-then-live?** On its own keys,
   C doesn't wait on Stripe's platform review.
5. **Register for GST/HST now?** It changes how prices read, not the code shape.
6. **Should Connect Google be part of sign-up itself** (one Google sign-in creates the shop and connects everything), as
   the owner principle says? Today it is a button in the shop admin after sign-up. Moving it to sign-up means a press can
   meet the Google review warning on their very first screen, so only do it after approval.

---

## 8. Proposed Phase 14: make it real (thin slice)

Built in this order, one pull request each. Rows 14.1 to 14.4 need no account and can start at once. From 14.5 on, rows
need your domain, organization and Stripe activation (section 1). Nothing here changes `LyricalmyricalWebsite` or
`lyrical-inventory`, and no test touches live money or a paying press's project.

| # | Repo | Pull request | Proven by | Effort |
| --- | --- | --- | --- | --- |
| 14.1 | platform | **Bring the Google link up to today's Google.** Merchant calls move from v1beta to v1 (accounts, data sources, free listings). Google Ads moves from v18 to a currently listed version. `endpoints.js` records the date each version was checked. A test refuses any version on a known-retired list. Why: the Google Shopping part would fail on real Google today [F12, F15] | google tests with the pretend Google on the new paths; the retired-version test fails on a planted `v1beta` Merchant path | quick |
| 14.2 | platform | **Pin Stripe's API version** on every Stripe call (payments, billing, Square untouched) and on the event addresses. One setting with a tested default. Why: Stripe's go-live list asks for it, and an unpinned live account can change shape under the shops [F17] | payments and billing tests: every request carries the pinned version; a wrong setting is refused at start | quick |
| 14.3 | platform | **The permission list Google will review.** `docs/google-verification.md` gives each permission, why it is needed and why a narrower one won't do, plus the screen-recording script [F4]. A test keeps `SCOPES` and the document in step and fails on any restricted permission (full Gmail, full Drive). Fix the "yearly security review" wording in `google/config.js` and the plan rows to "Google's review of sensitive permissions" [F2, F3] | test fails when a permission is added without a reason or a restricted one appears | quick |
| 14.4 | platform | **The "is Google ready" self-check.** Before `GOOGLE_CONNECT_ENABLED` can be true, the control room shows what is missing: sign-in screen approved, Merchant Center developer registration done [F13], versions checked within 90 days, separate test project for test sign-ins [F5]. Adds the one-time `registerGcp` call as a platform set-up step | self-check tests with fakes: each missing item listed in plain words; switching on refused until all pass | medium |
| 14.5 | platform | **Real Google Cloud client for shop-maker steps 1 to 6** (create project in the shops folder, link billing, add Firebase, turn on services, database and storage in Montréal, web app), with allowance-aware errors. "Project allowance reached" becomes a waiting state in the control room and the repair queue, not a retry loop. The sign-up daily cap reads the allowance left. *Needs Julian's organization, folder and billing account* [F8, F10] | tests with recorded Google answers (including the allowance error); dry run against the real folder lists only and changes nothing | medium |
| 14.6 | platform | **Host the platform services** in `lmb-platform-prod`: payments, email, billing, Google link, sign-up's `/api`, trial tips, health and status as functions, secrets in Secret Manager, one deploy workflow, alerts to `HEALTH_ALERT_TO`. All Stripe in test mode | emulator suite; after deploy, a smoke check that each door answers and refuses a call without a shop key | larger |
| 14.7 | platform | **Make the real test shop** (`lmb-test-shop`) with the real shop maker, then run the release check's practice purchase on Stripe's sandbox through the payment service. Record what broke on the way in the run book | release check green against the real test shop; re-running setup changes nothing | medium |
| 14.8 | platform | **Anti-spam basics.** Every platform email ends with Colophon's name, mailing address (`PLATFORM_MAILING_ADDRESS`, refused when empty for marketing emails) and a contact. The waitlist sign-up words say who is asking, what for and that people can stop at any time. The launch email has a working unsubscribe honoured at once [F21, F22] | email template test: every template has the footer; marketing ones have a signed unsubscribe; waitlist page test reads the consent words | quick |
| 14.9 | platform | **Tax on Colophon's plan.** The plan page and invoices read "plus GST/HST". The rate follows the press's province once Colophon is registered (`PLATFORM_GST_NUMBER` set). Before that, no tax line and no number. Invoices show the number [F20] | billing tests with fakes per province: ON 13%, NS 14%, AB 5%; no tax when unregistered | medium |
| 14.10 | platform | **First press by hand (step C).** A run-book chapter and a control-room checklist to open one press's shop with the real shop maker on **their own Stripe**, with the practice order, the first live order watched, and how to stop it. Records every step in the shop's audit log | run-book test: every button it names exists in the control room; checklist test with fakes | medium |
| 14.11 | platform | **Privacy contact and breach record.** The terms page names the person in charge of personal information and how to reach them [F24]. The control room keeps a breach record kept for 24 months [F23], with a "report needed?" question. *Quebec only if Julian says yes:* a sign-up province question that holds Quebec presses on the waitlist until French terms exist [F25] | terms page test finds the contact; breach record tests with fakes (kept 24 months, never deleted early) | medium |

**Next after these, if wanted:** submit Google's review once 14.3, 14.4 and the privacy page are live. Then turn on
Connect Google for the test shop (inside the 100-person cap), the Stripe Connect live switch for step D, and a
design-partner discount code if the waitlist calls want one.

---

## 9. Sources (all read 29 October 2026)

Google

- [F1] OAuth 2.0 Scopes for Google APIs: https://developers.google.com/identity/protocols/oauth2/scopes
- [F2] Gmail API scopes (updated 2026-09-10): https://developers.google.com/workspace/gmail/api/auth/scopes
- [F3] Restricted scope verification (updated 2026-08-19): https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- [F4] Sensitive scope verification (updated 2026-08-19): https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- [F5] OAuth app verification FAQ: https://support.google.com/cloud/answer/13463817
- [F6] Project quota requests: https://support.google.com/cloud/answer/6330231
- [F7] Billing quota increase form: https://support.google.com/code/contact/billing_quota_increase
- [F8] Create projects (updated 2026-10-26): https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects
- [F9] Creating and managing organizations (updated 2026-10-26): https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization
- [F10] Resource Manager quotas and limits (updated 2026-10-26): https://docs.cloud.google.com/resource-manager/docs/limits
- [F11] Understand Firebase projects (updated 2026-10-21): https://firebase.google.com/docs/projects/learn-more
- [F12] Merchant API latest updates (updated 2026-10-28): https://developers.google.com/merchant/api/latest-updates
- [F12b] Content API for Shopping deprecation and sunset (updated 2026-09-10): https://developers.google.com/shopping-content/guides/deprecation-and-sunset
- [F13] Merchant API: Register as a developer (updated 2026-10-26): https://developers.google.com/merchant/api/guides/quickstart/registration
- [F13b] Merchant Center service providers: account setup (updated 2026-09-24): https://developers.google.com/merchant/3p/quickstart
- [F14] Drive API scopes (updated 2026-09-03): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- [F15] Google Ads API deprecation and sunset (version list v23 to v26): https://developers.google.com/google-ads/api/docs/sunset-dates
- [F16] Calendar API scopes (updated 2026-09-03): https://developers.google.com/workspace/calendar/api/auth
- Also read: Analytics Admin API changelog (v1beta still supported; access bindings only in v1alpha; latest entry 2026-06-18): https://developers.google.com/analytics/devguides/config/admin/v1/changelog
- [F18] Google Cloud Platform Terms of Service, sections 1.1, 3.1, 3.3: https://cloud.google.com/terms

Stripe

- [F16a] Connected account types (legacy): https://docs.stripe.com/connect/accounts
- [F16b] SaaS platforms with Accounts v2: https://docs.stripe.com/connect/accounts-v2/saas-platform-payments-billing
- [F17] Build a SaaS platform (prerequisites): https://docs.stripe.com/connect/end-to-end-saas-platform.md?platform=web ; Go-live checklist: https://docs.stripe.com/get-started/checklist/go-live
- [F19] Stripe Billing pricing, Canada: https://stripe.com/en-ca/billing/pricing ; Connect pricing: https://stripe.com/connect/pricing

Canada and Quebec

- [F20] CRA RC4022, General Information for GST/HST Registrants (modified 2026-01-07): https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html
- [F21] CRTC, CASL guidance on implied consent: https://crtc.gc.ca/eng/com500/guide.htm
- [F22] Canada's Anti-Spam Legislation, S.C. 2010, c. 23, s. 6(6) (current to 2026-09-30): https://laws-lois.justice.gc.ca/eng/acts/E-1.6/page-1.html
- [F23] OPC, What you need to know about mandatory reporting of breaches (modified 2025-08-11): https://www.priv.gc.ca/en/privacy-topics/business-privacy/breaches-and-safeguards/privacy-breaches-at-your-business/gd_pb_201810/
- [F24] Commission d'accès à l'information, main changes under Law 25: https://www.cai.gouv.qc.ca/protection-renseignements-personnels/sujets-et-domaines-dinteret/principaux-changements-loi-25
- [F25] OQLF, Contrats d'adhésion (updated 2026-09-29): https://www.oqlf.gouv.qc.ca/francisation/entreprises/contrats-adhesion.html
