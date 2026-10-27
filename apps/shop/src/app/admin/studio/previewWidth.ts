// How wide Studio's desktop preview screen is. The canvas used to be fixed at 1200px, so any
// Style › Layout & spacing › Content width above ~1150px looked identical in the preview (the
// column already filled the screen). The owner can now pick a wider desktop screen, and Studio
// widens it by itself when a width setting wouldn't fit. Pure, so it is tested on its own.

export const DESKTOP_WIDTHS = [1200, 1440, 1920, 2560] as const;
export type DesktopWidth = typeof DESKTOP_WIDTHS[number];

/** Labels for the preview's Screen width picker. */
export const DESKTOP_WIDTH_LABELS: Record<DesktopWidth, string> = {
  1200: "Laptop (1200px)",
  1440: "Large laptop (1440px)",
  1920: "Big monitor (1920px)",
  2560: "Extra-wide monitor (2560px)",
};

/** Content columns keep 24px of side padding on each side (`px-6`). */
export const SIDE_PADDING = 48;

/** Style keys whose value is a column width in px that the preview screen has to fit. */
export const WIDTH_KEYS = new Set(["containerWidth", "catalogHeaderWidth"]);

export const isDesktopWidth = (v: any): v is DesktopWidth => DESKTOP_WIDTHS.includes(v);

/**
 * The desktop screen to show after a width setting changed: the current one when the column fits
 * (never narrows by itself), else the smallest wider screen that fits it (the widest if none does).
 */
export function screenForWidth(current: DesktopWidth, columnWidth: number): DesktopWidth {
  const need = Number(columnWidth) + SIDE_PADDING;
  if (!Number.isFinite(need) || need <= current) return current;
  return DESKTOP_WIDTHS.find(w => w > current && w >= need) ?? DESKTOP_WIDTHS[DESKTOP_WIDTHS.length - 1];
}

/** True when a column this wide shows the same as a narrower one on this screen (it fills it). */
export const fillsScreen = (screen: number, columnWidth: number) => Number(columnWidth) + SIDE_PADDING > screen;
