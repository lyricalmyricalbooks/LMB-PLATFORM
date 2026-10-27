# The admin as an Android app

The website admin can become an app on your Android phone in two ways. The first works today and takes
two minutes. The second puts the same app in Google Play, for when you want it installed through the store.
Both open exactly the same admin. Nothing is copied or duplicated, so every change to the website reaches the app
at once, with no app update.

## What is already done

- **The admin is installable.** While the admin is open, the page names its own app file
  (`public/admin.webmanifest`): name "Lyricalmyrical Admin", short name "LM Admin", opens on the Overview,
  runs full screen without the browser bar, and has its own icon (ink square, cream "LM", red rule).
  The shop keeps its own file, so customers never get offered the admin app.
- **Icons:** `public/admin-icon-192.png`, `public/admin-icon-512.png`, and `public/admin-icon-maskable-512.png`.
  The maskable icon has extra margin so Android can crop it into a circle or a rounded square.
- **Long-press shortcuts:** pressing and holding the app icon offers **Orders** and **Inventory**.
- **Play Store project settings:** `android/twa-manifest.json` is the ready-filled settings file for
  Bubblewrap, Google's tool that wraps a website into a Play Store app.
  The app's id is `com.lyricalmyrical.admin`. Once an app is published, its id can never change.
- **Ownership proof template:** `android/assetlinks.template.json`. This file proves to Android that the
  app and the website belong to the same owner. When the proof is in place, the app opens without a browser bar.
- **Safety:** `android/.gitignore` keeps the signing key and the built app out of the repository.
- **Sign-in is unchanged.** Only lyricalmyricalbooks@gmail.com can open the admin, in the app as on the web.

## Path 1: install it today (no Play Store)

1. On your Android phone, open Chrome and go to `https://lyricalmyricalbooks.com/admin`.
2. Sign in as usual.
3. Tap Chrome's **⋮** menu, then **Install app** (on some phones it says **Add to Home screen**, then **Install**).
4. "LM Admin" appears on your home screen and in your app list. It opens straight into the admin, full screen.

This is a real installed app as far as Android is concerned. For personal use, it may be all you ever need.

## Path 2: put it in Google Play

Do this when you want the app installed and kept up to date through Google Play, or Google's personal-app
programme opens up. The steps are one-off. After that, website updates reach the app by themselves.

### What you need

- A **Google Play developer account** (play.google.com/console, one-time USD 25 fee, identity check).
  Choose a *personal* account.
- A computer with **Node.js** installed. Bubblewrap downloads the rest (Java and the Android tools) the first time it runs.

### Steps

1. **Install Bubblewrap.** In a terminal: `npm install -g @bubblewrap/cli`
2. **Build the app.** In this repository's folder, run
   `bubblewrap init --manifest=https://lyricalmyricalbooks.com/admin.webmanifest --directory=android`.
   - The first time, it asks to download Java and the Android tools. Answer yes.
   - It then asks questions about the app. `android/twa-manifest.json` holds the answers to give: package id
     `com.lyricalmyrical.admin`, the colours, and the start address. When it asks about a signing key, choose to create a new one.
   - It asks for a **signing key** password. Pick a strong one and save it in your password manager.
     The key file (`lyricalmyrical-admin.keystore`) is how Google knows an update came from you. Back it up somewhere
     safe outside the repository. If you lose it, you can't update the app.
   - Then run `bubblewrap build` inside the `android` folder. You get `app-release-bundle.aab`, the file Google Play takes.
3. **Create the app in Play Console.** Go to **Create app**, name it "Lyricalmyrical Admin",
   choose App, Free, and accept the declarations.
4. **Upload to Internal testing.** Go to **Testing › Internal testing › Create new release** and upload the `.aab`.
   Add your own Gmail as the only tester. Internal testing has no review queue and no minimum number of testers,
   so a private app can stay there for good. Open the opt-in link on your phone and install from Play.
5. **Make the browser bar disappear.** In Play Console, open your app's **App integrity** page (called **App signing** in older layouts) and copy the
   **SHA-256 certificate fingerprint** of the app signing key. Paste it into `android/assetlinks.template.json` in
   place of `REPLACE_WITH_…`. Then publish that file on the website as `public/.well-known/assetlinks.json`.
   The site then serves it at `https://lyricalmyricalbooks.com/.well-known/assetlinks.json`.
   Ask Claude to do this part: it is one file plus a merge.
   Until this file is live, the app works but shows a thin address bar at the top.
6. **Updates:** website changes need nothing. Only when the app's name, icon or colours change do you run
   `bubblewrap update`, raise `appVersionCode` in `twa-manifest.json`, then `bubblewrap build` and upload again.

### Good to know

- Google Play shows store listing questions (privacy policy, content rating, data safety) even for internal
  testing. For an owner-only tool, the honest answers are short: no ads, sign-in with Google, and data stays in
  the shop's own Firebase.
- New *personal* developer accounts must run a closed test with a group of testers for two weeks before going to
  **Production**. Internal testing doesn't need that, which is why it's the recommended home for a private app.
- Google's sign-in opens in a pop-up. Inside the app it runs in Chrome's own secure window, the same as on the web.
