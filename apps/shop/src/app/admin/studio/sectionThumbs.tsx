// Add section pictures (Studio 2.6; drawn in the shop's own look since the starters and Studio rethink, step 6): one
// arrangement per kind of section, placed as the design places it, in the shop's colours, heading font and sample
// photos, drawn in code so every design has one and nothing needs regenerating. Pointing at a card tries the real
// section on the page.
const KIND: Record<string, string> = {
  HeroSection: "hero", ImageBannerSection: "hero", VideoHeroSection: "hero", SlideshowSection: "hero",
  ProductGridHeaderSection: "books", ProductShowcaseGridSection: "books", FeaturedCollectionSection: "books", CollectionListSection: "books",
  ProductCoverCarouselSection: "carousel",
  FeaturedProductSection: "spotlight", BookSpotlightSection: "spotlight", ImageWithTextSection: "spotlight", SplitOpeningSection: "hero", PhotoOpeningSection: "hero", BigIntroSection: "spotlight", FeatureDuoSection: "spotlight", StoryOrbitSection: "spotlight",
  FeatureGridSection: "columns", MulticolumnSection: "columns", StatsCounterSection: "columns", PricingTableSection: "columns", LogoListSection: "logos", FollowUsSection: "logos", BlogPostsSection: "columns",
  TestimonialsSection: "quotes", PraiseQuotesSection: "quotes",
  TextContentSection: "text", RichTextSection: "text", PageContentSection: "text", CustomHTMLSection: "code",
  NewsletterSection: "form", ContactFormSection: "form", NewsletterPopupSection: "popup",
  FAQSection: "list", CollapsibleSection: "list", StaffNotesTableSection: "list",
  MarqueeSection: "strip", PromoStripSection: "strip", CountdownSection: "countdown", EphemeraRowSection: "strip",
  GallerySection: "gallery", ImageCollageSection: "collage", ShoppablePhotoSection: "hero", LookbookSection: "gallery",
  VideoSection: "video", MapSection: "map", BookTimeSection: "columns", ServiceMenuSection: "list", BookingTeamSection: "columns", BookCallSection: "hero", BookingHoursSection: "map", ClientReviewsSection: "columns",
  StickyAddToBagSection: "bar",
  CompositionSection: "layout", RowSection: "layout",
};

export const thumbKind = (type: string) => KIND[type] || "text";

/** The shop's own look for the pictures: page colours, accent, heading font and sample photos (starters and Studio rethink, step 6). */
export type ThumbLook = { bg?: string; fg?: string; accent?: string; font?: string; photos?: string[] };
/** How a design changes its picture: where the words sit, which side the photo is on, a dark or bright band. */
export type ThumbDesign = { align: "left" | "center" | "right"; photoRight: boolean; band: "page" | "dark" | "bright" };

export function thumbDesign(settings: Record<string, any> = {}): ThumbDesign {
  const align = String(settings.align || settings.textAlign || settings.contentPosition || "");
  const side = [settings.layout, settings.imagePosition, settings.contentPosition].map(v => String(v || "")).join(" ");
  return {
    align: /left|start/.test(align) ? "left" : /right|end/.test(align) ? "right" : "center",
    photoRight: /right|reverse/.test(side),
    band: settings.colorSchemeId === "scheme-inverse" ? "dark" : settings.colorSchemeId === "scheme-accent" ? "bright" : "page",
  };
}

type Draw = { d: ThumbDesign; photo: () => string | undefined; accent: string; font?: string };
const box = (x: number, y: number, w: number, h: number, fill = false, key?: string, o?: Draw) => {
  const k = key ?? `${x}-${y}-${w}-${h}`;
  const url = fill ? o?.photo() : undefined;
  if (url) return <g key={k}><image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" /><rect x={x} y={y} width={w} height={h} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" /></g>;
  return <rect key={k} x={x} y={y} width={w} height={h} fill={fill ? "currentColor" : "none"} fillOpacity={fill ? 0.18 : undefined} stroke="currentColor" strokeWidth="1.5" />;
};
const line = (x: number, y: number, w: number, strong = false, key?: string) =>
  <rect key={key ?? `l${x}-${y}-${w}`} x={x} y={y} width={w} height={strong ? 4 : 2.5} fill="currentColor" fillOpacity={strong ? 0.75 : 0.4} />;
