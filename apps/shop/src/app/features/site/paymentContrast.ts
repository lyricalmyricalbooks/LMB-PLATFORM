/** Stripe receives resolved CSS colours; protect payment text from unreadable Studio pairs. */
// `dark`/`light` are the fallback inks (callers may pass theme colours); plain black/white otherwise.
export function readablePaymentText(background: string, text: string, dark?: string, light?: string): string {
  const luminance = (color: string) => {
    const channels = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!channels) return null;
    const linear = channels.slice(1, 4).map(value => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const bg = luminance(background), fg = luminance(text);
  if (bg == null || fg == null) return text;
  if ((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5) return text;
  return (bg + 0.05) / 0.05 >= 1.05 / (bg + 0.05) ? (dark || "#000000") : (light || "#ffffff");
}
