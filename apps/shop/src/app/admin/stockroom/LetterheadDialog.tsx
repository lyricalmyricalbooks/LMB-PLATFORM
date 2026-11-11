// Stockroom › Invoices › Letterhead (letterhead.ts): fill in the letter, see it on the page, save it in this browser,
// print it. The old app's rich-text toolbar is now plain paragraphs; a letter saved there with formatting keeps it
// until its words are changed here.
import { useMemo, useState } from "react";

import { Dialog, GhostButton, PrimaryButton, SecondaryButton, TextArea, TextField } from "../riso/components";
import { LETTERHEAD_KEY, letterheadPrintHtml, readLetterhead, type Letterhead } from "./letterhead";

const store = () => { try { return window.localStorage; } catch { return null; } };

export function LetterheadDialog({ invoice, onClose }: { invoice: Record<string, unknown> | null | undefined; onClose: () => void }) {
  const [letter, setLetter] = useState<Letterhead>(() => readLetterhead(invoice, store()));
  const [note, setNote] = useState("");
  const set = (patch: Partial<Letterhead>) => { setLetter((l) => ({ ...l, ...patch })); setNote(""); };
  const page = useMemo(() => letterheadPrintHtml(letter), [letter]);

  function save() {
    try { store()?.setItem(LETTERHEAD_KEY, JSON.stringify(letter)); setNote("Saved in this browser."); }
    catch { setNote("Couldn't save. Try a smaller logo."); }
  }
  function print() {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0";
    frame.title = "Letterhead print view";
    frame.onload = () => { const win = frame.contentWindow!; win.onafterprint = () => frame.remove(); win.focus(); win.print(); };
    frame.srcdoc = page;
    document.body.appendChild(frame);
  }
  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 400_000) { setNote("Use a logo under 400 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => set({ logo: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open onClose={onClose} size="lg" title="Letterhead" description="A letter on your press's paper."
      footer={<><SecondaryButton onClick={save}>Save</SecondaryButton><PrimaryButton onClick={print}>Print</PrimaryButton></>}>
      <div className="rp-lh">
        <div className="rp-money-form">
          <TextField label="Press name" value={letter.name} onChange={(e) => set({ name: e.target.value })} />
          <TextArea label="Address" rows={2} value={letter.address} onChange={(e) => set({ address: e.target.value })} />
          <div className="rp-money-form-row">
            <TextField label="Email" value={letter.email} onChange={(e) => set({ email: e.target.value })} />
            <TextField label="Phone" value={letter.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <TextField label="Website" value={letter.website} onChange={(e) => set({ website: e.target.value })} />
          <div className="rp-money-form-row">
            <TextField label="Accent colour" type="color" value={letter.accent} onChange={(e) => set({ accent: e.target.value })} />
            <label className="rp-lh-logo">Logo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => pickLogo(e.target.files?.[0])} /></label>
            {letter.logo && <GhostButton size="sm" onClick={() => set({ logo: "" })}>Remove logo</GhostButton>}
          </div>
          <TextArea label="To" rows={2} value={letter.recipient} onChange={(e) => set({ recipient: e.target.value })} />
          <div className="rp-money-form-row">
            <TextField label="Date" type="date" value={letter.date} onChange={(e) => set({ date: e.target.value })} />
            <TextField label="Subject" value={letter.subject} onChange={(e) => set({ subject: e.target.value })} />
          </div>
          <TextArea label="Letter" rows={8} value={letter.body} onChange={(e) => set({ body: e.target.value, bodyHtml: "" })}
            hint={letter.bodyHtml ? "Has formatting from the old app. Typing here replaces it with plain paragraphs." : undefined} />
          <div className="rp-money-form-row">
            <TextField label="Sign-off" placeholder="With thanks," value={letter.signoff} onChange={(e) => set({ signoff: e.target.value })} />
            <TextField label="Signature" value={letter.signature} onChange={(e) => set({ signature: e.target.value })} />
          </div>
          {note && <p className="rp-sr-save" role="status">{note}</p>}
        </div>
        <iframe className="rp-lh-preview" title="Letter preview" srcDoc={page} sandbox="" />
      </div>
    </Dialog>
  );
}
