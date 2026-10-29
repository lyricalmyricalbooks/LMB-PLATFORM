// The walkthrough's start page (`/`, plan 9.11): every page of the platform on one page of links, in the order to walk
// them: as a shopper, as a press in its admin and stockroom, as a press joining, and as the platform owner, with who
// each link signs in as and what to try there. The links to the shop and the stockroom go to
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
    id: "shopper",
    title: "1. As a shopper, buying from a press",
    intro: "Moth Press, a made-up press, on the real shop that goes live: the same pages, checkout and emails. Pay with the practice card 4242 4242 4242 4242 (any future date, any 3 digits); no money moves and every email lands in the practice inbox. These come from npm run demo, so start it too (npm run walkthrough:all starts both).",
    links: [
      { name: "The shop's front page", href: DEMO("/"), demo: true, who: null, try: "Books, zines, prints and merch. Use the menu at the top to see one kind at a time." },
      { name: "A photobook", href: DEMO("/books/low-tide-almanac"), demo: true, who: null, try: "Low Tide Almanac: two photos, reviews, the artist's bio, and Add to bag." },
      { name: "A T-shirt in sizes and colours", href: DEMO("/books/night-buses-t-shirt"), demo: true, who: null, try: "Pick a size and a colour: the photo and the stock follow. XL in Bone is sold out." },
      { name: "A print in two sizes", href: DEMO("/books/low-tide-print"), demo: true, who: null, try: "A3 and A2 cost different amounts." },
      { name: "Sold out, and a pre-order", href: DEMO("/books/field-guide-to-small-moths"), demo: true, who: null, try: "The field guide is sold out: ask to be told when it's back. Harbour Lights (in Photobooks) is a pre-order." },
      { name: "Bag and checkout", href: DEMO("/checkout"), demo: true, who: null, try: "Add things to the bag first. Try the code WELCOME10, then pay with 4242 4242 4242 4242. 4000 0000 0000 0002 shows a declined card." },
      { name: "The emails the shopper gets", href: DEMO("/inbox", PORTS.practice), demo: true, who: null, try: "The order confirmation, the shipping and refund emails, and your new-order alerts, as they look in a mailbox." },
      { name: "Track an order", href: DEMO("/track"), demo: true, who: null, try: "Use the order number and email from an order confirmation in the practice inbox." },
      { name: "The shopper's account", href: DEMO("/account"), demo: true, who: null, try: "Sign in with Google and pick shopper@example.com (or add any made-up address): past orders and saved addresses." },
    ],
  },
  {
    id: "shop",
    title: "2. As the press, in its website admin",
    intro: "Everything the press runs its shop with. In the admin, Sign in with Google and pick owner@example.com (Demo Owner). Four sample orders are already there: one shipped, one to send, one refunded and one asking to cancel.",
    links: [
      { name: "Overview", href: DEMO("/admin"), demo: true, who: "owner@example.com", try: "Sales, orders to send and what needs you today." },
      { name: "Orders", href: DEMO("/admin#orders"), demo: true, who: "owner@example.com", try: "Open Jun Park's order to pack and ship it, Tom Reyes's to answer the cancel request, or any paid order to refund it." },
      { name: "Products", href: DEMO("/admin#catalog"), demo: true, who: "owner@example.com", try: "Edit a book or the T-shirt's sizes and colours. Add a product, or import a list of products from a spreadsheet." },
      { name: "Inventory", href: DEMO("/admin#inventory"), demo: true, who: "owner@example.com", try: "Stock for every product and every size." },
      { name: "Customers", href: DEMO("/admin#customers"), demo: true, who: "owner@example.com", try: "Who bought what." },
      { name: "Discounts and reviews", href: DEMO("/admin#discounts"), demo: true, who: "owner@example.com", try: "WELCOME10 is set up. Reviews (in the menu) has one review waiting to be approved." },
      { name: "Payments and emails", href: DEMO("/admin#settings/payments"), demo: true, who: "owner@example.com", try: "How the shop takes payments; then Email sender in the menu for the emails' words and look." },
      { name: "Studio, the designer", href: DEMO("/admin#designer"), demo: true, who: "owner@example.com", try: "Change any colour, word or section, see it on the page, then publish." },
      { name: "Themes, including Marquee and Shelf", href: DEMO("/admin#designer?tab=themes"), demo: true, who: "owner@example.com", try: "Every full template, tried on the shop before you choose." },
      { name: "As a brand-new press", href: DEMO("/admin"), demo: true, who: "owner@example.com", try: "Start the demo with npm run demo -- --new-press: the admin opens on Choose your look, then Set up your shop." },
    ],
  },
  {
    id: "stockroom",
    title: "3. As the press, in its stockroom",
    intro: "The stockroom keeps the printed copies. Sign in with Google and pick owner@example.com (Demo Owner).",
    links: [
      { name: "The stockroom", href: DEMO("/", PORTS.stockroom), demo: true, who: "owner@example.com", try: "Moth Press's books and how many copies are on hand. Changes stay after the demo restarts." },
    ],
  },
  {
    id: "press",
    title: "4. As a press, finding and joining the platform",
    intro: "A press finding the platform, signing up and paying for its plan. Nothing is charged: payments are pretend.",
    links: [
      { name: "Waitlist", href: "/waitlist/", who: null, try: "The plans and Start your free trial. Joining the waitlist keeps your email only in this walkthrough." },
      { name: "Sign up", href: "/signup/?as=newcomer@example.com", who: "newcomer@example.com", try: "Continue with Google, answer the questions and pick a plan. The new shop is made in about a minute, then shows on the account page." },
      { name: "Your shops (the account page)", href: "/account/?as=owner@example.com", who: "owner@example.com", try: "Three made-up presses: one on its trial, one paused, one paying. Invite someone to help with a shop, or open its Plan & billing." },
      { name: "Plan & billing on a free trial", href: "/account/billing?shop=moth-press&as=owner@example.com", who: "owner@example.com", try: "Moth Press, on its trial with no card yet. Change the plan, or press Add a card." },
      { name: "Plan & billing when paused", href: "/account/billing?shop=paper-wasp&as=owner@example.com", who: "owner@example.com", try: "Paper Wasp Press, paused until a card is added. Add a card: the page that opens takes the test card, and the shop opens again." },
      { name: "Plan & billing when paying", href: "/account/billing?shop=fieldnote&as=owner@example.com", who: "owner@example.com", try: "Fieldnote Editions, paying monthly: its card, two paid invoices and the next bill." },
      { name: "The emails a press gets", href: "/inbox", who: null, try: "The platform's real emails, as they look in a mailbox: sign-in links, invites, the shop-ready email, trial and billing notices and support answers. Sign up or add a card above and the new email shows up here." },
      { name: "Help", href: "/help/", who: null, try: "The answers the pages link to, and what support includes." },
      { name: "Terms", href: "/terms/", who: null, try: "The terms and the privacy policy a press agrees to at sign-up." },
      { name: "Service status", href: "/status/", who: null, try: "Whether shops, checkout and backups are working, counted over the walkthrough's shops." },
    ],
  },
  {
    id: "owner",
    title: "5. As you, the platform owner",
    intro: "You, running the platform. The control room signs you in as admin@example.com with the two-step sign-in already done; the real one asks for a code from your authenticator app.",
    links: [
      { name: "Control room", href: "/control/", who: "admin@example.com", try: "Today: the money coming in, shops by state and what needs you. Every page is in the ink menu on the left (a drawer on a phone)." },
      { name: "Shops and a shop's record", href: "/control/#shops", who: "admin@example.com", try: "Made-up presses. Open Moth Press for its record: plan, billing, the Google steps, the per-order fee and the closing dates. View this shop asks for a reason; Make changes asks twice, and both go in the shop's log." },
      { name: "Your test shop", href: "/control/#test-shop", who: "admin@example.com", try: "On Today: opens the demo shop and its admin (start the demo first) and puts its test products back to 5 copies." },
      { name: "Support, repairs and account recovery", href: "/control/#support", who: "admin@example.com", try: "Questions from presses to answer, two problems to fix in Repairs, and one person asking to move their account to a new email." },
      { name: "Sign-ups and the waitlist", href: "/control/#signups", who: "admin@example.com", try: "Three people on the list, one already invited. Invite another and they skip the daily line." },
      { name: "Prices, switches and records", href: "/control/#settings", who: "admin@example.com", try: "The daily cap, the plans and prices and the founding offer; then Switches, Emergency payments, Run book, the Breach register and the Activity log in the menu." },
    ],
  },
]);

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const link = (item) => `<li class="card">
  <h3><a href="${escape(item.href)}"${item.demo ? ' target="_blank" rel="noopener"' : ""}>${escape(item.name)}</a></h3>
  <p class="cp-who">${item.who ? `Signs in as ${escape(item.who)}` : "No sign-in"}${item.demo ? " · needs the demo running" : ""}</p>
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
    <p class="cp-lede">Every page of the platform on this computer, running the same code that goes live: as a shopper, as a press and as the platform owner. The sign-ins are made-up people and the money is pretend, so try anything.</p>
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
