// Browser checks for the Design studio, against the local fixture (studio-fixture.html):
// the real Studio UI with an in-memory adminApi — no sign-in, no Firestore writes.
//   node scripts/studio-e2e.mjs            (starts its own Vite dev server)
//   STUDIO_URL=http://localhost:5173 node scripts/studio-e2e.mjs
//   CHROMIUM_PATH=/path/to/chrome …        (use an already installed Chromium)
//   STUDIO_SHOTS=dir …                     (save a screenshot per check)
//   STUDIO_SHARD=2/3 …                     (CI: run every third check, starting with the second; the checks are
//                                           independent, each opens its own page, so shards can run on separate machines)
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let server;
let base = process.env.STUDIO_URL;
if (!base) {
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
}
const shots = process.env.STUDIO_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

// Warm-up visit: lets the dev server finish bundling dependencies (it reloads the page once when
// it discovers a new one), so no check runs against a half-reloaded page.
{
  const warm = await browser.newPage();
  await warm.goto(`${base}/studio-fixture.html`).catch(() => {});
  await warm.waitForSelector("[data-studio-editor]", { timeout: 60000 }).catch(() => {});
  await warm.waitForTimeout(2000);
  await warm.close();
}

const results = [];
const [shardNo, shardCount] = (process.env.STUDIO_SHARD || "1/1").split("/").map(Number);
if (!(shardCount >= 1 && shardNo >= 1 && shardNo <= shardCount)) throw new Error(`STUDIO_SHARD must look like 2/3, not ${process.env.STUDIO_SHARD}`);
let checkNo = 0;
async function check(name, viewport, run, query = "", prepare = null) {
  // STUDIO_ONLY="words" runs only the checks whose name contains those words (local iteration).
  if (process.env.STUDIO_ONLY && !name.includes(process.env.STUDIO_ONLY)) return;
  if (checkNo++ % shardCount !== shardNo - 1) return;
  const started = Date.now();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    if (prepare) await prepare(page);
    await page.goto(`${base}/studio-fixture.html${query}`);
    await page.waitForSelector("[data-studio-editor]", { timeout: 30000 });
    await run(page);
    if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
    // Any Studio button that opened nothing during the check (openTarget's reportDeadStudioLink) fails it.
    await page.waitForTimeout(100);
    const dead = await page.evaluate(() => window.__studioDeadLinks || []).catch(() => []);
    if (dead.length) throw new Error(`buttons opened nothing: ${dead.join(", ")}`);
    results.push({ name, ok: true, ms: Date.now() - started });
  } catch (error) {
    // Keep Playwright's "waiting for <locator>" line so a CI failure names the element it waited for.
    const lines = String(error?.message || error).split("\n");
    const waited = lines.find(l => /waiting for/.test(l));
    results.push({ name, ok: false, ms: Date.now() - started, error: [lines[0], waited?.trim()].filter(Boolean).join(" · ") });
  } finally {
    if (shots) await page.screenshot({ path: join(shots, name.replace(/\W+/g, "-") + ".png") }).catch(() => {});
    await page.close();
  }
}
const expectText = async (page, text, timeout = 5000) => page.getByText(text).first().waitFor({ timeout });
const calls = page => page.evaluate(() => window.__studioFixture.calls);
const mod = process.platform === "darwin" ? "Meta" : "Control";
const desktop = { width: 1440, height: 900 };

await check("preview connects with the unsaved design", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frameLocator("iframe").first();
  await frame.getByText("Night Pages").first().waitFor({ timeout: 15000 });
});

await check("add section, undo, redo, save draft", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  await page.keyboard.press(`${mod}+z`);
  await expectText(page, "Home · 0 sections");
  await page.keyboard.press(`${mod}+Shift+z`);
  await expectText(page, "Home · 1 section");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const save = (await calls(page)).find(c => c.method === "saveDesign");
  if (save.args[1]?.publish) throw new Error("Save draft published the design");
  if (!save.args[0].design.heroPage.sections.some(s => s.type === "NewsletterSection")) throw new Error("saved draft is missing the new section");
});

await check("device switch keeps the real viewport width", desktop, async page => {
  await page.getByRole("button", { name: "Tablet preview" }).click();
  // The frame keeps the device's real CSS width (the preview is scaled to fit, never squeezed),
  // so the storefront inside switches to the matching breakpoint.
  const frameWidth = () => page.evaluate(() => document.querySelector(".studio-preview-frame")?.style.width);
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "820px", null, { timeout: 5000 })
    .catch(async () => { throw new Error(`tablet frame is ${await frameWidth()}`); });
  await page.getByRole("button", { name: "Phone preview" }).click();
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "390px", null, { timeout: 5000 })
    .catch(async () => { throw new Error(`phone frame is ${await frameWidth()}`); });
});

await check("desktop preview fits the canvas and zoom can show it at full size", desktop, async page => {
  const scale = () => page.evaluate(() => Number(document.querySelector(".studio-preview-frame")?.getAttribute("data-scale")));
  if (!(await scale() < 1)) throw new Error("the 1200px desktop preview was not scaled to fit the canvas");
  await page.getByLabel("Preview zoom").selectOption("100");
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.getAttribute("data-scale") === "1.000");
});

await check("page picker searches pages, collections and books, and keeps the workspace", desktop, async page => {
  await page.getByRole("button", { name: "Theme settings" }).click();
  await page.getByRole("button", { name: "Page to edit" }).click();
  await page.getByRole("combobox", { name: "Find a page, collection or book" }).fill("paper");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[aria-label='Page to edit']")?.textContent?.includes("Paper Weather"));
  const pressed = await page.getByRole("button", { name: "Theme settings" }).getAttribute("aria-pressed");
  if (pressed !== "true") throw new Error("switching page left Theme settings");
  await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src")?.includes("/books/paper-weather"));
});

await check("find anything opens a setting", desktop, async page => {
  await page.keyboard.press(`${mod}+k`);
  const search = page.getByRole("dialog").getByRole("combobox");
  await search.fill("announcement");
  await page.getByRole("option").first().waitFor({ state: "attached", timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
});

await check("find anything opens an element setting at the size being previewed", desktop, async page => {
  await page.getByRole("button", { name: "Phone preview" }).click();
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "390px", null, { timeout: 5000 });
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByRole("combobox").fill("newsletter button padding top");
  await page.getByRole("option").first().waitFor({ state: "attached", timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.locator('[data-style-key="regions.newsletterButtonMobilePaddingTop"]').first().waitFor({ state: "attached", timeout: 8000 });
  const width = await page.evaluate(() => document.querySelector(".studio-preview-frame")?.style.width);
  if (width !== "390px") throw new Error(`the preview left phone size (${width})`);
  // From desktop, a search that names "phone" opens the phone setting and the phone preview.
  await page.getByRole("button", { name: "Computer preview" }).click();
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "1200px", null, { timeout: 5000 });
  // Content width: a column wider than the 1200px preview screen widens the screen so the change shows.
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByRole("combobox").fill("content width");
  await page.getByRole("option").first().waitFor({ state: "attached", timeout: 5000 });
  await page.keyboard.press("Enter");
  const widthSlider = page.locator('[data-style-key="containerWidth"] input[type="range"]').first();
  await widthSlider.waitFor({ state: "attached", timeout: 8000 });
  await widthSlider.evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "1400"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "1920px" || document.querySelector(".studio-preview-frame")?.style.width === "1440px", null, { timeout: 5000 });
  await page.getByLabel("Desktop preview screen width").selectOption("1200");
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "1200px", null, { timeout: 5000 });
  if (!(await page.locator("[data-width-note]").first().textContent())?.includes("fills the 1200px")) throw new Error("Content width did not explain that the column fills the preview screen");
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByRole("combobox").fill("newsletter button phone padding top");
  await page.getByRole("option").first().waitFor({ state: "attached", timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.locator('[data-style-key="regions.newsletterButtonMobilePaddingTop"]').first().waitFor({ state: "attached", timeout: 8000 });
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "390px", null, { timeout: 5000 });
});

await check("find anything offers commands for the selected section, recent picks and > commands", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("button", { name: "Close settings" }).waitFor({ timeout: 5000 });
  await page.keyboard.press(`${mod}+k`);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("For what you selected").waitFor({ timeout: 5000 });
  await dialog.getByRole("combobox").fill("hide");
  await dialog.getByRole("option", { name: /Hide this section/ }).first().click();
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByRole("option", { name: /Show this section/ }).first().waitFor({ timeout: 5000 });
  await page.getByRole("dialog").getByRole("combobox").fill("> phone");
  const options = page.getByRole("dialog").getByRole("option");
  await options.first().waitFor({ timeout: 5000 });
  const kinds = await options.locator(".studio-find-kind").allTextContents();
  if (kinds.some(k => !/^(do|go to)$/i.test(k.trim()))) throw new Error(`> showed non-commands: ${kinds.join(", ")}`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".studio-preview-frame")?.style.width === "390px", null, { timeout: 5000 });
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByText("Recent").waitFor({ timeout: 5000 });
});

await check("clicking a section in the preview opens its settings", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByText("Nothing selected").waitFor({ timeout: 5000 });
  await expectText(page, "Preview connected", 30000);
  // Studio sends its click-to-edit maps shortly after the preview connects.
  await page.waitForTimeout(1500);
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-fm-section]").first().click({ position: { x: 8, y: 8 }, timeout: 15000 });
  await page.getByRole("button", { name: "Close settings" }).waitFor({ timeout: 8000 });
});

await check("a slow preview never clears what the owner selected", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("button", { name: "Close settings" }).waitFor({ timeout: 5000 });
  await expectText(page, "Preview connected", 30000);
  await page.waitForTimeout(1500);
  if (!(await page.getByRole("button", { name: "Close settings" }).count())) throw new Error("the section was deselected when the preview connected");
}, "", page => page.route(/preview=true/, async route => { await new Promise(r => setTimeout(r, 5000)); await route.continue(); }));

await check("page structure lists the header, follows the pointer and opens the bag", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const panel = page.locator(".studio-structure");
  await panel.locator("summary", { hasText: "Header" }).click();
  const masthead = panel.getByRole("button", { name: /^Masthead/ }).first();
  await masthead.waitFor({ timeout: 15000 });
  await masthead.hover();
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-studio-overlay]", { hasText: "Masthead" }).first().waitFor({ state: "visible", timeout: 5000 });
  await panel.locator("summary", { hasText: "Pop-ups" }).click();
  await panel.getByRole("button", { name: "Open in preview" }).first().click();
  await frame.locator("[role=dialog][data-studio-label='Cart drawer']").waitFor({ state: "visible", timeout: 8000 });
  await panel.getByRole("button", { name: /^Shopping bag/ }).click();
  const pressed = await page.getByRole("button", { name: "Theme settings", exact: true }).first().getAttribute("aria-pressed");
  if (pressed !== "true") throw new Error("Shopping bag did not open its settings");
});

