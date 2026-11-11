// @vitest-environment jsdom
// Sales channels and Social posts (plan 27.5, 27.6) against a pretend social service: connect, send products, the
// coming-soon state with the by-hand steps, a lost connection, and posting now, later, cancelling and trying again.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectOutcome, fromLocalInput, inFilter, localInputValue, maybeNotJpeg, postPhotos, postablePlaces, starterCaption } from "./socialChannels";

const api = vi.hoisted(() => ({ social: vi.fn(), getAllBooks: vi.fn() }));
vi.mock("./api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { SalesChannels } = await import("./SalesChannels");
const { SocialPosts } = await import("./SocialPosts");
const { ToastProvider } = await import("./riso/components");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const click = async (label: string) => { const b = button(label); if (!b) throw new Error(`no button ${label}: ${text()}`); await act(async () => { b.click(); }); await flush(); };
const text = () => document.body.textContent || "";
const card = (network: string) => document.querySelector(`[data-channel="${network}"]`) as HTMLElement;
/** Opens a channel's ⋯ menu, then picks one of its items. */
const pick = async (channel: string, item: string) => {
  const menu = document.querySelector(`[aria-label="Actions for ${channel}"]`) as HTMLButtonElement;
  if (!menu) throw new Error(`no menu for ${channel}: ${text()}`);
  await act(async () => { menu.click(); });
  await click(item);
};

const network = (id: string, fields: any = {}) => ({
  network: id, name: { meta: "Facebook & Instagram", pinterest: "Pinterest", tiktok: "TikTok" }[id], available: true, connected: false,
  problem: null, accountName: null, places: [], catalog: null, canSendCatalog: id !== "tiktok", ...fields,
});
const META_ON = network("meta", { connected: true, accountName: "Jo Moth", places: [{ id: "fb:111", kind: "facebookPage", name: "Moth Press" }, { id: "ig:222", kind: "instagram", name: "@mothpress" }] });
const BOOKS = [
  { id: "nm", slug: "night-moths", title: "Night Moths", retailPrice: 24, description: "<p>Poems for the dark.</p>", photos: [{ url: "https://img.example/a.jpg" }, { url: "https://img.example/b.png" }] },
  { id: "draft", title: "No page yet", photoUrl: "https://img.example/c.jpg" },
];

function fakeService(world: { status: any; posts?: any[]; fail?: Record<string, string> }) {
  world.posts ??= [];
  api.getAllBooks.mockResolvedValue(BOOKS);
  api.social.mockImplementation(async (step: string, args: any = {}) => {
    if (world.fail?.[step]) throw Object.assign(new Error(world.fail[step]), { code: "refused" });
    if (step === "status") return world.status;
    if (step === "connect") return { url: `https://signin.example/?network=${args.network}` };
    if (step === "sendCatalog") {
      world.status.networks = world.status.networks.map((n: any) => (n.network === args.network ? { ...n, catalog: { sentAt: "2026-11-04T12:00:00Z", feedUrl: "https://x/f.csv" } } : n));
      return { changed: true };
    }
    if (step === "disconnect") {
      world.status.networks = world.status.networks.map((n: any) => (n.network === args.network ? network(n.network) : n));
      return { disconnected: true };
    }
    if (step === "posts") return { posts: world.posts };
    if (step === "savePost") {
      const post = { id: `p${world.posts!.length + 1}`, bookId: args.bookId, bookTitle: "Night Moths", imageUrl: args.imageUrl, caption: args.caption,
        places: args.placeIds.map((id: string) => ({ id, kind: id.startsWith("ig") ? "instagram" : "facebookPage", name: id })),
        sendAt: args.sendAt || "2026-11-04T12:00:00Z", status: args.sendAt ? "scheduled" : "posted", createdAt: "2026-11-04T12:00:00Z",
        results: args.sendAt ? {} : Object.fromEntries(args.placeIds.map((id: string) => [id, { state: "posted" }])) };
      world.posts!.unshift(post);
      return { post };
    }
    if (step === "cancelPost") { world.posts = world.posts!.map((p) => (p.id === args.id ? { ...p, status: "cancelled" } : p)); return { cancelled: true }; }
    if (step === "retryPost") {
      world.posts = world.posts!.map((p) => (p.id === args.id ? { ...p, status: "posted", results: { "fb:111": { state: "posted" } } } : p));
      return { post: world.posts!.find((p) => p.id === args.id) };
    }
    throw new Error(`unexpected ${step}`);
  });
}

const mount = async (el: any) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(ToastProvider, null, el)));
  await flush();
};

