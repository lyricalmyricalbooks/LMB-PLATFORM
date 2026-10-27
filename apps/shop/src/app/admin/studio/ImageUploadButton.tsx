import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { uploadErrorMessage, uploadStudioImage } from "./mediaUpload";

/** Small "Upload image" button for Studio fields that otherwise only take a typed image URL. */
export function ImageUploadButton({ label = "Upload image", disabled, onUploaded }: {
  label?: string; disabled?: boolean; onUploaded: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="studio-upload">
      <input ref={input} type="file" accept="image/*" hidden aria-label={label}
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true); setError("");
          try { onUploaded(await uploadStudioImage(file)); }
          catch (err) { setError(uploadErrorMessage(err)); }
          finally { setBusy(false); }
        }} />
      <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={disabled || busy} onClick={() => input.current?.click()}>
        <ImageUp size={14} aria-hidden /> {busy ? "Uploading…" : label}
      </button>
      {error && <p role="alert" className="studio-upload-error">{error}</p>}
    </div>
  );
}
