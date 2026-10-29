// Help articles for the questions a press asks most in its first weeks (plan 3.4), with one for every step of the
// first-week list (plan 8.2, `CHECKLIST_ANSWERS`). Plain ES module with no imports, so the help page loads it as is
// and the tests read the same list.
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
    id: "sizes-and-colours",
    topic: "Getting started",
    question: "How do I sell something that comes in sizes or colours?",
    answer: [
      "Open the product, go to Editions and find Options: size, colour and more. Name an option, such as Size, and list its choices separated by commas, such as S, M, L, XL. Add a second option, such as Colour, if you need one.",
      "The shop makes one line for every combination, and each line has its own price and its own stock. Shoppers pick their size and colour on the product's page, and a size that has run out shows as sold out.",
    ],
    where: ["Books › a product › Editions"],
  },
  {
    id: "size-guide",
    topic: "Getting started",
    question: "How do I add a size guide?",
    answer: [
      "Open the product and look in its details for Size guide. Type the measurements in the box, or choose a picture of your size chart. Shoppers see it next to the sizes on the product's page.",
    ],
    where: ["Books › a product"],
  },
  {
    id: "first-week",
    topic: "Getting started",
    question: "What should I do first?",
    answer: [
      "The first time you open your shop's admin, you choose a look for it. Then your Overview shows Set up your shop: eight steps from your logo to opening your shop, in an order chosen from how you said you sell today.",
      "Three steps show at a time and the rest wait under Later. Most tick themselves once they are done. Your shop stays private until the last step, Open your shop. When you no longer need the guide, press Hide this guide.",
    ],
    where: ["Overview"],
  },
  {
    id: "import-spreadsheet",
    topic: "Getting started",
    question: "How do I bring in my books from a spreadsheet?",
    answer: [
      "Save your list of books as a CSV file. Most spreadsheet programs can do this from Save as or Download.",
      "Open Books, press Import CSV and choose the file. You see every book before anything is saved, and each one arrives as a draft.",
    ],
    where: ["Books"],
  },
  {
    id: "photos",
    topic: "Getting started",
    question: "How do I add photos to my books?",
    answer: [
      "Open the book in Books and add one or more photos, then save the book.",
      "Books with a photo sell far better, and the shop looks finished.",
    ],
    where: ["Books"],
  },
  {
    id: "isbn",
    topic: "Getting started",
    question: "Where do I put a book's ISBN?",
    answer: [
      "Open the book in Books and type it in the ISBN box. Dashes and spaces are fine.",
      "Bookshops and distributors order by ISBN, and the shop shows the barcode on the book's page.",
    ],
    where: ["Books"],
  },
  {
    id: "publish",
    topic: "Getting started",
    question: "How do I put a book on sale?",
    answer: [
      "Open the book and choose Publish. The shop checks the book first and tells you if anything is missing, such as a price or a photo.",
      "You can also pick a date, and the book goes on sale by itself that day.",
    ],
    where: ["Books"],
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
    id: "email-sender",
    topic: "Selling",
    question: "Which address do my order emails come from?",
    answer: [
      "Order emails go out from us under your press's name, and when a shopper replies, the reply comes to you.",
      "Sending from your own address comes with connecting your own web address. There is nothing to set up and no password to find.",
    ],
    plans: ["shop"],
  },
  {
    id: "test-order",
    topic: "Selling",
    question: "How do I try an order before real shoppers do?",
    answer: [
      "While your shop is still private, open Settings › Payments and press Try a practice order. For an hour, you can buy a book in your own shop with the practice card shown there. Then see the confirmation email and refund the order.",
      "Each step ticks itself when it is done, practice orders never count in your sales, and no real money moves.",
    ],
    where: ["Settings › Payments"],
    plans: ["shop"],
  },
  {
    id: "open-shop",
    topic: "Getting started",
    question: "How do I open my shop to shoppers?",
    answer: [
      "A new shop starts private: shoppers see an under-construction page while you set it up. When you are ready, press Open your shop, the last step of Set up your shop on the Overview.",
      "It first checks that your shop can sell: a published book, shipping, payments and your address for emails. If something is missing, it says what and takes you there. You can close the shop again from Settings › General › Store status.",
    ],
    where: ["Overview", "Settings › General"],
    plans: ["shop"],
  },
  {
    id: "share",
    topic: "Selling",
    question: "How do I tell people my shop is open?",
    answer: [
      "Copy your shop's web address from your browser and share it in your newsletter, on social media and at your next event.",
      "Each book has its own page, so you can share a link straight to a new book too.",
    ],
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
    id: "what-help",
    topic: "Your account",
    question: "What help can I get from Colophon?",
    answer: [
      "Ask from your account page and a person answers in writing. We fix anything that doesn't work, help when bringing your shop over goes wrong, and answer questions about your bill.",
      "We don't do setup calls, data entry or design work. Every setup step has a written answer on this page instead.",
    ],
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

/**
 * The answer for each step of the shop's setup guide, Set up your shop (apps/shop/src/app/admin/firstWeek.ts, `StepId`). A new step
 * there fails help.test.js until it has an answer here.
 */
export const CHECKLIST_ANSWERS = Object.freeze({
  logo: "look",
  look: "look",
  "add-books": "add-a-book",
  "bring-books": "bring-books",
  "import-spreadsheet": "import-spreadsheet",
  shipping: "shipping",
  payments: "get-paid",
  address: "own-address",
  practice: "test-order",
  open: "open-shop",
});

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
