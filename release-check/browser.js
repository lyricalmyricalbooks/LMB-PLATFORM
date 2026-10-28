// The release check's browser: Playwright driving the test shop's real pages, as a shopper and as the test owner. The
// checks (checks.js) only call the four methods below, so tests give them a pretend browser instead.
//
// Pass Playwright's `chromium` (the caller loads Playwright; the platform's own tests never need it):
//
//   const { chromium } = createRequire(import.meta.url)("playwright");
//   const browser = await playwrightBrowser({ chromium });
//
// Selectors follow the shop's own click-through check (apps/shop/scripts/storefront-smoke.mjs): field ids from
// checkoutDetails.ts and class names, never words, since every word on the shop is editable in Studio.

export const TEST_CARD = Object.freeze({ number: "4242424242424242", expiry: "12 / 34", cvc: "123", postalCode: "M5H 2N2" });

/** Where Firebase's web SDK keeps a signed-in user (browserLocalPersistence, the default for getAuth). */
export const AUTH_DB = Object.freeze({ name: "firebaseLocalStorageDb", store: "firebaseLocalStorage", keyPath: "fbase_key" });
export const authKey = (apiKey) => `firebase:authUser:${apiKey}:[DEFAULT]`;

/** Runs in the page: stores `value` under `key` in Firebase's sign-in store, making the store when it isn't there. */
export function seedAuthInPage({ db, key, value }) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(db.name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(db.store, { keyPath: db.keyPath });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const handle = open.result;
      const tx = handle.transaction(db.store, "readwrite");
      tx.objectStore(db.store).put({ [db.keyPath]: key, value });
      tx.oncomplete = () => { handle.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

export async function playwrightBrowser({ chromium, launchOptions = {}, timeoutMs = 30_000 }) {
  const browser = await chromium.launch(launchOptions);
  // en-CA: checkout guesses Canada, which the test shop's one shipping zone covers.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });
  context.setDefaultTimeout(timeoutMs);
  const crashes = [];
  const newPage = async () => {
    const page = await context.newPage();
    page.on("pageerror", (error) => crashes.push(`${page.url()}: ${error.message}`));
    return page;
  };
  const errorPanel = async (page) => (await page.locator("[data-store-region='errorPanel']").count()) > 0;
  const rejectCookies = async (page) => {
    const dialog = page.locator("[role=dialog][aria-label='Cookie consent']");
    try {
      await dialog.waitFor({ timeout: 5000 });
      await dialog.locator("button").filter({ hasText: /reject/i }).first().click();
    } catch { /* no banner */ }
  };
  // Signs the page's origin in as the test owner, then reloads so the app starts signed in.
  const signIn = async (page, url, session) => {
    await page.goto(url);
    await page.evaluate(seedAuthInPage, { db: AUTH_DB, key: authKey(session.apiKey), value: session.user });
    await page.reload();
  };
  const openPages = [];

  return {
    crashes,

    /** Check 1: home, a book page and a collection page load with prices and no errors. */
    async pagesLoad({ siteUrl, bookSlug, collection }) {
      const page = await newPage();
      const problems = [];
      try {
        for (const [what, path, selector] of [
          ["home page", "/", ".fm-card-title"],
          ["book page", `/books/${bookSlug}`, ".fm-pdp-title"],
          ["collection page", `/collections/${collection}`, ".fm-card-title"],
        ]) {
          const before = crashes.length;
          try {
            await page.goto(`${siteUrl}${path}`);
            await page.waitForSelector(selector);
            if (path === "/") await rejectCookies(page);
            // A price is a digit next to a currency sign somewhere on the page.
            if (!/[$€£]\s?\d|\d\s?[$€£]/.test(await page.locator("main, body").first().innerText())) problems.push(`the ${what} shows no price`);
            if (await errorPanel(page)) problems.push(`the ${what} shows its error panel`);
          } catch (error) {
            problems.push(`the ${what} didn't load (${String(error.message).split("\n")[0]})`);
          }
          if (crashes.length > before) problems.push(`the ${what} threw: ${crashes.slice(before).join("; ")}`);
        }
      } finally {
        await page.close();
      }
      return { problems };
    },

    /** Check 2: one copy in the bag, checkout with Stripe's test card. Resolves to the order id once Stripe says paid. */
    async buy({ siteUrl, bookSlug, email, card = TEST_CARD }) {
      const page = await newPage();
      try {
        // Carrier quotes and the paid address finder cost money per call: the test shop uses its own rates.
        await page.route(/\/(getShippoRates|validateAddress)\b/, (route) => route.abort());
        await page.goto(`${siteUrl}/books/${bookSlug}`);
        await page.waitForSelector(".fm-pdp-title");
        await rejectCookies(page);
        // The button keeps a hover animation running, so Playwright never sees it "stable".
        await page.locator(".fm-pdp-card button").filter({ hasText: /add to bag/i }).first().click({ force: true });
        await page.waitForSelector(".fm-bag");
        await page.locator(".fm-bag button, .fm-bag a").filter({ hasText: /checkout/i, visible: true }).last().click({ force: true });
        await page.waitForURL(/\/checkout/);
        await page.fill("form input[type=email]", email);
        await page.fill("#co-field-name", "Release Check");
        if (await page.locator("#co-field-street").count()) {
          await page.fill("#co-field-street", "100 Queen St W");
          await page.fill("#co-field-city", "Toronto");
          await page.selectOption("#co-field-state", "ON");
          await page.fill("#co-field-zip", "M5H 2N2");
          await page.locator("#co-field-zip").blur();
          const choice = page.locator("input[name=fulfillment-option]").first();
          await choice.waitFor();
          await choice.check({ force: true });
        }
        // Stripe's card form lives in its own frames; the one with the card number is the one to fill.
        const frame = await stripeCardFrame(page, timeoutMs);
        await frame.locator("input[name=number]").fill(card.number);
        await frame.locator("input[name=expiry]").fill(card.expiry);
        await frame.locator("input[name=cvc]").fill(card.cvc);
        const postal = frame.locator("input[name=postalCode]");
        if (await postal.count()) await postal.fill(card.postalCode);
        await page.locator("button[type=submit].fm-co-paybtn-main").click({ force: true });
        // Checkout's own success address (Checkout.tsx successUrl): only reached after Stripe confirms the payment.
        await page.waitForURL(/[?&]success=true&order_id=/, { timeout: Math.max(timeoutMs, 90_000) });
        const orderId = new URL(page.url()).searchParams.get("order_id");
        if (!orderId) throw new Error("checkout finished without an order id");
        return { orderId };
      } finally {
        await page.close();
      }
    },

    /**
     * Check 4: the stockroom open and signed in as the test owner. It brings website orders in by itself only while
     * open (runWebsiteImport), so the page stays open until `close()`.
     */
    async openStockroom({ url, session }) {
      const page = await newPage();
      await signIn(page, url, session);
      // Set once the stockroom has accepted the signed-in owner (apps/stockroom/src/main.js).
      await page.waitForFunction(() => window.IS_PUBLISHER === true, null, { timeout: Math.max(timeoutMs, 60_000) });
      openPages.push(page);
      return { close: () => page.close() };
    },

    /** Check 6: the admin opens as the test owner and lists the order. */
    async adminShowsOrder({ siteUrl, session, orderId }) {
      const page = await newPage();
      try {
        await signIn(page, `${siteUrl}/admin#orders`, session);
        // Each order row's label names the order (OrdersDesk.tsx); words aren't matched.
        await page.locator(`[aria-label*="${orderId.replace(/["\\]/g, "")}"]`).first().waitFor({ timeout: Math.max(timeoutMs, 60_000) });
        return !(await errorPanel(page));
      } catch {
        return false;
      } finally {
        await page.close();
      }
    },

    async close() {
      for (const page of openPages) await page.close().catch(() => {});
      await browser.close();
    },
  };
}

async function stripeCardFrame(page, timeoutMs) {
  const until = Date.now() + Math.max(timeoutMs, 30_000);
  while (Date.now() < until) {
    for (const frame of page.frames()) {
      if (!/js\.stripe\.com|stripe/.test(frame.url())) continue;
      if (await frame.locator("input[name=number]").count().catch(() => 0)) return frame;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("Stripe's card form never appeared");
}
