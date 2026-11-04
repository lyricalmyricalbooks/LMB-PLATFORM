import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { googleFontHref } from "../../features/site/fonts";
import { lookFonts, type LookPreview, type PreviewProduct } from "../lookGallery";
import { useShopWords } from "../shopWords";

// The try-on (Choose your look): a whole shop page drawn in a look's own colours, type, picture shape, buttons and
// template layout, at a real desktop or phone width and scaled to fit. Drawn from the theme itself, so every look in
// the library has one by construction, in setup mode too (no shop exists yet there, so the real storefront can't be
// shown). Studio › Themes › Preview shows a look on the press's real shop once it is open.

export type StageDevice = "desktop" | "phone";
export type StagePage = "home" | "product";

/** The widths the page is drawn at before scaling: a laptop and a phone. */
export const STAGE_WIDTH: Record<StageDevice, number> = { desktop: 1200, phone: 390 };

const loaded = new Set<string>();
/** Fetches a look's faces from Google Fonts once per page, so the try-on shows its real type. */
export function useLookFonts(look: LookPreview) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    for (const font of lookFonts(look)) {
      if (loaded.has(font)) continue;
      loaded.add(font);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontHref(font);
      link.dataset.lookFont = font;
      document.head.appendChild(link);
    }
  }, [look.headingFont, look.bodyFont]);
}

/**
 * Holds content drawn at `width` and scales it down to the space it is given (never up). `height` crops it (a card's
 * thumbnail); without it the whole page shows and the box grows to fit.
 */
export function ScaledStage({ width, height, children, label }: { width: number; height?: number; children: ReactNode; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [innerHeight, setInnerHeight] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const available = el.clientWidth || width;
      setScale(Math.min(1, available / width));
      setInnerHeight(inner.current?.offsetHeight || 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [width]);
  const s = scale || 1;
  const shown = height ?? (innerHeight ? innerHeight * s : undefined);
  return (
    <div ref={box} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: "100%", height: shown, overflow: "hidden", position: "relative" }}>
      <div ref={inner} aria-hidden style={{ width, transform: `scale(${s})`, transformOrigin: "top left", visibility: scale ? "visible" : "hidden", pointerEvents: "none" }}>
        {children}
      </div>
    </div>
  );
}

/** A drawn cover for a product without a photo: a block in the look's colours with its title set in the look's type. */
function Cover({ look, product, index, ratio, radius, style }: { look: LookPreview; product: PreviewProduct; index: number; ratio: number; radius: CSSProperties["borderRadius"]; style?: CSSProperties }) {
  const fills = [look.accent, look.surface, look.secondary, look.text];
  const fill = fills[index % fills.length];
  const ink = fill === look.text ? look.bg : fill === look.surface ? look.text : look.buttonText;
  const frame: CSSProperties = {
    display: "block", width: "100%", aspectRatio: String(ratio), borderRadius: radius, overflow: "hidden",
    border: look.outline ? `${look.outline}px solid ${look.outlineColor}` : `1px solid ${look.border}`,
    boxShadow: look.shadow ? `${look.shadow}px ${look.shadow}px 0 ${look.shadowColor}` : undefined, ...style,
  };
  if (product.photo) return <img src={product.photo} alt="" loading="lazy" style={{ ...frame, objectFit: "cover" }} />;
  return (
    <div style={{ ...frame, background: fill, color: ink, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "10%", boxSizing: "border-box" }}>
      <span style={{ fontFamily: look.headingFont, fontWeight: look.headingWeight, fontSize: 22, lineHeight: 1.05, textTransform: look.uppercase ? "uppercase" : "none", overflowWrap: "anywhere" }}>{product.title}</span>
      {product.maker && <span style={{ fontSize: 11, opacity: 0.8 }}>{product.maker}</span>}
    </div>
  );
}

const pill = (look: LookPreview, filled: boolean): CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 18px", fontSize: 14, fontWeight: 700,
  borderRadius: look.buttonRadius, textTransform: look.uppercase ? "uppercase" : "none", letterSpacing: look.uppercase ? "0.06em" : undefined,
  background: filled ? look.button : "transparent", color: filled ? look.buttonText : look.text,
  border: `${Math.max(1, look.outline)}px solid ${filled ? look.button : look.border}`,
  boxShadow: filled && look.shadow ? `${Math.min(look.shadow, 4)}px ${Math.min(look.shadow, 4)}px 0 ${look.shadowColor}` : undefined,
});

