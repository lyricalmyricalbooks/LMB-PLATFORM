// Help articles for the top 20 questions a press asks in its first weeks (plan 3.4). Plain ES module with no imports,
// so the help page loads it as is and the tests read the same list.
//
// Words here are customer-facing: plain words, short sentences, no code or tool names, never a rival's name. Every
// "where to click" path names real admin pages (help.test.js checks them against the shop's menu). Say only what the
// shop does today; when something isn't built yet, say so and say what to do instead.

/**
 * @typedef {{ id: string, topic: string, question: string, answer: string[], steps?: string[], where?: string[], plans?: string[] }} Article
 * `where`: click paths in the shop's admin, written "Page › Part". `plans`: only for presses whose plan includes these
 * apps ("shop", "stockroom"); missing means everyone.
 */

export const TOPICS = Object.freeze(["Getting started", "Moving your shop", "Selling", "Orders", "Your stockroom", "Your account"]);

/** @type {readonly Article[]} */
export const ARTICLES = Object.freeze([
  {
    id: "add-a-book",
    topic: "Getting started",
    question: "How do I add my first book?",
    answer: [
      "Open Books and press Add book. A title, a price and a photo are enough to start. You can fill in the rest later.",
      "A new book starts as a draft, so shoppers can't see it yet. When it's ready, choose Publish. The shop checks the book first and tells you if anything is missing.",
    ],
    where: ["Books › Add book"],
  },
  {
    id: "editions",
    topic: "Getting started",
    question: "How do I sell one book in more than one edition?",
    answer: [
      "Some books come as a paperback and a hardcover, or as a plain and a signed copy. Each of these is an edition, with its own price and its own stock.",
      "Open the book, go to Editions and press Add edition for each one. Shoppers then choose the edition they want on the book's page.",
    ],
    where: ["Books › a book › Editions"],
  },
  {
    id: "first-week",
    topic: "Getting started",
    question: "What should I do first?",
    answer: [
      "Your Overview opens with a short list called Your first week. It is chosen from how you said you sell today when you signed up.",
      "Steps the shop can check, such as adding books, shipping and payments, tick themselves. You tick the others with Mark done. When you no longer need the list, press Hide this list.",
    ],
    where: ["Overview"],
  },
  {
    id: "bring-books",
    topic: "Moving your shop",
    question: "How do I bring my books over from my old shop?",
    answer: [
      "Bring your shop with you. In your old shop, export your products as a file. Don't change the file.",
      "Here, open Books, press Import CSV and choose that file. You see every book before anything is saved. Photos, prices, sale prices, stock and editions come over, and every new book arrives as a draft.",
      "Bringing the same file over twice adds nothing new, so you can try again safely.",
      "For now the photos still load from your old shop. Keep your old shop open until we tell you they have been copied over.",
    ],
    where: ["Books › Import CSV"],
  },
  {
    id: "bring-customers",
    topic: "Moving your shop",
    question: "How do I bring my customers over?",
    answer: [
      "Export your customer list from your old shop. Here, open Customers and press Bring customers over.",
      "Each customer gets a private note with their name, town and what they spent at your old shop. Notes you already wrote are kept.",
      "Customers who agreed to your emails at your old shop can join your newsletter too. That only happens after you tick the box to say you have their permission.",
      "Brought-over customers appear in your Customers list once they order here.",
    ],
    where: ["Customers › Bring customers over"],
  },
  {
    id: "old-links",
    topic: "Moving your shop",
    question: "Will links to my old shop still work?",
    answer: [
      "Yes, for your books. When you bring books over from your old shop's export, each book's old address is saved as a redirect to the same book here.",
      "The redirects start working once your web address leads to this shop. Redirects you made yourself are never replaced. You can see or remove them in Settings › General › URL redirects.",
    ],
    where: ["Settings › General"],
  },
  {
    id: "own-address",
    topic: "Moving your shop",
    question: "Can my shop use my own web address?",
    answer: [
      "Not by yourself yet. Connecting your own web address is still being finished.",
      "Until then your shop works at its own address, which you find in the welcome email. Ask us with Get help from Colophon on your account page, and we'll tell you when your own address is ready.",
    ],
  },
  {
    id: "shipping",
    topic: "Selling",
    question: "How do I set my shipping prices?",
    answer: [
      "Open Settings › Shipping. Add the places you send to, such as Canada, the United States and everywhere else, and a price for each.",
      "Shoppers see the price of delivery before they pay. The Overview tells you if a place or a book has no shipping price yet.",
    ],
    where: ["Settings › Shipping"],
    plans: ["shop"],
  },
  {
    id: "get-paid",
    topic: "Selling",
    question: "How do I get paid?",
    answer: [
      "Open Settings › Payments and connect your payments account. Money from each sale goes into that account, and from there to your bank.",
      "Before you tell people about your shop, buy one book yourself to check that a payment goes all the way through.",
    ],
    where: ["Settings › Payments"],
    plans: ["shop"],
  },
  {
    id: "look",
    topic: "Selling",
    question: "How do I change how my shop looks?",
    answer: [
      "Open Settings › Design. Choose a theme, then your colours, fonts and logo.",
      "Your changes stay a draft until you publish them, so shoppers never see a half-finished look. You can check the shop on a phone-sized screen before you publish.",
    ],
    where: ["Settings › Design"],
    plans: ["shop"],
  },
  {
    id: "words",
    topic: "Selling",
    question: "How do I change the words on my shop?",
    answer: [
      "Open Settings › Design and go to Text & labels. Every button, message and heading shoppers see is there, and you can write your own.",
      "Like every design change, new words go live when you publish.",
    ],
    where: ["Settings › Design"],
    plans: ["shop"],
  },
  {
    id: "discounts",
    topic: "Selling",
    question: "How do I make a discount code?",
    answer: [
      "Open Discounts and press New discount. Choose the code shoppers type, how much it takes off and when it starts and ends.",
      "You can also limit a code to one use per customer.",
    ],
    where: ["Discounts › New discount"],
    plans: ["shop"],
  },
  {
    id: "pre-orders",
    topic: "Selling",
    question: "Can I take pre-orders for a book that isn't out yet?",
    answer: [
      "Yes. Open the book, set its publication date and switch on Take pre-orders until the publication date.",
      "Shoppers can buy it straight away. The order waits in Orders until the book is out, and you send it then.",
    ],
    where: ["Books › a book"],
    plans: ["shop"],
  },
  {
    id: "new-order",
    topic: "Orders",
    question: "What happens when someone places an order?",
    answer: [
      "You get an email, and the order appears in Orders. The customer gets an email that confirms their order.",
      "The stock of each book goes down by itself, so you don't sell copies you don't have.",
    ],
    where: ["Orders"],
    plans: ["shop"],
  },
  {
    id: "send-order",
    topic: "Orders",
    question: "How do I send an order and let the customer know?",
    answer: [
      "Open the order in Orders. Pack it, add the tracking number if you have one, and press Mark as shipped.",
      "The customer gets an email saying their order is on its way. If they say it didn't arrive, you can send that email again from the order.",
    ],
    where: ["Orders"],
    plans: ["shop"],
  },
  {
    id: "fairs",
    topic: "Your stockroom",
    question: "How do I sell at a fair or a market?",
    answer: [
      "Open the stockroom on your phone and go to Event POS. Add each sale as you make it.",
      "Sales at the fair come off the same stock as your website, so you never sell a copy twice.",
    ],
    plans: ["stockroom"],
  },
  {
    id: "stock-everywhere",
    topic: "Your stockroom",
    question: "How do I keep my stock right on the website and in the stockroom?",
    answer: [
      "Link them once in Inventory › Inventory app link. Press Check connection, then match each book on the website to the same book in the stockroom.",
      "After that, the stockroom keeps the count. Website sales come off it by themselves, and the website shows what the stockroom says.",
    ],
    where: ["Inventory › Inventory app link"],
    plans: ["shop", "stockroom"],
  },
  {
    id: "team",
    topic: "Your account",
    question: "Can someone help me run the shop?",
    answer: [
      "Yes. Open Settings › Team and add them with the Google email address they sign in with.",
      "Staff can do everything except change the team or your payment and email settings. Authors only see their own books, in the stockroom.",
    ],
    where: ["Settings › Team"],
  },
  {
    id: "copy-of-everything",
    topic: "Your account",
    question: "How do I get a copy of my books, orders and customers?",
    answer: [
      "In Books, open More catalog actions and choose Export. In Orders and in Customers, press Export CSV. Each saves a spreadsheet file you can keep.",
      "Your shop is also backed up every night, so a mistake can be put right.",
    ],
    where: ["Books", "Orders", "Customers"],
  },
  {
    id: "trial-ends",
    topic: "Your account",
    question: "What happens when my free trial ends?",
    answer: [
      "If you have added a card, your plan simply carries on. If you haven't, your shop pauses. Nothing is deleted.",
      "Add a card at any time and your shop opens again, billed from that day. If you cancel, your plan runs to the end of the time already paid for, and you can change your mind until then.",
    ],
  },
]);

/** The articles for a plan ("both", "shop" or "stockroom"); everyone gets the ones with no plan. */
export function articlesFor(plan) {
  const apps = plan === "both" ? ["shop", "stockroom"] : [plan];
  return ARTICLES.filter((a) => !a.plans || a.plans.some((p) => apps.includes(p)));
}

/** Articles whose question or answer has every word typed in the search box. */
export function searchArticles(text, list = ARTICLES) {
  const words = String(text || "").toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 1);
  if (!words.length) return [...list];
  return list.filter((a) => {
    const hay = [a.question, ...a.answer, ...(a.where || [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
