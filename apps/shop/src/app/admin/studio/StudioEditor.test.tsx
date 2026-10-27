// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("firebase/firestore", () => new Proxy({}, { get: (_t, name) => name === "then" ? undefined : vi.fn() }));
vi.mock("firebase/auth", () => ({ signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn() }));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn(), getStorage: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as any;
// jsdom has no ResizeObserver; Studio's resizable panels (react-resizable-panels v4) construct one.
window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

const { adminApi } = await import("../api");
const { StudioEditor } = await import("./StudioEditor");
const { createStudioFixture, installFakeStudioApi } = await import("./fixture/fakeStudioApi");

let host: HTMLDivElement, root: Root, restore: () => void, fixture: ReturnType<typeof createStudioFixture>;
beforeEach(() => {
  localStorage.clear();
  fixture = createStudioFixture();
  restore = installFakeStudioApi(adminApi as any, fixture);
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => { act(() => root?.unmount()); host.remove(); restore(); });

async function mount() {
  root = createRoot(host);
  await act(async () => { root.render(h(StudioEditor, { settings: fixture.settings, onExit: () => {} })); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

const buttons = (label: string | RegExp) => [...document.body.querySelectorAll("button")]
  .filter(b => { const name = b.getAttribute("aria-label") || b.textContent?.trim() || ""; return typeof label === "string" ? name === label || b.textContent?.trim() === label : label.test(b.textContent || ""); });
const click = async (el: Element | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => { (el as HTMLElement).click(); await new Promise(r => setTimeout(r, 0)); });
};
const key = async (k: string, extra: KeyboardEventInit = {}) => {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: true, bubbles: true, ...extra })); await new Promise(r => setTimeout(r, 0)); });
};
// Another Studio tab saves a normalised design, like this one does.
const otherTabDraft = async (patch: Record<string, any>) => {
  const { normalizeDesign } = await import("./studioModel");
  return { ...normalizeDesign(fixture.settings.draftDesign, adminApi.getDefaultSettings().design), ...patch };
};
const homeSections = (design: any) => (design?.heroPage?.sections || []).map((s: any) => s.type);

