// One picture for something shown on the website (an event, a bookable service): chosen in the browser, made smaller,
// kept with the shop's other pictures under `assets/<folder>/`. Shared by Events and Bookings (plan 4, 2.3).
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import toast from "react-hot-toast";
import { GhostButton, SecondaryButton } from "./riso/components";
import "./photoField.css";

export function PhotoField({ photo, onChange, folder, label = "Picture (optional)", hint, shape = "wide" }: {
  photo: string; onChange: (url: string) => void; folder: string; label?: string; hint: string; shape?: "wide" | "square";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose a picture (JPG, PNG or WebP)."); return; }
    setBusy(true);
    try {
      const [{ prepareProductImage }, { adminApi }] = await Promise.all([import("./prepareImage"), import("./api")]);
      const ready = await prepareProductImage(file, 1600);
      const ext = (ready.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      onChange(await adminApi.uploadFile(ready, `assets/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`));
    } catch {
      toast.error("The picture couldn't be added. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="photo-field" data-shape={shape}>
      <span className="photo-field-label">{label}</span>
      <div className="photo-field-row">
        {photo ? <img src={photo} alt="" className="photo-field-thumb" /> : <span className="photo-field-thumb" data-empty aria-hidden><ImagePlus size={20} /></span>}
        <div className="photo-field-actions">
          <SecondaryButton onClick={() => input.current?.click()} busy={busy}>{photo ? "Change picture" : "Add a picture"}</SecondaryButton>
          {photo && <GhostButton onClick={() => onChange("")} disabled={busy}>Remove</GhostButton>}
        </div>
      </div>
      <p className="photo-field-hint">{hint}</p>
      <input ref={input} type="file" accept="image/*" hidden aria-label={label} onChange={(e) => { void choose(e.target.files?.[0]); }} />
    </div>
  );
}
