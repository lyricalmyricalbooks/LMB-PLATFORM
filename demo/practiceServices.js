// The demo's practice services, on one port (PORTS.practice): the practice card service (practicePay.js) and the
// practice inbox (practiceMail.js). The shop's server code reaches them through the emulators' environment
// (practiceEnv), the checkout page through its shop profile, and people through the inbox page at /inbox.
import { createServer } from "node:http";
import { createPracticeStripe, parseForm, PRACTICE_CARDS } from "./practicePay.js";
import { createPracticeInbox, practiceMailApi, PRACTICE_MAIL_KEY } from "./practiceMail.js";

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** What the emulators need in their environment so the shop's server code uses the practice services. */
export function practiceEnv(serviceUrl) {
  return { DEMO_STRIPE_URL: serviceUrl, RESEND_BASE_URL: serviceUrl };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const when = (iso) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });

/** The practice inbox page: every email the shop sent, newest first, each opened in place. */
export function inboxPage(mail, openId = null) {
  const open = mail.find((m) => m.id === openId) ?? mail[0] ?? null;
  const rows = mail.map((m) => `<li><a href="/inbox?open=${encodeURIComponent(m.id)}"${open && m.id === open.id ? ' aria-current="true"' : ""}>
    <b>${escape(m.subject)}</b><span>To ${escape(m.to.join(", "))}</span><time>${escape(when(m.at))}</time></a></li>`).join("\n");
  const body = open?.html
    ? `<iframe title="${escape(open.subject)}" sandbox="" srcdoc="${escape(open.html)}"></iframe>`
    : `<pre>${escape(open?.text ?? "")}</pre>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${open ? 30 : 5}">
<title>Practice inbox · Colophon walkthrough</title>
<style>
  :root { --paper: #f3eee4; --ink: #14110d; --red: #e8402a; --mute: #5b5348; --line: #14110d; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --paper: #1d1b18; --ink: #f3eee4; --mute: #b9b0a2; --line: #f3eee4; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  header { border-bottom: 2px solid var(--line); padding: 16px; }
  header h1 { margin: 0; font-size: 28px; letter-spacing: .02em; text-transform: uppercase; }
  header p { margin: 4px 0 0; color: var(--mute); max-width: 70ch; }
  main { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; min-height: calc(100vh - 110px); }
  ul { list-style: none; margin: 0; padding: 0; border-right: 2px solid var(--line); overflow: auto; }
  li a { display: grid; gap: 2px; padding: 12px 16px; color: inherit; text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); }
  li a:hover, li a:focus-visible { background: color-mix(in srgb, var(--red) 12%, transparent); outline: none; }
  li a[aria-current] { box-shadow: inset 6px 0 0 var(--red); background: color-mix(in srgb, var(--red) 8%, transparent); }
  li span, li time { color: var(--mute); font-size: 14px; }
  section { padding: 16px; display: grid; gap: 12px; align-content: start; min-width: 0; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 14px; }
  dt { color: var(--mute); }
  dd { margin: 0; overflow-wrap: anywhere; }
  iframe { width: 100%; min-height: 70vh; border: 2px solid var(--line); background: #fff; }
  pre { white-space: pre-wrap; border: 2px solid var(--line); padding: 12px; margin: 0; }
  .empty { padding: 32px 16px; color: var(--mute); }
  @media (max-width: 720px) { main { grid-template-columns: 1fr; } ul { border-right: 0; border-bottom: 2px solid var(--line); max-height: 40vh; } }
</style>
</head>
<body>
<header>
  <h1>Practice inbox</h1>
  <p>Every email the demo shop sends lands here instead of anyone's mailbox: order confirmations, shipping and refund notices, your new-order alerts and the rest. Nothing leaves this computer.</p>
</header>
${mail.length ? `<main>
<ul aria-label="Emails, newest first">
${rows}
</ul>
<section aria-label="The open email">
  <dl>
    <dt>Subject</dt><dd><b>${escape(open.subject)}</b></dd>
    <dt>From</dt><dd>${escape(open.from)}</dd>
    <dt>To</dt><dd>${escape(open.to.join(", "))}</dd>
    ${open.replyTo.length ? `<dt>Reply to</dt><dd>${escape(open.replyTo.join(", "))}</dd>` : ""}
    <dt>Sent</dt><dd>${escape(when(open.at))}</dd>
    ${open.attachments.length ? `<dt>Attached</dt><dd>${escape(open.attachments.join(", "))}</dd>` : ""}
  </dl>
  ${body}
</section>
</main>` : `<p class="empty">No emails yet. Buy something in the demo shop (pay with the practice card ${escape(PRACTICE_CARDS.good)}) and the order confirmation shows up here within a few seconds. This page checks again every few seconds.</p>`}
</body>
</html>
`;
}

/**
 * Starts the practice services on `port`. `webhookUrl` is the shop's stripeWebhook; `inboxFile` keeps the emails.
 * Returns `{ url, stripe, inbox, close() }`.
 */
export async function startPracticeServices({ host = "127.0.0.1", port, webhookUrl, inboxFile = null, log = () => {} }) {
  const stripe = createPracticeStripe({ webhookUrl, log });
  const inbox = createPracticeInbox({ file: inboxFile });
  const send = (res, status, body, type = "application/json; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    try {
      const address = new URL(req.url ?? "/", `http://${host}`);
      const path = address.pathname;
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (path === "/" || path === "/inbox") return send(res, 200, inboxPage(inbox.all(), address.searchParams.get("open")), "text/html; charset=utf-8");
      if (path === "/inbox.json") return send(res, 200, inbox.all());
      if (path === "/practice/confirm" && req.method === "POST") {
        let body = {};
        try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
        return send(res, 200, await stripe.confirm(body));
      }
      if (path.startsWith("/v1/")) {
        const raw = req.method === "GET" || req.method === "DELETE" ? "" : await readBody(req);
        const query = parseForm(address.search.slice(1));
        const answer = stripe.api(req.method, path, query, parseForm(raw));
        return send(res, answer.status, answer.body);
      }
      const raw = req.method === "POST" ? await readBody(req) : "";
      let json = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
      const mail = practiceMailApi(inbox, req.method, path, json);
      if (mail) {
        log(`practice inbox: ${req.method} ${path}`);
        return send(res, mail.status, mail.body);
      }
      send(res, 404, { error: { message: `Nothing here: ${req.method} ${path}` } });
    } catch (error) {
      send(res, 500, { error: { type: "api_error", message: String(error?.message ?? error) } });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const actual = server.address().port;
  return { url: `http://${host}:${actual}`, stripe, inbox, close: () => new Promise((resolve) => server.close(resolve)) };
}

export { PRACTICE_MAIL_KEY };
