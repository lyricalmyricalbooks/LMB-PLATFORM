import type { SiteSettings } from "./types";
import { RISO_NOIR_ID, RISO_NOIR_TOKENS } from "./risoNoir";

// Stock cover shown for a book with no photo — replaceable in Studio › Style › Product cards & grid.
export const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1763747996545-8905244bc31a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg";

// Social links used until the owner saves their own (Studio › Style › Footer › Social links).
/** No social account is invented for a shop: the link appears once the owner adds theirs (Studio › Style › Footer & social links). */
/** The made-up account the starting design used to carry; a shop still showing it is read as having none. */
export const PLACEHOLDER_INSTAGRAM = "https://www.instagram.com/yourpress";

export const CATEGORIES = ["PUBLICATIONS", "ZINES", "IMPRINT", "OUT OF PRINT"] as const;
/** The starting menu before 14 November 2026: still recognised as untouched (admin/sells.ts). */
export const LEGACY_CATEGORIES = ["PUBLICATIONS", "EPHEMERA", "IMPRINT", "OUT OF PRINT"] as const;

export const DEFAULT_SETTINGS: SiteSettings = {
  // First paint (before Firestore answers) already wears the Riso Noir tokens.
  design: { ...RISO_NOIR_TOKENS, themeLibraryPreset: RISO_NOIR_ID } as any,
};

export const SITE_CACHE_KEY = "site-bootstrap-v1";

/** The image shown for a book with no photo: the owner's choice (Studio), else the stock cover. */
export const placeholderImage = (design?: any): string => design?.placeholderImageUrl || DEFAULT_IMAGE;
