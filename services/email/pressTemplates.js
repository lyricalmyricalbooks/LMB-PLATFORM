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
    "data-export-ready": ({ link, until, asked, reason }, { settings, pressName }) => layout({
      subject: `${pressName}'s data is ready to download`,
      greeting: "Hello,",
      paragraphs: [
        asked === "owner"
          ? `Here is the copy of ${pressName}'s data you asked for.`
          : `${settings.platformName} made a copy of ${pressName}'s data for you${reason ? `: ${reason}` : "."}`,
        "It holds your books, orders, customers, discounts, reviews, pages, settings, newsletter list and stockroom records, one spreadsheet file for each, with a short note saying what is in them.",
        `The link works until ${until}. After that, ask for a new copy from your account page.`,
        "Keep the file somewhere safe: it has your customers' names and addresses in it.",
      ],
      buttons: [["Download your data", safeLink(link)]],
      footer: signOff(settings),
    }),
  };
}
