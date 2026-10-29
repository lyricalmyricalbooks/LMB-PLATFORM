# The demo shop on your own computer

The demo shop is the platform's test shop running on your own computer. It has the shop, its admin, Studio and the
stockroom, filled with the test shop's starter books. Click through it, change things and break things. Nothing
reaches a real shop, a real Google account or a bank.

It runs on Google's **Firebase emulators**: practice copies of the database, sign-in and file storage that live only on
your computer. The shop is a made-up project called `demo-colophon-test`. The emulators never contact Google for
it.

## What to install (once)

1. **Node.js 22 or newer** from [nodejs.org](https://nodejs.org) (the "LTS" button is fine).
2. **Java 21 or newer.** The emulators run on it. A free one: **Temurin 21** from [adoptium.net](https://adoptium.net).
   During the install, tick "Set JAVA_HOME" and "Add to PATH".
3. **Git**, to download this repository. Then, in a terminal:

   ```
   git clone https://github.com/lyricalmyricalbooks/LMB-PLATFORM.git
   ```

To check Java, open a new terminal and type `java -version`. It should say 21 or higher. If the demo can't find Java,
it says so and stops.

## Start it

Open a terminal in the `LMB-PLATFORM` folder. On Windows, that's PowerShell or Command Prompt: open the folder in File
Explorer, click the address bar, type `cmd` and press Enter. Then run:

```
npm run demo
```

The same command works on Windows, Mac and Linux. The first run takes a few minutes: it installs the apps' parts and
downloads the emulators. Later runs take about a minute.

When it's ready, it prints the addresses to open:

| What | Address |
| --- | --- |
| The shop | http://127.0.0.1:5173/ |
| A book page | http://127.0.0.1:5173/books/low-tide-almanac |
| A shirt in sizes | http://127.0.0.1:5173/books/night-buses-t-shirt |
| The admin | http://127.0.0.1:5173/admin |
| Studio (the theme editor) | http://127.0.0.1:5173/admin#designer |
| The stockroom | http://127.0.0.1:5174/ |
| The practice inbox (every email the shop sends) | http://127.0.0.1:5175/inbox |
| The emulators' control panel (see and edit the raw data) | http://127.0.0.1:4000/ |

## Sign in

In the admin or the stockroom, click **Sign in with Google**. A practice sign-in window opens. Pick
**owner@example.com (Demo Owner)**. If the list is empty, click "Add new account" and type `owner@example.com`. There
is no password, and no real Google account is used. The demo owner is the shop's owner, so every admin screen and the
stockroom open.

## What's in it

- **Moth Press**, a made-up press, with eleven products and their pictures: photobooks, zines and poetry, one on sale,
  one sold out, a pre-order and an e-book, and merch (a tote bag in two colours, a T-shirt in sizes S to XL and two
  colours, a print in two sizes and an enamel pin).
- Reviews (one waiting to be approved), the discount code **WELCOME10** (10% off), and shipping for Canada ($5, plus $1
  for each extra item) and everywhere else ($15, plus $3).
- Five orders, placed and paid the way a shopper's are: one shipped, one waiting to be sent, one refunded, one where
  the shopper asks to cancel, and one delivered where the shopper asks to return a T-shirt that's too big. Their emails
  are in the practice inbox. Returns are switched on for 30 days (Settings › Shipping › Returns); a new press starts
  with them off.
- The printed books in the stockroom, with their copies on hand. The platform's three test books are there too; in the
  shop they are drafts, so shoppers don't see them.

## Stop it

Press **Ctrl+C** in the terminal. If Windows asks "Terminate batch job (Y/N)?", type `Y` and press Enter. The demo saves
the shop's and the stockroom's data on the way out, so your changes are still there next time.

To start over from the sample press (and an empty practice inbox), run `npm run demo -- --fresh`. A demo saved before
29 October 2026 has only the test books: run it once with `--fresh` to get Moth Press and its orders.

## See it as a brand-new press

A press that has just signed up opens its admin on **Choose your look** (pick a look for the shop), and then **Set up
your shop** (the list of first steps). To see the demo shop that way, run:

```
npm run demo -- --new-press
```

It sets the demo shop up as if its owner had just answered the sign-up questions ("just starting out", publishing
books), with no look chosen and no step ticked. Open the admin and sign in as the demo owner. Add `--new-press` again
whenever you want to go through it from the start; without it, the demo keeps what you did. To also forget the books
and everything else, use both: `npm run demo -- --fresh --new-press`.

## What doesn't work on your computer

- **Paying is practice.** Checkout is the real one, but the card form talks to a practice card service on your
  computer instead of Stripe. Pay with **4242 4242 4242 4242** (any future date, any three digits); **4000 0000 0000
  0002** is always declined. The order is marked paid by the shop's own code, exactly as a real payment would, and
  refunds work. No money moves, and PayPal and Square can't be tried.
- **Emails go to the practice inbox**, http://127.0.0.1:5175/inbox, not to anyone's mailbox. They are the shop's real
  emails: the order confirmation, your new-order alert, shipping, refunds, cancel and return requests. Their links open
  this computer's shop (http://127.0.0.1:5173), not a real address: on the practice computer only, the functions read
  `DEMO_SHOP_URL` and take it only when it is a `http://127.0.0.1:<port>` address.
- **Files to try the importers with** are at http://127.0.0.1:5175/samples/new-products.csv (a plain product
  spreadsheet), /samples/old-shop-products.csv (an export from an old shop: a hoodie in sizes and colours) and
  /samples/old-shop-customers.csv (a customer list). They carry no photos: add those in the product editor.
- Shipping labels and live carrier rates can't be bought.
- **Stay online.** The practice sign-in window and the stockroom load a few files from the internet. Your shop's data
  never leaves your computer.
- If the shop's server code can't start, the demo runs without it and says so. Then shipping prices, order tools and
  the Team list don't work either. `npm run demo -- --no-functions` does the same on purpose.

## If something goes wrong

- **"The Firebase emulators are already running"**: another demo window is still open. Stop it with Ctrl+C first.
- **A port is taken** (5173, 5174, 5175, 4000, 8080, 9000, 9099, 9199, 5001, 4400 or 4500): close the program using it, or
  restart the computer.
- The emulators' own messages are in `.demo/emulators.log` in the `LMB-PLATFORM` folder.

## The sample press (on a server, for anyone to try)

The sample press is this demo on a server, so people can look around before they sign up. It is the same shop with the
same books, run in a stricter way:

- **Read-only.** Visitors can open the shop, the admin, Studio and the stockroom, and sign in as the demo owner the
  same way. Nothing they change is kept: saving shows an error.
- **No email and no payment, ever.** The shop's server code, the only part that sends email or takes a card, never
  runs. The checkout stops before Pay.
- **Fresh every night** at 3 a.m. (server time): everything is cleared and the starter books go back in.
- Every page shows a bar: "This is a sample press to try. Nothing you do here is saved, and it starts fresh every
  night."

Once it has an address, the waitlist and sign-up pages show a "Try a sample press" link.

### What Julian does to put it online

The code is ready. Nothing is hosted yet. To host it:

1. **Get a small server.** A Linux machine with Node.js 22 and Java 21, about 2 GB of memory, in the platform's own
   Google Cloud account (never in a press's project). Give it a name, such as `sample.yourpress.example`.
2. **Open these ports to the internet, and no others:** 5173 (the shop), 5174 (the stockroom), 9099 (sign-in), 8080
   (database), 9000 (stockroom live data) and 9199 (photos). Keep 5001 (the server code), 4000 (the control panel)
   and the 1xxxx ports closed.
3. **Start it** on the server, from the `LMB-PLATFORM` folder:

   ```
   npm run demo -- --sample-press sample.yourpress.example
   ```

   Run it as a service that restarts on its own, such as a systemd unit. To start it fresh by hand while it runs,
   use `node demo/reset.js`.
4. **Check it:** open `http://sample.yourpress.example:5173/`, see the bar, change something in the admin and see it
   refused. The next morning, the shop is back to its starter books.
5. **Link it:** put the address in `SAMPLE_PRESS_URL` in both `waitlist/config.js` and `signup/config.js`.

### What it can't do yet

- **The address is `http://`, not `https://`.** Browsers mark the page "Not secure". The apps reach the practice
  database with plain `http://`, so `https://` needs a small change to both apps first.
- **Saving shows the app's usual error,** not a friendly "this is a sample" message.
- **Everyone shares one sample press.** Visitors can't see each other's changes, because there are none.

## For developers

`demo/run.js` does the work. In order, it:

1. Checks Node and Java, and installs each app's packages on the first run.
2. Writes `.demo/`. That's the emulator config, the rules filled in for the demo owner (the shop's and the stockroom's
   Firestore rules joined, since the emulator takes one file for every database), a `.firebaserc` for the two buckets,
   and both apps' shop profiles. `.demo/` is git-ignored.
3. Starts `firebase-tools@15.32.1 emulators:start` with `--import`/`--export-on-exit .demo/data`. That export keeps
   only the default Firestore database, so the stockroom's own database (`stockroom`) is saved by `demo/keepDatabase.js`
   to `.demo/stockroom-data.json`: every few seconds and at Ctrl+C, and written back before seeding on the next start.
4. Seeds the emulators (`demo/seed.js`). It adds the test catalogue (`setup/test-catalogue.js`), photos, settings, the
   Team entry, the stockroom books, and a Google account with the `owner` role. Each item is added only when it's
   missing.
5. Starts each app's own Vite (`demo/serve.js`), which answers `/shop-profile.js` with the demo profile.
6. The first time the sample press is added, places its orders through the shop's own path (`demo/sampleOrders.js`):
   the order as a guest under the shop's rules, the card payment from `createStripeCheckoutSession`, the practice card,
   then the webhook marks it paid. One is then shipped, one refunded through `refundOrder` and one asks to cancel.

**Practice services** (`demo/practiceServices.js`, port 5175, started before the emulators): a stand-in for Stripe's
API and for the email sender's, and the inbox page. `practicePay.js` keeps payment intents, charges, refunds and events
in memory and signs each webhook with the practice secret, as Stripe does; `practiceMail.js` keeps the last 200 emails
in `.demo/inbox.json`. The shop's functions reach it only when `FUNCTIONS_EMULATOR` is `"true"` and `DEMO_STRIPE_URL` is
set (the `Stripe` wrapper at the top of `apps/shop/functions/index.js`); the email library reads `RESEND_BASE_URL`.
Seeding writes the practice keys (`PRACTICE_KEYS`, `PRACTICE_MAIL_KEY`, all test-shaped) into the emulator's
`adminSecrets` and turns test mode on. In the browser, the demo profile defines a practice `window.Stripe` before the
shop loads Stripe's, so the real checkout mounts the practice card form. The sample press on a server
(`--sample-press`) gets none of this. Tests: `demo/practice.test.js`.

The apps only use the emulators when built with `VITE_FIREBASE_EMULATORS=true` **and** opened with a `demo-` project.
See `apps/shop/src/lib/emulators.ts` and `apps/stockroom/src/lib/emulators.js`. A real shop sets neither, so its
pages are unchanged. App Check is skipped in demo mode.

`--sample-press <host>` (`demo/hosted.js`) changes four things:

- `sampleRules` takes every write out of the rules: `allow read, write` becomes `allow read`, and the database's
  `.write` becomes `false`.
- `sampleEmulatorConfig` has no functions and no control panel. The emulators listen on this computer only, on
  `INTERNAL_PORTS`.
- `demo/gate.js` is the only thing on the public ports (`GATE_PORTS`). It serves each app's `vite build` (made for the
  public host) with `sampleProfileScript`, which adds the bar. It forwards everything else to the emulators, except
  what `gateRefusal` turns away: the emulators' `owner` pass, `/emulator/` admin addresses (the practice sign-in
  window is allowed), `/internal/` and `/.settings/`.