describe("the words and rules both pages share", () => {
  it("says how a sign-in went, in plain words", () => {
    expect(connectOutcome("connected", "meta")?.text).toMatch(/Facebook & Instagram is connected/);
    expect(connectOutcome("denied", "tiktok")?.tone).toBe("warning");
    expect(connectOutcome("no_places", "pinterest")?.text).toMatch(/no boards/);
    expect(connectOutcome("failed", "meta")?.tone).toBe("danger");
    expect(connectOutcome(null, null)).toBeNull();
  });
  it("lists only connected places, in the channels' order", () => {
    const places = postablePlaces({ enabled: true, networks: [network("tiktok", { connected: true, places: [{ id: "tt:1", kind: "tiktok", name: "Moth" }] }), META_ON] as any });
    expect(places.map((p) => p.id)).toEqual(["fb:111", "ig:222", "tt:1"]);
    expect(postablePlaces({ enabled: false, networks: [META_ON] as any })).toEqual([]);
  });
  it("starts a post with the product's name, a short line and the price", () => {
    const words = starterCaption({ title: "Night Moths", subtitle: "by Jo Moth", price: 24, description: "<p>Poems for the dark.</p>" });
    expect(words).toBe("Night Moths by Jo Moth\n\nPoems for the dark.\n\n$24.00. Link in the post.");
    expect(starterCaption({ title: "Mug", description: "x ".repeat(200) }).split("\n\n")[1].length).toBeLessThanOrEqual(180);
  });
  it("uses the product's photos, never a video, and spots a photo Instagram may refuse", () => {
    expect(postPhotos({ photos: [{ url: "https://a/1.jpg" }, { url: "https://a/v.mp4", type: "video" }], photoUrl: "https://a/1.jpg" })).toEqual(["https://a/1.jpg"]);
    expect(maybeNotJpeg("https://firebasestorage.example/o/books%2Fcover.webp?alt=media")).toBe(true);
    expect(maybeNotJpeg("https://img.example/cover.jpg")).toBe(false);
  });
  it("reads the time box on the press's own clock", () => {
    const ms = Date.parse("2026-11-04T15:30:00Z");
    expect(fromLocalInput(localInputValue(ms))).toBe(new Date(ms).toISOString());
    expect(fromLocalInput("")).toBeNull();
    expect(inFilter({ status: "partly" }, "attention")).toBe(true);
    expect(inFilter({ status: "scheduled" }, "upcoming")).toBe(true);
  });
});