await check("Back returns to where you were after a Find jump, and the path shows the workspace", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const crumbs = () => page.locator("[data-studio-breadcrumb] .studio-crumbs").innerText().then(t => t.replace(/\s+/g, " ").trim());
  const pressed = name => page.locator(`nav[aria-label="Studio workspaces"] button[aria-label="${name}"]`).getAttribute("aria-pressed");
  const back = page.locator("[data-studio-back]");
  if (!(await back.isDisabled())) throw new Error("Back is enabled before the owner has gone anywhere");
  if (!(await crumbs()).startsWith("Page layout")) throw new Error(`the path does not start with the workspace: ${await crumbs()}`);
  await page.waitForTimeout(1000);
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByRole("combobox").fill("announcement");
  await page.getByRole("option").first().waitFor({ state: "attached", timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
  // Find opens the Header & announcement bar settings: the path names them, and Back returns to the page.
  await page.waitForFunction(() => /^Theme settings › Header & announcement bar/.test((document.querySelector("[data-studio-breadcrumb] .studio-crumbs")?.textContent || "").replace(/\s+/g, " ").trim()), null, { timeout: 5000 })
    .catch(async () => { throw new Error(`the path does not name the part Find opened: ${await crumbs()}`); });
  if (await back.isDisabled()) throw new Error("Back stayed disabled after a Find jump");
  await page.waitForTimeout(900);
  await back.click();
  await page.waitForFunction(() => /^Page layout › Home$/.test((document.querySelector("[data-studio-breadcrumb] .studio-crumbs")?.textContent || "").replace(/\s+/g, " ").trim()), null, { timeout: 5000 })
    .catch(async () => { throw new Error(`Back did not return to Page layout › Home: ${await crumbs()}`); });
  if ((await pressed("Page layout")) !== "true") throw new Error("Back did not keep Page layout on the rail");
  if (!await back.isDisabled()) throw new Error("Back is still enabled with nowhere left to go");
  // A rail change is a jump too; Alt+Left (from the keyboard) returns from it, and the path names the workspace.
  await page.waitForTimeout(900);
  await page.locator('nav[aria-label="Studio workspaces"] button[aria-label="Theme settings"]').click();
  await page.waitForFunction(() => (document.querySelector("[data-studio-breadcrumb] .studio-crumbs")?.textContent || "").trim() === "Theme settings", null, { timeout: 5000 })
    .catch(async () => { throw new Error(`the path does not name Theme settings: ${await crumbs()}`); });
  await page.waitForTimeout(900);
  await page.keyboard.press("Alt+ArrowLeft");
  await page.waitForFunction(() => /^Page layout › Home$/.test((document.querySelector("[data-studio-breadcrumb] .studio-crumbs")?.textContent || "").replace(/\s+/g, " ").trim()), null, { timeout: 5000 })
    .catch(async () => { throw new Error(`Alt+Left did not go back: ${await crumbs()}`); });
  if ((await pressed("Page layout")) !== "true") throw new Error("Alt+Left did not reopen Page layout on the rail");
});

await check("Back closes a page part opened by clicking the preview", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frameLocator("iframe").first();
  const crumbs = () => page.locator("[data-studio-breadcrumb] .studio-crumbs").innerText().then(t => t.replace(/\s+/g, " ").trim());
  await page.waitForTimeout(1000);
  await frame.locator("header [data-studio-copy='navSearch']").first().click({ timeout: 15000 });
  await page.locator("[data-studio-element-inspector]").waitFor({ timeout: 8000 });
  if (!/^Page layout › Home › \S/.test(await crumbs())) throw new Error(`the path does not name the clicked part: ${await crumbs()}`);
  await page.waitForTimeout(900);
  await page.locator("[data-studio-back]").click();
  await page.getByText("Nothing selected").waitFor({ timeout: 5000 });
  if ((await crumbs()) !== "Page layout › Home") throw new Error(`Back left the path at: ${await crumbs()}`);
});

await check("Theme settings lists the shop top to bottom, and the Where-is-it map jumps to a part", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByText("Where is it on the shop?").first().waitFor({ timeout: 5000 });
  const titles = await page.locator(".studio-settings-heading h3").allTextContents();
  const want = ["Top of every page", "Shop & book pages", "Bag, checkout & accounts", "Custom pages & features", "Bottom of every page", "Pop-ups & notices"];
  if (JSON.stringify(titles.slice(0, want.length)) !== JSON.stringify(want)) throw new Error(`headings are ${titles.join(" | ")}`);
  const footerCards = await page.locator("section[aria-labelledby=studio-heading-bottom] .studio-category-card strong").allTextContents();
  if (!footerCards.includes("Footer & social links")) throw new Error(`Bottom of every page holds ${footerCards.join(", ")}`);
  const topCards = await page.locator("section[aria-labelledby=studio-heading-top] .studio-category-card strong").allTextContents();
  if (!topCards.includes("Logo & wordmark")) throw new Error(`Top of every page holds ${topCards.join(", ")}`);
  await page.getByRole("button", { name: "Jump to Bottom of every page" }).click();
  await page.waitForFunction(() => {
    const heading = document.getElementById("studio-heading-bottom");
    const scroller = document.querySelector(".studio-sidebar .flex-1");
    if (!heading || !scroller) return false;
    const h = heading.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    return h.top >= s.top - 2 && h.top < s.top + s.height / 2;
  }, null, { timeout: 5000 });
});

await check("Page layout: the click tip hides for good, and Style / Words on a part open its settings", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const tip = page.getByRole("note").filter({ hasText: "click anything in the preview to edit it" });
  await tip.waitFor({ timeout: 5000 });
  const panel = page.locator(".studio-structure");
  await panel.locator("summary", { hasText: "Header" }).click();
  await panel.getByRole("button", { name: /^Header/ }).first().waitFor({ timeout: 15000 });
  await panel.getByRole("button", { name: "Words for Header", exact: true }).click();
  await page.getByRole("button", { name: "All text categories" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Page layout", exact: true }).first().click();
  const headerGroup = panel.locator("summary", { hasText: "Header" });
  if (!(await panel.getByRole("button", { name: "Style settings for Header", exact: true }).isVisible().catch(() => false))) await headerGroup.click();
  await panel.getByRole("button", { name: "Style settings for Header", exact: true }).click();
  await page.locator("[data-studio-panel=style-focus]").waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Page layout", exact: true }).first().click();
  await tip.getByRole("button", { name: "Hide this tip" }).click();
  await tip.waitFor({ state: "detached", timeout: 3000 });
  await page.reload();
  await page.waitForSelector("[data-studio-editor]", { timeout: 30000 });
  await page.locator(".studio-structure").waitFor({ timeout: 10000 });
  if (await page.getByRole("note").filter({ hasText: "click anything in the preview to edit it" }).count()) throw new Error("the tip came back after it was hidden");
});

await check("a page part opens in the inspector with its words, and an edit shows in the preview", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const panel = page.locator(".studio-structure");
  await panel.locator("summary", { hasText: "Header" }).click();
  await panel.getByRole("button", { name: /^Header/ }).first().click();
  const inspector = page.locator("[data-studio-element-inspector]");
  await inspector.waitFor({ timeout: 5000 });
  await inspector.getByRole("tab", { name: "Words" }).waitFor({ timeout: 5000 });
  await inspector.getByRole("tab", { name: "Style" }).waitFor({ timeout: 5000 });
  await inspector.getByRole("tab", { name: "Words" }).click();
  const fields = inspector.locator(".studio-copy-field input");
  let edited = null;
  for (let i = 0; i < await fields.count(); i++) {
    const value = await fields.nth(i).inputValue();
    if (value.length >= 3 && !value.includes("{")) { edited = { i, value }; break; }
  }
  if (!edited) throw new Error("no plain word to edit in the Header words");
  await fields.nth(edited.i).fill(edited.value + " Zq");
  const frame = page.frameLocator("iframe").first();
  await frame.getByText(edited.value + " Zq").first().waitFor({ state: "attached", timeout: 8000 });
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  if ((await fields.nth(edited.i).inputValue()) !== edited.value) throw new Error("Undo did not restore the word");
  await page.keyboard.press("Escape");
  await page.getByText("Nothing selected").waitFor({ timeout: 5000 });
});

await check("a section's Style, Layout and Visibility tabs save its look", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  const tabs = page.getByRole("tablist", { name: "Section settings" });
  for (const name of ["Content", "Style", "Layout", "Visibility"]) await tabs.getByRole("tab", { name }).waitFor({ timeout: 5000 });
  await tabs.getByRole("tab", { name: "Visibility" }).click();
  await page.getByRole("switch", { name: "Hide on tablets", exact: true }).waitFor({ timeout: 5000 });
  await tabs.getByRole("tab", { name: "Style" }).click();
  await page.locator("[data-section-style-key=bgColor] input:not([type=color])").fill("#112233");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const saved = (await calls(page)).filter(c => c.method === "saveDesign").pop();
  const section = saved.args[0].design.heroPage.sections.find(s => s.type === "NewsletterSection");
  if (section?.settings?.bgColor !== "#112233") throw new Error(`saved bgColor is ${section?.settings?.bgColor}`);
  await page.getByRole("button", { name: "Reset Solid colour" }).click();
  if (await page.getByRole("button", { name: "Reset Solid colour" }).count()) throw new Error("Reset did not clear the colour");
});

await check("link and book pickers save the same strings as typed links", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Image with Text/ }).first().click();
  await page.getByRole("button", { name: "Choose link: CTA link" }).click();
  await page.getByRole("combobox", { name: "Find a page, category or book" }).fill("about");
  await page.keyboard.press("Enter");
  await page.getByLabel("CTA link (address)").waitFor({ timeout: 5000 });
  if ((await page.getByLabel("CTA link (address)").inputValue()) !== "/page/about") throw new Error("the picked page did not fill the link");
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Showcase Product Grid/ }).first().click();
  await page.getByLabel("Which books").selectOption("manual");
  await page.getByRole("button", { name: /^Add a book: / }).click();
  await page.getByRole("combobox", { name: "Find a book to add" }).fill("paper");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const saved = (await calls(page)).filter(c => c.method === "saveDesign").pop();
  const sections = saved.args[0].design.heroPage.sections;
  const banner = sections.find(s => s.type === "ImageWithTextSection");
  if (banner?.settings?.ctaUrl !== "/page/about") throw new Error(`saved ctaUrl is ${banner?.settings?.ctaUrl}`);
  const grid = sections.find(s => s.type === "ProductShowcaseGridSection");
  if (grid?.settings?.productSource !== "manual" || grid?.settings?.manualSlugs !== "paper-weather") throw new Error(`saved grid source ${grid?.settings?.productSource} / ${grid?.settings?.manualSlugs}`);
  // The preview shows only the picked book.
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-fm-section] .fm-card-title", { hasText: "Paper Weather" }).first().waitFor({ timeout: 15000 });
  if (await frame.locator("[data-fm-section] .fm-card-title", { hasText: "Night Pages" }).count()) throw new Error("the grid still shows a book that was not picked");
});

await check("right-click a section to move it to another page, and Undo brings it back", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  await page.locator(".studio-outline .studio-tree-row").first().click({ button: "right" });
  await page.getByRole("button", { name: "Move to another page…" }).click();
  const dialog = page.getByRole("dialog", { name: /Move section to another page/ });
  await dialog.getByLabel("Page").selectOption({ label: "About" });
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expectText(page, "Home · 0 sections");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectText(page, "Home · 1 section");
});

await check("pick several sections and hide them together", desktop, async page => {
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Add section" }).first().click();
    await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  }
  await expectText(page, "Home · 2 sections");
  const labels = page.locator(".studio-outline .studio-tree-row > .studio-tree-label");
  await labels.nth(0).click({ modifiers: [mod] });
  await labels.nth(1).click({ modifiers: [mod] });
  const bar = page.getByRole("toolbar", { name: "Selected sections" });
  await bar.getByText("2 selected").waitFor({ timeout: 5000 });
  await bar.getByRole("button", { name: "Hide" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".studio-outline .studio-tree-row[data-hidden=true]").length === 2);
});

await check("Theme settings › Show on page selects that part, opening the bag when needed", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByText("Where is it on the shop?").first().waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Show Header & announcement bar on the page" }).click();
  await page.locator("[data-studio-element-inspector]").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByRole("button", { name: "Show Cart drawer (shopping bag) on the page" }).click();
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[role=dialog][data-studio-label='Cart drawer']").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-studio-element-inspector][aria-label='Cart drawer settings']").waitFor({ timeout: 10000 });
});

await check("every Show on page button selects its part or opens its settings, never a dead end", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const openHome = async () => {
    await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
    const back = page.getByRole("button", { name: /All theme settings|Back to theme settings/ }).first();
    if (await back.isVisible().catch(() => false)) await back.click();
    await page.getByText("Where is it on the shop?").first().waitFor({ timeout: 5000 });
  };
  await openHome();
  const names = await page.getByRole("button", { name: /^Show .+ on the page$/ }).evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
  // These parts always render on their page in the fixture, so they must open in the inspector.
  const mustSelect = ["Header & announcement bar", "Customer accounts", "Badges & shop labels", "Custom pages", "Checkout"];
  const outcomes = [];
  for (const name of names) {
    await openHome();
    await page.getByRole("button", { name, exact: true }).click();
    const title = name.replace(/^Show /, "").replace(/ on the page$/, "");
    const outcome = await Promise.race([
      page.locator("[data-studio-element-inspector]").waitFor({ timeout: 12000 }).then(() => "selected"),
      page.getByText(`${title} isn't showing on this page right now`).waitFor({ timeout: 12000 }).then(() => "settings"),
    ]).catch(() => "nothing");
    outcomes.push(`${title}: ${outcome}`);
    if (outcome === "nothing") throw new Error(`Show on page did nothing for ${title}`);
    if (mustSelect.some(m => title.startsWith(m)) && outcome !== "selected") throw new Error(`${title} opened its settings instead of the part`);
    if (outcome === "selected") await page.getByRole("button", { name: "Close settings" }).click().catch(() => {});
  }
  console.log("    " + outcomes.join(" · "));
});

await check("Show on page works when that custom page is already open", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Page to edit" }).click();
  await page.getByRole("option", { name: /^About/ }).first().click();
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByRole("button", { name: /^Show Custom pages/ }).click();
  await page.locator("[data-studio-element-inspector]").waitFor({ timeout: 12000 });
  const picked = await page.getByRole("button", { name: "Page to edit" }).textContent();
  if (!/About/.test(picked || "")) throw new Error(`Page to edit changed to ${picked}`);
});

