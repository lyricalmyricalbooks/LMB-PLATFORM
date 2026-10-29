// The walkthrough's start page (`/`, plan 9.11): every page of the platform on one page of links, as the platform owner
// and as a press, with who each link signs in as and what to try there. The links to the shop and the stockroom go to
// `npm run demo` (demo/config.js), which runs beside the walkthrough (`npm run walkthrough -- --with-demo` starts both).
import { PORTS, url } from "../demo/config.js";

const DEMO = (path, port = PORTS.shop) => url(port, path);

/**
 * The start page's sections. Each link: `name`, `href`, `who` (who it signs in as, or null), `try` (what to look at).
 * `demo: true` marks a link served by `npm run demo`, not by the walkthrough. A walkthrough link names its person with
 * `?as=` so it opens as them whoever signed in last; the control room always opens as the platform owner.
 */
export const START_SECTIONS = Object.freeze([
  {
    id: "owner",
    title: "As the platform owner",
    intro: "You, running the platform. The control room signs you in as admin@example.com with the two-step sign-in already done; the real one asks for a code from your authenticator app.",
    links: [
      { name: "Control room", href: "/control/", who: "admin@example.com", try: "Today: the money coming in, shops by state and what needs you. Every page is in the ink menu on the left (a drawer on a phone)." },
      { name: "Shops and a shop's record", href: "/control/#shops", who: "admin@example.com", try: "Five made-up presses. Open Moth Press for its record: plan, billing, the Google steps, the per-order fee and the closing dates. View this shop asks for a reason; Make changes asks twice, and both go in the shop's log." },
      { name: "Your test shop", href: "/control/#test-shop", who: "admin@example.com", try: "On Today: opens the demo shop and its admin (start the demo first) and puts its sample books back to 5 copies." },
      { name: "Support, repairs and account recovery", href: "/control/#support", who: "admin@example.com", try: "Questions from presses to answer, two problems to fix in Repairs, and one person asking to move their account to a new email." },
      { name: "Sign-ups and the waitlist", href: "/control/#signups", who: "admin@example.com", try: "Three people on the list, one already invited. Invite another and they skip the daily line." },
      { name: "Prices, switches and records", href: "/control/#settings", who: "admin@example.com", try: "The daily cap, the plans and prices and the founding offer; then Switches, Emergency payments, Run book, the Breach register and the Activity log in the menu." },
    ],
  },
  {
    id: "press",
    title: "As a press, before and after signing up",
    intro: "A press finding the platform, signing up and paying for its plan. Nothing is charged: payments are pretend.",
    links: [
      { name: "Waitlist", href: "/waitlist/", who: null, try: "The plans and Start your free trial. Joining the waitlist keeps your email only in this walkthrough." },
      { name: "Sign up", href: "/signup/?as=newcomer@example.com", who: "newcomer@example.com", try: "Continue with Google, answer the questions and pick a plan. The new shop is made in about a minute, then shows on the account page." },
      { name: "Your shops (the account page)", href: "/account/?as=owner@example.com", who: "owner@example.com", try: "Three made-up presses: one on its trial, one paused, one paying. Invite someone to help with a shop, or open its Plan & billing." },
      { name: "Plan & billing on a free trial", href: "/account/billing?shop=moth-press&as=owner@example.com", who: "owner@example.com", try: "Moth Press, on its trial with no card yet. Change the plan, or press Add a card." },
      { name: "Plan & billing when paused", href: "/account/billing?shop=paper-wasp&as=owner@example.com", who: "owner@example.com", try: "Paper Wasp Press, paused until a card is added. Add a card: the page that opens takes the test card, and the shop opens again." },
      { name: "Plan & billing when paying", href: "/account/billing?shop=fieldnote&as=owner@example.com", who: "owner@example.com", try: "Fieldnote Editions, paying monthly: its card, two paid invoices and the next bill." },
      { name: "Help", href: "/help/", who: null, try: "The answers the pages link to, and what support includes." },
      { name: "Terms", href: "/terms/", who: null, try: "The terms and the privacy policy a press agrees to at sign-up." },
      { name: "Service status", href: "/status/", who: null, try: "Whether shops, checkout and backups are working, counted over the walkthrough's shops." },
    ],
  },
  {
    id: "shop",
    title: "Inside a press's shop and stockroom",
    intro: "The press's own website, its admin and its stockroom. These come from npm run demo, so start it too (or start both at once with npm run walkthrough -- --with-demo). In the admin or the stockroom, Sign in with Google and pick owner@example.com (Demo Owner).",
    links: [
      { name: "The shop", href: DEMO("/"), demo: true, who: null, try: "The storefront a shopper sees, with the test books. Add one to the bag and go to checkout." },
      { name: "A book page", href: DEMO("/books/test-book-one"), demo: true, who: null, try: "Test Book One: 5 left. Its stock follows the stockroom." },
      { name: "The admin", href: DEMO("/admin"), demo: true, who: "owner@example.com", try: "Orders, books and settings. Settings › Taxes › Start from a preset; Settings › General › Your web address; the URL redirects card; the email sender preview with the press's name." },
      { name: "Practice order and test sale", href: DEMO("/admin"), demo: true, who: "owner@example.com", try: "While the shop is private, Try a practice order: the checkout takes the test card for an hour and the order is kept out of the reports. Then refund it." },
      { name: "Studio (the designer)", href: DEMO("/admin#designer"), demo: true, who: "owner@example.com", try: "Change the look and the words of the shop, then publish." },
      { name: "The stockroom", href: DEMO("/", PORTS.stockroom), demo: true, who: "owner@example.com", try: "The same books and their copies. Signed out, it says so; changes stay after the demo restarts." },
      { name: "As a brand-new press", href: DEMO("/admin"), demo: true, who: "owner@example.com", try: "Start the demo with npm run demo -- --new-press: the admin opens on Choose your look, then Set up your shop." },
    ],
  },
]);

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const link = (item) => `<li class="card">
  <h3><a href="${escape(item.href)}"${item.demo ? ' target="_blank" rel="noopener"' : ""}>${escape(item.name)}</a></h3>
  <p class="cp-who">${item.who ? `Signs in as ${escape(item.who)}` : "No sign-in"}${item.demo ? " · needs npm run demo" : ""}</p>
  <p class="hint">${escape(item.try)}</p>
</li>`;