/** The product card each template draws: tilted stalls, arched tops, ruled rows, a bare wall of covers… */
function Card({ look, product, index, phone }: { look: LookPreview; product: PreviewProduct; index: number; phone: boolean }) {
  const s = look.style;
  const radius = s === "arch" ? "999px 999px 0 0" : look.radius;
  const tall = s === "mosaic" && index % 3 === 0;
  const cover = <Cover look={look} product={product} index={index} ratio={tall ? look.ratio * 0.62 : look.ratio} radius={radius} />;
  const badge = index === 0 ? <span style={{ position: "absolute", top: 8, right: 8, padding: "3px 8px", fontSize: 11, fontWeight: 800, background: look.badgeBg, color: look.badgeText, borderRadius: s === "marquee" ? 999 : look.radius, textTransform: "uppercase" }}>New</span> : null;
  const words = (
    <div style={{ marginTop: 10, display: "grid", gap: 2 }}>
      <strong style={{ fontSize: phone ? 14 : 15, fontFamily: s === "shelf" || s === "arch" ? look.headingFont : look.bodyFont, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title || "Untitled"}</strong>
      {product.maker && <span style={{ fontSize: 13, color: look.muted }}>{product.maker}</span>}
      {product.price && <span style={{ fontSize: 14, fontWeight: 700, color: index === 1 ? look.accent : look.text }}>{product.price}</span>}
    </div>
  );
  if (s === "market") {
    return (
      <div style={{ position: "relative", transform: `rotate(${index % 2 ? 1.6 : -1.6}deg)`, background: look.surface, border: `3px solid ${look.border}`, boxShadow: `6px 6px 0 ${look.border}`, padding: 10 }}>
        {cover}{badge}{words}
      </div>
    );
  }
  if (s === "shelf") {
    return (
      <div style={{ position: "relative", borderBottom: `6px solid ${look.border}`, paddingBottom: 12 }}>
        {cover}{badge}{words}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", gridRow: tall ? "span 2" : undefined, background: s === "atlas" ? look.surface : undefined, padding: s === "atlas" ? 10 : undefined, borderRadius: s === "atlas" ? look.radius : undefined }}>
      {cover}{badge}{words}
    </div>
  );
}

/** Index rows: the catalogue as a ruled list, a small cover at the start of each row. */
function Rows({ look, products, phone }: { look: LookPreview; products: PreviewProduct[]; phone: boolean }) {
  return (
    <div style={{ borderTop: `2px solid ${look.border}` }}>
      {products.map((p, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: phone ? "56px 1fr auto" : "40px 72px 2fr 1fr auto", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: `1px solid ${look.border}` }}>
          {!phone && <span style={{ fontFamily: look.headingFont, fontSize: 13, color: look.muted }}>{String(i + 1).padStart(2, "0")}</span>}
          <Cover look={look} product={p} index={i} ratio={look.ratio} radius={look.radius} style={{ width: phone ? 56 : 72 }} />
          <strong style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || "Untitled"}</strong>
          {!phone && <span style={{ color: look.muted, fontSize: 14 }}>{p.maker}</span>}
          <span style={{ fontWeight: 700 }}>{p.price}</span>
        </div>
      ))}
    </div>
  );
}

