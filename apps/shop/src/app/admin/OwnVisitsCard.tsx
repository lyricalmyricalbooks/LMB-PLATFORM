import { useState } from "react";
import toast from "react-hot-toast";
import { isOwnerDevice, looksAutomated, OWNER_DEVICE_PARAM, SHOP_OWNER_EMAIL, setOwnerDevice } from "../lib/ownerDevice";
import { HowTo } from "./settingsLayout";
import { SecondaryButton, SectionCard, StatusBadge, Toggle } from "./riso/components";

// Settings › General › Your own visits: keeps the owner's browsing and test orders out of the shop's numbers
// (lib/ownerDevice.ts). The switch is per browser; the link marks a phone or another browser in one tap.
export function OwnVisitsCard() {
  const [on, setOn] = useState(() => isOwnerDevice());
  const link = typeof window !== "undefined" ? `${window.location.origin}${import.meta.env.BASE_URL || "/"}?${OWNER_DEVICE_PARAM}=on` : "";

  const flip = (next: boolean) => {
    setOwnerDevice(next);
    setOn(isOwnerDevice());
    toast.success(next ? "This browser's visits are no longer counted" : "This browser's visits count again");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy. Select the link and copy it by hand."); }
  };

  return (
    <SectionCard title="Your own visits"
      description="Real customers only. You never count."
      actions={<StatusBadge tone={on ? "success" : "warning"}>{on ? "This browser: not counted" : "This browser: counted"}</StatusBadge>}>
      <Toggle label="Leave this browser out of the shop's numbers" checked={on} onChange={flip} />
      <p className="rp-hint" style={{ margin: "8px 0 0" }}>Admin browsers are skipped automatically. Phone? Open this link there once.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <span className="rp-mono" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{link}</span>
        <SecondaryButton size="sm" onClick={copy}>Copy link</SecondaryButton>
      </div>
      <div style={{ marginTop: 12 }}>
      <HowTo summary="Fine print">
      <ul className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "disc" }}>
        <li>Orders with <span className="rp-mono">{SHOP_OWNER_EMAIL}</span> stay in Orders, out of sales.</li>
        <li>Keep the link private. Whoever opens it stops counting.</li>
        <li>Robots and speed testers never count{looksAutomated() ? " (this browser looks automated, so it doesn't either)" : ""}.</li>
        <li>Past visits stay. Overview › <strong>Start traffic counts again</strong> wipes the shop's counter.</li>
        <li>Clearing cookies forgets this. Sign in or reopen the link.</li>
      </ul>
      </HowTo>
      </div>
    </SectionCard>
  );
}