await check("long text groups open as short sub-sections", desktop, async page => {
  await page.getByRole("button", { name: "Text & labels", exact: true }).first().click();
  await page.getByRole("button", { name: /^Checkout/ }).first().click();
  await page.getByRole("button", { name: /Payment & the Pay button/ }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: /Error messages/ }).waitFor({ timeout: 5000 });
});

await check("page-only overrides are listed and can follow all pages", desktop, async page => {
  await page.getByRole("button", { name: "Theme settings" }).click();
  await page.getByRole("button", { name: "Page to edit" }).click();
  await page.getByRole("combobox", { name: "Find a page, collection or book" }).fill("catalog");
  await page.keyboard.press("Enter");
  const card = page.locator("[data-studio-page-overrides]");
  await card.locator("summary").click();
  const count = async () => Number(await card.locator(".studio-overrides-count").textContent());
  const before = await count();
  if (!(before > 0)) throw new Error("no page overrides listed for the live catalog page");
  await card.getByRole("button", { name: "Use the all-pages value" }).first().click();
  await page.waitForFunction(n => Number(document.querySelector("[data-studio-page-overrides] .studio-overrides-count")?.textContent) === n - 1, before);
}, "?live=1");

await check("deleting a section is instant and Undo brings it back", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  await page.getByRole("button", { name: "Delete section" }).click();
  await expectText(page, "Home · 0 sections");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectText(page, "Home · 1 section");
  const title = await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).getAttribute("title");
  if (!/Undo: Add Newsletter/.test(title || "")) throw new Error(`undo button says "${title}"`);
});

await check("? opens the keyboard shortcuts", desktop, async page => {
  await page.locator("body").press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ timeout: 5000 });
});

await check("a Studio link opens the right page and tool", desktop, async page => {
  await page.waitForFunction(() => document.querySelector("[aria-label='Page to edit']")?.textContent?.includes("Paper Weather"));
  const pressed = await page.getByRole("button", { name: "Theme settings" }).getAttribute("aria-pressed");
  if (pressed !== "true") throw new Error("the link did not open Theme settings");
}, "#designer?b=paper-weather&tab=style");

await check("Media lists a library image and opens its details", desktop, async page => {
  await page.getByRole("button", { name: "Media", exact: true }).click();
  const card = page.locator("[data-media-id='m-riso-print']");
  await card.waitFor({ timeout: 10000 });
  const thumbLoaded = await card.locator("img").evaluate(img => img.complete && img.naturalWidth > 0);
  if (!thumbLoaded) throw new Error("the fixture image thumbnail did not load");
  await page.getByRole("button", { name: /^No description/ }).click();
  await card.waitFor({ timeout: 5000 });
  await card.click();
  await expectText(page, "Where it's used");
  await expectText(page, "Not used anywhere yet");
  await page.getByRole("table", { name: "Sizes shoppers download" }).waitFor({ timeout: 5000 });
  await page.getByLabel("Picture description").fill("Red dot on yellow paper");
  await page.getByRole("button", { name: "Save description" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveMedia" && c.args[0].alt === "Red dot on yellow paper"));
});

await check("an image field picks from the library; the preview gets srcset", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Image Banner/ }).first().click();
  await page.locator("[data-media-choose='imageUrl']").click();
  const dialog = page.getByRole("dialog", { name: /Choose an image/ });
  await dialog.locator("[data-media-id='m-riso-print']").click();
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  const frame = page.frameLocator("iframe").first();
  await frame.locator("img[srcset*='480w']").first().waitFor({ state: "attached", timeout: 15000 });
});

await check("Media explains a library whose rules aren't deployed", desktop, async page => {
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expectText(page, "The media library isn't switched on yet");
}, "?media=denied");

await check("Motion: blocks set to appear as you scroll get the motion CSS, and Play this section's motion replays it", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Flexible composition/ }).first().click();
  await page.getByRole("tablist", { name: "Section settings" }).getByRole("tab", { name: "Style" }).click();
  await page.locator("[data-section-style-key=revealBlocks] select").selectOption("fade-up");
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  if (!frame) throw new Error("no preview frame");
  await frame.waitForFunction(() => [...document.querySelectorAll("style")].some(s => s.textContent.includes('[data-motion="armed"] [data-fm-block]{opacity:0')), null, { timeout: 10000 });
  const sectionId = await frame.evaluate(() => document.querySelector("[data-motion-watch]")?.parentElement?.getAttribute("data-fm-section"));
  if (!sectionId) throw new Error("the section has no motion watcher");
  // Replay: the section is armed (blocks hidden) and then shown again.
  await frame.evaluate(id => { window.__motionSeen = []; const el = document.querySelector(`[data-fm-section="${id}"]`); new MutationObserver(() => window.__motionSeen.push(el.getAttribute("data-motion"))).observe(el, { attributes: true, attributeFilter: ["data-motion"] }); }, sectionId);
  await page.locator("[data-studio-panel='motion-preview']").getByRole("button", { name: "Play this section's motion" }).click();
  await frame.waitForFunction(() => (window.__motionSeen || []).includes("armed") && window.__motionSeen.at(-1) === "shown", null, { timeout: 5000 });
  await frame.waitForFunction(id => getComputedStyle(document.querySelector(`[data-fm-section="${id}"] [data-fm-block]`)).opacity === "1", sectionId, { timeout: 5000 });
});

await check("Arrange on page: a Flexible composition block moves on the grid by keyboard and by dragging, and Undo restores it", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Flexible composition/ }).first().click();
  const card = page.locator("[data-studio-panel='grid-arrange']");
  await card.waitFor({ timeout: 5000 });
  await card.getByRole("button", { name: "Arrange on page" }).click();
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  if (!frame) throw new Error("no preview frame");
  const box = frame.locator("[data-studio-grid] [data-grid-block]").first();
  await box.waitFor({ timeout: 10000 });
  const lastDesign = async () => {
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForTimeout(400);
    return (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design;
  };
  const composition = d => d.heroPage.sections.filter(s => s.type === "CompositionSection").pop();
  // Keyboard: Shift + Right makes the block one column wider (an unplaced block starts one column wide).
  await box.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForFunction(() => document.querySelector("button[aria-label^='Undo']")?.getAttribute("title")?.includes("Resize block on grid"), null, { timeout: 5000 });
  let saved = await lastDesign();
  const first = composition(saved).settings.items[0];
  if (first.grid?.desktop?.span !== 2) throw new Error(`keyboard resize saved ${JSON.stringify(first.grid)}`);
  // Mouse: drag the resize corner right by about a third of the grid (four more columns).
  const handle = frame.locator("[data-studio-grid] [data-grid-block] [data-grid-resize]").first();
  await handle.waitFor({ timeout: 5000 });
  const hb = await handle.boundingBox();
  const gb = await frame.locator("[data-studio-grid]").boundingBox();
  if (!hb || !gb) throw new Error("no handle box");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + gb.width / 3, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("button[aria-label^='Undo']")?.getAttribute("title")?.includes("Place block on grid"), null, { timeout: 5000 });
  saved = await lastDesign();
  const dragged = composition(saved).settings.items[0].grid.desktop.span;
  if (!(dragged >= 5 && dragged <= 7)) throw new Error(`drag saved span ${dragged}`);
  // Undo twice brings back the original placement.
  await page.getByRole("button", { name: /^Undo/ }).click();
  await page.getByRole("button", { name: /^Undo/ }).click();
  saved = await lastDesign();
  if (composition(saved)?.settings.items[0].grid?.desktop?.span) throw new Error("Undo did not restore the placement");
  await card.getByRole("button", { name: "Stop arranging" }).click();
  await frame.locator("[data-studio-grid]").waitFor({ state: "detached", timeout: 5000 });
});

await check("Brand kit: a logo's colour becomes a palette, the canvas previews it, Apply is one undoable change", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const lastDesign = async () => {
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForTimeout(400);
    return (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design;
  };
  await page.getByRole("button", { name: "Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Brand kit…" }).click();
  const kit = page.locator("[data-studio-brand-kit]");
  await kit.waitFor({ timeout: 5000 });
  // A red square on white, drawn in the page and handed to the file input like a real upload.
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = c.height = 40;
    const x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, 40, 40); x.fillStyle = "#e8402a"; x.fillRect(8, 8, 24, 24);
    return c.toDataURL("image/png").split(",")[1];
  });
  await kit.locator('input[aria-label="Upload your logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
  await kit.getByText("Colours found").waitFor({ timeout: 15000 });
  await kit.getByRole("button", { name: "Next" }).click();
  await kit.locator("[data-palette='logo-light']").click();
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  if (!frame) throw new Error("no preview frame");
  await frame.waitForFunction(() => /250, 248, 244/.test(document.querySelector("header[data-fm-header]")?.getAttribute("style") || ""), null, { timeout: 10000 });
  await kit.getByRole("button", { name: "Next" }).click();
  await kit.locator("[data-personality='bold']").click();
  await kit.getByRole("button", { name: "Next" }).click();
  await kit.locator("[data-home='keep']").click();
  await kit.getByRole("button", { name: "Next" }).click();
  await kit.locator("[data-brand-summary]").getByText(/Anton headings/).waitFor({ timeout: 5000 });
  const homeBefore = await page.evaluate(() => { const f = window.__studioFixture.settings; return ((f.draftDesign || f.design || {}).heroPage?.sections || []).length; });
  await kit.getByRole("button", { name: "Apply brand kit" }).click();
  await page.waitForFunction(() => document.querySelector("button[aria-label^='Undo']")?.getAttribute("title")?.includes("Apply brand kit"), null, { timeout: 5000 });
  let saved = await lastDesign();
  if (saved.backgroundColor !== "#faf8f4" || saved.headingFont !== "Anton" || !/^#e8402a$/i.test(saved.primaryColor)) {
    throw new Error(`brand kit saved ${JSON.stringify({ bg: saved.backgroundColor, font: saved.headingFont, accent: saved.primaryColor })}`);
  }
  if (!String(saved.logoUrl || "").includes("example.invalid")) throw new Error("the uploaded logo was not set");
  if ((saved.heroPage?.sections || []).length !== homeBefore) throw new Error("Keep my Home page changed Home");
  if (!(saved.colorSchemes || []).some(s => s.id === "brand-accent")) throw new Error("no Brand colour scheme");
  await page.getByRole("button", { name: /^Undo/ }).click();
  saved = await lastDesign();
  if (saved.backgroundColor === "#faf8f4") throw new Error("Undo did not take the brand kit back");
});

await check("Block picker: pointing at a block tries it on the page, clicking adds it, and Undo removes it", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Flexible composition/ }).first().click();
  await page.locator("[data-studio-panel='block-clipboard']").getByRole("button", { name: "Add block…" }).click();
  const picker = page.locator("[data-studio-block-picker]");
  await picker.getByText(/Adding to/).waitFor({ timeout: 5000 });
  await picker.locator("[data-block-choice='new:image']").hover();
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-fm-block='__studio-block-candidate']").first().waitFor({ state: "attached", timeout: 10000 });
  await picker.getByText("Showing Picture on the page").waitFor({ timeout: 5000 });
  await picker.locator("[data-block-choice='new:image']").click();
  await page.waitForFunction(() => document.querySelector("button[aria-label^='Undo']")?.getAttribute("title")?.includes("Add Picture"), null, { timeout: 5000 });
  await frame.locator("[data-fm-block='__studio-block-candidate']").waitFor({ state: "detached", timeout: 10000 });
  const lastDesign = async () => {
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForTimeout(400);
    return (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design;
  };
  const composition = d => d.heroPage.sections.filter(s => s.type === "CompositionSection").pop();
  let saved = await lastDesign();
  const items = composition(saved).settings.items;
  if (items[items.length - 1]?.type !== "image") throw new Error(`no picture block added: ${JSON.stringify(items.map(b => b.type))}`);
  if (JSON.stringify(saved).includes("__studio-block-candidate")) throw new Error("the try-on block leaked into the saved draft");
  await page.getByRole("button", { name: /^Undo/ }).click();
  saved = await lastDesign();
  if (composition(saved).settings.items.length !== items.length - 1) throw new Error("Undo did not remove the added block");
  // Closing the picker without adding takes the try-on block and its "not added yet" label off the page.
  await page.locator("[data-studio-panel='block-clipboard']").getByRole("button", { name: "Add block…" }).click();
  await picker.locator("[data-block-choice='new:button']").hover();
  await frame.locator("[data-fm-block='__studio-block-candidate']").first().waitFor({ state: "attached", timeout: 10000 });
  await frame.getByText("Preview · not added yet").first().waitFor({ timeout: 5000 });
  await picker.getByRole("button", { name: "Back to sections" }).click();
  await frame.locator("[data-fm-block='__studio-block-candidate']").waitFor({ state: "detached", timeout: 10000 });
  await page.waitForTimeout(500);
  if (await frame.getByText("Preview · not added yet").count()) throw new Error("the preview still labels the closed try-on block");
});

