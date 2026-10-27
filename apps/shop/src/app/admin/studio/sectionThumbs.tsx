// Add section thumbnails (Studio 2.6): a small wireframe per kind of section, drawn in code so every section type
// has one and nothing needs regenerating. The live "try it on the page" preview shows the real thing.
const KIND: Record<string, string> = {
  HeroSection: "hero", ImageBannerSection: "hero", VideoHeroSection: "hero", SlideshowSection: "hero",
  ProductGridHeaderSection: "books", ProductShowcaseGridSection: "books", FeaturedCollectionSection: "books", CollectionListSection: "books",
  ProductCoverCarouselSection: "carousel",
  FeaturedProductSection: "spotlight", BookSpotlightSection: "spotlight", ImageWithTextSection: "spotlight",
  FeatureGridSection: "columns", MulticolumnSection: "columns", StatsCounterSection: "columns", PricingTableSection: "columns", LogoListSection: "logos", BlogPostsSection: "columns",
  TestimonialsSection: "quotes", PraiseQuotesSection: "quotes",
  TextContentSection: "text", RichTextSection: "text", PageContentSection: "text", CustomHTMLSection: "code",
  NewsletterSection: "form", ContactFormSection: "form", NewsletterPopupSection: "popup",
  FAQSection: "list", CollapsibleSection: "list", StaffNotesTableSection: "list",
  MarqueeSection: "strip", PromoStripSection: "strip", CountdownSection: "countdown", EphemeraRowSection: "strip",
  GallerySection: "gallery", ImageCollageSection: "collage",
  VideoSection: "video", MapSection: "map",
  StickyAddToBagSection: "bar",
  CompositionSection: "layout", RowSection: "layout",
};

export const thumbKind = (type: string) => KIND[type] || "text";

const box = (x: number, y: number, w: number, h: number, fill = false, key?: string) =>
  <rect key={key ?? `${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} fill={fill ? "currentColor" : "none"} fillOpacity={fill ? 0.18 : undefined} stroke="currentColor" strokeWidth="1.5" />;
const line = (x: number, y: number, w: number, strong = false, key?: string) =>
  <rect key={key ?? `l${x}-${y}-${w}`} x={x} y={y} width={w} height={strong ? 4 : 2.5} fill="currentColor" fillOpacity={strong ? 0.75 : 0.4} />;

function shapes(kind: string) {
  switch (kind) {
    case "hero": return [box(6, 6, 108, 60, true), line(30, 28, 60, true), line(40, 38, 40), box(48, 46, 24, 8)];
    case "books": return [line(6, 8, 40, true), ...[0, 1, 2, 3].flatMap(i => [box(6 + i * 28, 18, 22, 30, true, `b${i}`), line(6 + i * 28, 52, 18, false, `t${i}`), line(6 + i * 28, 58, 10, false, `p${i}`)])];
    case "carousel": return [box(34, 10, 52, 52, true), box(8, 18, 20, 36), box(92, 18, 20, 36)];
    case "spotlight": return [box(8, 8, 46, 56, true), line(62, 16, 44, true), line(62, 26, 36), line(62, 32, 40), line(62, 38, 30), box(62, 48, 28, 8)];
    case "columns": return [line(36, 8, 48, true), ...[0, 1, 2].flatMap(i => [box(8 + i * 36, 20, 30, 18, true, `c${i}`), line(8 + i * 36, 44, 26, false, `c1${i}`), line(8 + i * 36, 50, 20, false, `c2${i}`)])];
    case "logos": return [...[0, 1, 2, 3, 4].map(i => box(6 + i * 22, 28, 18, 14, true, `g${i}`))];
    case "quotes": return [<text key="q" x="10" y="30" fontSize="26" fill="currentColor" fillOpacity="0.7">“</text>, line(28, 20, 80, true), line(28, 30, 70), line(28, 38, 60), line(28, 52, 30)];
    case "text": return [line(10, 10, 60, true), line(10, 22, 100), line(10, 30, 96), line(10, 38, 100), line(10, 46, 80), line(10, 54, 90)];
    case "code": return [box(6, 8, 108, 56), <text key="c" x="40" y="44" fontSize="18" fill="currentColor" fillOpacity="0.6">{"</>"}</text>];
    case "form": return [line(34, 12, 52, true), line(26, 24, 68), box(14, 38, 62, 12), box(80, 38, 26, 12, true)];
    case "popup": return [box(2, 2, 116, 68, true), box(22, 12, 76, 48), line(32, 22, 40, true), line(32, 30, 56), box(32, 40, 38, 10), box(72, 40, 18, 10, true)];
    case "list": return [line(8, 8, 50, true), ...[0, 1, 2, 3].flatMap(i => [box(8, 18 + i * 13, 104, 10, false, `r${i}`), line(12, 22 + i * 13, 50, false, `rl${i}`)])];
    case "strip": return [box(4, 28, 112, 16, true), line(28, 34, 64, true)];
    case "countdown": return [line(36, 10, 48, true), ...[0, 1, 2, 3].map(i => box(14 + i * 24, 26, 20, 22, true, `d${i}`))];
    case "gallery": return [0, 1, 2].flatMap(r => [0, 1, 2].map(c => box(18 + c * 30, 6 + r * 21, 26, 18, true, `gl${r}${c}`)));
    case "collage": return [box(8, 8, 52, 56, true), box(64, 8, 24, 26, true), box(92, 8, 20, 26, true), box(64, 38, 48, 26, true)];
    case "video": return [box(14, 8, 92, 56, true), <path key="v" d="M54 26 L70 36 L54 46 Z" fill="currentColor" fillOpacity="0.7" />];
    case "map": return [box(8, 8, 104, 56, true), <circle key="m" cx="60" cy="34" r="6" fill="currentColor" fillOpacity="0.7" />];
    case "bar": return [box(6, 6, 108, 40), box(4, 50, 112, 18, true), box(8, 53, 8, 12), line(20, 57, 40, true), box(88, 54, 24, 10)];
    case "layout": return [box(6, 8, 52, 26, true), box(62, 8, 52, 26), box(6, 38, 108, 26)];
    default: return [line(10, 20, 100)];
  }
}

export function SectionThumb({ type }: { type: string }) {
  return (
    <svg className="studio-section-thumb" viewBox="0 0 120 72" aria-hidden="true" focusable="false" data-thumb={thumbKind(type)}>
      {shapes(thumbKind(type))}
    </svg>
  );
}