/** The opening band each template has: Marquee's huge ruled masthead, Atlas's split hero, Arch's centred title… */
function Hero({ look, press, heading, phone, lead }: { look: LookPreview; press: string; heading: string; phone: boolean; lead: PreviewProduct }) {
  const s = look.style;
  const big = phone ? 40 : 84;
  const title: CSSProperties = { margin: 0, fontFamily: look.headingFont, fontWeight: look.headingWeight, lineHeight: 0.95, textTransform: look.uppercase || s === "marquee" ? "uppercase" : "none" };
  if (s === "marquee") {
    return (
      <div>
        <h2 style={{ ...title, fontSize: big * 1.2, borderBottom: `6px solid ${look.border}`, padding: "12px 0" }}>{heading}</h2>
        <div style={{ background: look.secondary, color: look.text, fontWeight: 900, fontSize: 13, letterSpacing: "0.16em", padding: "8px 0", whiteSpace: "nowrap", overflow: "hidden", textTransform: "uppercase" }}>
          {"New this week ✦ Small runs ✦ Ships in two days ✦ New this week ✦ Small runs ✦ Ships in two days ✦"}
        </div>
      </div>
    );
  }
  if (s === "atlas" || s === "mosaic") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1.1fr 1fr", gap: phone ? 16 : 40, alignItems: "center", padding: phone ? "8px 0" : "24px 0" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <h2 style={{ ...title, fontSize: big * 0.8 }}>{heading}</h2>
          <p style={{ margin: 0, color: look.muted, fontSize: phone ? 14 : 17, maxWidth: 440 }}>Made in small batches by {press}. New work every season.</p>
          <span><span style={pill(look, true)}>Shop now</span></span>
        </div>
        {!phone && <Cover look={look} product={lead} index={0} ratio={1.25} radius={look.radius} />}
      </div>
    );
  }
  if (s === "arch") {
    return (
      <div style={{ textAlign: "center", padding: phone ? "16px 0" : "40px 0", display: "grid", gap: 12, justifyItems: "center" }}>
        <span style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", color: look.muted }}>{press}</span>
        <h2 style={{ ...title, fontSize: big * 0.85, fontStyle: "italic" }}>{heading}</h2>
        <span style={{ width: 64, height: 1, background: look.border }} />
      </div>
    );
  }
  if (s === "riso") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 24, alignItems: "end", padding: phone ? "8px 0" : "16px 0" }}>
        <h2 style={{ ...title, fontSize: big, textTransform: "uppercase" }}>{heading}</h2>
        <p style={{ margin: 0, fontSize: phone ? 14 : 16, color: look.muted, borderLeft: `4px solid ${look.accent}`, paddingLeft: 12 }}>Small runs, loud ink. Printed and packed by {press}.</p>
      </div>
    );
  }
  return (
    <div style={{ padding: phone ? "8px 0" : "20px 0", display: "grid", gap: 10 }}>
      <h2 style={{ ...title, fontSize: big * 0.7 }}>{heading}</h2>
      <p style={{ margin: 0, color: look.muted, fontSize: phone ? 14 : 16 }}>New this season from {press}.</p>
    </div>
  );
}

