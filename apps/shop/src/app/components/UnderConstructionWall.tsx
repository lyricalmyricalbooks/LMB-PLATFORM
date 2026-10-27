import { regionProps } from "../features/site/storefrontRegions";
import { Link, useLocation } from "react-router";
import { StorefrontThemeStyle } from "../features/site/StorefrontThemeStyle";
import { useLiveDesign } from "../features/site/useSiteData";
import { getCopy } from "../features/site/storeCopy";

/**
 * Full-screen Riso "under construction" wall. Off by default; switched on in
 * Studio › Style › Storefront elements › "Under construction wall". Never
 * covers /admin, so the owner can always get back in to switch it off.
 */
export function UnderConstructionWall() {
  const design = useLiveDesign();
  const { pathname } = useLocation();
  if (design?.showUnderConstruction !== true) return null;
  if (pathname.startsWith("/admin")) return null;
  const c = (key: string) => getCopy(design, key);
  const email = c("ucEmail");
  return (
    <div
      data-fm-store
      role="dialog"
      aria-modal="true"
      aria-label={c("ucAria")}
      data-studio-target="copy:Under construction|style:elements" data-studio-label="Under construction wall"
      className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-[var(--bg-color)] p-4 text-[rgb(var(--fg-rgb))]"
    >
      <StorefrontThemeStyle design={design} />
      <div {...regionProps("constructionArtwork")}
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ backgroundImage: "repeating-linear-gradient(-45deg, var(--accent-color) 0 18px, transparent 18px 36px)" }}
      />
      <div {...regionProps("constructionPanel")} className="relative w-full max-w-[40rem] border-2 border-[var(--rp-outline)] bg-[var(--bg-color)] p-6 shadow-[8px_8px_0_var(--rp-shadow-color)] md:p-10">
        <span {...regionProps("constructionTag")} className="inline-block -rotate-2 border-2 border-[var(--rp-outline)] bg-[var(--accent-color)] px-3 py-1 font-mono text-[11px] font-black uppercase tracking-[0.25em] text-[var(--btn-text)]">
          {c("ucTag")}
        </span>
        <h1 {...regionProps("constructionHeading")} className="mt-6 font-[Anton,var(--heading-font,sans-serif)] text-5xl uppercase leading-[0.9] md:text-7xl">
          {c("ucHeading")}{" "}
          <span className="text-[var(--accent-color)]">{c("ucHeadingAccent")}</span>
        </h1>
        <hr className="my-6 border-t-2 border-[var(--rp-outline)]" />
        <p {...regionProps("constructionBody")} className="max-w-[32rem] text-base leading-relaxed opacity-80">{c("ucBody")}</p>
        {email && (
          <a
            href={`mailto:${email}`}
            className="mt-8 inline-block border-2 border-[var(--rp-outline)] bg-[var(--btn-bg)] px-5 py-3 font-mono text-[11px] font-black uppercase tracking-[0.2em] text-[var(--btn-text)] shadow-[3px_3px_0_var(--rp-shadow-color)] transition-transform hover:-translate-y-0.5"
          >
            {c("ucButton")}
          </a>
        )}
        {design?.showUnderConstructionAdmin !== false && (
          <Link
            to="/admin"
            className="ml-3 mt-8 inline-block border-2 border-[var(--rp-outline)] px-5 py-3 font-mono text-[11px] font-black uppercase tracking-[0.2em] transition-transform hover:-translate-y-0.5"
          >
            {c("ucAdmin")}
          </Link>
        )}
        <p {...regionProps("constructionFootnote")} className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">{c("ucFootnote")}</p>
      </div>
    </div>
  );
}
