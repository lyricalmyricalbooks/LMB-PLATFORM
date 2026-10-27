// @ts-nocheck — mirror of the CommonJS server module (functions/emailTheme.js).
// Riso Press look for every email the shop sends: cream paper, ink text, flare-red
// accent with INK text (never white), square corners, 2px ink rules, Anton / Archivo /
// DM Mono with web-safe fallbacks. Admin-preview mirror of functions/emailTheme.js —
// emailTheme.parity.test.ts keeps the two identical.

// "light" = newsprint (cream paper, ink text); "dark" = Riso Noir (black, white text).
// Chosen in Settings › Notifications › Email branding › Email theme.
const RISO_THEMES = {
  light: { paper: "#faf6ec", card: "#ffffff", sunken: "#f0e9da", ink: "#100f0d", text: "#100f0d", muted: "#3e3a34", subtle: "#5f5950", hair: "#d9d0bd", rule: "#100f0d", accentText: "#b4271a", success: "#0a6b47" },
  dark: { paper: "#000000", card: "#100f0d", sunken: "#1c1a17", ink: "#100f0d", text: "#faf6ec", muted: "#d9d0bd", subtle: "#9b9386", hair: "#3e3a34", rule: "#faf6ec", accentText: "#ff6b55", success: "#3ccf91" },
};
const RISO = { ...RISO_THEMES.light, accent: "#e8402a" };
const risoPalette = (theme) => RISO_THEMES[theme === "dark" ? "dark" : "light"];
const LEGACY_DEFAULT_ACCENT = /^#7c3aed$/i;
const FONT_DISPLAY = "'Anton', Impact, 'Arial Narrow Bold', sans-serif";
const FONT_BODY = "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_MONO = "'DM Mono', 'Courier New', Courier, monospace";

// Only a #hex colour reaches the CSS; anything else (a typo, a stray quote) falls back to flare red.
function risoAccent(brandColor) {
  const c = String(brandColor || "").trim();
  return !/^#[0-9a-f]{3,8}$/i.test(c) || LEGACY_DEFAULT_ACCENT.test(c) ? RISO.accent : c;
}

// The email logo: an https address only, with quotes escaped so it can't break the email.
function safeLogoUrl(url) {
  const u = String(url || "").trim();
  return /^https:\/\/[^\s<>]+$/i.test(u) ? u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : "";
}

function risoButton(href, label, accent, theme) {
  const p = risoPalette(theme);
  return `<div style="margin:28px 0;"><a href="${href}" style="display:inline-block;background:${risoAccent(accent)};color:${RISO.ink};border:2px solid ${p.rule};box-shadow:3px 3px 0 ${p.rule};padding:12px 26px;text-decoration:none;font-family:${FONT_MONO};font-size:12px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;">${label}</a></div>`;
}

// Re-point the older inline-styled snippets (purple buttons, rounded cards, grey
// hairlines, generic sans-serif) at the Riso palette so every email matches.
function risoize(html, accent, theme) {
  const a = risoAccent(accent);
  const p = risoPalette(theme);
  return String(html || "")
    .replace(/font-family:\s*sans-serif;?/gi, "")
    .replace(/font-family:\s*monospace;?/gi, `font-family:${FONT_MONO};`)
    .replace(/border-radius:\s*\d+px;?/gi, "border-radius:0;")
    .replace(/box-shadow:\s*0 [^;"]*;?/gi, "")
    .replace(/background(-color)?:\s*#7c3aed;\s*color:\s*#fff(fff)?;?/gi, `background:${a};color:${RISO.ink};border:2px solid ${p.rule};`)
    .replace(/#7c3aed(10|20)/gi, p.hair)
    .replace(/#7c3aed/gi, p.accentText)
    .replace(/#16a34a/gi, p.success)
    .replace(/#f8f6ff|#f3f4f6|#f9fafb/gi, p.sunken)
    .replace(/#eeeeee|#dddddd|#e5e7eb/gi, p.hair)
    .replace(/#888888|#999999|#888\b|#999\b|#6b7280/gi, p.subtle)
    .replace(/#666666|#555555|#666\b|#555\b|#4b5563/gi, p.muted)
    .replace(/#333333|#111111|#111\b|#333\b/gi, p.text)
    .replace(/(color:\s*)#fff(fff)?\b/gi, `$1${RISO.ink}`)
    .replace(/background:\s*#fff(fff)?\b/gi, `background:${p.card}`);
}

function risoLayout(inner, { logoUrl = "", accent = "", theme = "light", year = new Date().getFullYear() } = {}) {
  const a = risoAccent(accent);
  const p = risoPalette(theme);
  const logo = safeLogoUrl(logoUrl);
  const masthead = logo
    ? `<img src="${logo}" alt="Lyricalmyrical Books" style="max-height:44px;width:auto;display:block;" />`
    : `<div style="font-family:${FONT_DISPLAY};font-size:30px;line-height:1;letter-spacing:0.01em;text-transform:uppercase;color:${p.text};">Lyricalmyrical Books</div>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="${theme === "dark" ? "dark" : "light"}">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:24px 12px; background:${p.paper}; color:${p.text}; font-family:${FONT_BODY}; font-size:15px; line-height:1.6; }
  a { color:${p.text}; }
  h1, h2, h3 { font-family:${FONT_DISPLAY}; font-weight:400; text-transform:uppercase; letter-spacing:0.01em; color:${p.text}; }
  h4 { font-family:${FONT_MONO}; font-weight:500; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:${p.subtle}; }
  table td { font-family:${FONT_BODY}; }
</style>
</head>
<body style="margin:0;padding:24px 12px;background:${p.paper};color:${p.text};font-family:${FONT_BODY};">
  <div style="max-width:600px;margin:0 auto;background:${p.card};border:2px solid ${p.rule};box-shadow:6px 6px 0 ${p.rule};">
    <div style="height:8px;background:${a};border-bottom:2px solid ${p.rule};"></div>
    <div style="padding:28px 32px 18px;border-bottom:2px solid ${p.rule};">${masthead}</div>
    <div style="padding:28px 32px;font-size:15px;line-height:1.6;color:${p.text};">${risoize(inner, a, theme)}</div>
    <div style="padding:16px 32px;border-top:2px solid ${p.rule};background:${p.sunken};font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${p.subtle};">
      &copy; ${year} Lyricalmyrical Books<!--fm-footer-extra-->
    </div>
  </div>
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


export { RISO, RISO_THEMES, risoPalette, risoAccent, safeLogoUrl, risoButton, risoize, risoLayout, placeItemsTable };
