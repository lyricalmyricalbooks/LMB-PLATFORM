// What an anonymous caller may be told when a public endpoint fails (#108).
//
// Our own refusals ("Choose between 1 and 50 books.", gift-card and discount messages, stock-hold
// messages) are written for shoppers and pass through. Text that came from an upstream service or
// the database (a Shippo response body, a Stripe "Invalid API Key provided: sk_****abcd", a Firestore
// index or permission message) never leaves the server: it is logged by the caller and replaced
// by a fixed sentence. Endpoints that require the verified admin keep their detailed messages.

const UPSTREAM_TEXT = /shippo|stripe|paypal|resend|nodemailer|firestore|firebase|grpc|google|api[ _-]?key|secret|bearer|\btoken\b|index|permission|quota|ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|\bat \S+ \(|\n/i;

function publicErrorMessage(err, fallback) {
  if (!err) return fallback;
  // Stripe and Firestore/gRPC errors carry a type, a raw upstream body, or a numeric/gRPC code.
  if (typeof err.type === "string" && /^(Stripe|Firebase)/.test(err.type)) return fallback;
  if (err.raw || typeof err.code === "number" || typeof err.statusCode === "number") return fallback;
  if (typeof err.code === "string" && /^(permission-denied|not-found|unavailable|failed-precondition|resource-exhausted|internal|unknown|aborted|deadline-exceeded|auth\/|app\/|storage\/)/.test(err.code)) return fallback;
  const message = typeof err.message === "string" ? err.message.trim() : "";
  if (!message || message.length > 300 || UPSTREAM_TEXT.test(message)) return fallback;
  return message;
}

module.exports = { publicErrorMessage };
