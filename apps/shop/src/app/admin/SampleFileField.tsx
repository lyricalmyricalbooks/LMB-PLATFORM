// A product's free sample (Digital D3b, Beta): one short public file shoppers can try on the product page (audio or
// video plays there, a PDF opens in a new tab). Stored under products/samples/ (public read, storage.rules products/**),
// so it is never the bought file. Saved with the product as `sample`; Remove clears it (the file stays until a clean-up).
import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { SecondaryButton } from "./riso/components";
import { bookPhotoPath } from "./bookPhotoUpload";
import { uploadWithProgress } from "./bookVideoUpload";
import { productSample, sampleFileKind, sampleProblem, SAMPLE_ACCEPT, type ProductSample } from "../features/site/extras/pdp-sample/sample";
import { fileSizeText } from "../../shared/digitalFiles";

const KIND_WORDS = { audio: "Plays on the product page", video: "Plays on the product page", read: "Opens in a new tab from the product page" } as const;

export function SampleFileField({ book, onChange, notify }: {
  book: any;
  onChange: (sample: ProductSample | null) => void;
  notify: { ok: (m: string) => void; err: (m: string) => void };
}) {
  const sample = productSample(book);
  const input = useRef<HTMLInputElement>(null);
  const [share, setShare] = useState<number | null>(null);

  const upload = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    const problem = sampleProblem(file);
    const kind = sampleFileKind(file.name);
    if (problem || !kind) { notify.err(problem); return; }
    setShare(0);
    try {
      const path = bookPhotoPath(Date.now(), file.name).replace(/^products\//, "products/samples/");
      const url = await uploadWithProgress(file, path, kind.contentType, setShare);
      onChange({ url, kind: kind.kind, name: file.name.slice(0, 120), size: file.size });
      notify.ok(`${file.name} is the sample. Save to show it.`);
    } catch (err) {
      console.error("Sample upload failed:", err);
      notify.err(`"${file.name}" didn't finish uploading. Check the connection and try again.`);
    } finally {
      setShare(null);
    }
  };

  return (
    <div className="be-dfiles" role="group" aria-label="Free sample">
      <p className="rp-label">Free sample (Beta)</p>
      {sample ? (
        <div className="be-dfiles-row">
          <p className="be-note"><strong>{sample.name || "Sample"}</strong>{sample.size ? ` · ${fileSizeText(sample.size)}` : ""} · {KIND_WORDS[sample.kind]}</p>
          <div className="be-dfiles-tools">
            <SecondaryButton size="sm" disabled={share !== null} onClick={() => input.current?.click()}><Upload size={13} aria-hidden /> Replace</SecondaryButton>
            <SecondaryButton size="sm" onClick={() => onChange(null)} aria-label="Remove the sample"><Trash2 size={13} aria-hidden /> Remove</SecondaryButton>
          </div>
        </div>
      ) : share === null && (
        <div className="be-inline-actions">
          <SecondaryButton size="sm" onClick={() => input.current?.click()}><Upload size={13} aria-hidden /> Upload a sample</SecondaryButton>
          <span className="be-note">A short excerpt anyone can try: audio, video or PDF, up to 50 MB.</span>
        </div>
      )}
      {share !== null && (
        <div className="be-dfiles-progress" role="status" aria-live="polite">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          <span>Uploading the sample: {Math.round(share * 100)}%</span>
          <progress max={1} value={share} aria-hidden />
        </div>
      )}
      <input ref={input} type="file" accept={SAMPLE_ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1}
        onChange={(e) => void upload(e.target.files?.[0])} />
    </div>
  );
}