const button = (x: number, y: number, w: number, o: Draw, key = `btn${x}-${y}`) => <rect key={key} x={x} y={y} width={w} height={8} rx="1.5" fill={o.accent} />;
/** Lines placed by the design's alignment inside [left, left + width]. */
const placed = (left: number, width: number, w: number, d: ThumbDesign) => d.align === "left" ? left : d.align === "right" ? left + width - w : left + (width - w) / 2;
const headline = (left: number, width: number, y: number, o: Draw, size = 13, fill = "currentColor") => {
  const anchor = o.d.align === "left" ? "start" : o.d.align === "right" ? "end" : "middle";
  const x = o.d.align === "left" ? left : o.d.align === "right" ? left + width : left + width / 2;
  return <text key={`h${y}`} x={x} y={y} fontSize={size} textAnchor={anchor} fill={fill} style={{ fontFamily: o.font ? `"${o.font}", serif` : undefined, fontWeight: 600 }}>Headline</text>;
};

function shapes(kind: string, o: Draw) {
  const { d } = o;
  const b = (x: number, y: number, w: number, h: number, fill = false, key?: string) => box(x, y, w, h, fill, key, o);
  switch (kind) {
    case "hero": {
      const url = o.photo();
      return [
        url ? <image key="bg" href={url} x="0" y="0" width="120" height="72" preserveAspectRatio="xMidYMid slice" /> : box(6, 6, 108, 60, true, "bg"),
        url ? <rect key="shade" x="0" y="0" width="120" height="72" fill="#000" fillOpacity="0.35" /> : null,
        headline(14, 92, 34, o, 13, url ? "#fff" : "currentColor"),
        <rect key="sub" x={placed(14, 92, 44, d)} y="40" width="44" height="2.5" fill={url ? "#fff" : "currentColor"} fillOpacity="0.7" />,
        button(placed(14, 92, 26, d), 48, 26, o),
      ];
    }
    case "books": return [line(placed(6, 108, 40, d), 8, 40, true), ...[0, 1, 2, 3].flatMap(i => [b(6 + i * 28, 18, 22, 30, true, `b${i}`), line(6 + i * 28, 52, 18, false, `t${i}`), line(6 + i * 28, 58, 10, false, `p${i}`)])];
    case "carousel": return [b(34, 10, 52, 52, true), b(8, 18, 20, 36, true), b(92, 18, 20, 36, true)];
    case "spotlight": {
      const photoX = d.photoRight ? 66 : 8, textX = d.photoRight ? 10 : 62;
      return [b(photoX, 8, 46, 56, true, "photo"), headline(textX, 46, 22, { ...o, d: { ...d, align: d.align === "center" ? "left" : d.align } }, 10),
        line(textX, 30, 36), line(textX, 36, 40), line(textX, 42, 30), button(textX, 50, 26, o)];
    }
    case "columns": return [line(placed(8, 104, 48, d), 8, 48, true), ...[0, 1, 2].flatMap(i => [b(8 + i * 36, 20, 30, 18, true, `c${i}`), line(8 + i * 36, 44, 26, false, `c1${i}`), line(8 + i * 36, 50, 20, false, `c2${i}`)])];
    case "logos": return [...[0, 1, 2, 3, 4].map(i => box(6 + i * 22, 28, 18, 14, true, `g${i}`))];
    case "quotes": return [<text key="q" x="10" y="30" fontSize="26" fill={o.accent}>“</text>, line(28, 20, 80, true), line(28, 30, 70), line(28, 38, 60), line(28, 52, 30)];
    case "text": return [headline(10, 100, 18, o, 11), ...[28, 36, 44, 52].map((y, i) => { const w = [100, 94, 100, 80][i]; return line(placed(10, 100, w, d), y, w, false, `tx${i}`); })];
    case "code": return [box(6, 8, 108, 56), <text key="c" x="40" y="44" fontSize="18" fill="currentColor" fillOpacity="0.6">{"</>"}</text>];
    case "form": return [headline(10, 100, 20, o, 11), line(placed(10, 100, 68, d), 26, 68), box(14, 38, 62, 12), <rect key="go" x="80" y="38" width="26" height="12" rx="1.5" fill={o.accent} />];
    case "popup": return [box(2, 2, 116, 68, true), box(22, 12, 76, 48), line(32, 22, 40, true), line(32, 30, 56), box(32, 40, 38, 10), button(72, 41, 18, o)];
    case "list": return [line(placed(8, 104, 50, d), 8, 50, true), ...[0, 1, 2, 3].flatMap(i => [box(8, 18 + i * 13, 104, 10, false, `r${i}`), line(12, 22 + i * 13, 50, false, `rl${i}`)])];
    case "strip": return [<rect key="s" x="4" y="28" width="112" height="16" fill={o.accent} />, <rect key="sl" x="28" y="34" width="64" height="4" fill="#fff" fillOpacity="0.85" />];
    case "countdown": return [line(36, 10, 48, true), ...[0, 1, 2, 3].map(i => box(14 + i * 24, 26, 20, 22, true, `d${i}`))];
    case "gallery": return [0, 1, 2].flatMap(r => [0, 1, 2].map(c => b(18 + c * 30, 6 + r * 21, 26, 18, true, `gl${r}${c}`)));
    case "collage": return [b(8, 8, 52, 56, true), b(64, 8, 24, 26, true), b(92, 8, 20, 26, true), b(64, 38, 48, 26, true)];
    case "video": return [b(14, 8, 92, 56, true), <circle key="vc" cx="60" cy="36" r="10" fill="#000" fillOpacity="0.45" />, <path key="v" d="M56 30 L66 36 L56 42 Z" fill="#fff" />];
    case "map": return [box(8, 8, 104, 56, true), <circle key="m" cx="60" cy="34" r="6" fill={o.accent} />];
    case "bar": return [box(6, 6, 108, 40), box(4, 50, 112, 18, true), b(8, 53, 8, 12, true, "bt"), line(20, 57, 40, true), button(88, 55, 24, o)];
    case "layout": return [b(6, 8, 52, 26, true), box(62, 8, 52, 26), box(6, 38, 108, 26)];
    default: return [line(10, 20, 100)];
  }
}

/** One Add section picture: the design's own arrangement, in the shop's colours, font and sample photos. */
export function SectionThumb({ type, settings, look }: { type: string; settings?: Record<string, any>; look?: ThumbLook }) {
  const d = thumbDesign(settings);
  const photos = look?.photos || [];
  let next = 0;
  const accent = look?.accent || "currentColor";
  const page = { bg: look?.bg, fg: look?.fg };
  const colours = d.band === "dark" ? { bg: page.fg, fg: page.bg } : d.band === "bright" ? { bg: look?.accent, fg: page.bg } : page;
  const o: Draw = { d, accent: d.band === "bright" ? (page.fg || accent) : accent, font: look?.font, photo: () => photos.length ? photos[next++ % photos.length] : undefined };
  return (
    <svg className="studio-section-thumb" viewBox="0 0 120 72" aria-hidden="true" focusable="false" data-thumb={thumbKind(type)} data-thumb-band={d.band}
      style={colours.bg || colours.fg ? { background: colours.bg, color: colours.fg } : undefined}>
      {shapes(thumbKind(type), o)}
    </svg>
  );
}
