import { useState } from "react";
import toast from "react-hot-toast";
import { friendlyError } from "./settingsLayout";
import { PrimaryButton, SectionCard } from "./riso/components";
import { downloadShop, type TakeoutStep } from "./takeoutRun";

// One obvious way to leave with everything: Settings › General › Download your shop, and the same button in the cancel
// step. The zip is built in this browser from this shop's own records (takeoutRun.ts), so nothing is sent anywhere.
export function useShopDownload() {
  const [step, setStep] = useState<TakeoutStep | null>(null);
  const [summary, setSummary] = useState("");
  const run = async () => {
    setSummary("");
    setStep({ label: "Reading your shop…" });
    try {
      setSummary(await downloadShop(setStep));
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
  return (
    <div className="rp-stack" style={{ gap: 6 }} data-download-shop>
      <div><PrimaryButton busy={d.busy} onClick={() => void d.run()}>{d.busy ? d.label : "Download your shop"}</PrimaryButton></div>
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
