import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Images, Trash2 } from "lucide-react";
import { QuillEditor, type QuillClass as QuillCtor, type QuillEditorHandle } from "../../components/QuillEditor";
import { IMAGE_SIZES, pageBodyStats } from "../../features/site/pageBody";
import { mainUrl } from "./mediaLibrary";
import { useMediaPicker, type MediaPickerApi } from "./mediaPicker";
import { uploadErrorMessage, uploadStudioImage } from "./mediaUpload";
import { StudioAiRewrite } from "./StudioAiRewrite";

// The custom page body editor (Studio › Pages). Quill, plus: pictures uploaded to Storage (toolbar button,
// paste or drag-and-drop — never stored inline as data: text), the media library, picture size /
// alignment / description tools, a divider line and video embeds. The saved HTML is what PageView renders.

// Quill loads on first use (QuillEditor); this is the class once it has.
let QuillClass: any = null;
let extrasRegistered = false;
function registerExtras(Quill: QuillCtor) {
  QuillClass = Quill;
  if (extrasRegistered) return;
  extrasRegistered = true;
  const BlockEmbed = QuillClass.import("blots/block/embed");
  class Divider extends BlockEmbed {}
  (Divider as any).blotName = "divider";
  (Divider as any).tagName = "hr";
  QuillClass.register(Divider, true);
  const icons = QuillClass.import("ui/icons");
  icons.divider = '<svg viewBox="0 0 18 18"><line class="ql-stroke" x1="3" x2="15" y1="9" y2="9"></line></svg>';
}

/** Uploads one picture (into the media library when it's switched on) and returns its address + saved description. */
export async function uploadPagePicture(media: MediaPickerApi | null, file: File): Promise<{ url: string; alt: string }> {
  if (media?.status === "ready") {
    const item = await media.upload(file);
    return { url: mainUrl(item), alt: item.alt || "" };
  }
  return { url: await uploadStudioImage(file), alt: "" };
}

/** Picture files Quill's own drop/paste hands to our uploader (everything else stays with the browser). */
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml", "image/heic", "image/heif"];

type Picked = { index: number; src: string; alt: string; width: string; align: string };

