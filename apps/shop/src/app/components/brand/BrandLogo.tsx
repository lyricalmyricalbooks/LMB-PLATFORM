import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BRAND_LOGOS } from "./brandLogos";
import "./brandLogo.css";

// Partner company logos (Google, Stripe, Square, QuickBooks, Instagram …), drawn from the companies' own artwork in
// shared/brand-logos (sources, owners and rules in its README). Every logo sits on the same white tile at one of three
// sizes, so it keeps its own colours and clear space in every admin look, by day and by night. Never recolour, stretch
// or redraw one: add its SVG to shared/brand-logos instead.

export type BrandId = keyof typeof BRAND_LOGOS;
export type BrandLogoSize = "sm" | "md" | "lg";

export function isBrandId(id: unknown): id is BrandId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(BRAND_LOGOS, id);
}

export function brandName(id: BrandId): string {
  return BRAND_LOGOS[id].name;
}

/** Just the mark, no tile: for places that set their own frame (the Google sign-in button). */
export function BrandMark({ id, size = 18, label }: { id: BrandId; size?: number; label?: string }) {
  const logo = BRAND_LOGOS[id];
  return (
    <svg className="brand-mark" viewBox={logo.viewBox} width={size} height={size} fill={logo.color ?? undefined}
      data-brand={id} focusable="false" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      dangerouslySetInnerHTML={{ __html: logo.body }} />
  );
}

/** The artwork to draw in the company's own colours: its full-colour file when it has one, else its coloured mark. */
export function colourArt(logo: { viewBox: string; body: string; color: string | null; full?: { viewBox: string; body: string } }) {
  return logo.full ? { viewBox: logo.full.viewBox, body: logo.full.body, fill: undefined } : { viewBox: logo.viewBox, body: logo.body, fill: logo.color ?? undefined };
}

/**
 * A company's logo on its tile. Decorative by default (the company's name is in the text beside it); pass `label`
 * when the logo stands alone.
 */
export function BrandLogo({ id, size = "md", label, className }: { id: BrandId; size?: BrandLogoSize; label?: string; className?: string }) {
  const logo = BRAND_LOGOS[id];
  const art = colourArt(logo);
  return (
    <span className={`brand-logo brand-logo--${size}${className ? ` ${className}` : ""}`} data-brand={id}
      style={logo.background ? { background: logo.background, borderColor: logo.background } : undefined}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <svg viewBox={art.viewBox} fill={art.fill} focusable="false" aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: art.body }} />
    </span>
  );
}

/** A row of logos, e.g. "Works with" lines. Each logo is named for screen readers. */
export function BrandLogoRow({ ids, size = "sm", label }: { ids: BrandId[]; size?: BrandLogoSize; label?: string }) {
  return (
    <span className="brand-logo-row" {...(label ? { role: "group", "aria-label": label } : {})}>
      {ids.map((id) => <BrandLogo key={id} id={id} size={size} label={BRAND_LOGOS[id].name} />)}
    </span>
  );
}

/** A heading line with the company's logo in front, for cards about one company. */
export function BrandTitle({ id, children, size = "md" }: { id: BrandId; children: ReactNode; size?: BrandLogoSize }) {
  return (
    <span className="brand-title">
      <BrandLogo id={id} size={size} />
      <span>{children}</span>
    </span>
  );
}

/**
 * Google's own "Sign in with Google" button, drawn to Google's branding rules: the four-colour G on white, Google's
 * grey outline and dark text (Google's dark version at night), the words "Sign in with Google" or "Continue with
 * Google". https://developers.google.com/identity/branding-guidelines
 */
export function GoogleSignInButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" {...rest} className={`gsi-button${className ? ` ${className}` : ""}`}>
      <span className="gsi-button-g"><BrandMark id="google" size={20} /></span>
      <span className="gsi-button-text">{children}</span>
    </button>
  );
}
