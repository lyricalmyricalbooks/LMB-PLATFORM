import { useState } from "react";
import type { User } from "firebase/auth";
import { functionFetch } from "../../lib/functionsBase";
import { regionProps } from "./storefrontRegions";
import { getCopy } from "./storeCopy";

/**
 * "Your data" in the shopper's account (plan 14.7). The shopper is signed in, so a copy of what the shop holds about
 * them downloads straight away, and a deletion request reaches the owner already marked as verified. Nothing is erased
 * until the owner approves it (Settings › General › Privacy requests).
 */
export function YourDataCard({ design, user }: { design: any; user: User }) {
  const [state, setState] = useState<"" | "busy" | "downloaded" | "asked" | "error">("");

  const call = async (action: "myDataExport" | "myDataErase") => {
    const token = await user.getIdToken();
    return functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
  };

  const download = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const response = await call("myDataExport");
      if (!response.ok) throw new Error("export failed");
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-data.json";
      link.click();
      URL.revokeObjectURL(url);
      setState("downloaded");
    } catch {
      setState("error");
    }
  };

  const ask = async () => {
    if (state === "busy") return;
    if (!window.confirm(getCopy(design, "yourDataEraseConfirm"))) return;
    setState("busy");
    try {
      const response = await call("myDataErase");
      setState(response.ok ? "asked" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <section {...regionProps("accountYourData")} className="glass-card border border-white/5 rounded-[2.5rem] p-10 space-y-4">
      <h2 className="text-xs font-black tracking-[0.5em] text-white/30 uppercase">{getCopy(design, "yourDataHeading")}</h2>
      <p className="text-sm leading-6 fm-muted">{getCopy(design, "yourDataText")}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="fm-track-btn" onClick={download} disabled={state === "busy"}>{getCopy(design, "yourDataDownload")}</button>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={ask} disabled={state === "busy" || state === "asked"}>{getCopy(design, "yourDataErase")}</button>
      </div>
      {state === "downloaded" && <p role="status" className="text-sm leading-6">{getCopy(design, "yourDataDownloaded")}</p>}
      {state === "asked" && <p role="status" className="text-sm leading-6">{getCopy(design, "yourDataAsked")}</p>}
      {state === "error" && <p role="alert" className="text-sm fm-danger-text">{getCopy(design, "yourDataError")}</p>}
    </section>
  );
}
