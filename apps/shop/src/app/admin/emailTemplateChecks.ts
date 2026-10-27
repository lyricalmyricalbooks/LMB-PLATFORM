/**
 * Settings › Notifications template rules (pure): which placeholders each email knows, the
 * sample values the live preview fills in, and the checks shown under the editor. The server
 * mirror of REQUIRED_PLACEHOLDERS is functions/emailOutbox.js (parity checked in emailTemplateChecks.test.ts).
 */

export type TemplateId =
  | "order_confirmation" | "order_pending_payment" | "shipping_confirmation" | "abandoned_cart" | "order_cancelled"
  | "order_refunded" | "customer_welcome" | "delivery_update" | "contact_reply" | "gift_card" | "review_request";

export type TemplateFields = { subject: string; body: string; buttonText: string; signoff: string; enabled?: boolean };

export const PLACEHOLDERS: Record<TemplateId, string[]> = {
  order_confirmation: ["customer_name", "order_id", "order_url", "items_table", "total_price", "shipping_method", "delivery_estimate"],
  order_pending_payment: ["customer_name", "order_id", "total_price", "payment_method", "items_table"],
  shipping_confirmation: ["customer_name", "order_id", "tracking_carrier", "tracking_number", "tracking_url"],
  abandoned_cart: ["customer_name", "cart_url", "items_table"],
  order_cancelled: ["customer_name", "order_id"],
  order_refunded: ["customer_name", "order_id", "total_price"],
  customer_welcome: ["customer_name", "email"],
  delivery_update: ["customer_name", "order_id", "status", "tracking_carrier", "tracking_number", "tracking_url"],
  contact_reply: ["customer_name", "email"],
  review_request: ["customer_name", "order_id", "book_titles", "items_table"],
  gift_card: ["recipient_name", "sender_name", "amount", "code", "message", "expires", "shop_url"],
};

/** A line the server adds back when an edit drops it — without it the email is useless. */
export const REQUIRED_PLACEHOLDERS: Partial<Record<TemplateId, Record<string, string>>> = {
  gift_card: { code: "Your gift card code: {{code}}" },
};

const SAMPLE: Record<string, string> = {
  book_titles: "Visions of Toronto", customer_name: "Julianne Smith", order_id: "LM-98241", tracking_carrier: "Canada Post", tracking_number: "123456789012",
  total_price: "CA$45.00", payment_method: "Interac e-Transfer", email: "julianne.smith@gmail.com", status: "out for delivery",
  tracking_url: "#", cart_url: "#", order_url: "#", shipping_method: "Canada Post Expedited Parcel",
  delivery_estimate: "2-4 business days after dispatch", recipient_name: "Sam", sender_name: "Julianne", amount: "CA$50.00",
  code: "ABCD-EFGH-JKMN-PQRS", expires: "It never expires.", shop_url: "#", items_table: "",
};

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** The body as the server sends it: required lines added back. */
export function withRequiredPlaceholders(templateId: TemplateId, body: string): string {
  let text = String(body ?? "");
  for (const [token, line] of Object.entries(REQUIRED_PLACEHOLDERS[templateId] || {})) {
    if (!new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`).test(text)) text = `${text.trimEnd()}\n\n${line}`;
  }
  return text;
}

/** Fills sample values; placeholders this email doesn't know read as blank (as the server sends them). */
export function fillSample(templateId: TemplateId, text: string, values: Record<string, string> = {}): string {
  const known = new Set(PLACEHOLDERS[templateId] || []);
  return String(text ?? "").replace(TOKEN, (_, name: string) => {
    if (!known.has(name)) return "";
    if (values[name]) return values[name];
    if (name === "message") return templateId === "gift_card" ? "Happy birthday! Enjoy something new to read." : "";
    return SAMPLE[name] ?? "";
  });
}

export type TemplateProblem = { tone: "warning" | "danger"; text: string };

/** What the editor warns about under a template. */
export function templateProblems(templateId: TemplateId, fields: TemplateFields): TemplateProblem[] {
  const out: TemplateProblem[] = [];
  const known = new Set(PLACEHOLDERS[templateId] || []);
  const unknown = new Set<string>();
  for (const value of [fields.subject, fields.body, fields.buttonText, fields.signoff]) {
    for (const match of String(value ?? "").matchAll(TOKEN)) if (!known.has(match[1])) unknown.add(match[1]);
  }
  if (unknown.size) {
    out.push({ tone: "warning", text: `${[...unknown].map(n => `{{${n}}}`).join(", ")} ${unknown.size === 1 ? "isn't a placeholder" : "aren't placeholders"} for this email, so ${unknown.size === 1 ? "it" : "they"} will be left blank. Check the spelling against the list below.` });
  }
  const outsideBody = [fields.subject, fields.buttonText, fields.signoff].some(v => /\{\{\s*items_table\s*\}\}/.test(String(v ?? "")));
  if (outsideBody) out.push({ tone: "warning", text: "{{items_table}} is the order table, so it only works in the body copy. Anywhere else it will be left blank." });
  if (!String(fields.subject ?? "").trim()) out.push({ tone: "danger", text: "The subject line is empty, so the default subject will be used." });
  if (!String(fields.body ?? "").trim()) out.push({ tone: "danger", text: "The body copy is empty, so the default text will be used." });
  for (const token of Object.keys(REQUIRED_PLACEHOLDERS[templateId] || {})) {
    if (!new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`).test(fields.body || "")) {
      out.push({ tone: "warning", text: `{{${token}}} is missing from the body. The line "${REQUIRED_PLACEHOLDERS[templateId]![token]}" will be added at the end so customers still get it.` });
    }
  }
  return out;
}

/** Inserts `token` into `value` at the remembered selection (or the end), returning the new text and caret. */
export function insertAt(value: string, token: string, start?: number | null, end?: number | null): { value: string; caret: number } {
  const text = String(value ?? "");
  const s = typeof start === "number" && start >= 0 && start <= text.length ? start : text.length;
  const e = typeof end === "number" && end >= s && end <= text.length ? end : s;
  const before = text.slice(0, s);
  const pad = before && !/\s$/.test(before) ? " " : "";
  const next = `${before}${pad}${token}${text.slice(e)}`;
  return { value: next, caret: s + pad.length + token.length };
}

/** Every template with a problem, for the tab badges and the SaveBar message. */
export function problemTemplates(templates: Record<string, TemplateFields | undefined>): Record<string, TemplateProblem[]> {
  const out: Record<string, TemplateProblem[]> = {};
  for (const [id, fields] of Object.entries(templates)) {
    if (!fields) continue;
    const problems = templateProblems(id as TemplateId, fields);
    if (problems.length) out[id] = problems;
  }
  return out;
}