await check("Copy block in one section and paste it into another section of the same kind", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const addComposition = async () => {
    await page.getByRole("button", { name: "Add section" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /^Flexible composition/ }).first().click();
    await page.locator("[data-studio-panel='block-clipboard']").waitFor({ timeout: 5000 });
  };
  await addComposition();
  await page.locator("[data-studio-panel='block-clipboard']").getByRole("button", { name: "Add block…" }).click();
  await page.locator("[data-studio-block-picker] [data-block-choice='new:text']").click();
  await page.locator("[data-studio-panel='block-clipboard']").getByRole("button", { name: "Copy block" }).click();
  await expectText(page, "Block copied");
  await page.getByRole("button", { name: "Page layout", exact: true }).first().click();
  await addComposition();
  await page.locator("[data-studio-panel='block-clipboard']").getByRole("button", { name: "Paste copied block" }).click();
  await page.waitForFunction(() => document.querySelector("button[aria-label^='Undo']")?.getAttribute("title")?.includes("Paste block"), null, { timeout: 5000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForTimeout(400);
  const sections = (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design.heroPage.sections.filter(s => s.type === "CompositionSection");
  if (sections.length !== 2) throw new Error(`expected two compositions, got ${sections.length}`);
  const copied = sections[0].settings.items.find(b => b.title === "New heading");
  const pasted = sections[1].settings.items.find(b => b.title === "New heading");
  if (!copied || !pasted) throw new Error("the copied block was not pasted");
  if (copied.id === pasted.id) throw new Error("the pasted block kept the original's id");
});

await check("New page offers starters; FAQ opens as a draft with its headings", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "New page" }).click();
  const gallery = page.locator("[data-studio-page-starters]");
  await gallery.waitFor({ timeout: 5000 });
  await gallery.locator("[data-page-starter='faq']").click();
  await expectText(page, "FAQ page started as a draft");
  await page.locator(".studio-page-body .ql-editor").getByText("Orders").first().waitFor({ timeout: 5000 });
  if (await page.getByLabel(/Published/).isChecked()) throw new Error("the FAQ starter opened as published");
});

await check("Header and footer colour schemes reach the preview", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByRole("button", { name: /^Colour schemes/ }).first().click();
  for (const part of ["header", "footer"]) {
    const select = page.locator(`[data-style-key="elementSchemes.${part}"] select`);
    await select.waitFor({ timeout: 5000 });
    const value = await select.locator("option").nth(1).getAttribute("value");
    await select.selectOption(value);
  }
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  if (!frame) throw new Error("no preview frame");
  await frame.waitForFunction(() => {
    const header = document.querySelector("header[data-fm-header]");
    const footer = document.querySelector("footer[data-fm-footer]");
    return header && footer && header.getAttribute("style")?.includes("var(--bg-color)") && getComputedStyle(header).getPropertyValue("--bg-color").trim()
      && footer.getAttribute("style")?.includes("var(--bg-color)");
  }, null, { timeout: 10000 });
});

await check("Design scales: a heading scale reaches the preview and a section's spacing step saves", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByRole("button", { name: /^Design scales/ }).first().click();
  const preview = page.locator("[data-studio-scale-preview]");
  await preview.getByText(/Choose a heading size scale/).waitFor({ timeout: 5000 });
  await page.locator('[data-style-key="typeScale"] select').selectOption("perfect-fourth");
  await preview.getByText(/Page title \(h1\)/).waitFor({ timeout: 5000 });
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  if (!frame) throw new Error("no preview frame");
  await frame.waitForFunction(() => {
    const root = document.querySelector("[data-fm-store]");
    return root && getComputedStyle(root).getPropertyValue("--fm-step-4").includes("clamp(");
  }, null, { timeout: 10000 });
  // A section picks a spacing step on its Layout tab.
  await page.getByRole("button", { name: "Page layout", exact: true }).first().click();
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("tablist", { name: "Section settings" }).getByRole("tab", { name: "Layout" }).click();
  await page.locator("[data-section-style-key=spacingStep] select").selectOption("l");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const saved = (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design;
  if (saved.typeScale !== "perfect-fourth") throw new Error("the type scale was not saved");
  if (saved.heroPage.sections.find(s => s.type === "NewsletterSection")?.settings?.spacingStep !== "l") throw new Error("the spacing step was not saved");
});

await check("a new colour scheme reaches a section in the preview, and deleting it warns", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByRole("button", { name: /^Colour schemes/ }).first().click();
  const editor = page.locator("[data-studio-schemes]");
  await editor.getByRole("button", { name: "Add colour scheme" }).click();
  const scheme = editor.locator(".studio-scheme").last();
  const id = await scheme.getAttribute("data-scheme-id");
  await scheme.getByLabel("Scheme name").fill("Zine pink");
  await scheme.locator("[data-scheme-role=background] input:not([type=color])").fill("#ffdde1");
  await scheme.getByText(/Text on background \d/).waitFor({ timeout: 5000 });
  // Give a new section that scheme from its Style tab.
  await page.getByRole("button", { name: "Page layout", exact: true }).first().click();
  await page.getByRole("button", { name: "Add section" }).first().click();
  // (Page layout also lists the built-in "Newsletter …" parts, so pick from the Add section dialog.)
  await page.getByRole("dialog").getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("tablist", { name: "Section settings" }).getByRole("tab", { name: "Style" }).click();
  await page.locator("[data-section-style-key=colorSchemeId] select").selectOption({ label: "Zine pink" });
  const preview = () => page.frames().find(f => /preview=true/.test(f.url()));
  const frame = preview();
  if (!frame) throw new Error("no preview frame");
  await frame.waitForFunction(schemeId => {
    const el = document.querySelector(`[data-fm-section][data-scheme="${schemeId}"]`);
    return el && getComputedStyle(el).getPropertyValue("--bg-color").trim() === "#ffdde1";
  }, id, { timeout: 10000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const saved = (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design;
  if (!saved.colorSchemes?.some(s => s.id === id && s.name === "Zine pink" && s.v === 2)) throw new Error("saved draft is missing the new scheme");
  if (saved.heroPage.sections.find(s => s.type === "NewsletterSection")?.settings?.colorSchemeId !== id) throw new Error("the section did not save its scheme");
  // Deleting a scheme in use asks first; the section then falls back to the theme colours.
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  // Theme settings reopens on the category it was showing.
  await page.locator("[data-studio-schemes]").waitFor({ timeout: 5000 });
  const again = page.locator(`[data-studio-schemes] .studio-scheme[data-scheme-id="${id}"]`);
  await again.getByText("Used by 1 section").waitFor({ timeout: 5000 });
  await again.locator(".studio-scheme-head").click();
  await again.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete colour scheme?" });
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByRole("button", { name: "Delete scheme" }).click();
  await frame.waitForFunction(() => document.querySelector("[data-fm-section]") && !document.querySelector("[data-fm-section][data-scheme]"), null, { timeout: 10000 });
});

await check("the wishlist page shows the one shop header and footer, listed in Page layout", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frameLocator("iframe").first();
  await frame.locator("header[data-section=navigation] [data-studio-label='Category bar']").first().waitFor({ state: "attached", timeout: 15000 });
  await frame.locator("footer[data-studio-label='Footer']").waitFor({ state: "attached", timeout: 5000 });
  // The wishlist's own title bar sits under the shop header as a plain row, not a second <header>.
  if (await frame.locator("header [data-store-region=wishlistHeader], header[data-store-region=wishlistHeader]").count()) throw new Error("the wishlist bar is still a header");
  const panel = page.locator(".studio-structure");
  await panel.locator("summary", { hasText: "Header" }).click();
  await panel.getByRole("button", { name: /^Logo/ }).first().waitFor({ timeout: 15000 });
}, "#designer?t=wishlistPage");

await check("a Newsletter in the Pop-up group opens as a pop-up in the preview and saves to overlaySections", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const panel = page.locator(".studio-structure");
  await panel.locator("summary", { hasText: "Pop-ups" }).click();
  await panel.getByRole("button", { name: /^Pop-up sections/ }).click();
  await panel.locator("summary", { hasText: "Every page · Pop-up" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Newsletter/ }).first().click();
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[role=dialog][data-studio-label='Pop-up'] [data-fm-section]").first().waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const save = (await calls(page)).find(c => c.method === "saveDesign");
  if (!save.args[0].design.overlaySections?.some(s => s.type === "NewsletterSection")) throw new Error("the pop-up section was not saved to overlaySections");
  if (save.args[0].design.heroPage?.sections?.some(s => s.type === "NewsletterSection")) throw new Error("the pop-up section also landed on the page");
});

await check("two announcement messages take turns in the preview", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  await page.getByRole("button", { name: /^Header & announcement bar/ }).first().click();
  const editor = page.locator("[data-studio-panel=announcements]");
  await editor.getByRole("button", { name: "Add message" }).click();
  await editor.getByLabel("Message 1", { exact: true }).fill("First message");
  await editor.getByRole("button", { name: "Add message" }).click();
  await editor.getByLabel("Message 2", { exact: true }).fill("Second message");
  const frame = page.frameLocator("iframe").first();
  const bar = frame.locator("[data-studio-label='Announcement bar']").first();
  await bar.getByText("First message").first().waitFor({ timeout: 10000 });
  await bar.getByText("Second message").first().waitFor({ timeout: 10000 });
});

await check("a header link with sub-links can become a mega menu with a featured card", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Navigation", exact: true }).first().click();
  const links = page.locator("[data-studio-panel='menus:links']");
  await links.getByRole("button", { name: "Add link" }).click();
  await links.getByRole("button", { name: "+ Add sub-link" }).last().click();
  await links.getByLabel("Show sub-links as a mega menu (columns)").last().check();
  await links.getByLabel("Featured card title").last().fill("New this month");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const save = (await calls(page)).find(c => c.method === "saveDesign");
  const item = save.args[0].design.menus?.header?.at(-1);
  if (!item?.mega || item.featuredTitle !== "New this month") throw new Error(`mega menu not saved: ${JSON.stringify(item)}`);
});

await check("Add section tries a section on the page while pointing at it, and adds it on click", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  const library = page.locator("[data-studio-library]");
  await library.getByText(/position 1 of 1/).waitFor({ timeout: 5000 });
  await library.locator("[data-library-type=PraiseQuotesSection] .studio-library-card").hover();
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-fm-section='__studio-candidate']").first().waitFor({ state: "visible", timeout: 10000 });
  await library.getByText("Showing Praise & press quotes on the page").waitFor({ timeout: 5000 });
  await library.locator("[data-library-type=PraiseQuotesSection] .studio-library-card").click();
  await expectText(page, "Home · 1 section");
  await frame.locator("[data-fm-section='__studio-candidate']").waitFor({ state: "detached", timeout: 10000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const save = (await calls(page)).find(c => c.method === "saveDesign");
  const saved = save.args[0].design.heroPage.sections;
  if (!saved.some(s => s.type === "PraiseQuotesSection")) throw new Error("the section was not added");
  if (JSON.stringify(save.args[0].design).includes("__studio-candidate")) throw new Error("the try-on candidate leaked into the saved draft");
});

await check("+ Section above on the canvas opens Add section at that spot", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.locator("[data-library-type=NewsletterSection] .studio-library-card").click();
  const frame = page.frameLocator("iframe").first();
  await frame.getByRole("button", { name: "+ Section above" }).click({ timeout: 10000 });
  await page.locator("[data-studio-library]").getByText(/position 1 of 2/).waitFor({ timeout: 5000 });
});

await check("a Promo strip goes under the header on every page with Add it there instead", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  const item = page.locator("[data-library-type=PromoStripSection]");
  await item.getByText("Best under the header (every page)").waitFor({ timeout: 5000 });
  await item.getByRole("button", { name: "Add it there instead" }).click();
  await page.locator(".studio-structure summary", { hasText: "Every page · Under the header" }).waitFor({ timeout: 5000 });
  const frame = page.frameLocator("iframe").first();
  await frame.getByText("New releases every month").first().waitFor({ timeout: 10000 });
});

await check("a section title on book pages connects to a custom book field", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.locator("[data-library-type=TextContentSection] .studio-library-card").click();
  await page.getByLabel("Connect Title to a detail", { exact: true }).selectOption({ label: "Series" });
  await page.locator("[data-connected-field='book.custom.series']").getByText("Connected to Book › Series").waitFor({ timeout: 5000 });
  const frame = page.frameLocator("iframe").first();
  await frame.getByText("The Night Series").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const save = (await calls(page)).find(c => c.method === "saveDesign");
  const sec = save.args[0].design.productPage.sections.find(s => s.type === "TextContentSection");
  if (sec?.settings?.title?.$dyn !== "book.custom.series") throw new Error(`not connected: ${JSON.stringify(sec?.settings?.title)}`);
}, "#designer?t=productPage");