/** The sample world at a glance: the made-up presses and the waitlist the walkthrough starts with. */
function ledger(presses, waitlist) {
  if (!presses.length) return "";
  const cells = [
    ["Sample presses", presses.length, presses.map((p) => p.pressName).join(", ")],
    ...presses.map((p) => [p.pressName, p.plan === "both" ? "Both" : p.plan === "shop" ? "Shop" : "Stockroom", p.note]),
    ["Waitlist", waitlist.length, "people waiting for an invite"],
  ];
  return `<div class="cp-ledger" style="--n:${cells.length}">${cells.map(([label, value, foot]) => `<div><span class="cp-kicker">${escape(label)}</span><b>${escape(value)}</b><em>${escape(foot)}</em></div>`).join("")}</div>`;
}

/** The start page's HTML. `presses` and `waitlist` are the sample world it starts with (server.js). */
export function startPage({ presses = [], waitlist = [] } = {}) {
  return `<!doctype html>
<html lang="en" class="rp cp-page">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Walkthrough · Colophon</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&family=DM+Mono&display=swap">
<link rel="stylesheet" href="/look/adminThemes.css">
<link rel="stylesheet" href="/look/pressroom.css">
<link rel="stylesheet" href="/look/platform-pages.css">
<script src="/look/platform-look.js"></script>
</head>
<body class="cp">
<header class="cp-mast"><div class="cp-wrap"><span class="cp-word">Colophon<small>walkthrough</small></span></div></header>
<main id="main">
  <div class="cp-wrap cp-start-page">
    <div class="mark">Colophon · walkthrough</div>
    <h1 class="cp-title">Walk through the platform</h1>
    <p class="cp-lede">Every page of the platform on this computer, as the platform owner and as a press. The sign-ins are made-up people and the money is pretend, so try anything.</p>
    <div class="cp-alertline" data-tone="info" role="note"><p><b>Nothing here is real.</b> Nothing is saved, sent or charged, and nothing reaches a real shop, Google account or bank. Stop the walkthrough and everything made in it is forgotten.</p></div>
    ${ledger(presses, waitlist)}
${START_SECTIONS.map((section) => `  <section id="${section.id}">
  <h2 class="cp-h2">${escape(section.title)}</h2>
  <p class="hint">${escape(section.intro)}</p>
  <ul class="cp-grid3 cp-links-grid">
${section.links.map(link).join("\n")}
  </ul>
  </section>`).join("\n")}
    <p class="hint">To be someone else on a walkthrough page, add <code>?as=name@example.com</code> to its address.</p>
  </div>
</main>
</body>
</html>
`;
}
