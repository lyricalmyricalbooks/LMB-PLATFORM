import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { stale } from "./build.mjs";
import { BRAND_LOGOS } from "./logos.js";

const sources = JSON.parse(readFileSync(new URL("./sources.json", import.meta.url), "utf8"));
const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("logos.js and every copy match the SVG files and notes (run node shared/brand-logos/build.mjs)", () => {
  assert.deepEqual(stale(), []);
});

test("every logo has its own SVG file, an owner, a colour or its own colours, and where it came from", () => {
  const files = readdirSync(new URL("./svg/", import.meta.url)).map((f) => f.replace(/\.svg$/, "")).sort();
  assert.deepEqual(files, Object.keys(sources.logos).sort(), "one SVG file per listed logo, and no strays");
  for (const [id, logo] of Object.entries(BRAND_LOGOS)) {
    assert.ok(logo.name && logo.owner, `${id} names its company and owner`);
    assert.ok(/^https:\/\//.test(logo.guidelines), `${id} links its owner's brand rules or source`);
    assert.ok(logo.source, `${id} says where the artwork came from`);
    assert.match(logo.viewBox, /^0 0 \d+ \d+$/, `${id} keeps its own square artboard (never stretched)`);
    if (logo.color === null) assert.match(logo.body, /fill="#/, `${id} carries its own colours`);
    else assert.match(logo.color, /^#[0-9A-F]{6}$/i, `${id} is drawn in its company's colour`);
    assert.doesNotMatch(logo.body, /<script|on[a-z]+=|href=/i, `${id} is plain artwork`);
    if (logo.full) {
      assert.match(logo.full.body, /fill="#/, `${id}'s full-colour artwork carries its own colours`);
      assert.doesNotMatch(logo.full.body, /<script|on[a-z]+=|href=/i, `${id}'s full-colour artwork is plain artwork`);
    }
  }
});

test("the README lists every logo with its owner, and no rival shop builder is in the kit", () => {
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  for (const [id, logo] of Object.entries(BRAND_LOGOS)) {
    assert.ok(readme.includes(`\`${id}\``), `README lists ${id}`);
    assert.ok(readme.includes(logo.owner), `README names ${logo.owner}`);
  }
  for (const rival of ["shopify", "squarespace", "bigcartel", "wix", "etsy", "woocommerce"]) {
    assert.ok(!(rival in BRAND_LOGOS), `${rival} is a rival: customer-facing pages never show it`);
  }
});

test("every Google sign-in button on the platform pages is Google's own button with Google's words", () => {
  for (const page of ["join/index.html", "signup/index.html", "accounts/index.html", "accounts/install.html", "accounts/billing.html", "control-room/index.html"]) {
    const html = read(page);
    const button = /<button[^>]*id="google"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    assert.ok(button, `${page} has the Google button`);
    assert.match(button[0], /class="gsi-button"/, `${page}: Google's button style`);
    assert.match(button[1], /fill="#4285F4"[\s\S]*fill="#34A853"[\s\S]*fill="#FBBC05"[\s\S]*fill="#EA4335"/, `${page}: the four-colour G`);
    assert.match(button[1], /<span class="gsi-button-text">(Sign in|Continue|Sign up) with Google<\/span>/, `${page}: Google's approved words`);
    const css = /href="([^"]*brand-logos\.css)"/.exec(html);
    assert.ok(css, `${page} loads the logo styles`);
    assert.ok(existsSync(new URL(css[1], new URL(`../../${page}`, import.meta.url))), `${page}: ${css[1]} is there`);
  }
});
