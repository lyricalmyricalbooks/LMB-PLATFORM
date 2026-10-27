// One set of screen-size breakpoints for every Studio "phone / tablet / desktop" setting —
// sections, blocks and built-in page elements must switch layout at the same width.
export const PHONE_MAX = 767;
export const TABLET_MAX = 1023;

/** Media queries for the three Studio devices, as disjoint ranges. */
export const DEVICE_MEDIA = {
  desktop: `(min-width:${TABLET_MAX + 1}px)`,
  tablet: `(min-width:${PHONE_MAX + 1}px) and (max-width:${TABLET_MAX}px)`,
  mobile: `(max-width:${PHONE_MAX}px)`,
} as const;

/** "Up to" queries: tablet values also apply on phones unless a phone value overrides them. */
export const UP_TO = { tablet: `(max-width:${TABLET_MAX}px)`, mobile: `(max-width:${PHONE_MAX}px)` } as const;

/** Section spacing keys and their per-device names (`mobilePaddingTop`, `tabletGap`…). */
export const PADDING_KEYS = ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"];
export const GAP_KEYS = ["gap", "gridGap", "rowGap", "navGap"];
export type Device = "desktop" | "tablet" | "mobile";
export const spacingKey = (key: string, device: Device) => device === "desktop" ? key : device + key[0].toUpperCase() + key.slice(1);
