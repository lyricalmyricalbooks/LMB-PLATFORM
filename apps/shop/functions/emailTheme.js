// Colophon bento look for every email the shop sends: a cream page, the shop's name on its accent tile (Colophon
// mint unless the shop picks a colour), the words on a white tile with round corners, ink pill buttons, Archivo / DM
// Mono with web-safe fallbacks, tables for Outlook. Mirrored for the admin preview in src/app/admin/emailTheme.ts —
// emailTheme.parity.test.ts keeps them identical. (Names keep their older riso… spelling so callers stay the same.)

// "light" = Colophon day (cream page, white tiles); "dark" = Colophon night (warm black, light words); "market" =
// Market stall (yellow paper); "index" = Index rows (grey paper). Same bento layout, the colours follow the shop design.
// Chosen in Settings › Notifications › Email branding › Email theme. `pill`/`onPill`: the button and its words.
const RISO_THEMES = {
  light: { paper: "#efede8", card: "#ffffff", sunken: "#f5f4ef", ink: "#1f1e1b", text: "#1f1e1b", muted: "#55524b", subtle: "#67635b", hair: "#e4e1da", rule: "#1f1e1b", accentText: "#17653c", success: "#17653c", pill: "#1f1e1b", onPill: "#ffffff" },
  dark: { paper: "#171614", card: "#22211e", sunken: "#2c2b27", ink: "#1f1e1b", text: "#efede8", muted: "#c9c5bb", subtle: "#a9a498", hair: "#3a3833", rule: "#efede8", accentText: "#80dba2", success: "#80dba2", pill: "#efede8", onPill: "#1f1e1b" },
  market: { paper: "#ffe14d", card: "#ffffff", sunken: "#ffd21f", ink: "#16130c", text: "#16130c", muted: "#4a4420", subtle: "#5c5420", hair: "#d9b800", rule: "#16130c", accentText: "#a80d4c", success: "#14683f", pill: "#16130c", onPill: "#ffffff" },
  index: { paper: "#f2f2ee", card: "#ffffff", sunken: "#e6e6df", ink: "#0e0e0e", text: "#0e0e0e", muted: "#3d3d39", subtle: "#5a5a55", hair: "#cfcfc7", rule: "#0e0e0e", accentText: "#3f5200", success: "#1d6b46", pill: "#0e0e0e", onPill: "#ffffff" },
};
// The default accent is Colophon's mint tile.
const RISO = { ...RISO_THEMES.light, accent: "#a9e8c6" };
const risoPalette = (theme) => (Object.prototype.hasOwnProperty.call(RISO_THEMES, theme) ? RISO_THEMES[theme] : RISO_THEMES.light);
// Older defaults (the purple, then Riso flare red) read as "not chosen", so those shops get the mint tile.
const LEGACY_DEFAULT_ACCENT = /^#(7c3aed|e8402a)$/i;
const FONT_BODY = "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_MONO = "'DM Mono', 'Courier New', Courier, monospace";

// Only a #hex colour reaches the CSS; anything else (a typo, a stray quote) falls back to mint.
function risoAccent(brandColor) {
  const c = String(brandColor || "").trim();
  return !/^#[0-9a-f]{3,8}$/i.test(c) || LEGACY_DEFAULT_ACCENT.test(c) ? RISO.accent : c;
}

// Ink or white words on the accent tile, whichever reads better.
function onAccent(hex) {
  let h = String(hex).slice(1);
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  const lin = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return (lum + 0.05) / 0.0625 >= 1.05 / (lum + 0.05) ? "#1f1e1b" : "#ffffff";
}

// The email logo: an https address only, with quotes escaped so it can't break the email.
function safeLogoUrl(url) {
  const u = String(url || "").trim();
  return /^https:\/\/[^\s<>]+$/i.test(u) ? u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : "";
}

// A pill button. A table cell carries the colour too, so Outlook (which ignores padding on links) still shows it.
function risoButton(href, label, _accent, theme) {
  const p = risoPalette(theme);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;border-collapse:separate;"><tr><td bgcolor="${p.pill}" style="background:${p.pill};border-radius:999px;"><a href="${href}" style="display:inline-block;background:${p.pill};color:${p.onPill};border-radius:999px;padding:13px 26px;text-decoration:none;font-family:${FONT_BODY};font-size:15px;font-weight:600;line-height:1.2;">${label}</a></td></tr></table>`;
}

