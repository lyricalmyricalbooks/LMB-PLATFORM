// The words of every email the platform sends, by kind. Each template takes the email's data plus `{ settings, pressName }`
// and returns { subject, text, html }. Every value from a press or a person is escaped in the HTML, and links must be
// https. Customer-facing words: name the product (settings.platformName), never a rival.

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A link a template may put in an email: https only, so a stored value can never become a script or mail link. */
export function safeLink(url) {
  if (typeof url !== "string" || !/^https:\/\/[^\s<>"']+$/.test(url)) throw new Error("an email link must be an https address");
  return url;
}

/** Builds the three parts from paragraphs of plain text and [label, url] buttons. */
export function layout({ subject, greeting, paragraphs, buttons = [], footer }) {
  const text = [greeting, ...paragraphs, ...buttons.map(([label, url]) => `${label}: ${safeLink(url)}`), footer].filter(Boolean).join("\n\n");
  const html = [
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px">',
    greeting ? `<p>${escapeHtml(greeting)}</p>` : "",
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...buttons.map(([label, url]) => `<p><a href="${escapeHtml(safeLink(url))}" style="display:inline-block;padding:10px 16px;border:2px solid #1a1a1a;color:#1a1a1a;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`),
    footer ? `<p style="font-size:13px;color:#555">${escapeHtml(footer)}</p>` : "",
    "</div>",
  ].join("");
  return { subject, text, html };
}

const signOff = (settings) => `Sent by ${settings.platformName}. Reply to this email if you need a hand.`;

export const TEMPLATES = {
  /** Setup step 14: the owner's first email, with the links to their new admin and stockroom. */
  "owner-welcome": ({ links = {} }, { settings, pressName }) => {
    const buttons = [];
    if (links.shopAdmin) buttons.push(["Open your shop's admin", links.shopAdmin]);
    if (links.stockroom) buttons.push(["Open your stockroom", links.stockroom]);
    if (!buttons.length) throw new Error("the welcome email has no links");
    return layout({
      subject: `${pressName} is ready on ${settings.platformName}`,
      greeting: "Hello,",
      paragraphs: [
        `${pressName} is set up and ready for you.`,
        "Sign in with this email address. Your setup checklist will walk you through the rest.",
      ],
      buttons,
      footer: signOff(settings),
    });
  },
};

/** Problems with a free-form email a shop asks to send (its own order and account emails), in plain words. */
export function customProblems(message) {
  const problems = [];
  if (typeof message.subject !== "string" || !message.subject.trim()) problems.push("the email has no subject");
  else if (message.subject.length > 200 || /[\r\n]/.test(message.subject)) problems.push("the subject is too long or has line breaks");
  if (!(typeof message.text === "string" && message.text.trim()) && !(typeof message.html === "string" && message.html.trim())) {
    problems.push("the email has no words");
  }
  if ((message.html?.length ?? 0) + (message.text?.length ?? 0) > 400_000) problems.push("the email is too long");
  return problems;
}