describe("Studio editor (mounted with an in-memory API)", () => {
  it("opens on the page outline with every workspace and lists draft pages as templates", async () => {
    await mount();
    for (const tab of ["Page layout", "Theme settings", "Text & labels", "Navigation", "Pages", "Media"]) expect(buttons(tab).length).toBeGreaterThan(0);
    await click(buttons("Page to edit")[0]);
    const pagePicker = [...document.querySelectorAll("[role=option]")].map(o => o.querySelector("span")?.textContent);
    expect(pagePicker).toEqual(expect.arrayContaining(["Home", "About", "Open call (draft)", "Night Pages", "Header & footer sections (every page)"]));
  });

  it("switching page keeps the open workspace and is remembered next time", async () => {
    await mount();
    await click(buttons("Theme settings")[0]);
    await click(buttons("Page to edit")[0]);
    await click([...document.querySelectorAll("[role=option]")].find(o => o.textContent?.includes("Night Pages")));
    expect(buttons("Theme settings")[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons("Page to edit")[0].textContent).toContain("Night Pages");
    act(() => root.unmount());
    await mount();
    expect(buttons("Page to edit")[0].textContent).toContain("Night Pages");
    expect(buttons("Theme settings")[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("adds a section, undoes it, and saves the draft without publishing", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    expect(host.textContent).toMatch(/Home · 1 section/);
    await key("z");
    expect(host.textContent).toMatch(/Home · 0 sections/);
    await key("z", { shiftKey: true });
    expect(host.textContent).toMatch(/Home · 1 section/);
    await click(buttons("Save draft")[0]);
    const save = fixture.calls.find(c => c.method === "saveDesign");
    expect(save?.args[1]).toEqual({ publish: false });
    expect(homeSections(save?.args[0].design)).toEqual(["NewsletterSection"]);
    expect(homeSections(fixture.settings.design)).toEqual([]);
  });

  it("the status pill says what each state means for the shop, and the Publish list counts its changes", async () => {
    await mount();
    const pill = () => document.body.querySelector("[data-studio-status]")?.textContent;
    expect(pill()).toBe("Live · the shop shows this");
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    expect(pill()).toBe("Not saved yet · shop unchanged");
    await click(buttons("Save draft")[0]);
    expect(pill()).toBe("Saved as draft · shop unchanged");
    expect(document.body.querySelector("[data-studio-status]")?.getAttribute("title")).toMatch(/Draft saved at /);
    await click(buttons("Publish")[0]);
    expect(document.body.querySelector("[data-publish-count]")?.textContent).toMatch(/^\d+ changes?$/);
    await click(buttons("Publish now")[0]);
    expect(pill()).toBe("Live · the shop shows this");
  });

  it("a failed save says so in plain words, keeps the draft in the editor and offers Try again", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    fixture.saveError = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    await click(buttons("Save draft")[0]);
    const toast = document.body.querySelector("[data-studio-toast=err]");
    expect(toast?.textContent).toMatch(/^Couldn't save the draft\. The shop didn't allow that.*Your changes are still here\./);
    expect(toast?.textContent).not.toMatch(/Missing or insufficient/);
    expect(spy).toHaveBeenCalled();
    expect(document.body.querySelector("[data-studio-status]")?.textContent).toBe("Not saved yet · shop unchanged");
    await click(buttons("Try again")[0]);
    expect(document.body.querySelector("[data-studio-status]")?.textContent).toBe("Saved as draft · shop unchanged");
    spy.mockRestore();
  });

  it("deleting a section keeps its Undo toast until dismissed", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await click(buttons("Delete section")[0]);
    const toast = document.body.querySelector("[data-studio-toast=warn]");
    expect(toast?.textContent).toMatch(/^Deleted/);
    expect(toast?.textContent).toMatch(/Undo/);
    expect(toast?.textContent).toMatch(/Dismiss/);
  });

  it("live sync: a save in another tab comes straight in when nothing is unsaved here", async () => {
    await mount();
    await act(async () => { fixture.remoteSave!({ ...JSON.parse(JSON.stringify(fixture.settings.draftDesign)), heroPage: { sections: [{ id: "remote1", type: "NewsletterSection", settings: {} }] } }); await new Promise(r => setTimeout(r, 0)); });
    expect(host.textContent).toMatch(/Home · 1 section/);
    expect(document.body.querySelector("[data-studio-incoming]")).toBeNull();
    // Their saved draft is now this tab's saved draft (compared after normalising), so nothing reads as unsaved.
    expect(host.textContent).not.toMatch(/Not saved yet/);
    // The next save builds on their revision instead of meeting a conflict.
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await click(buttons("Save draft")[0]);
    expect(homeSections(fixture.calls.find(c => c.method === "saveDesign")?.args[0].design)).toHaveLength(2);
  });

  it("live sync: unsaved edits here show a banner, and Bring in keeps both", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await act(async () => { fixture.remoteSave!(await otherTabDraft({ accentColor: "#123456" }), { publish: true }); await new Promise(r => setTimeout(r, 0)); });
    const banner = document.body.querySelector("[data-studio-incoming]")!;
    expect(banner.textContent).toMatch(/published in another tab or device/);
    await click(buttons("Bring in their changes")[0]);
    expect(document.body.querySelector("[data-studio-incoming]")).toBeNull();
    expect(host.textContent).toMatch(/Home · 1 section/);
    await click(buttons("Save draft")[0]);
    const save = fixture.calls.find(c => c.method === "saveDesign");
    expect(save?.args[0].design.accentColor).toBe("#123456");
    expect(homeSections(save?.args[0].design)).toEqual(["NewsletterSection"]);
  });

  it("live sync: Later leaves the edits alone, and Save then combines as before", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await act(async () => { fixture.remoteSave!(await otherTabDraft({ accentColor: "#654321" })); await new Promise(r => setTimeout(r, 0)); });
    await click(buttons("Later")[0]);
    expect(document.body.querySelector("[data-studio-incoming]")).toBeNull();
    await click(buttons("Save draft")[0]);
    const save = fixture.calls.filter(c => c.method === "saveDesign").pop();
    expect(save?.args[0].design.accentColor).toBe("#654321");
    expect(homeSections(save?.args[0].design)).toEqual(["NewsletterSection"]);
  });

  it("publishes only after confirming", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await click(buttons("Publish")[0]);
    expect(fixture.calls.some(c => c.method === "saveDesign")).toBe(false);
    await click(buttons("Publish now")[0]);
    const publish = fixture.calls.find(c => c.method === "saveDesign");
    expect(publish?.args[1]).toEqual({ publish: true });
    expect(homeSections(fixture.settings.design)).toEqual(["NewsletterSection"]);
  });

  it("Media lists library images with filters, details and a saved description", async () => {
    await mount();
    await click(buttons("Media")[0]);
    const card = document.querySelector("[data-media-id='m-riso-print']");
    expect(card?.textContent).toContain("riso-print.jpg");
    expect(card?.textContent).toMatch(/Unused.*Over budget.*No description/);
    await click(buttons(/^Over size budget/)[0]);
    expect(document.querySelector("[data-media-id='m-riso-print']")).not.toBeNull();
    await click(card!);
    expect(host.textContent).toContain("Not used anywhere yet");
    expect(host.textContent).toMatch(/1600 px.*over 200 KB/);
    const alt = document.querySelector<HTMLTextAreaElement>("textarea[id^='media-alt-']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(alt, "Red dot on yellow paper");
      alt.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttons("Save description")[0]);
    expect(fixture.calls.find(c => c.method === "saveMedia")?.args[0]).toMatchObject({ id: "m-riso-print", alt: "Red dot on yellow paper" });
  });

  it("an image field picks from the library and stores the picture's srcset record; delete is refused while used", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Image Banner/)[0]);
    await click(document.querySelector("[data-media-choose='imageUrl']")!);
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Choose an image");
    await click(document.querySelector("[role=dialog] [data-media-id='m-riso-print']")!);
    expect(document.querySelector("[role=dialog]")).toBeNull();
    await click(buttons("Save draft")[0]);
    const saved = fixture.calls.find(c => c.method === "saveDesign")?.args[0].design.heroPage.sections[0].settings;
    expect(saved.imageUrl__media).toMatchObject({ id: "m-riso-print", src: saved.imageUrl });
    expect(saved.imageUrl__media.srcset.map((v: any) => v.w)).toEqual([480, 960, 1600]);

    await click(buttons("Media")[0]);
    await click(document.querySelector("[data-media-id='m-riso-print']")!);
    expect(host.textContent).toMatch(/Home › Image Banner/);
    await click(buttons("Delete image")[0]);
    expect(host.textContent).toContain("still in use");
    expect(fixture.calls.some(c => c.method === "removeMedia")).toBe(false);
  });

  it("Delete is refused while My themes or Version history keeps the image, and works once nothing does", async () => {
    const src = fixture.media[0].variants[2].url;
    const withIt = { heroPage: { sections: [{ id: "x", type: "HeroSection", settings: { imageUrl: src } }] } };
    fixture.versions.push({ id: "v1", kind: "published", label: "Published", createdAt: "2026-10-01T00:00:00.000Z", design: withIt });
    fixture.settings.savedThemes = [{ id: "t1", name: "Autumn", design: withIt }];
    await mount();
    await click(buttons("Media")[0]);
    await click(document.querySelector("[data-media-id='m-riso-print']")!);
    expect(host.textContent).toContain("My themes › Autumn");
    expect(host.textContent).toContain("Version history › Published");
    await click(buttons("Delete image")[0]);
    expect(host.textContent).toContain("still in use");

    // Nothing holds it when Media opens, but a version saved since then does → the fresh re-read refuses.
    act(() => root.unmount());
    fixture.settings.savedThemes = [];
    fixture.versions.length = 0;
    await mount();
    await click(buttons("Media")[0]);
    await click(document.querySelector("[data-media-id='m-riso-print']")!);
    expect(host.textContent).toContain("Not used anywhere yet");
    fixture.versions.push({ id: "v2", kind: "draft", label: "Late draft", createdAt: "2026-10-02T00:00:00.000Z", design: withIt });
    await click(buttons("Delete image")[0]);
    expect(host.textContent).toMatch(/kept in Version history › Late draft/);
    expect(fixture.calls.some(c => c.method === "removeMedia")).toBe(false);

    fixture.versions.length = 0;
    await click(buttons("Delete image")[0]);
    await click(buttons("Delete image").at(-1));
    expect(fixture.calls.find(c => c.method === "removeMedia")?.args[0]).toBe("m-riso-print");
  });

  it("explains a media library whose rules aren't deployed, and image fields keep working", async () => {
    fixture.mediaDenied = true;
    await mount();
    await click(buttons("Media")[0]);
    expect(host.textContent).toContain("The media library isn't switched on yet");
    await click(buttons("Page layout")[0]);
    await click(buttons("Add section")[0]);
    await click(buttons(/^Image Banner/)[0]);
    expect(document.querySelector("input[placeholder='https://… or upload']")).not.toBeNull();
    expect(buttons("Upload image").length).toBeGreaterThan(0);
  });

  it("opens Theme settings on its design-system and parts headings, and Find anything with Ctrl/Cmd+K", async () => {
    await mount();
    await click(buttons("Theme settings")[0]);
    for (const heading of ["Where is it on the shop?", "Whole-site look", "Colours", "Typography", "Parts of your shop, top to bottom", "Top of every page", "Bottom of every page"]) expect(host.textContent).toContain(heading);
    expect(buttons("Show Header & announcement bar on the page").length).toBe(1);
    await key("k");
    expect(document.body.querySelector("[role='combobox'], input[aria-label*='Find' i], input[placeholder*='Find' i]")).not.toBeNull();
  });

  // ── Save / publish integrity (PR 6) ──
  // A save from another tab that this tab never heard about (live sync is off), so the next save meets a conflict.
  const unseenRemoteSave = async (draft: any) => {
    const watchers = fixture.watchers; fixture.watchers = [];
    fixture.remoteSave!(draft);
    fixture.watchers = watchers;
  };
  const remoteSection = { id: "remote1", type: "NewsletterSection", settings: {} };

  it("save conflict: Keep mine keeps the other tab's other changes (#6)", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await unseenRemoteSave({ ...(await otherTabDraft({ accentColor: "#123456" })), heroPage: { sections: [remoteSection] } });
    await click(buttons("Save draft")[0]);
    expect(host.textContent).toContain("Saved in another tab or device");
    expect(fixture.calls.some(c => c.method === "saveDesign")).toBe(false);
    await click(buttons("Keep mine and save")[0]);
    const save = fixture.calls.find(c => c.method === "saveDesign");
    expect(save?.args[0].design.accentColor).toBe("#123456"); // their change to a different setting survives
    expect(homeSections(save?.args[0].design)).toEqual(["NewsletterSection"]);
    expect(save?.args[0].design.heroPage.sections[0].id).not.toBe("remote1"); // mine, where we both changed Home
  });

  it("save conflict: Use the other version takes theirs for the shared setting and saves nothing (#6)", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await unseenRemoteSave({ ...(await otherTabDraft({ accentColor: "#123456" })), heroPage: { sections: [remoteSection] } });
    await click(buttons("Save draft")[0]);
    await click(buttons("Use the other version")[0]);
    expect(fixture.calls.some(c => c.method === "saveDesign")).toBe(false);
    expect(host.textContent).toMatch(/Home · 1 section/);
    // Their version is now the saved one; a further edit saves on top of it without another conflict.
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await click(buttons("Save draft")[0]);
    const save = fixture.calls.find(c => c.method === "saveDesign");
    expect(save?.args[0].design.accentColor).toBe("#123456");
    expect(save?.args[0].design.heroPage.sections[0].id).toBe("remote1");
    expect(homeSections(save?.args[0].design)).toHaveLength(2);
  });

  it("a conflict during Publish shows the combined design instead of publishing the other tab's draft (#50)", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await unseenRemoteSave(await otherTabDraft({ accentColor: "#123456" }));
    await click(buttons("Publish")[0]);
    await click(buttons("Publish now")[0]);
    expect(fixture.calls.some(c => c.method === "saveDesign")).toBe(false);
    expect(host.textContent).toMatch(/nothing was published/i);
    expect(homeSections(fixture.settings.design)).toEqual([]);
    expect(host.textContent).toMatch(/Home · 1 section/);
    // Reviewed → Publish again goes out with both sets of changes.
    await click(buttons("Publish")[0]);
    await click(buttons("Publish now")[0]);
    const publish = fixture.calls.find(c => c.method === "saveDesign");
    expect(publish?.args[1]).toEqual({ publish: true });
    expect(publish?.args[0].design.accentColor).toBe("#123456");
    expect(homeSections(publish?.args[0].design)).toEqual(["NewsletterSection"]);
  });

  it("a field update from another admin page moves the revision on, so Studio follows it (#9)", async () => {
    await mount();
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    const { draftFieldUpdate } = await import("../themeStore");
    await act(async () => { await draftFieldUpdate({ showUnderConstruction: true }); await new Promise(r => setTimeout(r, 0)); });
    // The unsaved section here and the new field there are different settings: offered as a combine banner, not ignored.
    expect(document.body.querySelector("[data-studio-incoming]")).not.toBeNull();
    await click(buttons("Bring in their changes")[0]);
    await click(buttons("Save draft")[0]);
    expect(fixture.calls.find(c => c.method === "saveDesign")?.args[0].design.showUnderConstruction).toBe(true);
  });

  it("Discard goes back to what is live now, not what was live when the admin page loaded (#51)", async () => {
    const stale = JSON.parse(JSON.stringify(fixture.settings));
    fixture.settings.design = { ...fixture.settings.design, accentColor: "#abcdef", scheduledMarker: "live-now" }; // a scheduled go-live
    root = createRoot(host);
    await act(async () => { root.render(h(StudioEditor, { settings: { ...stale, draftDesign: fixture.settings.draftDesign }, onExit: () => {} })); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await click(buttons("Add section")[0]);
    await click(buttons(/^Newsletter/)[0]);
    await click(buttons("Save draft")[0]);
    await click(buttons("Theme actions")[0]);
    await click(buttons(/^Discard saved draft/)[0]);
    await click(buttons("Discard draft")[0]);
    const discard = fixture.calls.filter(c => c.method === "saveDesign").pop();
    expect(discard?.args[1]).toEqual({ publish: false });
    expect(discard?.args[0].design.scheduledMarker).toBe("live-now");
    expect(discard?.args[0].design.accentColor).toBe("#abcdef");
  });

  it("Media Delete is refused while a scheduled design, a campaign's restore design or a share link uses the image (#8)", async () => {
    const src = fixture.media[0].variants[2].url;
    const withIt = { heroPage: { sections: [{ id: "x", type: "HeroSection", settings: { imageUrl: src } }] } };
    fixture.schedule = [{ id: "s1", kind: "campaign", name: "Autumn sale", status: "live", startAt: "2026-10-01T00:00:00.000Z", endAt: "2027-01-01T00:00:00.000Z", design: {}, revertDesign: withIt }];
    await mount();
    await click(buttons("Media")[0]);
    await click(document.querySelector("[data-media-id='m-riso-print']")!);
    await click(buttons("Delete image")[0]);
    expect(host.textContent).toMatch(/Scheduled › Autumn sale \(the design restored when it ends\)/);
    expect(fixture.calls.some(c => c.method === "removeMedia")).toBe(false);

    fixture.schedule = [];
    fixture.previewLinks = [{ token: "t".repeat(32), name: "For the printer", createdAt: "2026-10-09T00:00:00.000Z", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), design: withIt }];
    await click(buttons("Delete image")[0]);
    expect(host.textContent).toMatch(/Share link › For the printer/);
    expect(fixture.calls.some(c => c.method === "removeMedia")).toBe(false);

    // An expired link no longer shows anything, so it doesn't hold the image.
    fixture.previewLinks[0].expiresAt = "2026-01-01T00:00:00.000Z";
    await click(buttons("Delete image")[0]);
    await click(buttons("Delete image").at(-1));
    expect(fixture.calls.find(c => c.method === "removeMedia")?.args[0]).toBe("m-riso-print");
  });
});
