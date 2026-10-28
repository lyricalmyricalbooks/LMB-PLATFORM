// Placeholder covers for the demo books, drawn here so the demo needs no downloads: a flat ink block with the title, in
// the Riso Press inks.
const INKS = ["#e8463a", "#2f5fd0", "#f2c230", "#1f9e6e", "#e86fa6"];

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** An SVG cover (600 × 800) for one book. `index` picks the ink. */
export function coverSvg(title, index = 0) {
  const ink = INKS[Math.abs(index) % INKS.length];
  const words = escape(title).toUpperCase().split(" ");
  const lines = words.map((word, i) => `<text x="60" y="${420 + i * 86}" font-family="Anton, Impact, sans-serif" font-size="80" fill="#14110d">${word}</text>`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">`,
    `<rect width="600" height="800" fill="#f4efe6"/>`,
    `<rect x="40" y="40" width="520" height="300" fill="${ink}"/>`,
    `<rect x="40" y="40" width="520" height="720" fill="none" stroke="#14110d" stroke-width="6"/>`,
    ...lines,
    `<text x="60" y="730" font-family="monospace" font-size="24" fill="#14110d">DEMO PRESS · NOT A REAL BOOK</text>`,
    `</svg>`,
  ].join("");
}