- `demo/reset.js` clears both Firestore databases, the live data and the accounts, then reruns `seedDemo`. `run.js`
  runs it on start and every night at `RESET_HOUR`.

Tests: `demo/sample-press.test.js`. On 28 October 2026 it was also run against the real emulators: the read-only rules
loaded, a visitor's write was refused, the owner pass and the clear address were refused at the gate, and a change was
gone after a reset. The database emulator couldn't start in that sandbox, for the plain demo too.

## Walk through everything, as the owner and as a press

`npm run walkthrough` starts a small server on your computer with the platform's own pages on made-up data. It needs
only Node.js, no Java and no download, and it starts in a second. Then open the **start page**,
http://127.0.0.1:5180/. It links every page, says who each one signs you in as, and what to try there:

```
npm run walkthrough
```

To start the shop and the stockroom at the same time (the demo above, so it needs Java), run this instead:

```
npm run walkthrough:all
```

- **As the platform owner** (`/control/`): the control room, signed in as **admin@example.com** with the two-step
  sign-in already done (the real control room asks for a code from your authenticator app). It has three shops: Moth
  Press, Paper Wasp Press and your test shop, whose links open the demo shop. Three people wait on the waitlist.
- **Sign up** (`/signup/`): "Continue with Google" signs in as a made-up new press, **newcomer@example.com**. Fill in
  the form and watch the shop being made. Then open the account page to see it.
- **Account** (`/account/`): signs in as **owner@example.com**, who has three made-up presses, Moth Press (on its free
  trial), Paper Wasp Press (paused until a card is added) and Fieldnote Editions (paying, with two paid invoices).
- **Plan & billing** (`/account/billing?shop=moth-press`, `?shop=paper-wasp` and `?shop=fieldnote`): the plan, the card, changing plan,
  invoices and cancelling. **Add a card** opens a stand-in card page; press its button to add a test card. No money
  moves.
- **Waitlist** (`/waitlist/`): the page with the plans and **Start your free trial**.
- **Inside a press's shop**: the start page's last section links the demo's shop, admin, Studio and stockroom, with
  what to try (taxes presets, your web address, a practice order).
- Add `?as=name@example.com` to any address to be a different made-up person.

Everything made here is forgotten when you press **Ctrl+C**.
`npm run walkthrough -- --port 5190` uses another port if 5180 is taken.
