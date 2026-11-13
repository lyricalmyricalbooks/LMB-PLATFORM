// A pretend Google mailbox for the receipts tests and the walkthrough: Gmail's list, get, attachment and trash calls
// over an in-memory list of messages, plus the two sign-in calls (services/email/fakes.js has the sender's twin).
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const b64url = (text) => Buffer.from(text).toString("base64url");

/** One Gmail message as the API returns it (format=full). `files`: [{ name, type, bytes }]. */
export function gmailMessage({ id, to, from = "Paper Supply Co <billing@papersupply.example>", subject = "Your receipt", text = "", html = "", files = [], headers = {}, at = Date.UTC(2026, 10, 12, 15), labels = ["INBOX"] }) {
  const parts = [
    ...(text ? [{ mimeType: "text/plain", filename: "", body: { data: b64url(text), size: text.length } }] : []),
    ...(html ? [{ mimeType: "text/html", filename: "", body: { data: b64url(html), size: html.length } }] : []),
    ...files.map((f, i) => ({ mimeType: f.type, filename: f.name, body: { attachmentId: `att-${id}-${i}`, size: f.bytes.length } })),
  ];
  return {
    id, internalDate: String(at), labelIds: labels,
    payload: { mimeType: "multipart/mixed", filename: "", headers: [{ name: "From", value: from }, { name: "To", value: to }, { name: "Delivered-To", value: to }, { name: "Subject", value: subject }, ...Object.entries(headers).map(([name, value]) => ({ name, value }))], parts },
    files,
  };
}

export function fakeReceiptGmail(messages = []) {
  const box = new Map(messages.map((m) => [m.id, m]));
  const binned = [];
  const scopes = [];
  const fetch = async (url, init = {}) => {
    if (url.startsWith("http://metadata.google.internal/")) return response(200, { access_token: "server-token", expires_in: 3600 });
    if (url.startsWith("https://iamcredentials.googleapis.com/")) {
      scopes.push(JSON.parse(JSON.parse(init.body).payload).scope);
      return response(200, { keyId: "k1", signedJwt: "signed.jwt.token" });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) return response(200, { access_token: "mail-token", expires_in: 3600 });
    const at = new URL(url);
    const path = at.pathname.replace("/gmail/v1/users/me/messages", "");
    if (path === "") {
      // Like Gmail's search, loosely: any message that mentions one of the addresses asked for, in the folder asked for.
      const wanted = [...(at.searchParams.get("q") ?? "").matchAll(/(?:deliveredto|to|cc):(\S+?)[\s}]/g)].map((m) => m[1].toLowerCase());
      const spam = at.searchParams.get("labelIds") === "SPAM";
      const found = [...box.values()].filter((m) => m.labelIds.includes("SPAM") === spam && wanted.some((address) => JSON.stringify(m.payload.headers).toLowerCase().includes(address)));
      return response(200, { messages: found.map((m) => ({ id: m.id })) });
    }
    const [, id, kind, attachmentId] = path.split("/");
    const message = box.get(id);
    if (!message) return response(404, { error: { status: "NOT_FOUND", message: "Requested entity was not found." } });
    if (kind === "trash") { box.delete(id); binned.push(id); return response(200, { id }); }
    if (kind === "attachments") {
      const file = message.files[Number(attachmentId.split("-").pop())];
      return response(200, { data: Buffer.from(file.bytes).toString("base64url"), size: file.bytes.length });
    }
    const { files: _files, ...wire } = message;
    return response(200, wire);
  };
  return { fetch, box, binned, scopes, add: (message) => void box.set(message.id, message) };
}