// Re-point the older inline-styled snippets (purple buttons, grey hairlines, generic sans-serif) at the bento palette.
function risoize(html, accent, theme) {
  const p = risoPalette(theme);
  void accent;
  return String(html || "")
    .replace(/font-family:\s*sans-serif;?/gi, "")
    .replace(/font-family:\s*monospace;?/gi, `font-family:${FONT_MONO};`)
    .replace(/box-shadow:\s*0 [^;"]*;?/gi, "")
    .replace(/background(-color)?:\s*#7c3aed;\s*color:\s*#fff(fff)?;?/gi, "background:" + p.pill + ";color:\u0001pill;border-radius:999px;")
    .replace(/#7c3aed(10|20)/gi, p.hair)
    .replace(/#7c3aed/gi, p.accentText)
    .replace(/#16a34a/gi, p.success)
    .replace(/#f8f6ff|#f3f4f6|#f9fafb/gi, p.sunken)
    .replace(/#eeeeee|#dddddd|#e5e7eb|#eee\b|#ddd\b/gi, p.hair)
    .replace(/#888888|#999999|#888\b|#999\b|#6b7280/gi, p.subtle)
    .replace(/#666666|#555555|#666\b|#555\b|#4b5563/gi, p.muted)
    .replace(/#333333|#111111|#111\b|#333\b/gi, p.text)
    .replace(/(color:\s*)#0a7\b/gi, `$1${p.success}`)
    // White words stay white only right after a background colour (a button); anywhere else they would vanish on the tile.
    .replace(/(?<!background:\s*#[0-9a-f]{3,8};\s*)(color:\s*)#fff(fff)?\b/gi, `$1${p.text}`)
    .replace(/background:\s*#fff(fff)?\b/gi, `background:${p.card}`)
    .replace(/\u0001pill/g, p.onPill);
}

// The bento shell: the shop's name (or logo) on its accent tile, the words on a white tile, the footer under them.
// shopName: the shop's own name (the server's {{shop_name}}), escaped; it heads the email and signs the footer.
function risoLayout(inner, { logoUrl = "", accent = "", theme = "light", year = new Date().getFullYear(), shopName = "" } = {}) {
  const a = risoAccent(accent);
  const on = onAccent(a);
  const p = risoPalette(theme);
  const logo = safeLogoUrl(logoUrl);
  const name = String(shopName || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const masthead = logo
    ? `<img src="${logo}" alt="${name}" height="44" style="max-height:44px;width:auto;display:block;border:0;" />`
    : `<div style="font-family:${FONT_BODY};font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${on};">${name}</div>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="${theme === "dark" ? "dark" : "light"}">
<meta name="supported-color-schemes" content="${theme === "dark" ? "dark" : "light"}">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${p.paper}; color:${p.text}; font-family:${FONT_BODY}; font-size:15px; line-height:1.6; }
  a { color:${p.text}; }
  h1, h2, h3 { font-family:${FONT_BODY}; font-weight:700; letter-spacing:-0.01em; color:${p.text}; }
  h4 { font-family:${FONT_MONO}; font-weight:500; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${p.subtle}; }
  table td { font-family:${FONT_BODY}; }
  @media (max-width:520px) { .bento-tile { padding:22px 20px !important; border-radius:20px !important; } .bento-wrap { padding:14px 10px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${p.paper};color:${p.text};font-family:${FONT_BODY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="background:${p.paper};">
<tr><td class="bento-wrap" align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-collapse:separate;">
<tr><td class="bento-tile" bgcolor="${a}" style="background:${a};border-radius:24px;padding:26px 32px;">${masthead}</td></tr>
<tr><td style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>
<tr><td class="bento-tile" bgcolor="${p.card}" style="background:${p.card};border-radius:24px;padding:32px;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${p.text};">${risoize(inner, a, theme)}</td></tr>
<tr><td align="center" style="padding:18px 12px 0;font-family:${FONT_MONO};font-size:11px;line-height:1.6;letter-spacing:0.04em;color:${p.subtle};">&copy; ${year} ${name}<!--fm-footer-extra--></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// The order table goes where {{items_table}} sits in the (already line-broken) body; a body
// without the placeholder gets the table under the button. Never both.
function placeItemsTable(bodyHtml, tableHtml) {
  const token = /\{\{\s*items_table\s*\}\}/g;
  const table = String(tableHtml || "").replace(/\s*\n\s*/g, " ");
  if (token.test(bodyHtml)) return { body: String(bodyHtml).replace(token, () => table), after: "" };
  return { body: String(bodyHtml), after: table };
}

module.exports = { RISO, RISO_THEMES, risoPalette, risoAccent, onAccent, safeLogoUrl, risoButton, risoize, risoLayout, placeItemsTable };