await check("a new book page template gets its own sections and is listed in the page picker", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const card = page.locator("[data-studio-panel=template]");
  await card.getByRole("button", { name: "New template from this one" }).click();
  await page.getByRole("dialog").getByLabel("Name (e.g. Poetry)").fill("Poetry");
  await page.getByRole("dialog").getByRole("button", { name: "Create template" }).click();
  await card.getByLabel("Book page template to edit").waitFor({ timeout: 5000 });
  if ((await card.getByLabel("Book page template to edit").inputValue()) !== "productPage~poetry") throw new Error("did not switch to the new template");
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.locator("[data-library-type=PromoStripSection] .studio-library-card").click();
  const frame = page.frameLocator("iframe").first();
  await frame.getByText("New releases every month").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const design = (await calls(page)).find(c => c.method === "saveDesign").args[0].design;
  if (!design.alternateTemplates?.productPage?.some(t => t.id === "poetry")) throw new Error("template not registered");
  if (!design["productPage~poetry"]?.sections?.some(s => s.type === "PromoStripSection")) throw new Error("section not on the template");
  if (design.productPage?.sections?.some(s => s.type === "PromoStripSection")) throw new Error("section leaked onto the default template");
}, "#designer?t=productPage");

await check("the buy box follows Buy box blocks, and Add to bag still adds to the bag", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const panel = page.locator("[data-studio-panel=product-blocks]");
  await panel.getByRole("button", { name: "Move Price, sale end & stock up", exact: true }).click();
  await panel.getByRole("button", { name: "Hide Category tag", exact: true }).click();
  await panel.locator(".studio-pdp-add select").selectOption("collapsible");
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  if (!frame) throw new Error("no preview frame");
  await frame.waitForFunction(() => {
    const card = document.querySelector(".fm-pdp-card");
    if (!card) return false;
    const price = card.querySelector(".fm-pdp-price"), title = card.querySelector(".fm-pdp-title");
    return !!price && !!title && !!card.querySelector("details.fm-pdp-collapsible") && !card.querySelector(".fm-pdp-tag")
      && !!(price.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, undefined, { timeout: 15000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const design = (await calls(page)).find(c => c.method === "saveDesign").args[0].design;
  const saved = design.productPage?.productInfoBlocks || [];
  if (!saved.some(b => b.type === "collapsible") || !saved.find(b => b.type === "tag")?.hidden) throw new Error(`blocks not saved: ${JSON.stringify(saved)}`);
  // Commerce safety: the moved buy box still buys.
  await page.getByRole("button", { name: "Switch to Browse mode" }).click();
  await frame.evaluate(() => localStorage.removeItem("fm_cart"));
  await frame.locator(".fm-pdp-card [data-section=buttons]").click();
  await frame.waitForFunction(() => (JSON.parse(localStorage.getItem("fm_cart") || "[]")).length === 1, undefined, { timeout: 10000 });
}, "#designer?t=productPage");

await check("Version history compares a version with the draft and takes one section back", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  await page.getByRole("button", { name: "Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await dialog.waitFor({ timeout: 5000 });
  // A named checkpoint of the current draft.
  await dialog.getByRole("button", { name: "Save checkpoint…" }).click();
  await page.getByRole("dialog", { name: "Save checkpoint" }).getByRole("textbox").fill("Before the newsletter");
  await page.getByRole("dialog", { name: "Save checkpoint" }).getByRole("button", { name: "Save checkpoint" }).click();
  await dialog.getByText("Before the newsletter").waitFor({ timeout: 5000 });
  if (!(await calls(page)).some(c => c.method === "saveThemeCheckpoint" && c.args[0] === "Before the newsletter")) throw new Error("checkpoint not saved");
  // Compare the published version with the draft: the new section is listed, in Studio's words.
  await dialog.locator('[data-version-id="v-published"]').getByRole("button", { name: "Compare" }).click();
  const compare = page.getByRole("dialog", { name: /^Compare/ });
  const item = compare.locator('[data-diff-id^="section:"]').first();
  await item.waitFor({ timeout: 5000 });
  if (!/Newsletter/.test(await item.textContent()) || !/Added/.test(await item.textContent())) throw new Error(`diff item reads "${await item.textContent()}"`);
  await item.getByRole("button", { name: "Use this version's" }).click();
  await compare.getByText("No differences").waitFor({ timeout: 5000 });
  await compare.getByRole("button", { name: "Close dialog" }).click();
  await expectText(page, "Home · 0 sections");
  // The restore is one undoable draft change.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectText(page, "Home · 1 section");
});

await check("a save in another tab shows a live banner, and both sets of changes can be kept", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  // Another tab saves a different Home page section list and a new accent colour.
  await page.evaluate(() => {
    const f = window.__studioFixture;
    f.remoteSave({ ...JSON.parse(JSON.stringify(f.settings.draftDesign)), accentColor: "#123456", heroPage: { sections: [{ id: "theirs", type: "RichTextSection", settings: {} }] } });
  });
  const banner = page.locator("[data-studio-incoming]");
  await banner.waitFor({ timeout: 5000 });
  if (!/You both changed/.test(await banner.textContent())) throw new Error(`banner reads "${await banner.textContent()}"`);
  await banner.getByRole("button", { name: "Bring in theirs, keep mine" }).click();
  await banner.waitFor({ state: "detached", timeout: 5000 });
  await expectText(page, "Home · 1 section");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const save = (await calls(page)).find(c => c.method === "saveDesign");
  if (save.args[0].design.accentColor !== "#123456") throw new Error("their accent colour was lost");
  const kept = (save.args[0].design.heroPage.sections || []).map(x => x.type);
  if (kept.length !== 1 || kept[0] !== "NewsletterSection") throw new Error(`Home sections saved as ${kept.join(", ")}`);
});

await check("a save conflict keeps both tabs' other changes, and a conflict during Publish publishes nothing", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  // Another tab saves a new accent colour and its own Home sections; this tab never hears about it (no live sync).
  await page.evaluate(() => {
    const f = window.__studioFixture;
    const watchers = f.watchers; f.watchers = [];
    f.remoteSave({ ...JSON.parse(JSON.stringify(f.settings.draftDesign)), accentColor: "#123456", heroPage: { sections: [{ id: "theirs", type: "RichTextSection", settings: {} }] } });
    f.watchers = watchers;
  });
  // Publish meets a real conflict (both changed Home): the dialog asks, and Keep mine publishes nothing by itself.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expectText(page, "Saved in another tab or device");
  await page.getByRole("button", { name: "Keep mine, then review" }).click();
  await expectText(page, "Nothing is published yet");
  if ((await calls(page)).some(c => c.method === "saveDesign")) throw new Error("a conflicted Publish still wrote something");
  // Reviewed: Publish again goes out with their accent colour and my Home section.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const publish = (await calls(page)).find(c => c.method === "saveDesign");
  if (!publish.args[1].publish) throw new Error("expected a publish");
  if (publish.args[0].design.accentColor !== "#123456") throw new Error("their accent colour was lost");
  const kept = (publish.args[0].design.heroPage.sections || []).map(x => x.type);
  if (kept.join() !== "NewsletterSection") throw new Error(`Home sections published as ${kept.join(", ")}`);
});

await check("Studio Health checks the previewed page, shows a finding and opens its part", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  // A known problem inside a built-in part (a nameless 12×12 button in the footer), so the check doesn't depend on
  // what the shop's live content happens to contain.
  await page.frames().find(f => f !== page.mainFrame()).evaluate(() => {
    const footer = document.querySelector("footer") || document.body;
    const part = document.createElement("div");
    part.setAttribute("data-studio-target", "style:footer|copy:Footer");
    part.setAttribute("data-studio-label", "Footer");
    part.innerHTML = '<button type="button" data-e2e-health style="width:12px;height:12px;padding:0;border:0"></button>';
    footer.appendChild(part);
  });
  await page.getByRole("button", { name: "Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Studio Health" }).click();
  // On a computer Health opens in the Workbench docked under the preview (3.0 phase 1), not a dialog.
  const dialog = page.locator("[data-studio-workbench]");
  await dialog.getByText("Checking Home at desktop size").waitFor({ timeout: 5000 });
  const finding = dialog.locator('[data-health-id^="noname:"]').first();
  await finding.waitFor({ timeout: 5000 });
  // Show me closes Health, scrolls the preview to it and offers the way back.
  await finding.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "Back to Health" }).click();
  await dialog.locator("[data-health-id]").first().waitFor({ timeout: 5000 });
  await dialog.locator('[data-health-id^="noname:"]').first().getByRole("button", { name: "Edit this part" }).click();
  await page.locator("[data-studio-element-inspector], [data-studio-panel='section-inspector'], .studio-inspector [role=tab]").first().waitFor({ timeout: 5000 });
  if (await page.getByText("Nothing selected").isVisible()) throw new Error("Edit this part opened nothing");
  // Publish says how the page checks out.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const line = page.locator("[data-publish-health]");
  await line.waitFor({ timeout: 5000 });
  if (!/Studio Health checked Home on desktop only/.test(await line.textContent())) throw new Error(`publish line reads "${await line.textContent()}"`);
});

await check("Check every page: audits each kind of page in a hidden preview, Stop works, Open this page switches the canvas", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Studio Health" }).click();
  const wb = page.locator("[data-studio-workbench]");
  const panel = wb.locator("[data-studio-site-health-panel]");
  await panel.waitFor({ timeout: 5000 });
  // Stop ends a run part-way and removes the hidden page.
  await panel.getByRole("button", { name: "Check every page" }).click();
  await panel.getByRole("button", { name: "Stop" }).click();
  await panel.getByRole("button", { name: /^Check every page/ }).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector("iframe[data-studio-site-health]"), null, { timeout: 5000 });
  // A full run lists Home, a book page and a custom page, each with its own count.
  await panel.getByRole("button", { name: /^Check every page/ }).click();
  await panel.getByText(/Checking \d+ of \d+/).waitFor({ timeout: 5000 });
  await panel.locator("[data-site-health-summary]").waitFor({ timeout: 5000 });
  await panel.getByRole("button", { name: "Stop" }).waitFor({ state: "detached", timeout: 240000 });
  for (const id of ["home", "book:default", "wishlist", "404"]) await panel.locator(`[data-site-page="${id}"]`).waitFor({ timeout: 2000 });
  if (!(await panel.locator('[data-site-page^="page:"]').count())) throw new Error("no custom page was checked");
  const summary = await panel.locator("[data-site-health-summary]").textContent();
  if (!/pages? checked/.test(summary)) throw new Error(`summary reads "${summary}"`);
  if (await page.locator("iframe[data-studio-site-health]").count()) throw new Error("a hidden page was left behind");
  if (!(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("studio-site-health-v1:"))))) throw new Error("the run wasn't remembered");
  // Nothing was written while checking.
  if ((await calls(page)).some(c => c.method === "saveDesign")) throw new Error("checking every page wrote the design");
  // Open this page shows the book page on the canvas.
  const book = panel.locator('[data-site-page="book:default"]');
  // Open the row directly: an open <details> has open="" (falsy), so toggling on the attribute would close it.
  await book.locator("details").evaluate(d => { d.open = true; });
  await book.getByRole("button", { name: "Open this page" }).click();
  await page.waitForFunction(() => /\/books\//.test(document.querySelector('iframe[title="Live preview"]')?.getAttribute("src") || ""), null, { timeout: 10000 });
});

await check("Check every page scrolls through so sections that fade in lower down are checked; Open this page on the current page re-checks it", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.evaluate(() => {
    const f = window.__studioFixture;
    const draft = JSON.parse(JSON.stringify(f.settings.draftDesign || f.settings.design || {}));
    const filler = Array.from({ length: 5 }, (_, i) => ({ id: `filler${i}`, type: "RichTextSection", settings: { html: "<p>Filler</p>".repeat(12) } }));
    f.remoteSave({ ...draft, showHero: true, heroPage: { sections: [...filler, { id: "lowest", type: "RichTextSection", settings: { animation: "fade-up", html: '<p><a href="#">Go nowhere</a></p>' } }] } });
  });
  await page.frameLocator('iframe[title="Live preview"]').getByText("Go nowhere").first().waitFor({ state: "attached", timeout: 15000 });
  await page.getByRole("button", { name: "Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Studio Health" }).click();
  const panel = page.locator("[data-studio-site-health-panel]");
  await panel.getByRole("button", { name: "Check every page" }).click();
  await panel.getByRole("button", { name: "Stop" }).waitFor({ state: "detached", timeout: 240000 });
  await panel.locator('[data-site-page="home"] [data-site-finding="nowhere:s:lowest"]').waitFor({ state: "attached", timeout: 2000 });
  // The canvas already shows Home: Open this page checks it again straight away instead of waiting for a reload.
  const stamp = page.locator("[data-studio-workbench] .studio-health > .studio-health-bar span").first();
  const before = await stamp.textContent();
  await page.waitForTimeout(1100);
  await panel.locator('[data-site-page="home"]').getByRole("button", { name: "Open this page" }).click();
  await page.waitForFunction(([sel, old]) => document.querySelector(sel)?.textContent !== old, ["[data-studio-workbench] .studio-health > .studio-health-bar span", before], { timeout: 5000 });
});

