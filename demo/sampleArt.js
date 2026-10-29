// Pictures for the sample press's products, drawn here so the demo needs no downloads and uses nobody's photos: book
// covers in a few print styles, and simple product shots for the merch (a tote, a shirt, a poster, a pin). Each is an
// SVG, 1200 × 1500, on a soft paper background. Made up, like everything in the sample press.

const PAPER = "#efe9dd";
const INK = "#14110d";

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const svg = (body, bg = PAPER) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="${bg}"/>${body}</svg>`;
const text = (x, y, size, value, { fill = INK, family = "Anton, Impact, sans-serif", anchor = "start", weight = 400, spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" fill="${fill}" text-anchor="${anchor}">${escape(value)}</text>`;
const MONO = "DM Mono, ui-monospace, monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

// A book standing on the paper, with a soft shadow and a spine edge; `face` is the cover drawn in a 700 × 960 box.
function book(face, { bg = PAPER } = {}) {
  return svg(`<g transform="translate(250 270)">
    <rect x="18" y="24" width="700" height="960" fill="${INK}" opacity=".18"/>
    <svg width="700" height="960" viewBox="0 0 700 960" overflow="hidden">${face}</svg>
    <rect x="0" y="0" width="22" height="960" fill="${INK}" opacity=".12"/>
    <rect x="0" y="0" width="700" height="960" fill="none" stroke="${INK}" stroke-width="3"/>
  </g>`, bg);
}

