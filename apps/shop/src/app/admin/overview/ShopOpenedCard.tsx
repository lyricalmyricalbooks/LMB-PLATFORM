import { useState } from "react";
import { Copy, ExternalLink, Link2, Mail, Megaphone } from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton } from "../riso/components";
import { shopProfile } from "../../../lib/shopProfile";
import "./setupBoard.css";

/** The shop's public address: the press's own web address once it's connected, else the free one the shop came with. */
export function publicAddress(settings: any, siteUrl: string = shopProfile.siteUrl): string {
  const custom = String(settings?.domain?.custom || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return custom ? `https://${custom}` : siteUrl;
}

/** A short note to the press's own people, ready in their mail app: they only add the names. */
export function tellEmailHref(address: string, name?: string): string {
  const shop = name?.trim() || "My shop";
  const subject = `${shop} is open`;
  const body = `Hi,\n\n${shop} is open, and you're one of the first to know. Have a look: ${address}\n\nThank you for cheering me on.\n`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The moment a press opens its shop to shoppers (from the final check or the setup guide): a big "open" tile with the
 * shop's address to visit and share, beside three ready ways to tell the people who already know it (a post, a note to
 * its list, the link for its bio; sign-up to open shop plan, move 5), Google and, for a press that moved from another
 * online shop, its old links. Shown until it's put away, only in the visit that opened the shop.
 */
export function ShopOpenedCard({ address, onClose, name, moved = false, onOpen }: {
  address: string;
  onClose: () => void;
  /** The shop's name, for "Moth Press is open."; "Your shop is open." without one. */
  name?: string;
  /** The press brought its shop from another online shop: its old links are worth a check. */
  moved?: boolean;
  /** Opens an admin page (Google, Sales channels, General settings); the side tiles show only with it. */
  onOpen?: (tab: string) => void;
}) {
  const [copied, setCopied] = useState("");
  const copy = async (where: "address" | "bio" = "address") => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(where === "bio" ? "Link copied. Paste it into your bio wherever people follow you." : "Copied. Paste it anywhere you tell people about your shop.");
    }
    catch { setCopied(`Copy this address: ${address}`); }
  };
  const shown = address.replace(/^https:\/\//, "");
  const title = name?.trim() ? `${name.trim()} is open.` : "Your shop is open.";
  const go = (hash: string) => { window.location.hash = hash; };
  return (
    <div className="rp-sb">
      <div className="rp-sb-row" style={onOpen ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}>
        <section className="rp-sb-tile rp-sb-big rp-sb-good" aria-labelledby="shop-opened-title">
          <p className="rp-sb-eyebrow" style={{ overflowWrap: "anywhere" }}>Open · {shown}</p>
          <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
            <h2 id="shop-opened-title" className="rp-sb-title">{title}</h2>
            <p>Shoppers can find you and buy now. Tell people where it is.</p>
          </div>
          <div className="rp-sb-actions" style={{ marginTop: 0 }}>
            <PrimaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open(address, "_blank", "noopener")}>View your shop</PrimaryButton>
            <SecondaryButton icon={<Copy size={16} aria-hidden />} onClick={() => void copy()}>Copy the address</SecondaryButton>
            <GhostButton onClick={onClose}>Done</GhostButton>
          </div>
          <p role="status" className="rp-hint" style={{ margin: 0 }}>{copied}</p>
        </section>
        {onOpen && (
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <section className="rp-sb-tile" aria-labelledby="shop-opened-tell">
              <p className="rp-sb-eyebrow" id="shop-opened-tell">Tell the people who know you</p>
              <ul className="rp-sb-tell">
                <li>
                  <button type="button" onClick={() => onOpen("channels")}>
                    <Megaphone size={18} aria-hidden />
                    <span><strong>Post it</strong><small>A ready post with your shop's picture.</small></span>
                  </button>
                </li>
                <li>
                  <a href={tellEmailHref(address, name)}>
                    <Mail size={18} aria-hidden />
                    <span><strong>Email your people</strong><small>A short note, written for you.</small></span>
                  </a>
                </li>
                <li>
                  <button type="button" onClick={() => void copy("bio")}>
                    <Link2 size={18} aria-hidden />
                    <span><strong>Put it in your bio</strong><small>Copies your shop's link.</small></span>
                  </button>
                </li>
              </ul>
              <p className="rp-sb-promise">When your first order comes in, we'll email you and celebrate it here.</p>
            </section>
            <section className="rp-sb-tile" aria-labelledby="shop-opened-reach">
              <p className="rp-sb-eyebrow" id="shop-opened-reach">Reach new shoppers</p>
              <button type="button" className="rp-sb-link" style={{ color: "var(--rp-text)", fontSize: 18, textDecoration: "none" }} onClick={() => go("#settings/google")}>Show up on Google</button>
            </section>
            {moved && (
              <section className="rp-sb-tile rp-sb-next" aria-labelledby="shop-opened-links">
                <p className="rp-sb-eyebrow">Moved from another shop?</p>
                <h3 id="shop-opened-links">Check your old links</h3>
                <button type="button" className="rp-sb-link" onClick={() => onOpen("general")}>Check them now →</button>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
