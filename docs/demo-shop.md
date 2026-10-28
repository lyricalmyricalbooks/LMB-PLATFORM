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
the shop's data on the way out, so your changes are still there next time.

To start over from the starter books, run `npm run demo -- --fresh`.

## What doesn't work on your computer

- **Paying.** The checkout opens and works out shipping, but its Pay step says no payment method is available. Card
  payments need Stripe, which can't run on your computer. No order is paid and no money moves.
- **Emails** are not sent. Shipping labels and live carrier rates can't be bought.
- **Stockroom changes aren't kept** between runs. The emulator saves only the shop's own database, so the stockroom
  starts again from its starter books each time.
- **Stay online.** The practice sign-in window and the stockroom load a few files from the internet. Your shop's data
  never leaves your computer.
- If the shop's server code can't start, the demo runs without it and says so. Then shipping prices, order tools and
  the Team list don't work either. `npm run demo -- --no-functions` does the same on purpose.

## If something goes wrong

- **"The Firebase emulators are already running"**: another demo window is still open. Stop it with Ctrl+C first.
- **A port is taken** (5173, 5174, 4000, 8080, 9000, 9099, 9199, 5001, 4400 or 4500): close the program using it, or
  restart the computer.
- The emulators' own messages are in `.demo/emulators.log` in the `LMB-PLATFORM` folder.

## For developers

`demo/run.js` does the work. In order, it:

1. Checks Node and Java, and installs each app's packages on the first run.
2. Writes `.demo/`. That's the emulator config, the rules filled in for the demo owner (the shop's and the stockroom's
   Firestore rules joined, since the emulator takes one file for every database), a `.firebaserc` for the two buckets,
   and both apps' shop profiles. `.demo/` is git-ignored.
3. Starts `firebase-tools@15.32.1 emulators:start` with `--import`/`--export-on-exit .demo/data`.
4. Seeds the emulators (`demo/seed.js`). It adds the test catalogue (`setup/test-catalogue.js`), photos, settings, the
   Team entry, the stockroom books, and a Google account with the `owner` role. Each item is added only when it's
   missing.
5. Starts each app's own Vite (`demo/serve.js`), which answers `/shop-profile.js` with the demo profile.

The apps only use the emulators when built with `VITE_FIREBASE_EMULATORS=true` **and** opened with a `demo-` project.
See `apps/shop/src/lib/emulators.ts` and `apps/stockroom/src/lib/emulators.js`. A real shop sets neither, so its
pages are unchanged. App Check is skipped in demo mode.
