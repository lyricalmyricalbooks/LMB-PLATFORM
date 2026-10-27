import { createContext, useContext, useState } from "react";
import { Images } from "lucide-react";
import { mainUrl, pickPatch, type MediaItem } from "./mediaLibrary";
import { uploadErrorMessage } from "./mediaUpload";

// Studio media library (2.4): how image fields reach the library. StudioEditor provides this context;
// outside Studio (or in older callers) it is null and image fields work exactly as before.
export type MediaLibraryStatus = "loading" | "ready" | "denied" | "error";
export type MediaPickerApi = {
  status: MediaLibraryStatus;
  /** Opens the library picker; resolves with the chosen image, or null when it was closed. */
  choose: (title?: string) => Promise<MediaItem | null>;
  /** Resizes and uploads a file into the library. */
  upload: (file: File) => Promise<MediaItem>;
};

export const MediaPickerContext = createContext<MediaPickerApi | null>(null);
export const useMediaPicker = () => useContext(MediaPickerContext);

/**
 * Upload for an image field. When the library is switched on the picture always goes into it (resized
 * copies + a `media/{id}` record, listed in Studio › Media). Section and block fields (which have
 * `onPatch`) also get the `__media` record that gives shoppers `srcset`; Theme settings images (logo,
 * share image, favicon, placeholder…) are drawn as plain images, so they get the URL only, written
 * through the field's own `onChange` (which keeps the All pages / This page only scope).
 * Without the library: the plain Studio upload the field always had.
 */
export async function uploadIntoField(media: MediaPickerApi | null, file: File, opts: {
  fieldKey: string; record?: any; onPatch?: (patch: Record<string, any>) => void;
  onChange: (url: string) => void; uploadFile?: (file: File) => Promise<string>;
}) {
  if (media?.status === "ready") {
    const item = await media.upload(file);
    if (opts.onPatch) opts.onPatch(pickPatch(opts.fieldKey, item, opts.record));
    else opts.onChange(mainUrl(item));
    return;
  }
  if (!opts.uploadFile) return;
  opts.onChange(await opts.uploadFile(file));
}

/** "Choose from library" under an image field. Renders nothing outside Studio. */
export function MediaLibraryButton({ fieldKey, label, record, onPatch, onChange }: {
  fieldKey: string; label: string; record?: any;
  onPatch?: (patch: Record<string, any>) => void; onChange: (url: string) => void;
}) {
  const media = useMediaPicker();
  const [error, setError] = useState("");
  if (!media) return null;
  return (
    <>
      <button type="button" data-media-choose={fieldKey}
        onClick={async () => {
          setError("");
          try {
            const item = await media.choose(`Choose an image · ${label}`);
            if (!item) return;
            if (onPatch) onPatch(pickPatch(fieldKey, item, record));
            else onChange(mainUrl(item));
          } catch (err) { setError(uploadErrorMessage(err)); }
        }}
        className="w-full mt-1.5 text-[10px] font-bold uppercase tracking-widest py-2 border border-neutral-200 rounded-xl hover:bg-neutral-50 flex items-center justify-center gap-2">
        <Images size={11} aria-hidden /> Choose from library
      </button>
      {error && <p role="alert" className="studio-upload-error mt-1 text-[11px]">{error}</p>}
    </>
  );
}
