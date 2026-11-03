import { useState } from "react";
import { Copy, ExternalLink, PartyPopper } from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton } from "../riso/components";
import { shopProfile } from "../../../lib/shopProfile";

/** The shop's public address: the press's own web address once it's connected, else the free one the shop came with. */
export function publicAddress(settings: any, siteUrl: string = shopProfile.siteUrl): string {
  const custom = String(settings?.domain?.custom || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return custom ? `https://${custom}` : siteUrl;
}

/**
 * The moment a press opens its shop to shoppers (from the final check or the setup guide): one card that says it worked,
 * with the shop's address to visit and share. Shown until it's put away, only in the visit that opened the shop.
 */
export function ShopOpenedCard({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied("Copied. Paste it anywhere you tell people about your shop."); }
    catch { setCopied(`Copy this address: ${address}`); }
  };
  const shown = address.replace(/^https:\/\//, "");
  return (
    <section className="rp-card" aria-labelledby="shop-opened-title" style={{ borderColor: "var(--rp-success)", borderWidth: 2, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, padding: 20, alignItems: "start" }}>
        <span aria-hidden style={{ display: "inline-flex", color: "var(--rp-success)", paddingTop: 2 }}><PartyPopper size={28} /></span>
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <div>
            <h2 id="shop-opened-title" style={{ margin: 0, fontSize: 20 }}>Your shop is open</h2>
            <p style={{ margin: "6px 0 0" }}>Shoppers can find it and buy from it now. Tell people where it is:</p>
            <p className="rp-mono" style={{ margin: "6px 0 0", fontWeight: 700, overflowWrap: "anywhere" }}>{shown}</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PrimaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open(address, "_blank", "noopener")}>View your shop</PrimaryButton>
            <SecondaryButton icon={<Copy size={16} aria-hidden />} onClick={() => void copy()}>Copy the address</SecondaryButton>
            <GhostButton onClick={onClose}>Done</GhostButton>
          </div>
          <p role="status" className="rp-hint" style={{ margin: 0 }}>{copied}</p>
        </div>
      </div>
    </section>
  );
}
