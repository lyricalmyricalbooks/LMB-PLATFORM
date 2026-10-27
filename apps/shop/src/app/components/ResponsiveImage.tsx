import { createContext, useContext, type ImgHTMLAttributes } from "react";
import { responsiveSource } from "../features/site/mediaRef";

// Studio media library (2.4). Sections render their pictures through this component. A picture chosen
// from the library carries a `${field}__media` record (features/site/mediaRef.ts), so the browser gets
// `srcset`/`sizes` (480 / 960 / 1600 px copies), the picture's real `width`/`height` (no layout jump),
// lazy loading below the fold and `fetchpriority="high"` in the page's first section. Anything else —
// typed URLs, older uploads, existing designs — renders the exact `<img>` it always did.

/** True inside the page's first section (set by SectionList), where pictures load first and eagerly. */
export const SectionPriorityContext = createContext(false);

/** Section lists whose first section is the top of the page (home page and custom pages). */
export function sectionHasPriority(dataSection: string | undefined, index: number): boolean {
  if (index !== 0 || !dataSection) return false;
  return dataSection === "homepage" || dataSection === "heroPage" || dataSection === "page" || dataSection.startsWith("page:");
}

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src?: string;
  /** The field's `__media` record, if any. */
  media?: unknown;
  /** How wide the picture is drawn, for the browser's choice of copy. Defaults to the full screen width. */
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
};

export function ResponsiveImage({ src, media, sizes, alt, loading, fetchPriority, decoding, ...rest }: Props) {
  const priority = useContext(SectionPriorityContext);
  const source = responsiveSource(src, media);
  // Plain path kept byte-identical to the old markup (ResponsiveImage.test.tsx); callers pass `loading` rarely here.
  if (!source) return <img src={src} alt={alt} loading={loading} decoding={decoding} fetchPriority={fetchPriority} {...rest} />;
  return (
    <img
      // `loading` before `src`: React sets attributes in prop order, and a lazy picture whose src is set first
      // loads at once when the prerendered page already listed it (features/site/lazyFirst.test.ts).
      loading={priority ? "eager" : loading || "lazy"}
      src={src}
      srcSet={source.srcSet}
      sizes={sizes || "100vw"}
      width={source.width}
      height={source.height}
      alt={alt || source.alt}
      fetchPriority={priority ? "high" : fetchPriority}
      decoding={decoding || "async"}
      {...rest}
    />
  );
}