const TOOLBAR = [
  [{ header: [2, 3, 4, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
  [{ align: [] }],
  ["link", "blockquote", "divider"],
  ["image", "video"],
  ["clean"],
];

export function PageBodyEditor({ value, onChange, onUploading, title }: {
  value: string; onChange: (html: string) => void; onUploading?: (busy: boolean) => void;
  /** The page's title: tells the AI rewrite where these words are. */
  title?: string;
}) {
  const media = useMediaPicker();
  const quillRef = useRef<QuillEditorHandle | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [ready, setReady] = useState(false); // Quill has loaded and the editor exists
  const editor = () => quillRef.current?.getEditor?.() as any;
  useEffect(() => { onUploading?.(uploading > 0); }, [uploading, onUploading]);
  useEffect(() => () => onUploading?.(false), [onUploading]);

  const uploadPicture = (file: File) => uploadPagePicture(media, file);

  /** Puts a picture on its own line at `index` (so its size/position never reflow the text) and selects it. Returns the index after it. */
  const insertPicture = (index: number, url: string, alt: string): number => {
    const q = editor();
    if (!q || !url) return index;
    let at = Math.min(index, Math.max(0, q.getLength() - 1));
    if (at > 0 && q.getText(at - 1, 1) !== "\n") { q.insertText(at, "\n", "user"); at += 1; }
    q.insertEmbed(at, "image", url, "user");
    if (alt) q.formatText(at, 1, "alt", alt, "user");
    if (q.getText(at + 1, 1) !== "\n") q.insertText(at + 1, "\n", "user");
    q.setSelection(at, 1, "user");
    return at + 1;
  };

  const cursor = () => {
    const q = editor();
    const range = q?.getSelection?.();
    return range ? range.index + range.length : q ? Math.max(0, q.getLength() - 1) : 0;
  };

  const uploadFiles = async (files: File[], at?: number) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setError("");
    let index = at ?? cursor();
    setUploading((n) => n + images.length);
    for (const file of images) {
      try {
        const { url, alt } = await uploadPicture(file);
        if (!editor()) { setError("A picture was uploaded but couldn't be placed on the page. Add it again."); continue; }
        index = insertPicture(index, url, alt);
      } catch (err) { setError(uploadErrorMessage(err)); }
      finally { setUploading((n) => n - 1); }
    }
  };

  const uploadRef = useRef(uploadFiles);
  uploadRef.current = uploadFiles;

  const chooseFromLibrary = async () => {
    if (!media) return;
    const at = cursor();
    setError("");
    try {
      const item = await media.choose("Choose a picture for this page");
      if (item) insertPicture(at, mainUrl(item), item.alt || "");
    } catch (err) { setError(uploadErrorMessage(err)); }
  };

  // Handlers read the latest closures through a ref so `modules` stays stable (a new object remounts Quill).
  const handlers = useRef({ image: () => fileInput.current?.click(), divider: () => {} });
  handlers.current.divider = () => {
    const q = editor();
    if (!q) return;
    const index = cursor();
    q.insertEmbed(index, "divider", true, "user");
    q.setSelection(index + 1, 0, "user");
  };
  const modules = useMemo(() => ({
    toolbar: {
      container: TOOLBAR,
      handlers: { image: () => handlers.current.image(), divider: () => handlers.current.divider() },
    },
    // Quill 2 would put dropped/pasted pictures in the text as data: pictures; ours go to Storage instead.
    uploader: {
      mimetypes: PICTURE_TYPES,
      handler: (range: { index: number } | null, files: File[]) => uploadRef.current(Array.from(files), range?.index),
    },
  }), []);

  // Picture tools follow the selection: clicking a picture selects it, and the bar below edits it.
  useEffect(() => {
    const q = editor();
    if (!q) return;
    const read = (range: { index: number; length: number } | null) => {
      if (!range || range.length !== 1) return setPicked(null);
      const op = q.getContents(range.index, 1).ops?.[0];
      if (!op || typeof op.insert !== "object" || !op.insert.image) return setPicked(null);
      const line = q.getFormat(range.index, 1);
      setPicked({ index: range.index, src: op.insert.image, alt: op.attributes?.alt || "", width: op.attributes?.width || "", align: line.align || "" });
    };
    const onSelection = (range: any) => { if (range) read(range); };
    const onClick = (e: MouseEvent) => {
      const img = e.target as HTMLElement;
      if (img?.tagName !== "IMG" || !QuillClass) return;
      const blot = QuillClass.find(img);
      if (!blot) return;
      q.setSelection(q.getIndex(blot), 1, "user");
    };
    const intercept = (files: FileList | null | undefined, e: Event, at?: number) => {
      const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
      if (!list.length) return;
      e.preventDefault();
      // Quill's own paste/drop handlers sit on this same element: stop them too, so a picture is added once.
      e.stopImmediatePropagation();
      uploadRef.current(list, at);
    };
    const onPaste = (e: ClipboardEvent) => intercept(e.clipboardData?.files, e);
    const onDrop = (e: DragEvent) => {
      let at: number | undefined;
      const doc: any = document;
      const pos = doc.caretRangeFromPoint?.(e.clientX, e.clientY) || null;
      if (pos && QuillClass) {
        const blot = QuillClass.find(pos.startContainer, true);
        if (blot) at = q.getIndex(blot) + (pos.startContainer.nodeType === 3 ? pos.startOffset : 0);
      }
      intercept(e.dataTransfer?.files, e, at);
    };
    // While the Description box has focus the editor has no selection; keep the tools open then.
    const onText = () => { const range = q.getSelection(); if (range) read(range); };
    q.on("selection-change", onSelection);
    q.on("text-change", onText);
    q.root.addEventListener("click", onClick);
    q.root.addEventListener("paste", onPaste, true);
    q.root.addEventListener("drop", onDrop, true);
    return () => {
      q.off("selection-change", onSelection);
      q.off("text-change", onText);
      q.root.removeEventListener("click", onClick);
      q.root.removeEventListener("paste", onPaste, true);
      q.root.removeEventListener("drop", onDrop, true);
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Applies a change to the picked picture, if it's still where it was. */
  const onPicked = (fn: (q: any, index: number) => void) => {
    const q = editor();
    if (!q || !picked) return;
    const op = q.getContents(picked.index, 1).ops?.[0];
    if (!op || typeof op.insert !== "object" || op.insert.image !== picked.src) return setPicked(null);
    fn(q, picked.index);
  };
  const setAlt = (alt: string) => {
    setPicked((p) => (p ? { ...p, alt } : p));
    onPicked((q, i) => q.formatText(i, 1, "alt", alt.trim() || false, "user"));
  };

  const stats = pageBodyStats(value);

  return (
    <div className="studio-page-body">
      <input ref={fileInput} type="file" accept="image/*" multiple hidden aria-label="Upload pictures"
        onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; uploadFiles(files); }} />
      <div className="flex flex-wrap gap-2 mb-2">
        <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={uploading > 0} onClick={() => fileInput.current?.click()}>
          <ImagePlus size={14} aria-hidden /> {uploading > 0 ? `Uploading ${uploading} picture${uploading === 1 ? "" : "s"}…` : "Add pictures"}
        </button>
        {media && media.status !== "denied" && (
          <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={media.status !== "ready"} onClick={chooseFromLibrary}>
            <Images size={14} aria-hidden /> Choose from library
          </button>
        )}
      </div>
      <div className="rp-quill">
        <QuillEditor ref={quillRef} theme="snow" value={value || ""} onChange={onChange} modules={modules}
          prepare={registerExtras} onReady={() => setReady(true)}
          placeholder="Write your page content… Paste or drag pictures straight in." />
      </div>
      {error && <p role="alert" className="studio-upload-error mt-1 text-[11px]">{error}</p>}

      {picked && (
        <div className="studio-picture-tools mt-2 border border-neutral-300 rounded-lg p-2 space-y-2" role="group" aria-label="Selected picture">
          <div className="flex items-center gap-2">
            <img src={picked.src} alt="" className="w-12 h-12 object-cover rounded border border-neutral-200" />
            <p className="text-xs font-bold flex-1">Selected picture</p>
            <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" aria-label="Remove picture"
              title="Remove picture (Ctrl+Z in the text puts it back)"
              onClick={() => {
                // Focus the text again at the removed picture's place so Ctrl/Cmd+Z can bring it back.
                onPicked((q, i) => { q.deleteText(i, 1, "user"); q.focus(); q.setSelection(i, 0, "silent"); });
                setPicked(null);
              }}>
              <Trash2 size={13} aria-hidden /> Remove
            </button>
          </div>
          <div>
            <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Size</span>
            <div className="flex flex-wrap gap-1">
              {IMAGE_SIZES.map((s) => (
                <button key={s.label} type="button" aria-pressed={picked.width === s.value}
                  className={`rp-btn rp-btn-sm ${picked.width === s.value ? "rp-btn-primary" : "rp-btn-secondary"}`}
                  onClick={() => { setPicked((p) => (p ? { ...p, width: s.value } : p)); onPicked((q, i) => q.formatText(i, 1, "width", s.value || false, "user")); }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Position</span>
            <div className="flex gap-1">
              {([["", "Left", AlignLeft], ["center", "Centre", AlignCenter], ["right", "Right", AlignRight]] as const).map(([value, label, Icon]) => (
                <button key={label} type="button" aria-pressed={picked.align === value} aria-label={`Line up ${label.toLowerCase()}`}
                  className={`rp-btn rp-btn-sm ${picked.align === value ? "rp-btn-primary" : "rp-btn-secondary"}`}
                  onClick={() => { setPicked((p) => (p ? { ...p, align: value } : p)); onPicked((q, i) => q.formatLine(i, 1, "align", value || false, "user")); }}>
                  <Icon size={13} aria-hidden /> {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Picture description (read aloud to blind visitors and used by Google)</span>
            <input className="w-full border border-neutral-200 rounded-lg px-3 h-9 text-xs" value={picked.alt}
              placeholder="What the picture shows, for screen readers and search engines"
              onChange={(e) => setAlt(e.target.value)} />
          </label>
        </div>
      )}

      {/* Rewrite the page's words with AI; pictures, videos and dividers are held out and stay exactly as they are. */}
      <StudioAiRewrite kind="richtext" label="Page text" where={`Pages › ${title?.trim() || "untitled page"}`} value={value} onChange={onChange} localUndo />
      <p className="text-[11px] text-neutral-500 mt-1" aria-live="polite">
        {stats.words} word{stats.words === 1 ? "" : "s"}{stats.minutes ? ` · about ${stats.minutes} min read` : ""}
        {stats.images ? ` · ${stats.images} picture${stats.images === 1 ? "" : "s"}` : ""}
        {stats.videos ? ` · ${stats.videos} video${stats.videos === 1 ? "" : "s"}` : ""}
      </p>
      {stats.missingAlt > 0 && (
        <p className="text-[11px] text-neutral-600">⚠ {stats.missingAlt} picture{stats.missingAlt === 1 ? " has" : "s have"} no description — click {stats.missingAlt === 1 ? "it" : "each one"} and fill in Description.</p>
      )}
      {stats.pasted > 0 && <p className="text-[11px] text-neutral-600">{stats.pasted} pasted picture{stats.pasted === 1 ? "" : "s"} will be uploaded when you save.</p>}
    </div>
  );
}
