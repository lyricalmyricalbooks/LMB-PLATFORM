// @vitest-environment jsdom
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const askAi = vi.fn();
vi.mock("../aiWriter", async (orig) => ({ ...(await orig() as any), askAi: (...args: any[]) => askAi(...args) }));
const { StudioAiContext, StudioAiRewrite } = await import("./StudioAiRewrite");

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.appendChild(host);
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); host.replaceChildren(); askAi.mockReset(); });

const mount = (props: any, notify = vi.fn()) => {
  root = createRoot(host);
  act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, props))));
  return notify;
};
const click = (text: string) => act(() => { [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text))!.click(); });
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe("Rewrite with AI", () => {
  it("rewrites the field once, as one change, and offers Undo", async () => {
    askAi.mockResolvedValue({ text: "A warmer hello, {name}" });
    const onChange = vi.fn();
    const notify = mount({ kind: "text", label: "Greeting", where: "Header", value: "Hello {name}", onChange });
    click("Rewrite with AI"); click("Friendlier");
    await settle();
    expect(askAi).toHaveBeenCalledWith("rewrite", expect.objectContaining({ text: "Hello {name}", how: "friendlier", label: "Greeting", where: "Header", format: "plain" }), expect.anything());
    expect(onChange).toHaveBeenCalledWith("A warmer hello, {name}");
    expect(notify).toHaveBeenCalledWith("ok", expect.stringContaining("Greeting"), { undo: true });
  });
  it("changes nothing when the answer drops a placeholder, and says why", async () => {
    askAi.mockResolvedValue({ text: "Hello there" });
    const onChange = vi.fn();
    const notify = mount({ kind: "text", label: "Greeting", value: "Hello {name}", onChange });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/placeholder/), expect.anything());
  });
  it("keeps the owner's words when they typed while the AI was writing", async () => {
    let resolve!: (v: any) => void;
    askAi.mockReturnValue(new Promise(r => { resolve = r; }));
    const onChange = vi.fn();
    const notify = vi.fn();
    mount({ kind: "textarea", label: "Body", value: "First words", onChange }, notify);
    click("Rewrite with AI"); click("Shorter");
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { kind: "textarea", label: "Body", value: "First words, edited", onChange }))));
    resolve({ text: "Short" });
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/changed while/));
  });
  it("points at the AI settings when no key is saved", async () => {
    const { AiWriteError } = await import("../aiWriter");
    askAi.mockRejectedValue(new AiWriteError("Add your free Google AI key first", true));
    const notify = mount({ kind: "text", label: "Title", value: "Hi", onChange: vi.fn() });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/key/), { needsKey: true });
  });
  it("isn't offered for empty or connected fields, or outside Studio", () => {
    mount({ kind: "text", label: "Title", value: "", onChange: vi.fn() });
    expect(host.textContent).not.toContain("Rewrite");
    act(() => root.render(h(StudioAiRewrite, { kind: "text", label: "Title", value: "Hi", onChange: vi.fn() })));
    expect(host.textContent).not.toContain("Rewrite");
  });

  it("doesn't touch the field, or offer an Undo, when the AI has nothing to change", async () => {
    askAi.mockResolvedValue({ text: "Already right" });
    const onChange = vi.fn();
    const notify = mount({ kind: "text", label: "Title", value: "Already right", onChange });
    click("Rewrite with AI"); click("Fix spelling");
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("ok", expect.stringMatching(/nothing to change/));
    expect(notify.mock.calls.some(c => c[2]?.undo)).toBe(false);
  });
  it("rewrites the words of rich text with pictures and gives the pictures back untouched", async () => {
    const value = '<p>Hi there.</p><p class="ql-align-center"><img src="https://x.test/a.png" alt="Cover"></p>';
    askAi.mockImplementation(async (_task: string, input: any) => ({ text: input.text.replace("Hi there.", "Hello, friend.") }));
    const onChange = vi.fn();
    mount({ kind: "richtext", label: "Content", value, onChange });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(askAi.mock.calls[0][1].text).toBe("<p>Hi there.</p><p>[[keep-1]]</p>");
    expect(onChange).toHaveBeenCalledWith('<p>Hello, friend.</p><p class="ql-align-center"><img src="https://x.test/a.png" alt="Cover"></p>');
  });
  it("changes nothing when the AI drops a picture", async () => {
    askAi.mockResolvedValue({ text: "<p>Hello.</p>" });
    const onChange = vi.fn();
    const notify = mount({ kind: "richtext", label: "Content", value: '<p>Hi.</p><p><img src="a"></p>', onChange });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/moved or dropped a picture/), expect.anything());
  });
  it("still refuses coloured words before asking the AI", async () => {
    const notify = mount({ kind: "richtext", label: "Content", value: '<p><span style="color: red;">Hi</span></p>', onChange: vi.fn() });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(askAi).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/coloured/));
  });
  it("gives a page body its own Undo, which leaves later edits alone", async () => {
    askAi.mockResolvedValue({ text: "<p>New words.</p>" });
    const onChange = vi.fn(), notify = vi.fn();
    const props = { kind: "richtext", label: "Page text", value: "<p>Old words.</p>", onChange, localUndo: true };
    mount(props, notify);
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(onChange).toHaveBeenLastCalledWith("<p>New words.</p>");
    const undo = notify.mock.calls.find(c => c[0] === "ok")![2].undo as () => void;
    expect(typeof undo).toBe("function");
    // The editor tidied the markup but the words are the AI's: Undo puts the old body back.
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { ...props, value: "<p>New words.</p><p><br></p>" }))));
    act(() => undo());
    expect(onChange).toHaveBeenLastCalledWith("<p>Old words.</p>");
    // Once the owner has typed more, Undo doesn't throw their words away.
    onChange.mockClear();
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { ...props, value: "<p>New words, and mine.</p>" }))));
    act(() => undo());
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith("err", expect.stringMatching(/edited or closed/));
  });
  it("won't undo onto another page, or over a picture added after the rewrite", async () => {
    askAi.mockResolvedValue({ text: "<p>New words.</p>" });
    const onChange = vi.fn(), notify = vi.fn();
    const props = { kind: "richtext", label: "Page text", value: "<p>Old words.</p>", onChange, localUndo: true };
    mount(props, notify);
    click("Rewrite with AI"); click("Improve");
    await settle();
    const undo = notify.mock.calls.find(c => c[0] === "ok")![2].undo as () => void;
    onChange.mockClear();
    // Same words, but a picture was added since: Undo leaves it.
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { ...props, value: '<p>New words.</p><p><img src="a"></p>' }))));
    act(() => undo());
    expect(onChange).not.toHaveBeenCalled();
    // The page was closed (another opened): its editor is gone, so Undo does nothing.
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { ...props, value: "<p>New words.</p>" }))));
    act(() => root.unmount());
    act(() => undo());
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith("err", expect.stringMatching(/edited or closed/));
    root = createRoot(host);
  });
  it("reports nothing to change when only a link's new-tab settings differed", async () => {
    const value = '<p>See <a href="https://x.test" target="_blank" rel="noopener noreferrer">us</a>.</p>';
    askAi.mockImplementation(async (_t: string, input: any) => ({ text: input.text }));
    const onChange = vi.fn();
    const notify = mount({ kind: "richtext", label: "Page text", value, onChange, localUndo: true });
    click("Rewrite with AI"); click("Fix spelling");
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("ok", expect.stringMatching(/nothing to change/));
  });
  it("hands the answer to the newest onChange, so edits made while waiting aren't undone", async () => {
    let resolve!: (v: any) => void;
    askAi.mockReturnValue(new Promise(r => { resolve = r; }));
    const first = vi.fn(), second = vi.fn(), notify = vi.fn();
    mount({ kind: "text", label: "Answer", value: "Old", onChange: first }, notify);
    click("Rewrite with AI"); click("Improve");
    // Another field of the same block changed: the inspector re-renders with a fresh onChange (same value here).
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { kind: "text", label: "Answer", value: "Old", onChange: second }))));
    resolve({ text: "New" });
    await settle();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("New");
  });
});
