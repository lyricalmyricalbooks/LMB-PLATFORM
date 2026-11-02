// Settings › General › What you sell (plan 12.14): the owner's own answer to sign-up's "What do you sell?", saved as
// `firstWeek/start` › `sells` and read before the sign-up answer. It changes the admin's words, new products' starting
// kind and the emails' words; products already made are never touched. A shop of "Books and other things" speaks of
// products and makers while book products keep their book fields.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { currentSells } from "./sells";
import { SELLS_CHANGED_EVENT } from "./shopWords";
import { SectionCard, SelectField, PrimaryButton } from "./riso/components";

export const SELLS_CHOICES: { id: string; label: string }[] = [
  { id: "books", label: "Books" },
  { id: "zines", label: "Zines" },
  { id: "comics", label: "Comics" },
  { id: "prints", label: "Art and prints" },
  { id: "mixed", label: "Books and other things" },
  { id: "clothing", label: "Clothing" },
  { id: "shoes", label: "Shoes" },
  { id: "jewelry", label: "Jewelry" },
  { id: "music", label: "Music" },
  { id: "other", label: "Something else" },
];

export function WhatYouSellCard() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => adminApi.getFirstWeek()).then((doc) => {
      if (!live) return;
      const now = currentSells(doc);
      setSaved(now);
      // "A mix" from sign-up is books and other publications: show it as Books.
      setValue(now === "mix" ? "books" : now || "books");
    }).catch(() => { if (live) setSaved(null); });
    return () => { live = false; };
  }, []);
  if (saved === undefined) return null;
  const changed = value !== (saved === "mix" ? "books" : saved || "books");
  const save = async () => {
    setBusy(true);
    try {
      await adminApi.updateFirstWeek({ sells: value });
      setSaved(value);
      window.dispatchEvent(new CustomEvent(SELLS_CHANGED_EVENT, { detail: value }));
      toast.success("Saved. The admin now uses the words for what you sell.");
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  return (
    <SectionCard title="What you sell" description="Sets the words in your admin and emails. Products you already have stay as they are.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <SelectField label="What do you sell?" value={value} onChange={(e) => setValue(e.target.value)}>
          {SELLS_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <PrimaryButton onClick={save} busy={busy} disabled={!changed || busy}>Save</PrimaryButton>
      </div>
      <p className="rp-hint" style={{ margin: "12px 0 0" }}>Your stockroom keeps its current words until we refresh it for you.</p>
    </SectionCard>
  );
}
