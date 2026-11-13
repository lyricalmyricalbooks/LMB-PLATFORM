import { useState } from "react";
import toast from "react-hot-toast";
import { friendlyError } from "./settingsLayout";
import { PrimaryButton, SecondaryButton, SectionCard } from "./riso/components";
import { downloadShop, type TakeoutStep } from "./takeoutRun";
import { DownloadChoices } from "./DownloadChoices";
import type { TakeoutChoice } from "./takeoutChoice";

// One obvious way to leave with everything: Settings › General › Download your shop, and the same button in Close your
// shop. Choose what to download (DownloadChoices.tsx) picks parts, order days and Excel or CSV. The zip is built in this browser from this shop's own records (takeoutRun.ts), so nothing is sent anywhere.
export function useShopDownload() {
  const [step, setStep] = useState<TakeoutStep | null>(null);
  const [summary, setSummary] = useState("");
  const run = async (choice?: TakeoutChoice) => {
    setSummary("");
    setStep({ label: "Reading your shop…" });
    try {
      setSummary(await downloadShop(setStep, choice));
      toast.success("Your shop is downloaded.");
    } catch (err: any) {
      toast.error(friendlyError(err, "download your shop"));
    } finally { setStep(null); }
  };
  const label = step ? (step.of ? `${step.label} ${step.done}/${step.of}` : step.label) : "";
  return { busy: !!step, label, summary, run };
}

export function DownloadShopButton() {
  const d = useShopDownload();
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="rp-stack" style={{ gap: 6 }} data-download-shop>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton busy={d.busy} onClick={() => void d.run()}>{d.busy ? d.label : "Download your shop"}</PrimaryButton>
        <SecondaryButton disabled={d.busy} onClick={() => setChoosing(true)}>Choose what to download</SecondaryButton>
      </div>
      <DownloadChoices open={choosing} onClose={() => setChoosing(false)} onDownload={(c) => { setChoosing(false); void d.run(c); }} />
      {d.summary && <p className="rp-hint" role="status" style={{ margin: 0 }}>{`Saved: ${d.summary}.`}</p>}
    </div>
  );
}

export function DownloadShopCard() {
  return (
    <SectionCard title="Download your shop" description="Everything in one zip, ready for another shop system.">
      <DownloadShopButton />
      <p className="rp-hint" style={{ margin: "12px 0 0" }}>Products in four common layouts, customers, orders, pages, settings and photos.</p>
    </SectionCard>
  );
}
