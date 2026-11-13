import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { adIdsOf, cleanMetaPixelId, cleanPinterestTagId, cleanTiktokPixelId, type AdIds } from "../lib/adPixels";
import { HowTo, friendlyError } from "./settingsLayout";
import { PrimaryButton, SectionCard, StatusBadge, TextField } from "./riso/components";

// Settings › General › Ad tracking (gap list 37). The Meta, Pinterest and TikTok codes are public (shoppers' browsers
// load them, lib/adPixels.ts) and live in settings/website.analytics; only this card writes them, one field each, so
// the Google and Clarity IDs beside them are never touched. They run only after a shopper says yes to marketing cookies.
const FIELDS = ["analytics.metaPixelId", "analytics.pinterestTagId", "analytics.tiktokPixelId"];

export const adPixelsApi = {
  load: async (): Promise<AdIds> => {
    const snap = await getDoc(doc(db, "settings", "website"));
    return adIdsOf(snap.exists() ? snap.data() : null);
  },
  save: (ids: AdIds) => setDoc(doc(db, "settings", "website"), {
    analytics: { metaPixelId: cleanMetaPixelId(ids.meta), pinterestTagId: cleanPinterestTagId(ids.pinterest), tiktokPixelId: cleanTiktokPixelId(ids.tiktok) },
  }, { mergeFields: FIELDS }),
};

const EMPTY: AdIds = { meta: "", pinterest: "", tiktok: "" };

export function AdPixelsCard() {
  const [loaded, setLoaded] = useState<AdIds | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [form, setForm] = useState<AdIds>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setReadFailed(false);
    adPixelsApi.load().then((ids) => { setLoaded(ids); setForm(ids); }).catch(() => setReadFailed(true));
  };
  useEffect(load, []);

  const clean: AdIds = { meta: cleanMetaPixelId(form.meta), pinterest: cleanPinterestTagId(form.pinterest), tiktok: cleanTiktokPixelId(form.tiktok) };
  const bad = (raw: string, cleaned: string) => !!raw.trim() && !cleaned;
  const problems = { meta: bad(form.meta, clean.meta), pinterest: bad(form.pinterest, clean.pinterest), tiktok: bad(form.tiktok, clean.tiktok) };
  const dirty = loaded !== null && (clean.meta !== loaded.meta || clean.pinterest !== loaded.pinterest || clean.tiktok !== loaded.tiktok);
  const onCount = loaded ? [loaded.meta, loaded.pinterest, loaded.tiktok].filter(Boolean).length : 0;

  const save = async () => {
    setSaving(true);
    try {
      await adPixelsApi.save(clean);
      setLoaded(clean); setForm(clean);
      toast.success("Ad tracking saved");
    } catch (err: any) {
      toast.error(friendlyError(err, "save ad tracking"));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof AdIds) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <SectionCard title="Ad tracking"
      description="Count sales from your Facebook, Instagram, Pinterest and TikTok ads. Runs only for shoppers who say yes to marketing cookies."
      actions={loaded !== null && <StatusBadge tone={onCount ? "success" : "neutral"}>{onCount ? `${onCount} on` : "Off"}</StatusBadge>}>
      <HowTo summary="Where to find each code" open={loaded !== null && onCount === 0}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>
          <li><strong>Facebook and Instagram:</strong> in Meta Events Manager, open your pixel (dataset) and copy its ID, a long number.</li>
          <li><strong>Pinterest:</strong> in Pinterest Ads, open Conversions, then Tag manager, and copy the tag ID, a long number.</li>
          <li><strong>TikTok:</strong> in TikTok Events Manager, open Web events and copy the pixel ID (capital letters and numbers).</li>
          <li>Paste only the ID, not the code the site gives you. The shop adds the code itself, after the shopper agrees.</li>
        </ol>
      </HowTo>
      <TextField label="Facebook and Instagram pixel ID" value={form.meta} placeholder="1234567890123456" autoComplete="off" inputMode="numeric"
        error={problems.meta ? "Numbers only, as Meta shows it." : undefined} onChange={set("meta")} />
      <TextField label="Pinterest tag ID" value={form.pinterest} placeholder="2612345678901" autoComplete="off" inputMode="numeric"
        error={problems.pinterest ? "Numbers only, as Pinterest shows it." : undefined} onChange={set("pinterest")} />
      <TextField label="TikTok pixel ID" value={form.tiktok} placeholder="C4ABCD1234EFGH5678IJ" autoComplete="off"
        hint="Blank turns that one off. Checkout details, names and addresses are never sent."
        error={problems.tiktok ? "Capital letters and numbers, as TikTok shows it." : undefined} onChange={set("tiktok")} />
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "8px 0 0", color: "var(--rp-danger)" }}>
          ✕ Couldn't read the saved setting. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={load}>Try again</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <PrimaryButton disabled={!dirty || problems.meta || problems.pinterest || problems.tiktok || saving} onClick={save}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </div>
    </SectionCard>
  );
}
