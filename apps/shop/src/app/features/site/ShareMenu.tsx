import { useEffect, useId, useRef, useState } from "react";
import { Link2, Share2 } from "lucide-react";
import { SHARE_TARGETS, shareHref, sharedUrl } from "./shareLinks";

type Props = {
  title: string;
  image?: string;
  /** The words for a Text & labels key. */
  word: (key: string) => string;
  /** Called on every share, with where it went ("native", "copy", "facebook"…). */
  onShare?: (where: string) => void;
  onCopied: (ok: boolean) => void;
};

/** A phone (touch screen) with its own share sheet uses that; elsewhere the menu opens. */
function usesShareSheet(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * The product page's share button (plan 27.7), like Shopify themes' share links: on a phone the phone's own share sheet;
 * on a computer a short menu of Facebook, Pinterest, X, WhatsApp, email and Copy link. Each link is marked with where it
 * was shared, so visits from shares show in the shop's visit sources.
 */
export function ShareMenu({ title, image, word, onShare, onCopied }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key); };
  }, [open]);

  const pageUrl = () => window.location.href;

  const press = async () => {
    if (usesShareSheet()) {
      onShare?.("native");
      // Closing the share sheet is not an error.
      await navigator.share({ title, url: sharedUrl(pageUrl(), "native_share") }).catch(() => {});
      return;
    }
    setOpen((o) => !o);
  };

  const copy = async () => {
    onShare?.("copy");
    setOpen(false);
    try { await navigator.clipboard.writeText(sharedUrl(pageUrl(), "copy_link")); onCopied(true); } catch { onCopied(false); }
  };

  return (
    <span className="fm-pdp-share" ref={wrap}>
      <button
        ref={button}
        type="button"
        onClick={press}
        aria-label={word("bookShare")}
        title={word("bookShare")}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="fm-pdp-sq transition-all"
      >
        <Share2 size={16} />
      </button>
      {open && (
        <span className="fm-pdp-share-menu" id={menuId} role="group" aria-label={word("bookShare")}>
          {SHARE_TARGETS.map((t) => (
            <a key={t.id} href={shareHref(t.id, { url: pageUrl(), title, image })} target={t.id === "email" ? undefined : "_blank"}
              rel="noopener noreferrer" onClick={() => { onShare?.(t.id); setOpen(false); }} data-share={t.id}>
              {word(t.copyKey)}
            </a>
          ))}
          <button type="button" onClick={copy} data-share="copy"><Link2 size={14} aria-hidden="true" />{word("bookShareCopyLink")}</button>
        </span>
      )}
    </span>
  );
}
