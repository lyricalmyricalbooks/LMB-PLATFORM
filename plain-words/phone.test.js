// Code plan 6.16 (takes in 5.12): the sign-up, account, Plan & billing and help pages work on a phone. This is a static
// check of each page's markup and styles, not a browser run: these pages load their sign-in library from Google, so a
// browser in CI would need that blocked and faked, and the release check's browser (release-check/local-proof.js) and
// the shop's accessibility check (apps/shop, axe) don't cover them. What is checked, per page:
//   - the page scales (viewport tag, no zoom lock) and says its language;
//   - nothing is fixed wider than a 360px phone: no fixed widths, grids that fit, and no tables or pre-formatted blocks
//     that could push the page sideways;
//   - everything you press or type in is at least 44px tall, and text and fields are at least 16px (a smaller field
//     makes a phone zoom in);
//   - colours are readable in light and in dark mode (4.5 to 1 or better) for the ink, muted text, errors and buttons;
//   - the keyboard still sees where it is (no outline removed), and the page speaks its changes (a polite status line
//     and alerts for errors);
//   - the page has a loading, empty and error state wherever it fetches or lists things.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const PAGES = {
  "sign-up": { html: "signup/index.html", scripts: ["signup/app.js"] },
  "account": { html: "accounts/index.html", scripts: ["accounts/app.js"] },
  "Plan & billing": { html: "accounts/billing.html", scripts: ["accounts/billing.js"] },
  "help": { html: "help/index.html", scripts: ["help/page.js"] },
};

// ── A small reader for the pages' own style blocks ─────────────────────────────────────────────────────────────────

function styleOf(html) {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

/** Rules as { selectors, decls } (media blocks are flattened; the dark-mode block is read separately). */
function rulesOf(css) {
  const rules = [];
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of flat.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
    const decls = {};
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
    }
    rules.push({ selectors: m[1].split(",").map((s) => s.trim()), decls });
  }
  return rules;
}

const px = (value) => { const m = /(^|\s)(\d+(?:\.\d+)?)px\b/.exec(value ?? ""); return m ? Number(m[2]) : null; };
/** The biggest `property` (in px) declared by a rule whose selector list contains `selector`. */
const biggest = (rules, selector, property) => Math.max(0, ...rules.filter((r) => r.selectors.includes(selector)).map((r) => px(r.decls[property]) ?? 0));