describe("Sales channels", () => {
  it("while the one-button link is off: every channel says coming soon, and the by-hand steps open with the product file", async () => {
    fakeService({ status: { enabled: false, networks: [] } });
    await mount(h(SalesChannels, { onOpen: vi.fn() }));
    expect(text()).toContain("Online store");
    expect(text()).toContain("Google & YouTube");
    expect(document.querySelectorAll(".rp-badge").length).toBeGreaterThan(3);
    expect(text().match(/Coming soon/g)?.length).toBe(3);
    expect(card("tiktok").querySelector("button")).toBeNull();
    await pick("Pinterest", "Set up by hand");
    expect(text()).toContain("Feed address");
    expect(api.getAllBooks).toHaveBeenCalled();
  });

  it("connects: the sign-in page opens with a way back to this page", async () => {
    fakeService({ status: { enabled: true, networks: [network("meta"), network("pinterest"), network("tiktok")] } });
    const openSignIn = vi.fn();
    await mount(h(SalesChannels, { onOpen: vi.fn(), openSignIn }));
    await act(async () => { (card("pinterest").querySelector('[aria-label="Connect Pinterest"]') as HTMLButtonElement).click(); });
    await flush();
    expect(api.social).toHaveBeenCalledWith("connect", { network: "pinterest", returnUrl: expect.stringMatching(/#channels$/) });
    expect(openSignIn).toHaveBeenCalledWith("https://signin.example/?network=pinterest");
  });

  it("connected: the account and its places, send products, create a post, disconnect after asking", async () => {
    const world = { status: { enabled: true, networks: [META_ON, network("pinterest"), network("tiktok")] } };
    fakeService(world);
    const onOpen = vi.fn();
    await mount(h(SalesChannels, { onOpen }));
    expect(card("meta").textContent).toContain("Connected as Jo Moth");
    expect(card("meta").textContent).toContain("@mothpress");
    await pick("Facebook & Instagram", "Send my products");
    expect(api.social).toHaveBeenCalledWith("sendCatalog", { network: "meta" });
    expect(text()).toContain("Products sent to Facebook & Instagram");
    await act(async () => { (document.querySelector('[aria-label="Actions for Facebook & Instagram"]') as HTMLButtonElement).click(); });
    expect(button("Send products again")).toBeTruthy();
    await click("Create a post");
    expect(onOpen).toHaveBeenCalledWith("socialPosts");
    await pick("Facebook & Instagram", "Disconnect");
    expect(text()).toContain("Disconnect Facebook & Instagram?");
    const yes = [...document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button')].find((b) => b.textContent?.trim() === "Disconnect") as HTMLButtonElement;
    await act(async () => { yes.click(); });
    await flush();
    const disconnects = api.social.mock.calls.filter(([s]) => s === "disconnect");
    expect(disconnects).toEqual([["disconnect", { network: "meta" }]]);
  });

  it("a lost connection asks to connect again", async () => {
    fakeService({ status: { enabled: true, networks: [network("meta", { problem: "lost" }), network("pinterest"), network("tiktok")] } });
    await mount(h(SalesChannels, { onOpen: vi.fn() }));
    expect(card("meta").textContent).toContain("Connection lost");
    expect(button("Connect again")).toBeTruthy();
  });

  it("back from a sign-in: says how it went and takes the word off the address", async () => {
    window.history.replaceState(null, "", "/admin?social=connected&network=meta#channels");
    fakeService({ status: { enabled: true, networks: [META_ON, network("pinterest"), network("tiktok")] } });
    await mount(h(SalesChannels, { onOpen: vi.fn() }));
    expect(text()).toContain("Facebook & Instagram is connected");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#channels");
  });
});

describe("Social posts", () => {
  it("with nothing connected, points to Sales channels", async () => {
    fakeService({ status: { enabled: true, networks: [network("meta"), network("pinterest"), network("tiktok")] } });
    const onOpen = vi.fn();
    await mount(h(SocialPosts, { onOpen }));
    expect(text()).toContain("Connect an account to start posting");
    await click("Open Sales channels");
    expect(onOpen).toHaveBeenCalledWith("channels");
  });

  it("posts a product now: product, photo, words filled in, places, then it shows as posted", async () => {
    const world = { status: { enabled: true, networks: [META_ON, network("pinterest"), network("tiktok")] } };
    fakeService(world);
    await mount(h(SocialPosts, { onOpen: vi.fn(), startWithBook: "nm" }));
    expect(text()).toContain("New post");
    const product = document.querySelector("select") as HTMLSelectElement;
    expect([...product.options].map((o) => o.textContent)).toEqual(["Choose a product…", "Night Moths"]);
    const words = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(words.value).toContain("Night Moths");
    expect(words.value).toContain("$24.00");
    // The second photo is a PNG: the square picture is a JPEG, so only with it off does Instagram ticked warn.
    await act(async () => { (document.querySelectorAll(".rp-composer-photos input")[1] as HTMLInputElement).click(); });
    expect(text()).not.toContain("Instagram may refuse this photo");
    const square = () => document.querySelector('[role=switch][aria-label^="Square picture"]') as HTMLButtonElement;
    await act(async () => { square().click(); });
    expect(text()).toContain("Instagram may refuse this photo");
    await act(async () => { square().click(); });
    await act(async () => { (document.querySelectorAll(".rp-composer-photos input")[0] as HTMLInputElement).click(); });
    await click("Post now");
    expect(api.social).toHaveBeenCalledWith("savePost", { bookId: "nm", imageUrl: "https://img.example/a.jpg", caption: words.value, placeIds: ["fb:111", "ig:222"], sendAt: null, tagProduct: true, square: true });
    expect(text()).toContain("Posted.");
  });

  it("schedules for later, lists it under Scheduled, and cancels it after asking", async () => {
    const world = { status: { enabled: true, networks: [META_ON, network("pinterest"), network("tiktok")] } };
    fakeService(world);
    await mount(h(SocialPosts, { onOpen: vi.fn(), startWithBook: "nm" }));
    const later = [...document.querySelectorAll('input[name="post-when"]')][1] as HTMLInputElement;
    await act(async () => { later.click(); });
    await click("Schedule post");
    const call = api.social.mock.calls.find(([s]) => s === "savePost")!;
    expect(typeof call[1].sendAt).toBe("string");
    expect(text()).toContain("Scheduled for");
    expect(text()).toContain("Goes out");
    await act(async () => { (document.querySelector('[aria-label="Actions for the Night Moths post"]') as HTMLButtonElement).click(); });
    await click("Cancel");
    const yes = [...document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button')].find((b) => b.textContent?.trim() === "Cancel post") as HTMLButtonElement;
    await act(async () => { yes.click(); });
    await flush();
    expect(api.social).toHaveBeenCalledWith("cancelPost", { id: "p1" });
  });

  it("a post a place didn't take comes first with the reason, and Try again in its menu", async () => {
    fakeService({
      status: { enabled: true, networks: [META_ON, network("pinterest"), network("tiktok")] },
      posts: [{ id: "p9", bookId: "nm", bookTitle: "Night Moths", imageUrl: "https://img.example/a.jpg", caption: "Out now", sendAt: "2026-11-04T12:00:00Z", createdAt: "2026-11-04T12:00:00Z",
        status: "failed", places: [{ id: "fb:111", kind: "facebookPage", name: "Moth Press" }], results: { "fb:111": { state: "failed", message: "Facebook & Instagram turned that down." } } }],
    });
    await mount(h(SocialPosts, { onOpen: vi.fn() }));
    expect(text()).toContain("turned that down");
    await act(async () => { (document.querySelector('[aria-label="Actions for the Night Moths post"]') as HTMLButtonElement).click(); });
    await click("Try again");
    expect(api.social).toHaveBeenCalledWith("retryPost", { id: "p9" });
    expect(text()).toContain("Posted.");
  });
});
