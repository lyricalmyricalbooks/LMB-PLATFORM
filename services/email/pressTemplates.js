// Emails to a press from the control room (code plan 19.14, 19.16), sent to the shop's owner. Kept in their own file
// and spread into TEMPLATES (templates.js), which hands in its own layout helpers, like closingTemplates.js.

export function pressTemplates({ layout, safeLink, signOff }) {
  return {
    /**
     * An important message to presses (control-room/messages.js), sent once per message and shop. `data`: { pressName,
     * words (the message, plain text), endsOn (the day it leaves the admin, in words), link (the shop's admin, or null
     * for a press with no shop admin) }.
     */
    "press-message": ({ words, endsOn, link }, { settings, pressName }) => {
      if (typeof words !== "string" || !words.trim()) throw new Error("the message has no words");
      return layout({
        subject: `A message from ${settings.platformName} for ${pressName}`,
        greeting: "Hello,",
        paragraphs: [
          ...words.trim().split(/\n{2,}/),
          link
            ? `You'll also see this at the top of your shop's admin${endsOn ? ` until ${endsOn}` : ""}.`
            : "We're sending it by email so you don't miss it.",
        ],
        buttons: link ? [["Open your shop's admin", safeLink(link)]] : [],
        footer: signOff(settings),
      });
    },

    /**
     * A press's data, ready to download (services/export, 19.16). `data`: { pressName, link (the download, works 7
     * days), until (the last day it works, in words), asked: "owner" | "platform", reason (why the platform made it) }.
     */
    "data-export-ready": ({ link, until, asked, reason }, { settings, pressName, w = (text) => text }) => layout({
      subject: `${pressName}'s data is ready to download`,
      greeting: "Hello,",
      paragraphs: [
        asked === "owner"
          ? `Here is the copy of ${pressName}'s data you asked for.`
          : `${settings.platformName} made a copy of ${pressName}'s data for you${reason ? `: ${reason}` : "."}`,
        w("It holds your books, orders, customers, discounts, reviews, pages, settings, newsletter list and stockroom records, one spreadsheet file for each, with a short note saying what is in them."),
        `The link works until ${until}. After that, ask for a new copy from your account page.`,
        "Keep the file somewhere safe: it has your customers' names and addresses in it.",
      ],
      buttons: [["Download your data", safeLink(link)]],
      footer: signOff(settings),
    }),

    /**
     * Colophon's Chit Chats app (control-room/chitChatsNote.js), once a day at most: the press's paid orders that passed
     * `days` days without a tracking number today, the orders Chit Chats refused today, and whether it started refusing
     * the press's details today. `data`: { pressName, late (order numbers), lateCount, problems [{ order, words }],
     * problemCount, refused (Chit Chats's words, or null), days, link (the shop's orders or apps page, or null) }.
     */
    "chitchats-waiting": ({ late = [], lateCount = late.length, problems = [], problemCount = problems.length, refused = null, days, link }, { settings }) => {
      if (!lateCount && !problemCount && !refused) throw new Error("nothing is waiting");
      const orders = (n) => `${n} order${n === 1 ? "" : "s"}`;
      const more = (shown, n) => (n > shown ? ` and ${n - shown} more` : "");
      return layout({
        subject: [refused ? "Chit Chats stopped taking your orders" : null, lateCount ? `${orders(lateCount)} still waiting to ship` : null, problemCount ? `${orders(problemCount)} Chit Chats couldn't take` : null].filter(Boolean).join(", "),
        greeting: "Hello,",
        paragraphs: [
          refused ? `Chit Chats stopped accepting your account details (${refused.replace(/\.$/, "")}). Until you enter them again in Settings › Apps › Chit Chats, new paid orders won't reach Chit Chats.` : null,
          lateCount ? `${lateCount === 1 ? "A paid order has" : `${lateCount} paid orders have`} waited ${days} days without a tracking number: ${late.join(", ")}${more(late.length, lateCount)}. ${lateCount === 1 ? "It's" : "They're"} in your Chit Chats account, ready for a label. Once a parcel is on its way, its order is marked sent and the customer gets the tracking.` : null,
          ...problems.map((p) => `Chit Chats couldn't take order ${p.order}${p.words ? `: ${p.words}` : "."}`),
          problemCount > problems.length ? `It couldn't take ${problemCount - problems.length} more as well.` : null,
          problemCount ? `Make ${problemCount === 1 ? "that parcel" : "those parcels"} in Chit Chats yourself, or send ${problemCount === 1 ? "it" : "them"} another way.` : null,
        ].filter(Boolean),
        buttons: link ? [[refused && !lateCount && !problemCount ? "Open Settings › Apps" : "See your orders", safeLink(link)]] : [],
        footer: `${signOff(settings)} To stop these emails, open Chit Chats in Settings › Apps.`,
      });
    },

    /**
     * A press's switch between Stripe and Square is finished (control-room/providerSwitch.js). `data`: { pressName,
     * from, to ("stripe" | "square"), link (Settings › Payments in the shop's admin, or null) }.
     */
    "payments-switched": ({ from, to, link }, { settings }) => {
      const name = (p) => ({ stripe: "Stripe", square: "Square" })[p];
      if (!name(from) || !name(to)) throw new Error("the switch names no card provider");
      return layout({
        subject: `Your card payments now go through ${name(to)}`,
        greeting: "Hello,",
        paragraphs: [
          `Your switch is done. New card sales now go to your ${name(to)} account, and ${name(to)} pays them out.`,
          `Refunds for orders taken before today still go through ${name(from)}, so keep that account open.`,
        ],
        buttons: link ? [["Open Payments", safeLink(link)]] : [],
        footer: signOff(settings),
      });
    },
  };
}