await check("Rewrite with AI: a section title is rewritten as one undoable change, and a Text & labels {placeholder} is kept", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  // The fixture answers AI requests itself (setAiTransport), so nothing reaches Google.
  await page.evaluate(() => {
    window.__studioFixture.aiAnswer = body => body.task === "rewrite"
      ? { status: 200, data: { result: { text: body.input.text.includes("{year}") ? "Copyright {year}, the press" : "Letters from the press" } } }
      : undefined;
  });
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  const rewrite = page.getByRole("button", { name: "Rewrite Title with AI" });
  await rewrite.click();
  await page.getByRole("button", { name: "Friendlier" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByText("Letters from the press").first().waitFor({ timeout: 10000 });
  const asked = (await calls(page)).find(c => c.method === "aiWrite").args[0];
  if (asked.task !== "rewrite" || asked.input.how !== "friendlier" || !/Newsletter/.test(asked.input.where)) throw new Error(`asked ${JSON.stringify(asked)}`);
  await page.getByRole("button", { name: "Undo" }).first().click();
  await frame.getByText("Letters from the press").first().waitFor({ state: "detached", timeout: 10000 });
  // Text & labels: the {year} placeholder survives, and an answer that drops it changes nothing.
  await page.getByRole("button", { name: "Text & labels", exact: true }).first().click();
  await page.getByRole("button", { name: /^Footer/ }).first().click();
  const field = page.locator('[data-copy-key="footerCopyright"]');
  await field.getByRole("button", { name: /^Rewrite .* with AI$/ }).click();
  await field.getByRole("button", { name: "Improve" }).click();
  await page.waitForFunction(() => document.querySelector('[data-copy-key="footerCopyright"] input, [data-copy-key="footerCopyright"] textarea')?.value === "Copyright {year}, the press", null, { timeout: 10000 });
  await page.evaluate(() => { window.__studioFixture.aiAnswer = () => ({ status: 200, data: { result: { text: "No placeholder here" } } }); });
  await field.getByRole("button", { name: /^Rewrite .* with AI$/ }).click();
  await field.getByRole("button", { name: "Shorter" }).click();
  await expectText(page, "dropped a {placeholder}");
  const value = await field.locator("input, textarea").first().inputValue();
  if (value !== "Copyright {year}, the press") throw new Error(`the field changed to "${value}"`);
});

await check("Rewrite with AI on rich text: the toast's Undo puts the old words back even after the editor tidies the HTML", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.evaluate(() => {
    window.__studioFixture.aiAnswer = body => body.task === "rewrite"
      ? { status: 200, data: { result: { text: "<p><b>Our</b> story, told <a href=\"/page/about\">here</a>.</p>" } } }
      : undefined;
  });
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Text Content/ }).first().click();
  await page.getByRole("button", { name: "Rewrite Content with AI" }).click();
  await page.getByRole("button", { name: "Improve" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByText("story, told").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Undo" }).first().click();
  await frame.getByText("story, told").first().waitFor({ state: "detached", timeout: 10000 });
  await frame.getByText("Add your mission statement").first().waitFor({ timeout: 10000 });
});

await check("Draft a section with AI: the draft shows on the page, Add to page saves one section with its blocks, and a missing key points at the AI settings", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  // No key yet: the fixture answers like the real server does.
  const draft = page.locator("[data-studio-ai-draft]");
  await draft.locator("summary").click();
  await draft.getByRole("combobox", { name: "Kind of section to draft" }).selectOption("FAQSection");
  await draft.getByRole("textbox", { name: "What should the section say" }).fill("Shipping and pre-orders");
  await draft.getByRole("button", { name: "Draft it" }).click();
  await draft.getByRole("link", { name: "Open AI settings" }).waitFor({ timeout: 5000 });
  await page.evaluate(() => {
    window.__studioFixture.aiAnswer = body => body.task === "sectionDraft"
      ? { status: 200, data: { result: { title: "Shipping, simply", subtitle: "", items: [{ question: "Where do you ship?", answer: "Canada and abroad." }, { question: "When do pre-orders ship?", answer: "On release day." }] } } }
      : undefined;
  });
  await draft.getByRole("button", { name: "Draft it" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByText("Shipping, simply").first().waitFor({ timeout: 10000 });
  if ((await calls(page)).some(c => c.method === "saveDesign")) throw new Error("a draft was saved before Add to page");
  await draft.getByRole("button", { name: "Add to page" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const saved = (await calls(page)).filter(c => c.method === "saveDesign").pop().args[0].design;
  const faqs = (saved.heroPage?.sections || []).filter(x => x.type === "FAQSection" && x.settings.title === "Shipping, simply");
  if (faqs.length !== 1) throw new Error(`expected one drafted FAQ, got ${faqs.length}`);
  if ((faqs[0].settings.items || []).map(b => b.question).join("|") !== "Where do you ship?|When do pre-orders ship?") throw new Error(`items ${JSON.stringify(faqs[0].settings.items)}`);
  if ((faqs[0].settings.items || []).some(b => !b.id)) throw new Error("drafted blocks have no ids");
});

await check("Workbench: W opens it, Changes jumps back through edits, Setup's Show me opens Theme settings, G then T switches workspace", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const wb = page.locator("[data-studio-workbench]");
  await wb.waitFor({ timeout: 5000 });
  // Three named edits: add three sections.
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Add section" }).first().click();
    await page.getByRole("button", { name: /^Newsletter/ }).first().click();
    await page.keyboard.press("Escape");
  }
  const count = async () => page.evaluate(() => document.querySelectorAll(".studio-tree-section").length);
  await wb.getByRole("tab", { name: /Changes/ }).click();
  const steps = wb.locator(".studio-workbench-steps li");
  if ((await steps.count()) < 4) throw new Error(`expected at least 4 rows in Changes, got ${await steps.count()}`);
  const current = wb.locator('.studio-workbench-steps li[data-state="current"]');
  const before = await count();
  // Jump back two steps in one click.
  const rows = await steps.count();
  await steps.nth(rows - 3).getByRole("button").click();
  await wb.locator('.studio-workbench-steps li[data-state="future"]').nth(1).waitFor({ timeout: 5000 });
  if ((await current.count()) !== 1) throw new Error("no current step after the jump");
  const after = await count();
  if (after !== before - 2) throw new Error(`jumping back two steps left ${after} sections (was ${before})`);
  await wb.getByText("Different from the live shop").waitFor({ timeout: 5000 });
  // W closes and reopens the Workbench (plain keys work when no field has focus).
  await page.evaluate(() => (document.activeElement)?.blur?.());
  await page.keyboard.press("w");
  await page.locator('[data-studio-workbench][data-open="false"]').waitFor({ timeout: 5000 });
  await page.keyboard.press("w");
  await page.locator('[data-studio-workbench][data-open="true"]').waitFor({ timeout: 5000 });
  // Setup: Show me on the logo item opens Theme settings at Logo & wordmark.
  await wb.getByRole("tab", { name: /Setup/ }).click();
  await wb.getByText(/of \d+ done/).waitFor({ timeout: 5000 });
  const themeRow = wb.locator(['logo', 'colors', 'fonts', 'share'].map(id => `[data-setup-id="${id}"][data-done="false"]`).join(", ")).first();
  if (!(await themeRow.count())) throw new Error("expected an open Theme settings item in Setup");
  await themeRow.getByRole("button", { name: "Show me" }).click();
  await page.locator('.studio-rail button[aria-pressed="true"]', { hasText: "Theme" }).waitFor({ timeout: 5000 });
  // G then L goes to Page layout; G then T back to Theme settings.
  await page.evaluate(() => (document.activeElement)?.blur?.());
  await page.keyboard.press("g"); await page.keyboard.press("l");
  await page.locator('.studio-rail button[aria-pressed="true"]', { hasText: "Layout" }).waitFor({ timeout: 5000 });
  await page.keyboard.press("g"); await page.keyboard.press("t");
  await page.locator('.studio-rail button[aria-pressed="true"]', { hasText: "Theme" }).waitFor({ timeout: 5000 });
});

await check("Themes saves the draft as a theme, previews a look without changing the draft, and creates a share link", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  const panel = page.locator("[data-studio-panel='themes']");
  await panel.locator("[data-theme-card='live']").waitFor({ timeout: 5000 });
  // Save as a theme.
  await panel.getByRole("button", { name: "Save as a theme…" }).click();
  const ask = page.getByRole("dialog", { name: "Save to My themes" });
  await ask.getByRole("textbox").fill("Autumn test");
  await ask.getByRole("button", { name: "Save theme" }).click();
  await panel.getByText("Autumn test").waitFor({ timeout: 5000 });
  // Preview a ready-made look: the canvas changes, the draft doesn't.
  const before = JSON.stringify((await page.evaluate(() => window.__studioFixture.calls)).filter(c => c.method === "saveDesign"));
  const preset = panel.locator("[data-theme-card^='preset:']").first();
  await preset.getByRole("button", { name: "Preview" }).click();
  await page.locator("[data-studio-theme-preview]").waitFor({ timeout: 5000 });
  if (await page.locator("[data-studio-status=\"unsaved\"]").isVisible()) throw new Error("previewing a look changed the draft");
  await page.locator("[data-studio-theme-preview]").getByRole("button", { name: "Stop preview" }).click();
  await page.locator("[data-studio-theme-preview]").waitFor({ state: "detached", timeout: 5000 });
  if (JSON.stringify((await page.evaluate(() => window.__studioFixture.calls)).filter(c => c.method === "saveDesign")) !== before) throw new Error("preview saved something");
  // Share a preview link of the draft.
  await panel.locator("[data-theme-card='draft']").getByRole("button", { name: "Share a preview link" }).click();
  const share = page.getByRole("dialog", { name: /Share a preview/ });
  await share.getByRole("button", { name: "Create link" }).click();
  const link = await share.locator("[data-share-link] input").inputValue();
  if (!/\?themePreview=fixtureToken/.test(link)) throw new Error(`share link reads "${link}"`);
  if (!(await calls(page)).some(c => c.method === "createPreviewLink" && c.args[1] === 7)) throw new Error("no 7-day link was created");
  await share.locator("[data-preview-link]").first().getByRole("button", { name: "Turn off" }).click();
  await page.getByRole("dialog", { name: "Turn off this preview link?" }).getByRole("button", { name: "Turn off link" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "revokePreviewLink"));
});

await check("Schedule publishing saves a campaign in Toronto time and lists it, from the Publish dialog", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Schedule instead…" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule publishing" });
  await dialog.locator("[data-scheduler-health='never']").waitFor({ timeout: 5000 });
  await dialog.getByLabel("Campaign: from a time until a time, then switch back").check();
  const fields = dialog.locator('input[type="datetime-local"]');
  await fields.nth(0).fill("2031-03-02T09:00");
  await fields.nth(1).fill("2031-03-09T18:30");
  await dialog.getByRole("button", { name: "Schedule campaign" }).click();
  await dialog.locator("[data-schedule-id]").first().waitFor({ timeout: 5000 });
  const add = (await calls(page)).find(c => c.method === "addThemeSchedule");
  if (add?.args[0].startAt !== "2031-03-02T14:00:00.000Z" || add?.args[0].endAt !== "2031-03-09T22:30:00.000Z") throw new Error(`saved ${JSON.stringify(add?.args[0])}`);
  if ((await calls(page)).some(c => c.method === "saveDesign")) throw new Error("scheduling published or saved the draft");
  await dialog.locator("[data-schedule-id]").first().getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog", { name: /^Cancel “/ }).getByRole("button", { name: "Cancel schedule" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "cancelThemeSchedule"));
});

await check("an edit while a theme preview is showing ends the preview, and the canvas shows the edit", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  const panel = page.locator("[data-studio-panel='themes']");
  await panel.locator("[data-theme-card^='preset:']").first().getByRole("button", { name: "Preview" }).click();
  await page.locator("[data-studio-theme-preview]").waitFor({ timeout: 5000 });
  // Undo changes the draft: the canvas must stop showing the previewed look and follow the draft.
  await page.locator("[data-studio-theme-preview]").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press(`${mod}+z`);
  await page.locator("[data-studio-theme-preview]").waitFor({ state: "detached", timeout: 5000 });
  await page.getByRole("button", { name: "Page layout", exact: true }).first().click();
  await expectText(page, "Home · 0 sections");
});