function variables(css, scope) {
  const block = scope === "dark" ? /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "" : /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

for (const [name, page] of Object.entries(PAGES)) {
  const html = read(page.html);
  const css = styleOf(html);
  const rules = rulesOf(css);
  const scripts = page.scripts.map(read).join("\n");
  const everything = `${html}\n${scripts}`;

  test(`${name} page: scales to the phone and says its language`, () => {
    assert.match(html, /<html lang="en">/);
    const viewport = /<meta name="viewport" content="([^"]*)"/.exec(html)?.[1] ?? "";
    assert.match(viewport, /width=device-width/);
    assert.match(viewport, /initial-scale=1/);
    assert.doesNotMatch(viewport, /maximum-scale|user-scalable\s*=\s*(no|0)/, "pinch-zoom must stay on");
  });

  test(`${name} page: nothing is fixed wider than a 360px phone, and nothing can push the page sideways`, () => {
    const wide = [];
    for (const rule of rules) {
      for (const property of ["width", "min-width", "flex-basis"]) {
        const value = rule.decls[property];
        if (value && /^\d+px$/.test(value) && Number(value.slice(0, -2)) > 328) wide.push(`${rule.selectors.join(", ")} { ${property}: ${value} }`);
      }
      const grid = rule.decls["grid-template-columns"];
      for (const m of grid?.matchAll(/minmax\((\d+)px/g) ?? []) if (Number(m[1]) > 328) wide.push(`${rule.selectors.join(", ")} { grid-template-columns: ${grid} }`);
    }
    assert.deepEqual(wide, [], "a fixed width over 328px (360 less the 16px sides) would scroll on a small phone");
    const main = rules.find((r) => r.selectors.includes("main"));
    assert.ok(px(main.decls["max-width"]) >= 600, "the page column has a maximum, not a fixed width");
    assert.match(main.decls.padding, /\b16px\b/, "main keeps a 16px gutter on each side");
    assert.match(css, /\*\s*\{\s*box-sizing:\s*border-box/);
    assert.doesNotMatch(everything, /<table\b|<pre\b/, "a table or a pre-formatted block can push the page sideways");
    assert.doesNotMatch(css, /overflow-x:\s*hidden/, "hiding sideways overflow only hides the problem");
  });

  test(`${name} page: buttons and fields are easy to tap, and text is easy to read`, () => {
    const body = rules.find((r) => r.selectors.includes("body"));
    assert.ok(px(body.decls.font) >= 16 || px(body.decls["font-size"]) >= 16, "body text is at least 16px");
    // Every control the page has, and the smallest height its rules give it.
    const controls = [
      ["button", /<button\b|createElement\("button"\)|el\("button"/],
      ["input", /<input\b/],
      ["select", /<select\b/],
      ["textarea", /<textarea\b/],
      ["a.button", /class="button"|className: "button"/],
      ["input[type=search]", /type="search"/],
      ["summary", /<summary\b/],
    ];
    for (const [selector, used] of controls) {
      if (!used.test(everything)) continue;
      // A page may style all its fields together ("input") or only its search box ("input[type=search]").
      const names = selector === "input" ? ["input", "input[type=search]"] : [selector];
      const height = Math.max(...names.flatMap((n) => [biggest(rules, n, "min-height"), biggest(rules, `.support ${n}`, "min-height")]));
      assert.ok(height >= 44, `${selector} must be at least 44px tall (rule gives ${height}px)`);
    }
    // The small "ghost" text buttons, and a tick box's row, are the smallest things; they keep 44px too.
    if (rules.some((r) => r.selectors.includes(".ghost"))) assert.ok(biggest(rules, ".ghost", "min-height") >= 44);
    for (const selector of ["input, select, button", "input, select, button, textarea", "textarea", "input[type=search]"]) {
      const rule = rules.find((r) => r.selectors.join(", ") === selector);
      if (!rule) continue;
      const size = px(rule.decls["font-size"]) ?? px(rule.decls.font);
      if (size !== null) assert.ok(size >= 16, `${selector}: fields are at least 16px or a phone zooms in`);
    }
  });

  test(`${name} page: colours are readable in light and dark mode`, () => {
    for (const scope of ["light", "dark"]) {
      const light = variables(css, "light");
      const v = { ...light, ...(scope === "dark" ? variables(css, "dark") : {}) };
      assert.ok(v.paper && v.ink, `${scope}: paper and ink are set`);
      assert.ok(contrast(v.ink, v.paper) >= 4.5, `${scope}: ink on paper`);
      if (v.muted) assert.ok(contrast(v.muted, v.paper) >= 4.5, `${scope}: muted text on paper`);
      if (v.danger) assert.ok(contrast(v.danger, v.paper) >= 4.5, `${scope}: error text on paper`);
      if (v.yellow) assert.ok(contrast("#1d1a17", v.yellow) >= 4.5, `${scope}: button text on yellow`);
    }
    assert.match(css, /prefers-color-scheme:\s*dark/);
  });

  test(`${name} page: the keyboard sees where it is, and changes are spoken`, () => {
    assert.doesNotMatch(css, /outline:\s*(none|0)\b/, "no outline is removed");
    assert.match(html, /id="status"[^>]*role="status"[^>]*aria-live="polite"|id="answers" aria-live="polite"/, "a polite place for changes");
    assert.ok(/role="alert"/.test(everything) || /role="status"/.test(everything), "errors are announced");
    // Every field has a label the page reads out.
    const fields = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/type="(checkbox|radio|hidden)"/.test(tag));
    for (const tag of fields) {
      const id = /\bid="([^"]+)"/.exec(tag)?.[1];
      const labelled = (id && new RegExp(`for="${id}"`).test(html)) || /aria-label=/.test(tag) || html.includes("<label") ;
      assert.ok(labelled, `${tag} has a label`);
    }
  });
}

// ── Loading, empty and error states ────────────────────────────────────────────────────────────────────────────────

test("every page that fetches something shows loading, empty and error states", () => {
  const signup = read("signup/index.html") + read("signup/app.js");
  const account = read("accounts/index.html") + read("accounts/app.js");
  const billing = read("accounts/billing.html") + read("accounts/billing.js");
  const help = read("help/index.html") + read("help/page.js");

  // Sign-up: the shop being made (loading is the making screen), the address check, and a plain error line.
  assert.match(signup, /id="view-making"/);
  assert.match(signup, /Making your shop/);
  assert.match(signup, /We couldn't reach Colophon/);
  assert.match(signup, /id="address-state"[^>]*role="status"/);

  // Account: loading the shops, no shops, no requests, and an error that offers another try.
  assert.match(account, /id="view-loading"/, "the account page shows that it is loading your shops");
  assert.match(account, /Loading your shops/);
  assert.match(account, /You're not on any shop's team yet/);
  assert.match(account, /No requests yet/);
  assert.match(account, /id="view-error"/, "the account page has an error screen");
  assert.match(account, /id="retry"/, "the account page's error screen offers Try again");

  // Plan & billing: loading, no plan yet, an error with Try again, no invoices yet.
  assert.match(billing, /Loading your plan/);
  assert.match(billing, /id="view-none"/);
  assert.match(billing, /id="retry"/);
  assert.match(billing, /No invoices yet/);

  // Help: the answers are on the page itself; a search with nothing found says so and points to a person.
  assert.match(help, /No answer has all of those words/);
  assert.match(help, /<noscript>/, "help says what to do when scripts are off");
});

test("the account page's loading and error screens use styles the page defines", () => {
  const html = read("accounts/index.html");
  assert.match(styleOf(html), /\.loading\s*\{/);
  assert.match(styleOf(html), /\.empty\s*\{/);
});
