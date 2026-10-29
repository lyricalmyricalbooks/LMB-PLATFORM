// The safety headers every page of the platform and of every shop sends (plan 13.2). One list, so the hosting files and
// their test agree. Firebase Hosting files are JSON and cannot import this, so `security/headers.test.js` reads each one
// and checks it against this list.
//
// The policy is deliberately the part that cannot break a page: no plug-ins, no foreign <base> tag, no framing by another
// site. A full script allow-list (Stripe, Google sign-in, fonts, Studio embeds) is tried first as Report-Only, and only
// enforced after a quiet watch period, because one wrong entry would stop checkout.
export const CONTENT_POLICY = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
export const STRICT_TRANSPORT = "max-age=31536000; includeSubDomains";

/** The headers every page gets, by who owns the page. `framing` is the old X-Frame-Options value. */
export function safetyHeaders({ camera = false, framing = "SAMEORIGIN" } = {}) {
  return [
    { key: "Strict-Transport-Security", value: STRICT_TRANSPORT },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: framing },
    { key: "Content-Security-Policy", value: framing === "DENY" ? CONTENT_POLICY.replace("frame-ancestors 'self'", "frame-ancestors 'none'") : CONTENT_POLICY },
    // Payments stay allowed everywhere (Apple Pay and Google Pay need them); the rest a page never uses is switched off.
    { key: "Permissions-Policy", value: `camera=(${camera ? "self" : ""}), microphone=(), geolocation=(), usb=()` },
  ];
}