await check("Pages shows the page being edited in the canvas, with unsaved words", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Edit About" }).click();
  await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src")?.includes("/page/about"), null, { timeout: 5000 });
  await expectText(page, "Preview connected", 30000);
  await page.locator(".studio-page-body .ql-editor").click();
  await page.keyboard.type(" Unsaved canvas words");
  await page.frameLocator("iframe").first().getByText("Unsaved canvas words").first().waitFor({ timeout: 10000 });
});

await check("a page that loads after the draft changed still shows the unsaved draft", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.evaluate(() => {
    const f = window.__studioFixture;
    const draft = JSON.parse(JSON.stringify(f.settings.draftDesign || f.settings.design || {}));
    f.remoteSave({ ...draft, copy: { ...(draft.copy || {}), trackTitle: "Where is my parcel" } });
  });
  await page.getByRole("button", { name: "Page to edit" }).click();
  await page.getByRole("combobox", { name: "Find a page, collection or book" }).fill("Order tracking");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src")?.includes("/track"), null, { timeout: 5000 });
  await page.frameLocator("iframe").first().getByText("Where is my parcel").first().waitFor({ timeout: 15000 });
});

await check("a single click on header words opens that header part, not the search", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frameLocator("iframe").first();
  await frame.locator("header [data-studio-copy='navSearch']").first().click({ timeout: 15000 });
  await page.locator("[data-studio-element-inspector]").waitFor({ timeout: 8000 });
  if (await frame.locator("[role=dialog]").count()) throw new Error("the click opened the search instead of selecting the header");
});

await check("Pop-ups opens the cookie banner in the preview even after it was answered", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frameLocator("iframe").first();
  if (await frame.getByText("your call.").count()) throw new Error("the answered cookie banner showed before Studio asked for it");
  const panel = page.locator(".studio-structure");
  await panel.locator("summary", { hasText: "Pop-ups" }).click();
  await panel.locator(".studio-structure-row", { hasText: "Cookie banner" }).getByRole("button", { name: "Open in preview" }).click();
  await frame.getByText("your call.").first().waitFor({ timeout: 8000 });
  // Answering it in the preview never changes this browser's real answer.
  await frame.getByRole("button", { name: /accept/i }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lm:cookie-consent") || "null")?.decidedAt);
  if (saved !== "2026-01-01T00:00:00.000Z") throw new Error(`the preview changed the saved cookie answer (${saved})`);
}, "", page => page.addInitScript(() => {
  try { localStorage.setItem("lm:cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, decidedAt: "2026-01-01T00:00:00.000Z" })); } catch { /* blocked */ }
}));

await check("a full-page link inside the preview moves Studio to that page", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.frames().find(f => f !== page.mainFrame()).evaluate(() => { location.assign("/page/about?preview=true"); });
  await page.waitForFunction(() => document.querySelector("[aria-label='Page to edit']")?.textContent?.includes("About"), null, { timeout: 15000 });
});

await check("a custom page takes uploaded and pasted pictures, with size, position and description", desktop, async page => {
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Edit About" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DAwMDAxMDAwAAAGQAD/7+5zQAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[aria-label="Upload pictures"]').setInputFiles({ name: "spread.png", mimeType: "image/png", buffer: png });
  const tools = page.getByRole("group", { name: "Selected picture" });
  await tools.waitFor({ timeout: 10000 });
  await tools.getByRole("button", { name: "Medium" }).click();
  await tools.getByRole("button", { name: "Line up centre" }).click();
  await tools.getByLabel("Picture description").pressSequentially("Open book spread");
  if (await tools.getByLabel("Picture description").inputValue() !== "Open book spread") throw new Error("typing a description closed the picture tools");
  // A pasted picture is uploaded too, never kept as data: text.
  await page.locator(".studio-page-body .ql-editor").click();
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    document.querySelector(".studio-page-body .ql-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, png.toString("base64"));
  await page.waitForFunction(() => document.querySelectorAll(".studio-page-body .ql-editor img").length === 2, null, { timeout: 10000 });
  await expectText(page, "2 pictures");
  await page.getByRole("button", { name: "Save page" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "updatePage"), null, { timeout: 10000 });
  const body = (await calls(page)).find(c => c.method === "updatePage").args[1].body;
  if (/src="data:/.test(body)) throw new Error("a picture was saved inline as data: text");
  const placed = body.match(/<p class="ql-align-center"><img [^>]*alt="Open book spread"[^>]*><\/p>/)?.[0] || "";
  if (!/src="https:\/\/example\.invalid\//.test(placed) || !placed.includes('alt="Open book spread"') || !placed.includes('width="50%"')) throw new Error(`saved body ${body}`);
  if (!body.startsWith("<p>We publish books.</p>")) throw new Error(`the picture's position moved the text: ${body}`);
  if ((body.match(/<img /g) || []).length !== 2) throw new Error(`expected two pictures in ${body}`);
});

await check("Rewrite with AI on a custom page keeps its picture and centring, with its own Undo", desktop, async page => {
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Edit About" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DAwMDAxMDAwAAAGQAD/7+5zQAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[aria-label="Upload pictures"]').setInputFiles({ name: "spread.png", mimeType: "image/png", buffer: png });
  const tools = page.getByRole("group", { name: "Selected picture" });
  await tools.waitFor({ timeout: 10000 });
  await tools.getByRole("button", { name: "Line up centre" }).click();
  // The fixture's AI rewrites only the words it is sent; the picture never goes to it.
  await page.evaluate(() => {
    window.__studioFixture.aiAnswer = body => body.task === "rewrite"
      ? { status: 200, data: { result: { text: body.input.text.replace("We publish books.", "We print and publish books.") } } }
      : undefined;
  });
  const editor = page.locator(".studio-page-body .ql-editor");
  const rewrite = async how => {
    await page.getByRole("button", { name: "Rewrite Page text with AI" }).click();
    await page.getByRole("button", { name: how }).click();
  };
  await rewrite("Improve");
  await page.waitForFunction(() => document.querySelector(".studio-page-body .ql-editor")?.textContent.includes("We print and publish books."), null, { timeout: 10000 });
  const asked = (await calls(page)).filter(c => c.method === "aiWrite").pop().args[0];
  if (/<img|https?:|data:/.test(asked.input.text) || !asked.input.text.includes("[[keep-1]]") || asked.input.where !== "Pages › About") throw new Error(`sent to the AI: ${JSON.stringify(asked.input)}`);
  if (await editor.locator("p.ql-align-center img").count() !== 1) throw new Error(`the centred picture was lost: ${await editor.innerHTML()}`);
  // The toast's Undo puts the old words back (page edits aren't in Studio's history).
  await page.getByRole("status").filter({ hasText: "Rewrote" }).getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => !document.querySelector(".studio-page-body .ql-editor")?.textContent.includes("We print"), null, { timeout: 10000 });
  if (await editor.locator("p.ql-align-center img").count() !== 1) throw new Error("Undo lost the picture");
  // An answer that drops the picture changes nothing.
  await page.evaluate(() => { window.__studioFixture.aiAnswer = () => ({ status: 200, data: { result: { text: "<p>Only words now.</p>" } } }); });
  await rewrite("Shorter");
  await expectText(page, "moved or dropped a picture");
  if ((await editor.textContent()).includes("Only words now")) throw new Error("an answer without the picture replaced the page");
  await page.evaluate(() => {
    window.__studioFixture.aiAnswer = body => ({ status: 200, data: { result: { text: body.input.text.replace("We publish books.", "We print and publish books.") } } });
  });
  await rewrite("Improve");
  await page.waitForFunction(() => document.querySelector(".studio-page-body .ql-editor")?.textContent.includes("We print and publish books."), null, { timeout: 10000 });
  await page.getByRole("button", { name: "Save page" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "updatePage"), null, { timeout: 10000 });
  const body = (await calls(page)).find(c => c.method === "updatePage").args[1].body;
  if (!body.startsWith("<p>We print and publish books.</p>") || !/<p class="ql-align-center"><img [^>]*src="https:\/\/example\.invalid\//.test(body)) throw new Error(`saved body ${body}`);
});

await check("a custom page's search listing fills in from the page", desktop, async page => {
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Edit About" }).click();
  await page.getByRole("button", { name: "Auto-fill from page" }).click();
  if (await page.getByLabel("Title on Google").inputValue() !== "About") throw new Error("search title wasn't filled from the page title");
  const preview = page.getByLabel("Search result preview");
  if (!/About — /.test(await preview.innerText()) || !(await preview.innerText()).includes("We publish books.")) throw new Error(`search preview: ${await preview.innerText()}`);
  await expectText(page, "with the shop name");
  if (await page.getByLabel("Description on Google").inputValue() !== "We publish books.") throw new Error("description wasn't filled from the page text");
  if ((await calls(page)).some(c => c.method === "updatePage")) throw new Error("auto-fill saved before Save page");
  await page.getByRole("button", { name: "All pages" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  // Find anything › "Fill in missing search listings" runs the same fill.
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("dialog").getByRole("combobox").fill("fill in missing search");
  await page.getByRole("dialog").getByRole("option", { name: /Fill in missing search listings/ }).first().click();
  await page.getByRole("button", { name: /^Fill in \d+ pages?$/ }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "updatePage"), null, { timeout: 10000 });
  const about = (await calls(page)).find(c => c.method === "updatePage" && c.args[0] === "p1")?.args[1];
  if (about?.seoTitle !== "About" || about?.metaDescription !== "We publish books.") throw new Error(`saved ${JSON.stringify(about)}`);
  if ("body" in about) throw new Error("bulk fill rewrote the page body");
  await page.getByRole("button", { name: /Fill in missing search listings/ }).waitFor({ state: "detached", timeout: 5000 });
});

// Theme settings helpers: open a category card on the Theme settings home, then set one control.
const openStyleCategory = async (page, title) => {
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  const back = page.getByRole("button", { name: "All theme settings" });
  if (await back.count()) await back.first().click();
  await page.getByText("Where is it on the shop?").first().waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: new RegExp("^" + title.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")) }).first().click();
};
const styleControl = (page, key, tag) => page.locator(`[data-style-key="${key}"] ${tag}`).first();
// Search Theme settings for a control by its label and wait for its field.
const findStyleField = async (page, label, key) => {
  await page.getByRole("button", { name: "Theme settings", exact: true }).first().click();
  const back = page.getByRole("button", { name: "All theme settings" });
  if (await back.count()) await back.first().click();
  await page.getByLabel("Search style settings").fill(label);
  await page.locator(`[data-style-key="${key}"]`).first().waitFor({ timeout: 5000 });
};
const openStyleField = async (page, key) => {
  if (await page.locator(`[data-style-key="${key}"]`).count()) return;
  // The field may sit in a folded sub-section: open them all.
  // Click the first folded one each time: positions shift as they open, so a list taken up front skips every other one.
  const folded = page.locator(".studio-subsection-toggle[aria-expanded=false]");
  for (let i = 0; i < 40 && await folded.count() && !(await page.locator(`[data-style-key="${key}"]`).count()); i++) {
    await folded.first().click({ timeout: 5000 }).catch(() => {});
  }
  await page.locator(`[data-style-key="${key}"]`).first().waitFor({ timeout: 5000 });
};

await check("full width and the shop filter bar: off until switched on, then the shop runs to the edges with All · categories · In stock (no numbers)", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const preview = () => page.frames().find(f => /preview=true/.test(f.url()));
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-studio-label='Product grid']").first().waitFor({ timeout: 15000 });
  if (await frame.locator(".fm-filter-bar").count()) throw new Error("the filter bar shows before it is switched on");
  const toggle = async (label, key) => { await findStyleField(page, label, key); await page.locator(`[data-style-key="${key}"] [role=switch]`).first().click(); };
  await toggle("full screen width", "fullWidth");
  await preview().waitForFunction(() => { const m = document.querySelector("main"); return !!m && getComputedStyle(m).maxWidth === "100%"; }, null, { timeout: 10000 });
  await toggle("shop filter bar beside", "showShopFilterBar");
  await findStyleField(page, "Heading (leave empty", "catalogHeading");
  await styleControl(page, "catalogHeading", "input").fill("Publications");
  await findStyleField(page, "Heading case", "catalogHeadingCase");
  await styleControl(page, "catalogHeadingCase", "select").selectOption("none");
  const bar = frame.locator(".fm-filter-bar");
  await bar.waitFor({ timeout: 10000 });
  const words = (await bar.locator("button").allInnerTexts()).join(" ");
  if (/\d/.test(words)) throw new Error(`the filter bar shows numbers: ${words}`);
  if (!/in stock/i.test(words)) throw new Error(`no In stock button: ${words}`);
  await preview().waitForFunction(() => { const h = document.querySelector(".fm-catalog-heading"); return !!h && getComputedStyle(h).textTransform === "none"; }, null, { timeout: 10000 });
});

await check("the default shop header follows the Header menu, link colour, sticker pills and the category limit", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frameLocator("iframe").first();
  const bar = frame.locator("header [data-studio-label='Category bar']");
  await bar.waitFor({ timeout: 15000 });
  // Navigation › Header menu: a new link shows in the Reference header (it used to show only in Modern).
  await page.getByRole("button", { name: "Navigation", exact: true }).first().click();
  await page.locator("[data-studio-panel='menus:links']").getByRole("button", { name: "Add link" }).click();
  await bar.locator("nav a").first().waitFor({ timeout: 10000 });
  // Shop categories says how many the Reference header shows.
  await page.locator("[data-reference-limit='1']").waitFor({ timeout: 5000 });
  const before = await bar.locator(":scope > button, :scope > a").count();
  await openStyleCategory(page, "Shop page masthead & covers");
  if (await styleControl(page, "catalogLayoutStyle", "select").inputValue() !== "reference") throw new Error("Layout control does not show the Reference layout the shop uses");
  await openStyleField(page, "referenceCategoryLimit");
  await styleControl(page, "referenceCategoryLimit", "input[type=range]").fill("4");
  await bar.locator(":scope > button, :scope > a").nth(before).waitFor({ timeout: 10000 });
  await openStyleCategory(page, "Navigation links");
  await styleControl(page, "navLinkColor", "input:not([type=color])").fill("#ff0000");
  await page.frames().find(f => /preview=true/.test(f.url())).waitForFunction(() => {
    const b = document.querySelector("header [data-studio-label='Category bar'] > button, header [data-studio-label='Category bar'] > a");
    return b && getComputedStyle(b).color === "rgb(255, 0, 0)";
  }, undefined, { timeout: 10000 });
  await findStyleField(page, "Nav link style", "navStyle");
  await styleControl(page, "navStyle", "select").selectOption("stickers");
  await bar.locator(".fm-sticker-pill").first().waitFor({ timeout: 10000 });
});

await check("Theme settings switches start in the state the shop shows", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await openStyleCategory(page, "Badges & shop labels");
  const sale = page.getByRole("switch", { name: "Sale badge", exact: true }).first();
  if (await sale.getAttribute("aria-checked") !== "true") throw new Error("Sale badge switch shows Off while the shop draws the badge");
  await findStyleField(page, "Line above card title", "catalogCardRuleWidth");
  if (await styleControl(page, "catalogCardRuleWidth", "input[type=range]").inputValue() !== "2") throw new Error("Line above card title shows 0 while the shop draws 2px");
});

await check("the bag's own background wins over the checkout background", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await openStyleCategory(page, "Checkout");
  await openStyleField(page, "checkoutBgColor");
  await styleControl(page, "checkoutBgColor", "input:not([type=color])").fill("#000000");
  await page.getByRole("button", { name: "All theme settings" }).first().click();
  await page.getByRole("button", { name: "Show Cart drawer (shopping bag) on the page" }).click();
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  await frame.waitForSelector(".fm-bag", { timeout: 10000 });
  await openStyleCategory(page, "Cart drawer (shopping bag)");
  await openStyleField(page, "cartDrawerBg");
  await styleControl(page, "cartDrawerBg", "input:not([type=color])").fill("#ff0000");
  await frame.waitForFunction(() => getComputedStyle(document.querySelector(".fm-bag")).backgroundColor === "rgb(255, 0, 0)", undefined, { timeout: 10000 });
});

await check("the checkout preview shows a sample book so its look can be edited, and saves no bag", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  await frame.waitForFunction(() => location.pathname.endsWith("/checkout") && !!document.querySelector("[data-fm-checkout] form"), undefined, { timeout: 20000 });
  const bag = await frame.evaluate(() => JSON.parse(localStorage.getItem("fm_cart") || "[]"));
  if (bag.length) throw new Error(`the preview put the sample book in the bag: ${JSON.stringify(bag)}`);
}, "#designer?t=cartPage");

