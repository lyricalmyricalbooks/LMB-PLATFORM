// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, createElement as h, createRef } from "react";
import { createRoot } from "react-dom/client";
import { QuillEditor, loadQuill, type QuillEditorHandle } from "./QuillEditor";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout; Quill measures the selection when undo scrolls it into view.
const noBox = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
(Range.prototype as any).getBoundingClientRect ||= noBox;
(Range.prototype as any).getClientRects ||= () => [];

async function mount(value: string) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const ref = createRef<QuillEditorHandle>();
  const changes: string[] = [];
  const render = async (v: string) => {
    await act(async () => { root.render(h(QuillEditor, { ref, value: v, onChange: (html: string) => changes.push(html) })); });
  };
  await render(value);
  await act(async () => { await loadQuill(); });
  return { el, ref, changes, render, root };
}

describe("QuillEditor", () => {
  it("opens an older page without reporting a change, and reports real edits as Quill 1 HTML", async () => {
    // Spelled differently from what the editor would write (attribute order), but means the same.
    const { ref, changes } = await mount('<ul><li>one</li></ul><p><img width="50%" alt="A" src="https://example.invalid/a.png"></p>');
    const q = ref.current!.getEditor()!;
    expect(q).toBeTruthy();
    expect(changes).toEqual([]);
    await act(async () => { q.insertText(3, "!", "user"); });
    expect(changes).toEqual(['<ul><li>one!</li></ul><p><img src="https://example.invalid/a.png" alt="A" width="50%"></p>']);
    // Ctrl+Z goes back to the page as opened, never to an empty editor.
    await act(async () => { q.history.undo(); q.history.undo(); });
    expect(q.getText()).toContain("one");
  });

  it("takes a new value from outside (AI rewrite, undo) without echoing it back", async () => {
    const { ref, changes, render } = await mount("<p>first</p>");
    await render("<p>second</p>");
    expect(ref.current!.getEditor()!.getText()).toBe("second\n");
    expect(changes).toEqual([]);
    // Its own echo doesn't reload the contents (the cursor would jump while typing).
    const q = ref.current!.getEditor()!;
    await act(async () => { q.insertText(6, "!", "user"); });
    const before = q.getContents();
    await render(changes[0]);
    expect(q.getContents()).toEqual(before);
  });
});