function Header({ look, press, phone }: { look: LookPreview; press: string; phone: boolean }) {
  return (
    <>
      {look.announcement && (
        <div style={{ background: look.announcement.bg, color: look.announcement.text, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textAlign: "center", padding: "7px 12px", textTransform: "uppercase" }}>
          Free shipping on orders over $50
        </div>
      )}
      <div style={{ background: look.headerBg, color: look.headerText, borderBottom: `${look.style === "marquee" ? 3 : 1}px solid ${look.border}`, padding: phone ? "14px 16px" : "18px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <span style={{ fontFamily: look.headingFont, fontWeight: look.headingWeight, fontSize: phone ? 20 : 26, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: look.uppercase ? "uppercase" : "none" }}>{press}</span>
        {phone
          ? <span style={{ display: "flex", gap: 14, fontSize: 14, fontWeight: 700 }}><span>Bag (1)</span><span style={{ fontSize: 18, lineHeight: 1 }}>☰</span></span>
          : <span style={{ display: "flex", gap: 28, fontSize: 15 }}><span>Shop</span><span>About</span><span>Contact</span><span style={{ fontWeight: 700 }}>Bag (1)</span></span>}
      </div>
    </>
  );
}

function Footer({ look, press, phone }: { look: LookPreview; press: string; phone: boolean }) {
  const col = (head: string, items: string[]) => (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <strong style={{ color: look.footerHeading, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em" }}>{head}</strong>
      {items.map(i => <span key={i} style={{ fontSize: 14, opacity: 0.85 }}>{i}</span>)}
    </div>
  );
  return (
    <div style={{ background: look.footerBg, color: look.footerText, borderTop: `1px solid ${look.border}`, padding: phone ? "28px 16px" : "40px", display: "grid", gap: 24, gridTemplateColumns: phone ? "1fr 1fr" : "2fr 1fr 1fr 1fr" }}>
      <div style={{ display: "grid", gap: 8, gridColumn: phone ? "1 / -1" : undefined }}>
        <span style={{ fontFamily: look.headingFont, fontWeight: look.headingWeight, fontSize: 22 }}>{press}</span>
        <span style={{ fontSize: 14, opacity: 0.85 }}>News and new work, once a month.</span>
      </div>
      {col("Explore", ["Shop", "About", "Events"])}
      {col("Help", ["Shipping", "Returns", "Contact"])}
      {!phone && col("Follow", ["Instagram", "Newsletter"])}
    </div>
  );
}

function ProductPage({ look, product, phone, books }: { look: LookPreview; product: PreviewProduct; phone: boolean; books: boolean }) {
  const radius = look.style === "arch" ? "999px 999px 0 0" : look.radius;
  return (
    <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1.1fr 1fr", gap: phone ? 20 : 56, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <Cover look={look} product={product} index={0} ratio={look.ratio} radius={radius} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[1, 2, 3, 0].map(i => <Cover key={i} look={look} product={{ ...product, title: "", maker: "" }} index={i} ratio={1} radius={look.radius} />)}
        </div>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <span style={{ fontSize: 13, color: look.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{product.maker}</span>
        <h2 style={{ margin: 0, fontFamily: look.headingFont, fontWeight: look.headingWeight, fontSize: phone ? 34 : 52, lineHeight: 1, textTransform: look.uppercase ? "uppercase" : "none" }}>{product.title || "Untitled"}</h2>
        <span style={{ fontSize: 22, fontWeight: 700 }}>{product.price || "$24"}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...pill(look, false), borderWidth: 2, borderColor: look.text }}>{books ? "Paperback" : "Standard"}</span>
          <span style={pill(look, false)}>{books ? "Signed copy" : "Gift wrapped"}</span>
        </div>
        <span style={{ ...pill(look, true), width: "100%", boxSizing: "border-box", padding: "14px 18px" }}>{look.cta}</span>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: look.text }}>{books ? "A small-run edition, printed and bound by hand. Every copy is checked before it ships, and packed in recycled paper." : "Made in small batches and checked by hand before it ships, packed in recycled paper."}</p>
        <div style={{ borderTop: `1px solid ${look.border}`, paddingTop: 12, display: "grid", gap: 8, fontSize: 14 }}>
          <span>Shipping & returns</span><span style={{ color: look.muted }}>Ships in two days. Free over $50.</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The page itself, drawn at the device's width. `products` are the press's own (title and photo) or made-up ones;
 * the first eight show.
 */
export function LookStage({ look, press, device, page = "home", products, books = true }: {
  look: LookPreview; press: string; device: StageDevice; page?: StagePage; products: PreviewProduct[];
  /** A shop that sells books (sellsBooks): book words on the chips and the product page; any other shop gets plain ones. */
  books?: boolean;
}) {
  const w = useShopWords();
  useLookFonts(look);
  const phone = device === "phone";
  const list = products.slice(0, 8);
  const cols = phone ? Math.max(1, Math.min(look.columns.phone, 2)) : look.columns.desktop;
  const heading = look.heading || w("New books");
  const pad = phone ? 16 : 40;
  return (
    <div data-look-stage={look.style || "default"} style={{ width: STAGE_WIDTH[device], background: look.bg, color: look.text, fontFamily: look.bodyFont, lineHeight: 1.4 }}>
      <Header look={look} press={press} phone={phone} />
      <div style={{ padding: `${phone ? 20 : 32}px ${pad}px ${phone ? 32 : 56}px`, display: "grid", gap: phone ? 20 : 28 }}>
        {page === "product"
          ? <ProductPage look={look} product={list[0] || { title: "", photo: "" }} phone={phone} books={books} />
          : <>
            <Hero look={look} press={press} heading={heading} phone={phone} lead={list[0] || { title: "", photo: "" }} />
            {look.chips && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(books ? ["All", "Books", "Zines", "Prints", "Sale"] : ["All", "New", "Bestsellers", "Gifts", "Sale"]).map((c, i) => (
                  <span key={c} style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700, borderRadius: look.buttonRadius, border: `1px solid ${look.border}`, background: i === 0 ? look.text : "transparent", color: i === 0 ? look.bg : look.text }}>{c}</span>
                ))}
              </div>
            )}
            {look.style === "index"
              ? <Rows look={look} products={list.slice(0, phone ? 5 : 6)} phone={phone} />
              : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: phone ? 14 : look.style === "marquee" ? 12 : 28, alignItems: "start" }}>
                  {list.slice(0, cols * 2).map((p, i) => <Card key={i} look={look} product={p} index={i} phone={phone} />)}
                </div>
              )}
            <div style={{ display: "flex", justifyContent: "center" }}><span style={pill(look, false)}>See everything</span></div>
          </>}
      </div>
      <Footer look={look} press={press} phone={phone} />
    </div>
  );
}
