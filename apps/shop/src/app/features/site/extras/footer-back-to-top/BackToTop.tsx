import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps, regionVisible } from "../../storefrontRegions";
import { BACK_TO_TOP_CSS, backToTopOn, backToTopShown, backToTopSide } from "./backToTop";

// Studio › Style › Footer & social links › Back to top button (off by default). Rendered by the one
// storefront footer, so every page with the shop footer gets it. Words: Text & labels › Footer › backToTop.
export function BackToTop({ design }: { design: any }) {
  const on = backToTopOn(design) && regionVisible(design, "footerBackToTop");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    let frame = 0;
    const check = () => { frame = 0; setShown(backToTopShown(window.scrollY, window.innerHeight)); };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [on]);
  if (!on) return null;
  const word = String(getCopy(design, "backToTop") ?? "");
  const goUp = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Keyboard and screen-reader users continue from the top of the page, not from the footer.
    const top = document.querySelector<HTMLElement>("[data-fm-store] header, header") || document.body;
    if (!top.hasAttribute("tabindex")) top.setAttribute("tabindex", "-1");
    top.focus({ preventScroll: true });
  };
  return (
    <>
      <style>{BACK_TO_TOP_CSS}</style>
      <button type="button" onClick={goUp} {...regionProps("footerBackToTop")}
        className="fm-back-to-top" data-side={backToTopSide(design)} data-shown={shown ? "true" : "false"}
        aria-label={word || undefined}
        data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Back to top button">
        <ArrowUp size={14} aria-hidden="true" />
        {word && <span className="fm-back-to-top-word" data-studio-copy="backToTop">{word}</span>}
      </button>
    </>
  );
}
