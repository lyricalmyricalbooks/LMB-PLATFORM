import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type Quill from "quill";
import { editorHtml } from "./quillHtml";

// A small React wrapper around Quill 2 (replaces react-quill, which was stuck on Quill 1 and its
// unpatched advisory). It saves Quill 1-shaped HTML (see quillHtml.ts), so pages and sections written
// before keep loading and saving with the same meaning.
//
// Like react-quill: `value` is HTML, `onChange(html)` fires on every edit, a new `value` from outside
// replaces the contents and keeps the cursor, and the ref's `getEditor()` returns the Quill instance.
// Unlike it: Quill loads on first use (it touches `document` as soon as it's imported, and only the
// admin needs it), so `getEditor()` is null until `onReady` fires; `modules`/`formats`/`theme` are read
// once, when the editor is made (both callers keep them stable; an external toolbar can't be wired
// twice); and loading a value never reports a change by itself, so opening an older page doesn't mark
// it unsaved.

export type QuillClass = typeof Quill;
export type QuillEditorHandle = { getEditor: () => Quill | null };

let quillLoad: Promise<QuillClass> | null = null;
/** Quill 2 and its Snow theme's CSS, loaded once. */
export function loadQuill(): Promise<QuillClass> {
  quillLoad ||= Promise.all([import("quill"), import("quill/dist/quill.snow.css")]).then(([m]) => m.default);
  quillLoad.catch(() => { quillLoad = null; }); // a failed chunk load can be tried again
  return quillLoad;
}

type Props = {
  value: string;
  onChange?: (html: string) => void;
  modules?: Record<string, unknown>;
  formats?: string[];
  theme?: string;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Runs with the Quill class before the editor is made (register custom formats here). */
  prepare?: (Quill: QuillClass) => void;
  /** The editor exists (also reachable through the ref from now on). */
  onReady?: (editor: Quill) => void;
};

export const QuillEditor = forwardRef<QuillEditorHandle, Props>(function QuillEditor(
  { value, onChange, modules, formats, theme = "snow", placeholder, className, onFocus, onBlur, prepare, onReady }, ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Quill | null>(null);
  // The HTML the editor holds, as last loaded or reported. A `value` equal to it is our own echo.
  const heldRef = useRef<string>("");
  const loadingRef = useRef(false);
  const latest = useRef({ value, onChange, onFocus, onBlur });
  latest.current = { value, onChange, onFocus, onBlur };

  useImperativeHandle(ref, () => ({ getEditor: () => editorRef.current }), []);

  /** Replaces the contents with `html` (an "api" change, so Ctrl+Z can undo it, like react-quill). */
  const load = (q: Quill, html: string) => {
    heldRef.current = html;
    const selection = q.hasFocus() ? q.getSelection() : null;
    loadingRef.current = true;
    try { q.setContents(q.clipboard.convert({ html: html || "" }), "api"); }
    finally { loadingRef.current = false; }
    if (selection) {
      const end = Math.max(0, q.getLength() - 1);
      const index = Math.min(selection.index, end);
      q.setSelection(index, Math.min(selection.length, end - index), "silent");
    }
  };

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    loadQuill().then((QuillCtor) => {
      const host = hostRef.current;
      if (cancelled || !host) return;
      prepare?.(QuillCtor);
      const box = document.createElement("div");
      host.appendChild(box);
      const q = new QuillCtor(box, { theme, modules, formats, placeholder });
      const onText = () => {
        if (loadingRef.current) return;
        const html = editorHtml(q.root);
        if (html === heldRef.current) return;
        heldRef.current = html;
        latest.current.onChange?.(html);
      };
      const onSelection = (range: unknown, old: unknown) => {
        if (range && !old) latest.current.onFocus?.();
        else if (!range && old) latest.current.onBlur?.();
      };
      q.on("text-change", onText);
      q.on("selection-change", onSelection);
      load(q, latest.current.value || "");
      q.history.clear(); // Ctrl+Z must never empty the editor back to before the page loaded
      editorRef.current = q;
      cleanup = () => {
        q.off("text-change", onText);
        q.off("selection-change", onSelection);
        editorRef.current = null;
        host.innerHTML = "";
      };
      onReady?.(q);
    }, (err) => console.error("The text editor couldn't load:", err));
    return () => { cancelled = true; cleanup(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = editorRef.current;
    if (q && (value || "") !== heldRef.current) load(q, value || "");
  }, [value]);

  useEffect(() => {
    const q = editorRef.current;
    if (q) q.root.dataset.placeholder = placeholder || "";
  }, [placeholder]);

  return <div ref={hostRef} className={className} />;
});
