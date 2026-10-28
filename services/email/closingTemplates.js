// The closing emails (code plan 6.8; services/billing/closing.js), sent to the shop's owner. Kept in their own file and
// spread into TEMPLATES (templates.js), which hands in its own layout helpers. `data`: { pressName, date (the day the
// shop is deleted, in words), days (30 or 7, warnings only), link (the platform's Plan & billing page) }.

export function closingTemplates({ layout, safeLink, signOff }) {
  return {
    /** 60 days paused (or the plan ended): the shop is closed, and everything can be downloaded until `date`. */
    "shop-closed": ({ date, link }, { settings, pressName }) => layout({
      subject: `${pressName} is closed. Download everything by ${date}`,
      greeting: "Hello,",
      paragraphs: [
        `${pressName} has been paused for a while, so it is now closed. Shoppers see a closed page and no orders come in.`,
        `Everything is kept until ${date}: your books, orders, customers and stock. Open your shop's admin to download them as files.`,
        `After ${date} the shop and everything in it are deleted for good. Start a plan again before then and it opens just as you left it.`,
      ],
      buttons: [["See your plan", safeLink(link)]],
      footer: signOff(settings),
    }),

    /** 30 and 7 days before the shop is deleted. */
    "shop-deletion-warning": ({ date, days, link }, { settings, pressName }) => {
      if (days !== 30 && days !== 7) throw new Error("the deletion warning is sent 30 or 7 days before");
      return layout({
        subject: `${pressName} will be deleted on ${date}`,
        greeting: "Hello,",
        paragraphs: [
          `In ${days} days, on ${date}, ${pressName} and everything in it will be deleted: books, orders, customers and stock. It can't be undone.`,
          "If you haven't yet, open your shop's admin and download everything as files.",
          `To keep the shop, start a plan again before ${date}.`,
        ],
        buttons: [["See your plan", safeLink(link)]],
        footer: signOff(settings),
      });
    },

    /** The shop has been deleted. */
    "shop-deleted": (_data, { settings, pressName }) => layout({
      subject: `${pressName} has been deleted`,
      greeting: "Hello,",
      paragraphs: [
        `As we said in our earlier emails, ${pressName} and everything in it have now been deleted from ${settings.platformName}.`,
        `Thank you for making your shop with us. You're welcome back any time.`,
      ],
      footer: signOff(settings),
    }),
  };
}
