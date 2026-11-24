// Away reply (plan 4, 3.7, Beta): a message sent through the website's contact form while the shop is closed is
// answered with the owner's away words and when the shop opens again, in place of the usual "Message received" email.
// The shop is closed outside the opening hours of Bookings › Hours & rules, on a day off and on holiday hours with no
// hours. Only for shops with Bookings (or Classes) on and the away reply switched on.

const { awayNow, cleanBookingSettings } = require("./shared/bookingTimes");

const WORDS = {
  en: {
    subject: "Thanks, {{customer_name}}: we're closed right now",
    standard: "Thanks for your message. We're closed right now, and we'll answer as soon as we're back.",
    back: "We're back {{back}}.",
    signoff: "Talk soon,\n{{shop_name}}",
  },
  fr: {
    subject: "Merci, {{customer_name}} : nous sommes fermés en ce moment",
    standard: "Merci pour votre message. Nous sommes fermés en ce moment et nous vous répondrons dès notre retour.",
    back: "Nous serons de retour {{back}}.",
    signoff: "À bientôt,\n{{shop_name}}",
  },
};

/** "Tuesday, November 24 at 10:00 a.m." (en) or "le mardi 24 novembre à 10 h 00" (fr), on the shop's clock. */
function backWords(ms, zone, language) {
  const fr = language === "fr";
  const date = new Date(ms);
  const day = date.toLocaleDateString(fr ? "fr-CA" : "en-CA", { timeZone: zone, weekday: "long", month: "long", day: "numeric" });
  const time = date.toLocaleTimeString(fr ? "fr-CA" : "en-CA", { timeZone: zone, hour: "numeric", minute: "2-digit" });
  return fr ? `le ${day} à ${time}` : `${day} at ${time}`;
}

/**
 * The away reply due now, or null: the shop's booking engine is on, the owner switched the away reply on, and the shop is
 * closed. `{ words, back }`: the owner's words (else the standard ones) and when it opens again ("" when not within three weeks).
 */
async function awayReplyNow({ db, engineOn, zone, nowMs, language }) {
  if (!(await engineOn(db).catch(() => false))) return null;
  const snap = await db.collection("bookingSettings").doc("main").get().catch(() => null);
  if (!snap?.exists) return null;
  const settings = cleanBookingSettings(snap.data());
  if (!settings.awayReply) return null;
  const away = awayNow(settings, nowMs, zone);
  if (!away) return null;
  const lang = language === "fr" ? "fr" : "en";
  return { words: settings.awayWords || WORDS[lang].standard, back: away.backAt ? backWords(away.backAt, zone, lang) : "" };
}

/** The template the email compiler fills: the owner's words and the return time are values, so they are escaped. */
function awayTemplate(language, hasBack) {
  const w = WORDS[language === "fr" ? "fr" : "en"];
  return {
    subject: w.subject,
    body: `Hi {{customer_name}},\n\n{{away_words}}${hasBack ? `\n\n${w.back}` : ""}`.replace(/^Hi /, language === "fr" ? "Bonjour " : "Hi "),
    buttonText: "",
    signoff: w.signoff,
    enabled: true,
  };
}

module.exports = { awayReplyNow, awayTemplate, backWords, AWAY_WORDS: WORDS };
