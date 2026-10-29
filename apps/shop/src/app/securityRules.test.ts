// Guards on what anonymous browsers may write or read (firestore.rules). Rules can't run in
// Vitest, so these pin the shape of each block; scripts/firestore-rules-emulator.mjs checks the
// same cases against the real rules engine (run it after changing these rules).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const rules = readFileSync(join(ROOT, "firestore.rules"), "utf8");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// The body of `match /<path> { … }`, braces balanced.
function block(path: string): string {
  const start = rules.indexOf(`match /${path} {`);
  expect(start, `firestore.rules needs match /${path}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start + `match /${path} `.length; i < rules.length; i++) {
    if (rules[i] === "{") depth++;
    if (rules[i] === "}" && --depth === 0) return rules.slice(start, i + 1);
  }
  throw new Error(`unbalanced block ${path}`);
}

describe("firestore.rules anonymous-abuse guards", () => {
  it("serves only published pages to the public", () => {
    const pages = block("pages/{pageId}");
    expect(pages).not.toMatch(/allow read: if true/);
    expect(pages).toMatch(/allow read: if isAdminReader\(\) \|\| resource\.data\.status == "published"/);
    // Every shopper read of pages filters on status (a list query must match the rule).
    expect(read("src/app/lib/publicApi.ts")).toMatch(/collection\(liteDb, "pages"\), where\("status", "==", "published"\)/);
    expect(read("scripts/publicStorefrontData.mjs")).not.toMatch(/collection\('pages'\)/);
  });

  it("lets a profile carry only the signed-in account's own email, with bounded fields", () => {
    const customers = block("customers/{customerId}");
    expect(customers).toMatch(/request\.resource\.data\.email == request\.auth\.token\.get\('email', null\)/);
    expect(customers).toMatch(/keys\(\)\.hasOnly\(\['uid', 'email', 'name', 'phone', 'defaultAddress'\]\)/);
    expect(customers).toMatch(/shortText\(request\.resource\.data\.get\('name', ''\), 200\)/);
    expect(customers).toMatch(/addressOk\(request\.resource\.data\.defaultAddress\)/);
    // Account.tsx writes exactly these keys.
    const account = read("src/app/features/site/Account.tsx");
    expect(account).toMatch(/uid: user\.uid,\s*email: user\.email \|\| "",\s*name: addressForm\.name,\s*phone: addressForm\.phone,\s*defaultAddress:/);
  });

  it("bounds browser-created orders: small customer/metadata maps; per-line quantity is the server's clamp", () => {
    const orders = block("orders/{orderId}");
    expect(orders).toMatch(/guestCustomerOk\(request\.resource\.data\.customer\)/);
    expect(orders).toMatch(/metadata\.size\(\) <= 4/);
    expect(orders).toMatch(/referralSource\.size\(\) <= 200/);
    expect(orders).toMatch(/request\.resource\.data\.acquisition is string && request\.resource\.data\.acquisition\.size\(\) <= 2000/);
    expect(rules).toMatch(/function guestCustomerOk\(c\) \{\s*return c is map && c\.size\(\) <= 10/);
    // Rules can't loop over lines (an unrolled check exceeds the 1000-expression limit and
    // refuses every order), so priceOrder clamps each line to 1–99 copies.
    expect(rules).not.toMatch(/guestLineOk/);
    expect(read("functions/index.js")).toMatch(/const quantity = Math\.max\(1, Math\.min\(99, Math\.floor\(Number\(requested\.quantity\) \|\| 1\)\)\);/);
    // Checkout keeps its free-text fields inside those bounds.
    const checkout = read("src/app/Checkout.tsx");
    expect(checkout).toMatch(/referralSource: \(referralSource \|\| "direct"\)\.slice\(0, 200\)/);
    expect(checkout).toMatch(/\.join\(", "\)\.slice\(0, 2000\)/);
  });

  it("only accepts today's analytics day doc, keyed by its date", () => {
    const analytics = block("analytics/{docId}");
    expect(analytics).toMatch(/docId\.matches\('\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'\)/);
    expect(analytics).toMatch(/request\.resource\.data\.get\('date', docId\) == docId/);
    expect(analytics).toMatch(/allow create: if isAdmin\(\) \|\| \(\s*analyticsDayOk\(\)/);
    expect(analytics).toMatch(/allow update: if isAdmin\(\) \|\| \(\s*analyticsDayOk\(\)/);
    // The storefront writes the doc id it also stores as `date`.
    expect(read("src/app/lib/commerce.ts")).toMatch(/doc\(liteDb, "analytics", today\), \{ date: today/);
    // Visits go through the same combined counter writes (commerce.ts queueVisit).
    expect(read("src/app/lib/publicApi.ts")).toMatch(/queueVisit\(\)/);
  });

  it("accepts a reviewer email only alongside the new pending review it belongs to", () => {
    const contacts = block("reviewContacts/{reviewId}");
    expect(contacts).toMatch(/!exists\(\/databases\/\$\(database\)\/documents\/reviews\/\$\(reviewId\)\)/);
    expect(contacts).toMatch(/getAfter\(\/databases\/\$\(database\)\/documents\/reviews\/\$\(reviewId\)\)\.data\.status == "pending"/);
    // reviews.ts writes both in one batch with the same createdAt.
    const reviews = read("src/app/lib/reviews.ts");
    expect(reviews).toMatch(/const batch = writeBatch\(liteDb\);\s*batch\.set\(ref, payload\);/);
    expect(reviews).toMatch(/batch\.set\(doc\(liteDb, "reviewContacts", ref\.id\), \{ email: cleanEmail, createdAt \}\)/);
  });

  it("keeps the server-only throttles and hold counts closed to browsers", () => {
    for (const path of ["stock-hold-owners/{holderId}", "contact-email-throttle/{id}"]) {
      expect(block(path)).toMatch(/allow read, write: if false;/);
    }
  });
});

describe("firestore.rules round-2 security (#18, #111, #112)", () => {
  it("serves only published books to the public, with private fields in an admin-only subdocument", () => {
    const books = block("books/{bookId}");
    expect(books).not.toMatch(/allow read: if true/);
    expect(books).toMatch(/allow read: if isAdminReader\(\) \|\| resource\.data\.status == "published"/);
    expect(books).toMatch(/match \/private\/\{docId\} \{\s*allow read: if isAdminReader\(\);\s*allow write: if isAdmin\(\);/);
    // The admin's one-query read of every private document.
    expect(rules).toMatch(/match \/\{path=\*\*\}\/private\/\{docId\} \{\s*allow read: if isAdminReader\(\);/);
  });

  it("every shopper read of books asks for published ones only", () => {
    expect(read("src/app/lib/publicApi.ts")).toMatch(/where\("status", "==", "published"\), orderBy\(documentId\(\)\)/);
    expect(read("scripts/publicStorefrontData.mjs")).toMatch(/fieldPath: 'status' \}, op: 'EQUAL', value: \{ stringValue: 'published' \}[\s\S]*collectionId: 'books'|collectionId: 'books'[\s\S]*fieldPath: 'status'/);
    // No shopper code reads books through the full SDK or by a different query.
    for (const file of ["src/app/lib/commerce.ts", "src/app/lib/reviews.ts", "src/app/features/site/newsletterSignup.ts", "src/app/features/site/contactMessages.ts"]) {
      expect(read(file), file).not.toMatch(/collection\(liteDb, "books"\)/);
    }
  });

  it("keeps analytics counters from going negative or being forged", () => {
    const analytics = block("analytics/{docId}");
    expect(analytics).toMatch(/get\('visits', 0\) >= 0/);
    expect(analytics).toMatch(/analyticsStepsOk\(\{\}, request\.resource\.data\.keys\(\)\)/);
    expect(analytics).toMatch(/analyticsStepsOk\(resource\.data, request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\)/);
    expect(analytics).toMatch(/hasOnly\(\['view', 'add_to_cart', 'checkout_start', 'purchase'\]\)/);
    expect(analytics).toMatch(/removedKeys\(\)\.size\(\) == 0/);
    // The storefront funnel sends exactly those four events.
    const funnel = read("src/app/lib/commerce.ts");
    expect(funnel).toMatch(/track: async \(event: "view" \| "add_to_cart" \| "checkout_start" \| "purchase"\)/);
  });

  it("accepts exactly the checkout steps and per-book signals the storefront sends", () => {
    const analytics = block("analytics/{docId}");
    const steps = read("src/app/lib/commerce.ts").match(/CHECKOUT_STEPS = \[([^\]]+)\]/)?.[1].replace(/"/g, "'");
    expect(steps).toBeTruthy();
    expect(analytics).toContain(`hasOnly([${steps}])`);
    for (const field of ["bookAdds", "wishlistAdds", "unbuyableViews", "checkout", "vitals"]) {
      expect(analytics).toContain(`'${field}' in ch`);
      expect(analytics.match(new RegExp(`'${field}'`, "g"))!.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("gives every browser-written order field a type and a size", () => {
    expect(block("orders/{orderId}")).toMatch(/guestOrderFieldsOk\(request\.resource\.data\)/);
    for (const field of ["subtotal", "discount", "shipping", "tax", "total"]) expect(rules).toContain(`moneyOk(d.get('${field}', 0))`);
    expect(rules).toMatch(/d\.customer\.keys\(\)\.hasOnly\(\['name', 'email', 'phone', 'address', 'billingAddress'\]\)/);
    // The keys Checkout sends all stay inside the allowed list.
    expect(read("src/app/Checkout.tsx")).toMatch(/customer: \{ \.\.\.customer, email:/);
  });

  it("checks the billing block as the two fields checkout sends, keeping a guest order under 1000 expressions", () => {
    // A whole-address check here made the database refuse every guest order (the platform walkthrough's emulator run).
    expect(rules).toMatch(/\(!\('billingAddress' in c\) \|\| billingOk\(c\.billingAddress\)\)/);
    expect(rules).toContain("b.keys().hasOnly(['state', 'country'])");
    expect(read("src/app/Checkout.tsx")).toContain('billingAddress: { state: "", country: "Canada" }');
  });

  it("expires server-only bookkeeping with Firestore TTL policies (#72)", () => {
    const indexes = JSON.parse(read("firestore.indexes.json"));
    const ttl = indexes.fieldOverrides.filter((o: any) => o.ttl === true && o.fieldPath === "expiresAt").map((o: any) => o.collectionGroup).sort();
    expect(ttl).toEqual(["abandoned-cart-throttle", "clientErrors", "contact-email-throttle", "email-claims", "payment-webhook-events", "rate-limits"]);
  });

  it("has the index the paged pending-reviews queue needs (#144)", () => {
    const indexes = JSON.parse(read("firestore.indexes.json"));
    expect(indexes.indexes.some((i: any) => i.collectionGroup === "reviews" && i.fields.length === 2
      && i.fields[0].fieldPath === "status" && i.fields[1].fieldPath === "createdAt" && i.fields[1].order === "DESCENDING")).toBe(true);
  });
});

// Team roles (functions/roles.js). "author" is a Team role for the stockroom only; the shop's admin checks name owner
// and staff alone, so an author on the Team opens nothing here. scripts/firestore-rules-emulator.mjs checks the same.
describe("Team roles", () => {
  const fn = (text: string, name: string) => text.match(new RegExp(`function ${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`))?.[1] ?? "";
  it("the Team accepts owner, staff, author and bookkeeper", () => {
    expect(block("members/{email}")).toContain('request.resource.data.role in ["owner", "staff", "author", "bookkeeper"]');
  });
  it("the bookkeeper only ever reads: orders, gift cards and the daily figures, never a write", () => {
    expect(fn(rules, "isOwner") + fn(rules, "isAdmin")).not.toMatch(/bookkeeper/);
    const lines = rules.split("\n").filter((line) => line.includes("isBookkeeper()") && !line.includes("function"));
    expect(lines.length).toBe(3);
    for (const line of lines) expect(line).toMatch(/allow (read|get, list): if isAdminReader\(\) \|\| isBookkeeper\(\)/);
    expect(block("orders/{orderId}")).toContain("isBookkeeper()");
    expect(block("giftCards/{cardId}")).toContain("isBookkeeper()");
    expect(block("analytics/{docId}")).toContain("isBookkeeper()");
    for (const path of ["customers/{customerId}", "settings/{docId}", "members/{email}", "books/{bookId}", "adminSecrets/{docId}", "newsletter/{docId}"]) {
      expect(block(path), path).not.toContain("isBookkeeper");
    }
  });
  it("an author never counts as an admin, in Firestore or Storage", () => {
    const firestoreAdmin = fn(rules, "isOwner") + fn(rules, "isAdmin");
    const storageAdmin = fn(read("storage.rules"), "isAdmin");
    for (const body of [firestoreAdmin, storageAdmin]) {
      expect(body).toMatch(/"staff"/);
      expect(body).not.toMatch(/author/);
    }
    expect(read("functions/roles.js")).toMatch(/const ADMIN_ROLES = \["owner", "staff"\];/);
  });
});

// Platform support ("act as this shop", functions/roles.js supportOf): staff access until its time, and only from a
// custom sign-in token, which only the platform can make. scripts/firestore-rules-emulator.mjs checks the same.
describe("Platform support", () => {
  const fn = (text: string, name: string) => text.match(new RegExp(`function ${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`))?.[1] ?? "";
  it("needs a custom sign-in and runs out, in Firestore and Storage", () => {
    for (const body of [fn(rules, "supportVisit"), fn(read("storage.rules"), "isSupport")]) {
      expect(body).toContain('request.auth.token.firebase.sign_in_provider == "custom"');
      expect(body).toContain("request.time.toMillis() < request.auth.token.support.until * 1000");
    }
    for (const text of [rules, read("storage.rules")]) expect(fn(text, "isAdmin")).toContain("isSupport()");
  });
  // Plan 9.8: a "view" visit (the default) reads what staff read and changes nothing; only an "edit" visit is staff.
  it("a view visit only ever reads", () => {
    expect(fn(rules, "isSupport")).toContain('support.get("mode", "view") == "edit"');
    expect(fn(read("storage.rules"), "isSupport")).toContain('support.get("mode", "view") == "edit"');
    expect(fn(rules, "isSupportViewer")).toContain('support.get("mode", "view") != "edit"');
    expect(fn(rules, "isAdmin")).not.toContain("isSupportViewer");
    const lines = rules.split("\n").filter((line) => line.includes("isAdminReader()") && !line.includes("function") && !line.trim().startsWith("//"));
    expect(lines.length).toBeGreaterThan(20);
    // Every rule that lets the viewer in is a read (the customer rule reads across two lines).
    for (const line of lines) expect(line, line).toMatch(/allow (read|get, list|list): if |request\.auth\.uid == customerId \|\| isAdminReader\(\)\);|return isAdmin\(\) \|\| isSupportViewer\(\);/);
  });
  it("is never the owner", () => {
    expect(fn(rules, "isOwner")).not.toContain("isSupport");
  });
});

// The shop's plan on the platform (plan 6.6, 6.7): only the platform writes platform/plan and platform/status, the plan
// is the admins' to read, and a paused plan stops guest orders. scripts/firestore-rules-emulator.mjs checks the same.
describe("The shop's plan", () => {
  it("is written by no browser, read by admins only, with a public open-or-not status", () => {
    const platform = block("platform/{docId}");
    expect(platform).toMatch(/allow write: if false;/);
    expect(platform).toMatch(/allow read: if docId == 'status' \|\| \(docId == 'plan' && isAdmin\(\)\);/);
  });
  it("leaves stopping orders to the server, which every checkout path goes through", () => {
    // functions/planPause.test.js proves the refusal; the guest order rule is at the engine's expression limit.
    expect(read("functions/index.js")).toMatch(/if \(planPaused\(\(await db\.collection\("platform"\)\.doc\("status"\)\.get\(\)\)\.data\(\)\)\)/);
  });
});
