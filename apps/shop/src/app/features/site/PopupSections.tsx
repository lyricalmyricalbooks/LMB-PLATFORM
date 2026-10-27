import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GroupSections } from "../../components/sectionRender";
import { CONSENT_EVENT, CONSENT_KEY } from "../../lib/consent";
import { inEditorPreview } from "../../lib/trackingGuard";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { getCopy } from "./storeCopy";
import { useStudioOverlay } from "./studioOverlay";
import {
  groupSections, leavingThroughTop, popupAllowed, popupScrollPercent, popupTriggerOf, popupVersion, scrolledPast,
  POPUP_SEEN_KEY, POPUP_SUPPRESS_KEY, type PopupFrequency,
} from "./sectionGroups";

const read = (store: Storage | undefined, key: string) => { try { return store?.getItem(key) ?? null; } catch { return null; } };
const write = (store: Storage | undefined, key: string, value: string) => { try { store?.setItem(key, value); } catch { /* storage blocked */ } };

/**
 * The pop-up section group (Studio › Page layout › Pop-up). It waits until the shopper has answered
 * the cookie banner (so the two never stack), then for Style › Pop-up › Delay, and shows as often as
 * Style › Pop-up › How often allows. Style › Pop-up › When it opens can instead wait until the shopper
 * is about to leave (the mouse heads for the tabs; phones have no mouse, so they use the delay) or has
 * scrolled part way down the page. In the Studio preview it only opens when Studio asks
 * (Page layout › Pop-overs › Pop-up, or while its sections are being edited).
 */
export function PopupSections({ design, books = [] }: { design: any; books?: any[] }) {
  const sections = groupSections(design, "overlaySections");
  const [open, setOpen] = useState(false);
  useStudioOverlay("popup", setOpen);
  const preview = inEditorPreview();
  const version = popupVersion(sections);
  const frequency = (design?.popupFrequency || "session") as PopupFrequency;
  const delay = Math.max(0, Math.min(120, Number(design?.popupDelaySeconds ?? 5))) * 1000;
  const bannerOn = design?.showCookieBanner !== false;
  const hideOnPhones = design?.popupHideOnPhones === true;
  const trigger = popupTriggerOf(design);
  const scrollPercent = popupScrollPercent(design);

  useEffect(() => {
    if (preview || !sections.length || typeof window === "undefined") return;
    if (read(window.sessionStorage, POPUP_SUPPRESS_KEY) === "1") return;
    if (hideOnPhones && window.matchMedia?.("(max-width: 767px)").matches) return;
    const key = `${POPUP_SEEN_KEY}:${version}`;
    const seen = { session: read(window.sessionStorage, key) === "1", ever: read(window.localStorage, key) === "1" };
    if (!popupAllowed(frequency, seen)) return;
    let timer = 0;
    let armed = false;
    const show = () => { disarm(); setOpen(true); };
    const onLeave = (e: MouseEvent) => { if (leavingThroughTop(e)) show(); };
    const onScroll = () => {
      const page = document.documentElement;
      if (scrolledPast(window.scrollY, window.innerHeight, page.scrollHeight, scrollPercent)) show();
    };
    // Exit intent needs a mouse; on touch screens the pop-up falls back to the delay.
    const exitMode = trigger === "exit" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    const disarm = () => {
      window.clearTimeout(timer);
      if (!armed) return;
      armed = false;
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
    const start = () => {
      disarm();
      if (exitMode) { armed = true; document.addEventListener("mouseout", onLeave); return; }
      if (trigger === "scroll") { armed = true; window.addEventListener("scroll", onScroll, { passive: true }); onScroll(); return; }
      timer = window.setTimeout(() => setOpen(true), delay);
    };
    const answered = () => !bannerOn || read(window.localStorage, CONSENT_KEY) !== null;
    if (answered()) start();
    const onConsent = () => { if (answered()) start(); };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => { disarm(); window.removeEventListener(CONSENT_EVENT, onConsent); };
  }, [preview, sections.length, version, frequency, delay, bannerOn, hideOnPhones, trigger, scrollPercent]);

  const close = () => {
    setOpen(false);
    if (preview) return;
    const key = `${POPUP_SEEN_KEY}:${version}`;
    write(window.sessionStorage, key, "1");
    write(window.localStorage, key, "1");
  };
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref as any, open && !preview, close);

  if (!open || !sections.length || typeof document === "undefined") return null;
  const position = design?.popupPosition || "center";
  const shade = Math.max(0, Math.min(90, Number(design?.popupBackdropOpacity ?? 60))) / 100;
  const width = Math.max(280, Math.min(1000, Number(design?.popupMaxWidth ?? 560)));
  const outline = Math.max(0, Math.min(6, Number(design?.popupBorderWidth ?? 2)));
  const place = position === "bottom-right" ? "items-end justify-end" : position === "bottom" ? "items-end justify-center" : "items-center justify-center";
  return createPortal(
    // Hide on phones also applies when Studio opens the pop-up in the phone preview (CSS follows the frame width).
    <div className={`fixed inset-0 z-[90] flex p-4 ${place}${hideOnPhones ? " max-md:hidden" : ""}`} style={{ backgroundColor: `rgba(var(--overlay-rgb, 0, 0, 0), ${shade})` }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={getCopy(design, "popupLabel")} tabIndex={-1}
        data-studio-target="style:popup|copy:Sections" data-studio-label="Pop-up"
        className="relative max-h-[90vh] w-full overflow-auto" style={{
          maxWidth: width,
          background: design?.popupBg || "var(--bg-color, Canvas)",
          color: design?.popupTextColor || "rgb(var(--fg-rgb, 255, 255, 255))",
          border: `${outline}px solid ${design?.popupBorderColor || "var(--rp-outline, rgb(var(--fg-rgb, 255, 255, 255)))"}`,
        }}>
        <button type="button" onClick={close} aria-label={getCopy(design, "popupClose")}
          className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center" style={{ color: "inherit" }}>
          <X size={18} aria-hidden="true" />
        </button>
        <GroupSections design={design} group="overlaySections" books={books} />
      </div>
    </div>,
    // Inside the storefront root, which carries the theme's colour tokens (--bg-color, --fg-rgb…).
    document.querySelector("[data-fm-store]") || document.body,
  );
}
