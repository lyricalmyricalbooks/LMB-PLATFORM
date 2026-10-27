import React, { useState, useRef, useMemo } from "react";
import { QuillEditor, type QuillEditorHandle } from "./QuillEditor";
import { adminApi } from "../admin/api";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Video,
  Quote,
  Code,
  Eye,
  Eraser,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  uploadFile?: (file: File, path: string) => Promise<string>;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your storefront content here...",
  className = "",
  uploadFile,
}: RichTextEditorProps) {
  const [showHtml, setShowHtml] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const quillRef = useRef<QuillEditorHandle>(null);
  // The editor reads its modules once, so the upload handlers reach the latest uploader through a ref.
  const uploadFileRef = useRef(uploadFile);
  uploadFileRef.current = uploadFile;

  // Generate a unique toolbar ID to prevent collisions when multiple editors render on a single page
  const toolbarId = useMemo(
    () => `toolbar-${Math.random().toString(36).substring(2, 9)}`,
    []
  );

  /** Uploads pictures to Storage and places them at `index` (or the cursor) — never as data: text. */
  const placePictures = async (files: File[], index?: number) => {
    setUploadError("");
    for (const file of files) {
      try {
        const uploadFn = uploadFileRef.current || adminApi.uploadFile;
        // `assets/` is the admin-writable Storage folder (storage.rules).
        const path = `assets/editor/${Date.now()}_${file.name.replace(/[^\w.-]+/g, "-")}`;
        const url = await uploadFn(file, path);

        const quill = quillRef.current?.getEditor();
        if (quill) {
          const at = index ?? quill.getSelection(true)?.index ?? Math.max(0, quill.getLength() - 1);
          quill.insertEmbed(at, "image", url, "user");
          index = at + 1;
        }
      } catch (error) {
        console.error("Quill image upload failed:", error);
        setUploadError("The picture couldn't be uploaded. Check your connection and try again.");
      }
    }
  };
  const placeRef = useRef(placePictures);
  placeRef.current = placePictures;

  // Quill Editor Configuration (read once, when the editor mounts)
  const modules = useMemo(
    () => ({
      toolbar: {
        container: `#${toolbarId}`,
        handlers: {
          image: () => {
            const input = document.createElement("input");
            input.setAttribute("type", "file");
            input.setAttribute("accept", "image/*");
            input.onchange = () => { const file = input.files?.[0]; if (file) placeRef.current([file]); };
            input.click();
          },
        },
      },
      // Pasted or dropped picture files are uploaded too, instead of Quill 2's inline data: pictures.
      uploader: {
        handler: (range: { index: number } | null, files: File[]) => placeRef.current(Array.from(files), range?.index),
      },
    }),
    [toolbarId]
  );

  const formats = useMemo(() => [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "align",
    "list",
    "link",
    "image",
    "video",
    "blockquote",
    "code-block",
  ], []);

  return (
    <div
      className={`flex flex-col border transition-all duration-300 rounded-2xl overflow-hidden bg-white dark:bg-neutral-950 ${
        isFocused
          ? "border-violet-500 ring-2 ring-violet-500/15 shadow-lg shadow-violet-500/5"
          : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm"
      } ${className}`}
    >
      {/* Dynamic Inject Style Overrides for Snow Theme Dropdowns */}
      <style>{`
        #${toolbarId} .ql-color .ql-picker-label,
        #${toolbarId} .ql-background .ql-picker-label {
          border: none !important;
          background: transparent !important;
          padding: 4px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 28px !important;
          height: 28px !important;
          border-radius: 6px !important;
          transition: all 0.2s;
        }
        #${toolbarId} .ql-color .ql-picker-label:hover,
        #${toolbarId} .ql-background .ql-picker-label:hover {
          background-color: rgba(0, 0, 0, 0.05) !important;
        }
        #${toolbarId} .ql-expanded .ql-picker-options {
          border-radius: 12px !important;
          border: 1px solid rgba(0,0,0,0.08) !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1) !important;
          padding: 8px !important;
          background: white !important;
          z-index: 100 !important;
        }
        #${toolbarId} .ql-picker-item {
          border-radius: 4px !important;
          margin: 2px !important;
        }
      `}</style>

      {/* Custom Header Toolbar Wrapper */}
      {/* While the HTML box is open the editor below is hidden but still mounted, so its toolbar is switched off:
          a click would format the hidden copy and write Quill's cleaned-up HTML over what is being typed. */}
      <div
        id={toolbarId}
        {...(showHtml ? { inert: true, "aria-disabled": true } : {})}
        className={`${showHtml ? "pointer-events-none opacity-40 " : ""}flex flex-wrap items-center gap-1.5 p-3 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300`}
      >
        {/* Headings */}
        <span className="ql-formats !mr-3">
          <select aria-label="Text style" title="Text style" className="ql-header bg-transparent border border-neutral-200 dark:border-neutral-800 text-[10px] font-black tracking-widest uppercase outline-none cursor-pointer rounded-lg px-2 py-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors">
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
            <option value="">Paragraph</option>
          </select>
        </span>

        {/* Text Formats */}
        <span className="ql-formats !mr-3 flex items-center gap-1 border-r border-neutral-200 dark:border-neutral-800 pr-3">
          <button type="button" aria-label="Bold" title="Bold" className="ql-bold p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Bold size={14} />
          </button>
          <button type="button" aria-label="Italic" title="Italic" className="ql-italic p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Italic size={14} />
          </button>
          <button type="button" aria-label="Underline" title="Underline" className="ql-underline p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Underline size={14} />
          </button>
          <button type="button" aria-label="Strikethrough" title="Strikethrough" className="ql-strike p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Strikethrough size={14} />
          </button>
        </span>

        {/* Colors */}
        <span className="ql-formats !mr-3 flex items-center gap-1 border-r border-neutral-200 dark:border-neutral-800 pr-3">
          <select className="ql-color" title="Text colour" aria-label="Text colour" />
          <select className="ql-background" title="Highlight colour" aria-label="Highlight colour" />
        </span>

        {/* Alignments */}
        <span className="ql-formats !mr-3 flex items-center gap-1 border-r border-neutral-200 dark:border-neutral-800 pr-3">
          <button type="button" aria-label="Align left" title="Align left" className="ql-align p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center" value="">
            <AlignLeft size={14} />
          </button>
          <button type="button" aria-label="Align centre" title="Align centre" className="ql-align p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center" value="center">
            <AlignCenter size={14} />
          </button>
          <button type="button" aria-label="Align right" title="Align right" className="ql-align p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center" value="right">
            <AlignRight size={14} />
          </button>
          <button type="button" aria-label="Justify" title="Justify" className="ql-align p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center" value="justify">
            <AlignJustify size={14} />
          </button>
        </span>

        {/* Lists */}
        <span className="ql-formats !mr-3 flex items-center gap-1 border-r border-neutral-200 dark:border-neutral-800 pr-3">
          <button type="button" aria-label="Numbered list" title="Numbered list" className="ql-list p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center" value="ordered">
            <ListOrdered size={14} />
          </button>
          <button type="button" aria-label="Bulleted list" title="Bulleted list" className="ql-list p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center" value="bullet">
            <List size={14} />
          </button>
        </span>

        {/* Links & Embeds */}
        <span className="ql-formats !mr-3 flex items-center gap-1 border-r border-neutral-200 dark:border-neutral-800 pr-3">
          <button type="button" aria-label="Link" title="Link" className="ql-link p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Link2 size={14} />
          </button>
          <button type="button" aria-label="Image" title="Image" className="ql-image p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <ImageIcon size={14} />
          </button>
          <button type="button" aria-label="Video" title="Video" className="ql-video p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Video size={14} />
          </button>
        </span>

        {/* Extra formatting utils */}
        <span className="ql-formats !mr-3 flex items-center gap-1">
          <button type="button" aria-label="Quote" title="Quote" className="ql-blockquote p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Quote size={14} />
          </button>
          <button type="button" aria-label="Clear formatting" title="Clear formatting" className="ql-clean p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all flex items-center justify-center">
            <Eraser size={14} />
          </button>
        </span>

        {/* Clean / Toggle HTML Mode */}
        <span className="flex items-center gap-1.5 ml-auto pl-3">
          <button
            type="button"
            onClick={() => setShowHtml((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all cursor-pointer ${
              showHtml
                ? "bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/10"
                : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700"
            }`}
          >
            {showHtml ? <Eye size={12} /> : <Code size={12} />}
            {showHtml ? "Visual" : "HTML"}
          </button>
        </span>
      </div>

      {/* Editor Content Area */}
      <div className="relative min-h-[180px] bg-white dark:bg-neutral-950">
        {showHtml && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write raw HTML code here..."
            className="w-full min-h-[220px] p-4 font-mono text-xs bg-neutral-900 text-emerald-400 border-none outline-none focus:ring-0 resize-y block leading-relaxed"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        )}
        {/* Stays mounted while the HTML box is open: a remount would wire the toolbar's buttons a second time. */}
        <div hidden={showHtml} className="[&_.ql-container]:!border-0 [&_.ql-editor]:min-h-[220px] [&_.ql-editor]:text-xs [&_.ql-editor]:leading-relaxed dark:text-neutral-100">
            <QuillEditor
              ref={quillRef}
              theme="snow"
              value={value || ""}
              onChange={onChange}
              placeholder={placeholder}
              modules={modules}
              formats={formats}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
        </div>
      </div>
      {uploadError && <p role="alert" className="px-4 py-2 text-[11px] font-bold text-red-700 bg-red-50 border-t border-red-200">{uploadError}</p>}
    </div>
  );
}
