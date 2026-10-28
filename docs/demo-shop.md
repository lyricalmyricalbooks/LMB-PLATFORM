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
| A book page | http://127.0.0.1:5173/books/test-book-one |
| The admin | http://127.0.0.1:5173/admin |
| Studio (the theme editor) | http://127.0.0.1:5173/admin#designer |
| The stockroom | http://127.0.0.1:5174/ |
| The emulators' control panel (see and edit the raw data) | http://127.0.0.1:4000/ |

## Sign in

In the admin or the stockroom, click **Sign in with Google**. A practice sign-in window opens. Pick
**owner@example.com (Demo Owner)**. If the list is empty, click "Add new account" and type `owner@example.com`. There
is no password, and no real Google account is used. The demo owner is the shop's owner, so every admin screen and the
stockroom open.

## What's in it

- Three printed test books with 5 copies each, a pre-order and an e-book, each with a placeholder cover.
- One shipping zone for Canada ($5, plus $1 for each extra book).
- The same three printed books in the stockroom, with 5 copies on hand.
- The stockroom also shows its own sample books. A new stockroom does that today.

## Stop it

Press **Ctrl+C** in the terminal. If Windows asks "Terminate batch job (Y/N)?", type `Y` and press Enter. The demo saves
the shop's and the stockroom's data on the way out, so your changes are still there next time.

To start over from the starter books, run `npm run demo -- --fresh`.

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

- **Paying.** The checkout opens and works out shipping, but its Pay step says no payment method is available. Card
  payments need Stripe, which can't run on your computer. No order is paid and no money moves.
- **Emails** are not sent. Shipping labels and live carrier rates can't be bought.
- **Stay online.** The practice sign-in window and the stockroom load a few files from the internet. Your shop's data
  never leaves your computer.
- If the shop's server code can't start, the demo runs without it and says so. Then shipping prices, order tools and
  the Team list don't work either. `npm run demo -- --no-functions` does the same on purpose.

## If something goes wrong

- **"The Firebase emulators are already running"**: another demo window is still open. Stop it with Ctrl+C first.
- **A port is taken** (5173, 5174, 4000, 8080, 9000, 9099, 9199, 5001, 4400 or 4500): close the program using it, or
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

## The sign-up, account and billing pages (no emulators needed)

`npm run walkthrough` starts a small server on your computer with the platform's own pages on made-up data: the waitlist
page with the plans, the sign-up page, the account page and each shop's **Plan & billing** page. It needs only Node.js,
no Java and no download, and it starts in a second. It prints the addresses to open:

```
npm run walkthrough
```

- **Sign up** (`/signup/`): "Continue with Google" signs in as a made-up new press, **newcomer@example.com**. Fill in
  the form and watch the shop being made. Then open the account page to see it.
- **Account** (`/account/`): signs in as **owner@example.com**, who has two made-up presses, Moth Press (on its free
  trial) and Paper Wasp Press (paused until a card is added).
- **Plan & billing** (`/account/billing?shop=moth-press` and `?shop=paper-wasp`): the plan, the card, changing plan,
  invoices and cancelling. **Add a card** opens a stand-in card page; press its button to add a test card. No money
  moves.
- **Waitlist** (`/waitlist/`): the page with the plans and **Start your free trial**.
- Add `?as=name@example.com` to any address to be a different made-up person.

The address `/` shows only the words "Start page coming". Everything made here is forgotten when you press **Ctrl+C**.
`npm run walkthrough -- --port 5190` uses another port if 5180 is taken.
