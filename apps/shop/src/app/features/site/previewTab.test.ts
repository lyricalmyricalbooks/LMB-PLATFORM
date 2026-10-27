import { describe, expect, it } from "vitest";
import { PREVIEW_CHANNEL, isPreviewTab, rememberPreviewSnapshot, startPreviewTab, studioDraftStatus } from "./previewTab";

// Studio › "Preview in new tab" — the storefront side of the BroadcastChannel hand-off.

class FakeChannel {
  static all: FakeChannel[] = [];
  sent: any[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  constructor(public name: string) { FakeChannel.all.push(this); }
  postMessage(data: any) { this.sent.push(data); }
  close() { this.closed = true; }
}

function fakeWindow(search: string, framed = false) {
  const listeners: ((e: MessageEvent) => void)[] = [];
  const dispatched: MessageEvent[] = [];
  const pushed: string[] = [];
  const win: any = {
    location: { search, origin: "https://shop.example", href: `https://shop.example/${search}` },
    history: {
      pushState: (_s: any, _t: string, url?: string) => { pushed.push(String(url)); },
      replaceState: (_s: any, _t: string, url?: string) => { pushed.push(String(url)); },
    },
    BroadcastChannel: FakeChannel,
    MessageEvent: class { constructor(public type: string, init: any) { Object.assign(this, init); } },
    addEventListener: (_t: string, fn: any) => listeners.push(fn),
    removeEventListener: () => {},
    dispatchEvent: (e: MessageEvent) => { dispatched.push(e); listeners.forEach((fn) => fn(e)); return true; },
  };
  win.parent = framed ? {} : win;
  return { win, dispatched, pushed };
}

describe("preview tab", () => {
  it("only runs top-level with ?preview=true", () => {
    expect(isPreviewTab(fakeWindow("?preview=true").win)).toBe(true);
    expect(isPreviewTab(fakeWindow("?preview=true", true).win)).toBe(false);
    expect(isPreviewTab(fakeWindow("").win)).toBe(false);
    FakeChannel.all = [];
    startPreviewTab(fakeWindow("").win);
    startPreviewTab(fakeWindow("?preview=true", true).win);
    expect(FakeChannel.all).toHaveLength(0);
  });

  it("re-dispatches Studio's snapshot as a same-origin window message and asks for it on start", () => {
    FakeChannel.all = [];
    const { win, dispatched } = fakeWindow("?preview=true");
    const stop = startPreviewTab(win);
    const channel = FakeChannel.all[0];
    expect(channel.name).toBe(PREVIEW_CHANNEL);
    expect(channel.sent).toContainEqual({ type: "PREVIEW_READY" });

    const state = { type: "STUDIO_PREVIEW_STATE", design: { productTitleColor: "#3245D2" }, books: [] };
    channel.onmessage!({ data: state } as MessageEvent);
    expect(win.__studioPreviewDesign).toEqual(state.design);
    const event = dispatched.find((e) => e.data === state)!;
    expect(event.origin).toBe("https://shop.example");
    expect(event.source).toBe(win);
    stop();
    expect(channel.closed).toBe(true);
  });

  it("remembers whether Studio's draft is unsaved, saved or live for the View website banner", () => {
    FakeChannel.all = [];
    const { win } = fakeWindow("?preview=true");
    startPreviewTab(win);
    const channel = FakeChannel.all[0];
    expect(studioDraftStatus(win)).toBeUndefined();
    channel.onmessage!({ data: { type: "STUDIO_PREVIEW_STATE", design: {}, studioStatus: "draft" } } as MessageEvent);
    expect(studioDraftStatus(win)).toBe("draft");
    channel.onmessage!({ data: { type: "STUDIO_PREVIEW_STATE", design: {}, studioStatus: "nonsense" } } as MessageEvent);
    expect(studioDraftStatus(win)).toBe("draft");
  });

  it("forwards the page's own PREVIEW_READY to Studio", () => {
    FakeChannel.all = [];
    const { win } = fakeWindow("?preview=true");
    startPreviewTab(win);
    const channel = FakeChannel.all[0];
    channel.sent = [];
    win.dispatchEvent(new MessageEvent("message", { data: { type: "PREVIEW_READY" }, origin: "https://shop.example" }));
    expect(channel.sent).toEqual([{ type: "PREVIEW_READY" }]);
  });

  it("keeps ?preview=true on in-app navigation", () => {
    FakeChannel.all = [];
    const { win, pushed } = fakeWindow("?preview=true");
    startPreviewTab(win);
    win.history.pushState(null, "", "/books/altrove");
    expect(pushed[0]).toBe("/books/altrove?preview=true");
  });
});

describe("rememberPreviewSnapshot", () => {
  it("keeps the newest Studio snapshot for pages that mount after it arrived", () => {
    const { win } = fakeWindow("?preview=true", true);
    const stop = rememberPreviewSnapshot(win);
    const design = { accentColor: "#ff0000" };
    win.dispatchEvent({ origin: "https://shop.example", source: win.parent, data: { type: "STUDIO_PREVIEW_STATE", design, settings: { design }, books: [{ id: "b" }], pages: [] } } as any);
    expect(win.__studioPreviewDesign).toBe(design);
    expect(win.__studioPreviewState.books).toEqual([{ id: "b" }]);
    expect(win.__studioPreviewState.pages).toEqual([]);
    stop();
  });

  it("ignores other senders and does nothing outside the preview", () => {
    const { win } = fakeWindow("?preview=true", true);
    rememberPreviewSnapshot(win);
    win.dispatchEvent({ origin: "https://evil.example", source: win.parent, data: { type: "STUDIO_PREVIEW_STATE", design: { a: 1 } } } as any);
    win.dispatchEvent({ origin: "https://shop.example", source: {}, data: { type: "STUDIO_PREVIEW_STATE", design: { a: 1 } } } as any);
    expect(win.__studioPreviewDesign).toBeUndefined();
    const shopper = fakeWindow("", true).win;
    rememberPreviewSnapshot(shopper);
    shopper.dispatchEvent({ origin: "https://shop.example", source: shopper.parent, data: { type: "STUDIO_PREVIEW_STATE", design: { a: 1 } } } as any);
    expect(shopper.__studioPreviewDesign).toBeUndefined();
  });
});