await check("Escape cancels a spacing drag even when Studio had the keyboard focus", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Preview connected", 30000);
  await page.waitForTimeout(1500);
  await page.locator(".studio-outline .studio-tree-label").first().click();
  const frame = page.frameLocator("iframe").first();
  await frame.locator("[data-studio-overlay][role=toolbar] button").filter({ hasText: /^Spacing$/ }).first().click({ timeout: 10000 });
  const handle = frame.locator('[role=slider][data-spacing-key="paddingBottom"]').first();
  await handle.waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForFunction(() => window.__studioFixture.calls.some(c => c.method === "saveDesign"));
  const saved = () => page.evaluate(() => window.__studioFixture.calls.filter(c => c.method === "saveDesign").pop().args[0].design.heroPage.sections[0].settings.paddingBottom);
  const start = await saved();
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y - i * 4);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(800);
  if (!(await page.getByRole("button", { name: "Save draft" }).isDisabled())) throw new Error("Escape did not cancel the drag: the padding change was kept");
  if (await saved() !== start) throw new Error("the cancelled drag was saved");
});

await check("a sticky add-to-bag bar off a book page is marked as showing only on book pages", desktop, async page => {
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Sticky add-to-bag bar/ }).first().click();
  await page.locator(".studio-outline").getByText("Shows only on book pages").first().waitFor({ timeout: 5000 });
});

await check("adding a section to a custom page makes its text a movable Page content section", desktop, async page => {
  await page.getByRole("button", { name: "Page to edit" }).click();
  await page.getByRole("combobox", { name: /Find a page/ }).fill("About");
  await page.keyboard.press("Enter");
  await page.locator("[data-studio-panel=page-content]").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  const rows = page.locator(".studio-outline");
  await rows.getByText("2. Page content").waitFor({ timeout: 5000 });
  await rows.getByText("1. Newsletter").waitFor({ timeout: 5000 });
  if (await page.locator("[data-studio-panel=page-content]").count()) throw new Error("the fixed-text card is still shown");
});

await check("mode button names what it does, and the inspector keeps its tab and can move a section", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const toBrowse = page.getByRole("button", { name: "Switch to Browse mode" });
  await toBrowse.click();
  const toEdit = page.getByRole("button", { name: "Switch to Edit mode" });
  if ((await toEdit.getAttribute("aria-pressed")) !== "true") throw new Error("the mode button is not marked pressed in Browse mode");
  await toEdit.click();
  await page.getByRole("button", { name: "Switch to Browse mode" }).waitFor({ timeout: 5000 });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Add section" }).first().click();
    await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  }
  const labels = page.locator(".studio-outline .studio-tree-label");
  await labels.first().click();
  await page.locator(".studio-inspector").getByRole("tab", { name: "Style" }).click();
  await labels.nth(1).click();
  const selected = await page.locator(".studio-inspector").getByRole("tab", { name: "Style" }).getAttribute("aria-selected");
  if (selected !== "true") throw new Error("the inspector went back to Content when another section of the same kind was selected");
  const actions = page.locator(".studio-inspector-actions");
  if (!(await actions.getByRole("button", { name: "Move down" }).isDisabled())) throw new Error("Move down is enabled on the last section");
  await actions.getByRole("button", { name: "Move up" }).click();
  await page.locator('.studio-outline .studio-tree-label[aria-current="true"]').getByText(/^1\./).waitFor({ timeout: 5000 });
  // Clicking the rail tab you are on keeps the selection.
  await page.getByRole("button", { name: "Page layout" }).first().click();
  if (!(await page.locator(".studio-inspector-actions").count())) throw new Error("clicking the active rail tab closed the inspector");
});

await check("View website opens the shop in a new tab with the draft and says whether it is saved", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.getByRole("button", { name: "Add section" }).first().click();
  await page.getByRole("button", { name: /^Newsletter/ }).first().click();
  await expectText(page, "Home · 1 section");
  const [tab] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: "View website" }).click()]);
  if (!/[?&]preview=true/.test(tab.url())) throw new Error(`View website opened ${tab.url()}`);
  await tab.locator('[data-draft-preview-banner="unsaved"]').waitFor({ timeout: 30000 });
  // The newsletter section exists only in the unsaved draft, so seeing it proves the tab shows the draft.
  const added = await page.evaluate(() => document.querySelector("iframe")?.contentDocument?.querySelector("[data-fm-section]")?.getAttribute("data-fm-section"));
  if (!added) throw new Error("the canvas has no section to look for");
  await tab.locator(`[data-fm-section="${added}"]`).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await tab.locator('[data-draft-preview-banner="draft"]').waitFor({ timeout: 15000 });
  if (shots) await tab.screenshot({ path: join(shots, "View-website-tab.png") }).catch(() => {});
  await tab.close();
});

// Every part listed in Page layout: its row, its Style / Words shortcuts and every link button in the inspector
// must open a settings panel, and a Theme settings element panel must hold at least one control.
async function checkPartButtons(page) {
  const dead = [];
  const openLayout = async () => {
    await page.locator('nav[aria-label="Studio workspaces"] button[aria-label="Page layout"]').click();
    await page.locator(".studio-structure").waitFor({ timeout: 8000 });
    for (const d of await page.locator(".studio-structure details.studio-structure-group").all()) await d.evaluate(el => { el.open = true; });
  };
  let clicked = 0;
  const landed = async (what) => {
    clicked++;
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const links = window.__studioDeadLinks || []; window.__studioDeadLinks = [];
      const focus = document.querySelector('[data-studio-panel="style-focus"]');
      const count = focus ? Number((focus.textContent.match(/(\d+) settings for this element/) || [])[1] ?? -1) : -1;
      return { links, emptyFocus: count === 0 };
    });
    if (result.links.length) dead.push(`${what} (${result.links.join(", ")})`);
    if (result.emptyFocus) dead.push(`${what} (Theme settings opened with no settings)`);
  };
  await openLayout();
  const rows = await page.locator(".studio-structure-row").count();
  for (let i = 0; i < rows; i++) {
    await openLayout();
    const row = page.locator(".studio-structure-row").nth(i);
    if (!await row.count()) break;
    const label = ((await row.locator(".studio-tree-label").innerText().catch(() => "")) || "").split("\n")[0].trim();
    const shortcuts = await row.locator(".studio-structure-actions button").allTextContents();
    for (const name of shortcuts) {
      await openLayout();
      await page.locator(".studio-structure-row").nth(i).locator(".studio-structure-actions button", { hasText: name }).click();
      await landed(`${label} › ${name}`);
    }
    await openLayout();
    await page.locator(".studio-structure-row").nth(i).locator(".studio-tree-label").click();
    await landed(label);
    const inspector = page.locator("[data-studio-element-inspector]");
    if (!await inspector.isVisible().catch(() => false)) continue;
    const buttons = await inspector.locator(".studio-element-links button").allTextContents();
    for (const name of buttons) {
      await openLayout();
      await page.locator(".studio-structure-row").nth(i).locator(".studio-tree-label").click();
      await inspector.waitFor({ timeout: 5000 });
      await inspector.locator(".studio-element-links button", { hasText: name }).first().click();
      await landed(`${label} › ${name}`);
    }
  }
  if (rows < 5 || clicked < 20) throw new Error(`Page layout listed only ${rows} parts (${clicked} buttons tried)`);
  console.log(`  checked ${clicked} buttons on ${rows} parts`);
  if (dead.length) throw new Error(`buttons that open nothing: ${dead.join(" · ")}`);
}

await check("every part's Style, Words and inspector buttons open real settings (Home)", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  await page.waitForTimeout(1500);
  await checkPartButtons(page);
}, "?live=1");

await check("every part's Style, Words and inspector buttons open real settings (book page)", desktop, async page => {
  await expectText(page, "Preview connected", 30000);
  const frame = page.frames().find(f => /preview=true/.test(f.url()));
  const slug = await frame.evaluate(() => window.__studioPreviewState?.books?.[0]?.slug);
  await frame.goto(new URL(`/books/${slug}?preview=true`, frame.url()).href);
  await page.waitForTimeout(3000);
  await checkPartButtons(page);
}, "?live=1");

await check("phone-sized editor loads without errors", { width: 390, height: 844 }, async page => {
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`editor scrolls sideways by ${overflow}px`);
});

await browser.close();
await server?.close();
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name} (${Math.round(r.ms / 1000)}s)${r.ok ? "" : ` — ${r.error}`}`);
const failed = results.filter(r => !r.ok).length;
const shardNote = shardCount > 1 ? ` (shard ${shardNo} of ${shardCount}: ${results.length} of ${checkNo} checks)` : "";
console.log(`\n${results.length - failed} passed, ${failed} failed${shardNote}`);
// A shard that ran nothing means the split went wrong, not that everything passed.
if (!results.length) { console.error("No Studio checks ran."); process.exit(1); }
process.exit(failed ? 1 : 0);