/** The cover styles: each takes `{ title, author, ink, ink2 }` and draws a 700 × 960 face. */
const COVERS = {
  // A photobook: a big duotone "photo" of a horizon, the title small underneath.
  horizon: ({ title, author, ink, ink2 }) => `<rect width="700" height="960" fill="#f7f3ea"/>
    <rect x="60" y="60" width="580" height="640" fill="${ink}"/>
    <rect x="60" y="430" width="580" height="270" fill="${ink2}"/>
    <circle cx="470" cy="300" r="90" fill="#f7f3ea" opacity=".85"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="60" y="${452 + i * 40}" width="580" height="6" fill="#f7f3ea" opacity="${0.35 - i * 0.05}"/>`).join("")}
    ${text(60, 790, 54, title.toUpperCase(), { spacing: 2 })}
    ${text(60, 850, 26, author, { family: MONO })}`,
  // A zine: a bold half-tone of dots and a stamped title.
  dots: ({ title, author, ink, ink2 }) => `<rect width="700" height="960" fill="${ink2}"/>
    ${Array.from({ length: 14 }, (_, r) => Array.from({ length: 10 }, (_, c) => `<circle cx="${50 + c * 67}" cy="${60 + r * 64}" r="${6 + ((r * 3 + c * 5) % 9) * 2.4}" fill="${ink}" opacity=".9"/>`).join("")).join("")}
    <rect x="40" y="610" width="620" height="230" fill="#f7f3ea"/>
    ${text(70, 720, 96, title.toUpperCase())}
    ${text(72, 800, 26, author, { family: MONO })}`,
  // Poetry: quiet type, a single moth-like mark.
  quiet: ({ title, author, ink }) => `<rect width="700" height="960" fill="#f4f0e6"/>
    <g transform="translate(350 360)" fill="${ink}">
      <path d="M0 -10 C-60 -120 -190 -110 -170 -10 C-160 50 -60 60 0 10 Z"/>
      <path d="M0 -10 C60 -120 190 -110 170 -10 C160 50 60 60 0 10 Z"/>
      <path d="M0 10 C-40 60 -120 120 -90 150 C-60 170 -20 90 0 30 Z" opacity=".75"/>
      <path d="M0 10 C40 60 120 120 90 150 C60 170 20 90 0 30 Z" opacity=".75"/>
      <rect x="-6" y="-40" width="12" height="120" rx="6" fill="${INK}"/>
    </g>
    ${text(350, 700, 58, title, { family: SERIF, anchor: "middle" })}
    ${text(350, 760, 26, author, { family: MONO, anchor: "middle", spacing: 2 })}`,
  // Essays: stacked colour bands and a big title.
  bands: ({ title, author, ink, ink2 }) => `<rect width="700" height="960" fill="#f7f3ea"/>
    <rect y="0" width="700" height="220" fill="${ink}"/>
    <rect y="220" width="700" height="110" fill="${ink2}"/>
    <rect y="330" width="700" height="40" fill="${INK}"/>
    ${title.toUpperCase().split(" ").map((word, i) => text(50, 520 + i * 110, 112, word)).join("")}
    ${text(52, 900, 26, author, { family: MONO })}`,
  // A field guide: a grid of little specimens.
  specimens: ({ title, author, ink, ink2 }) => `<rect width="700" height="960" fill="#ece5d6"/>
    ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => {
      const x = 130 + c * 220;
      const y = 150 + r * 190;
      const fill = (r + c) % 2 ? ink : ink2;
      return `<g transform="translate(${x} ${y}) scale(${0.45 + ((r + c) % 3) * 0.08})" fill="${fill}"><path d="M0 0 C-60 -110 -180 -100 -160 0 C-150 50 -60 50 0 10 Z"/><path d="M0 0 C60 -110 180 -100 160 0 C150 50 60 50 0 10 Z"/><rect x="-6" y="-30" width="12" height="90" rx="6" fill="${INK}"/></g>`;
    }).join("")).join("")}
    <rect x="40" y="700" width="620" height="200" fill="none" stroke="${INK}" stroke-width="4"/>
    ${text(70, 790, 54, title.toUpperCase())}
    ${text(72, 850, 24, author, { family: MONO })}`,
  // Night: a dark cover with a lit window grid.
  night: ({ title, author, ink }) => `<rect width="700" height="960" fill="#1b1d2b"/>
    ${Array.from({ length: 6 }, (_, r) => Array.from({ length: 8 }, (_, c) => ((r * 7 + c * 3) % 5 === 0 ? `<rect x="${70 + c * 72}" y="${110 + r * 80}" width="44" height="52" fill="${ink}"/>` : `<rect x="${70 + c * 72}" y="${110 + r * 80}" width="44" height="52" fill="#2b2f45"/>`)).join("")).join("")}
    ${text(70, 760, 104, title.toUpperCase(), { fill: "#f7f3ea" })}
    ${text(72, 830, 26, author, { family: MONO, fill: "#f7f3ea" })}`,
  // A screen: a plain digital edition.
  screen: ({ title, author, ink, ink2 }) => `<rect width="700" height="960" fill="${ink2}"/>
    <rect x="70" y="90" width="560" height="560" fill="${ink}"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M70 ${560 - i * 60} Q 350 ${420 - i * 70} 630 ${560 - i * 60}" stroke="#f7f3ea" stroke-width="6" fill="none" opacity="${0.9 - i * 0.18}"/>`).join("")}
    ${text(70, 770, 76, title.toUpperCase())}
    ${text(72, 830, 26, author, { family: MONO })}`,
};

/** A cover for one book. `style` is one of the COVERS keys. */
export function coverArt({ style, title, author, ink, ink2 }) {
  return book(COVERS[style]({ title, author, ink, ink2 }));
}

/** The back of a book: a short blurb and a barcode, for a second photo. */
export function backArt({ blurb, ink }) {
  const words = blurb.split(" ");
  const lines = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && `${last} ${word}`.length <= 30) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return book(`<rect width="700" height="960" fill="#f7f3ea"/><rect width="700" height="24" fill="${ink}"/>
    ${lines.slice(0, 9).map((line, i) => text(60, 150 + i * 52, 34, line, { family: SERIF })).join("")}
    <g transform="translate(420 760)">${Array.from({ length: 38 }, (_, i) => `<rect x="${i * 6}" y="0" width="${i % 3 ? 2 : 4}" height="120" fill="${INK}"/>`).join("")}</g>`);
}

/** A tote bag in `colour` with a printed mark in `ink`. */
export function toteArt({ colour, ink, label }) {
  return svg(`<g transform="translate(250 220)">
    <path d="M200 260 C200 40 500 40 500 260" fill="none" stroke="${colour}" stroke-width="34"/>
    <path d="M200 260 C200 40 500 40 500 260" fill="none" stroke="${INK}" stroke-width="3" opacity=".25"/>
    <rect x="20" y="16" width="700" height="1020" fill="${INK}" opacity=".12" transform="translate(0 250)"/>
    <rect x="0" y="250" width="700" height="1000" fill="${colour}" stroke="${INK}" stroke-width="3"/>
    <g transform="translate(350 640)" fill="${ink}"><path d="M0 0 C-80 -160 -250 -150 -225 0 C-210 70 -80 70 0 15 Z"/><path d="M0 0 C80 -160 250 -150 225 0 C210 70 80 70 0 15 Z"/><rect x="-8" y="-50" width="16" height="150" rx="8" fill="${INK}"/></g>
    ${text(350, 920, 60, label, { anchor: "middle", fill: ink })}
  </g>`);
}

/** A T-shirt in `colour` with a printed panel. */
export function shirtArt({ colour, ink, label }) {
  const outline = colour === "#1b1b1b" ? "#f7f3ea" : INK;
  return svg(`<g transform="translate(150 260)">
    <path d="M300 0 L120 70 L0 300 L150 360 L190 290 L190 1000 L710 1000 L710 290 L750 360 L900 300 L780 70 L600 0 C570 80 330 80 300 0 Z" fill="${INK}" opacity=".12" transform="translate(16 22)"/>
    <path d="M300 0 L120 70 L0 300 L150 360 L190 290 L190 1000 L710 1000 L710 290 L750 360 L900 300 L780 70 L600 0 C570 80 330 80 300 0 Z" fill="${colour}" stroke="${outline}" stroke-width="4"/>
    <rect x="310" y="250" width="280" height="340" fill="${ink}"/>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) => `<rect x="${330 + c * 66}" y="${270 + r * 58}" width="40" height="40" fill="${(r + c) % 3 ? "#2b2f45" : "#f2c230"}"/>`).join("")).join("")}
    ${text(450, 660, 46, label, { anchor: "middle", fill: outline })}
  </g>`);
}

/** A poster pinned flat: a big risograph print in two inks. */
export function posterArt({ title, ink, ink2 }) {
  return svg(`<g transform="translate(180 120)">
    <rect x="20" y="24" width="840" height="1200" fill="${INK}" opacity=".15"/>
    <rect width="840" height="1200" fill="#f7f3ea" stroke="${INK}" stroke-width="3"/>
    <rect x="60" y="60" width="720" height="760" fill="${ink2}"/>
    <circle cx="560" cy="300" r="150" fill="#f7f3ea" opacity=".9"/>
    <path d="M60 640 Q 260 520 420 620 T 780 600 L 780 820 L 60 820 Z" fill="${ink}"/>
    <path d="M60 720 Q 300 640 480 720 T 780 700 L 780 820 L 60 820 Z" fill="${INK}" opacity=".35"/>
    ${text(60, 960, 110, title.toUpperCase())}
    ${text(62, 1040, 30, "RISOGRAPH PRINT · TWO INKS", { family: MONO })}
  </g>`);
}

/** An enamel pin on a backing card. */
export function pinArt({ ink, ink2 }) {
  return svg(`<g transform="translate(300 250)">
    <rect x="16" y="20" width="600" height="900" fill="${INK}" opacity=".12"/>
    <rect width="600" height="900" fill="#f7f3ea" stroke="${INK}" stroke-width="3"/>
    <circle cx="300" cy="70" r="26" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
    <g transform="translate(300 450) scale(1.25)">
      <path d="M0 0 C-80 -160 -250 -150 -225 0 C-210 70 -80 70 0 15 Z" fill="${ink}" stroke="#c9a227" stroke-width="10"/>
      <path d="M0 0 C80 -160 250 -150 225 0 C210 70 80 70 0 15 Z" fill="${ink}" stroke="#c9a227" stroke-width="10"/>
      <circle cx="-120" cy="-30" r="28" fill="${ink2}"/><circle cx="120" cy="-30" r="28" fill="${ink2}"/>
      <rect x="-12" y="-60" width="24" height="170" rx="12" fill="#c9a227"/>
    </g>
    ${text(300, 820, 40, "MOTH PRESS", { anchor: "middle", spacing: 6 })}
  </g>`);
}
