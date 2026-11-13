// Help articles for the questions a press asks most in its first weeks (plan 3.4), with one for every step of the
// first-week list (plan 8.2, `CHECKLIST_ANSWERS`). Plain ES module with no build step, so the help page loads it as is
// and the tests read the same list. Its only import is `./sells.js`, this folder's copy of shared/sells/sells.js.
//
// What the shop sells (code plan 12.18): the answers are written for a books shop. For a shop that sells something else
// (`?sells=clothing` on the page's address), `articlesFor` passes them through the shop's words ("Add book" → "Add
// product", "editions" → "options"), the same words its admin shows. An article with `goods` uses those words instead,
// as written, where the swap alone would read wrongly. An article with `books: true` is only for shops that have
// books (the ISBN answer); a shop that sells books and other things still sees it.
//
// Words here are customer-facing: plain words, short sentences, no code or tool names, never a rival's name. Every
// "where to click" path names real admin pages (help.test.js checks them against the shop's menu). Say only what the
// shop does today; when something isn't built yet, say so and say what to do instead.

import { sellsBooks, wordsFor } from "./sells.js";

/**
 * @typedef {{ id: string, topic: string, question: string, answer: string[], steps?: string[], where?: string[], plans?: string[], books?: boolean, goods?: { question?: string, answer?: string[] } }} Article
 * `where`: click paths in the shop's admin, written "Page › Part". `plans`: only for presses whose plan includes these
 * apps ("shop", "stockroom"); missing means everyone. `books`: only for shops that have books. `goods`: the words for a
 * shop that doesn't sell books, used as written.
 */

export const TOPICS = Object.freeze(["Getting started", "Bringing your shop over", "Selling", "Orders", "Stockroom", "Your account"]);

/** @type {readonly Article[]} */
export const ARTICLES = Object.freeze([
  {
    id: "selling-legally",
    topic: "Selling",
    question: "What do I need to sell within the law?",
    answer: [
      "Your press is the seller, so the shopping, privacy and tax rules of the places you sell to apply to you. This is a short list of what most presses need, not legal advice.",
      "Fill in your own name, address and email under Settings › General. Every order email and shipping label shows them, and the law asks for them.",
      "Write your shipping, returns, privacy and terms pages. Each has a Start from our wording button, and your shop won't open until all four have words.",
      "Your returns page can say no to change-of-mind returns, but shoppers always keep their rights for faulty items. Shoppers in Europe and the United Kingdom can cancel within 14 days of delivery.",
      "In Canada, register for GST/HST once your sales pass $30,000 over four quarters. Quebec and British Columbia have their own sales tax lines. In the United States, register for sales tax in your own state before you sell there; each other state has its own line of sales before you must register.",
      "Selling to another country, such as Canada, the United States, Europe, the United Kingdom or Australia, can bring its own sales tax or VAT once your sales there pass a line. Check that country's line before you sell a lot there.",
      "Selling to shoppers in Quebec means your shop's pages, checkout and policies must also be in French. Your shop can translate its pages for you; check the wording before you rely on it.",
      "Send newsletters only to people who asked for them. Your sign-up form already asks them to confirm by email, and every newsletter has a way to stop.",
      "Your shop asks shoppers before it counts their visits. Leave the cookie banner on if you sell to Europe, the United Kingdom or Quebec.",
      "When a shopper asks for a copy of their details or to be deleted, answer within 30 days under Settings › General › Privacy requests.",
    ],
    where: ["Settings › General"],
  },
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
    goods: {
      question: "How do I sell one product in more than one version?",
      answer: [
        "Some products come in versions, such as a plain and a signed print, or a small and a large size. Each version has its own price and its own stock.",
        "Open the product, go to Editions and press Add edition for each version. Shoppers then choose the one they want on the product's page.",
      ],
    },
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
    id: "what-you-sell",
    topic: "Getting started",
    question: "I sell something different now. Can I change what my shop sells?",
    answer: [
      "Yes. Open Settings › General and find What you sell. Choose books, zines, comics, art and prints, clothing, shoes, jewelry, music, something else, or Books and other things if you sell both.",
      "The shop's pages and emails change their words at once. Your stockroom changes the next time you open it, and Settings tells you when it has. Products you already made stay as they are.",
    ],
    where: ["Settings › General"],
  },
  {
    id: "stock-places",
    topic: "Stockroom",
    question: "Some of my copies are at a market stall. Can the stockroom track that?",
    answer: [
      "Yes. Open a product in the stockroom and choose the Move between places button on its dashboard. Pick where the copies are now, where they are going and how many. Type a new place name the first time, such as Studio or Market stall.",
      "Everything you have not put in a place is called Main. The total on hand never changes when you move copies, and your sales and taxes are not affected. When something sells, Main goes down first. Close a place any time and its copies go back to Main.",
    ],
    plans: ["stockroom"],
  },
  {
    id: "size-guide",
    topic: "Getting started",
    question: "How do I add a size guide?",
    answer: [
      "Open the product and look in its details for Size guide. Type the measurements in the box, or choose a picture of your size chart. Shoppers see it next to the sizes on the product's page.",
      "For clothing and shoes, press Start from a typical size guide to fill the box with a common chart. Change the numbers to match how your own pieces fit.",
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
    id: "your-press",
    topic: "Getting started",
    question: "What goes in Your press, the first step?",
    answer: [
      "Your press is the name, contact email and address that go on your receipts, labels and contact page. Fill in the press name, the contact email, the street address, the city, the postal or ZIP code and the country.",
      "Your changes are saved when you finish the step. You can change any of them later in Settings.",
    ],
    // The step keeps its name, Your press, for every shop, so the swap must not rename it.
    goods: {
      answer: [
        "Your press is the step for your shop's name, contact email and address, which go on your receipts, labels and contact page. Fill in the shop name, the contact email, the street address, the city, the postal or ZIP code and the country.",
        "Your changes are saved when you finish the step. You can change any of them later in Settings.",
      ],
    },
    where: ["Overview › Get started"],
  },
  {
    id: "google-sign-in",
    topic: "Getting started",
    question: "Do I have to connect Google?",
    answer: [
      "Connecting Google is optional for now. It links your shop to the Google tools it uses, such as search and shopping, and the step tells you what it linked.",
      "Find step 4 of 8, Google in one sign-in, and press Connect Google. Google asks you to say yes, and you come straight back to your shop.",
      "While Google is still approving the sign-in for shops on Colophon, the step says it is coming soon. Carry on with the other steps, and we'll remind you once it's ready.",
    ],
    where: ["Overview › Get started"],
  },
  {
    id: "import-spreadsheet",
    topic: "Getting started",
    question: "How do I bring in my books from a spreadsheet?",
    answer: [
      "Save your list of books as a CSV file. Most spreadsheet programs can do this from Save as or Download.",
      "Open Books, press Import spreadsheet and choose the file. You see every book before anything is saved, and each one arrives as a draft.",
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
    books: true,
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
    topic: "Bringing your shop over",
    question: "How do I bring my books over from my old shop?",
    answer: [
      "Bring your shop with you. In your old shop, export your products as a file. Don't change the file.",
      "Here, open Books, press Import spreadsheet and choose that file. You see every book before anything is saved. Photos, prices, sale prices, stock and editions come over, and every new book arrives as a draft.",
      "Bringing the same file over twice adds nothing new, so you can try again safely.",
      "For now the photos still load from your old shop. Keep your old shop open until we tell you they have been copied over.",
    ],
    where: ["Books › Import spreadsheet"],
  },
  {
    id: "bring-customers",
    topic: "Bringing your shop over",
    question: "How do I bring my customers over?",
    answer: [
      "Export your customer list from your old shop. Here, open Customers and press Bring customers over.",
      "Each customer gets a private note with their name, town and what they spent at your old shop. Notes you already wrote are kept.",
      "Customers who agreed to your emails at your old shop can join your newsletter too. That only happens after you tick the box to say you have their permission.",
      "Brought-over customers appear in your Customers list straight away. Until they order here, they are under Not ordered here yet.",
    ],
    where: ["Customers › Bring customers over"],
  },
  {
    id: "old-links",
    topic: "Bringing your shop over",
    question: "Will links to my old shop still work?",
    answer: [
      "Yes, for your books. When you bring books over from your old shop's export, each book's old address is saved as a redirect to the same book here.",
      "The redirects start working once your web address leads to this shop. Redirects you made yourself are never replaced. You can see or remove them in Settings › General › URL redirects.",
      "For your other pages, such as About or a collection, use Check your old links under URL redirects before you move your web address. It reads your old shop's list of pages, tries each one here and suggests a new home for any that would show page not found. Add them one by one or all at once.",
      "Bring your own pages over brings pages such as About, FAQ or Contact here as drafts, with their words, headings, lists and links, and a redirect from each old address. Photos on those pages stay behind, so open Settings › Design, go to Pages, add them again, read each page through and publish it.",
    ],
    where: ["Settings › General"],
  },
  {
    id: "moving-checklist",
    topic: "Bringing your shop over",
    question: "What can I bring over from my old shop, and in what order?",
    answer: [
      "Everything below is optional, and each step is safe to repeat: bringing the same file twice adds nothing twice. Most old shops let you export each list as a CSV file from their settings or reports.",
    ],
    steps: [
      "Books: open Books, press Import spreadsheet and choose your old shop's product file. Old book addresses are sent on to the new pages.",
      "Customers: open Customers and press Bring customers over.",
      "Gift cards: open Gift cards and press Bring gift cards over, so balances still work.",
      "Discount codes: open Discounts and press Bring codes over, so codes your customers already have still work. Codes for only some items, and buy-some-get-some offers, are listed for you to set up by hand.",
      "Past orders: open Orders and press Bring past orders over. They count in your sales reports and each customer's history, and change no stock. Orders in another currency are converted at the Bank of Canada's average rate, which you can change, later too, on each order's page. Got a file per year? Press Bring another file after each one. Every window takes Excel, CSV and LibreOffice files as your old shop gives them. Wrong file? Remove that whole import in one step.",
      "Your own pages and old links: open Settings › General and use Check your old links under URL redirects, then Bring your own pages over for pages such as About or FAQ.",
      "On the day you move, follow What do I do on the day I move from my old shop?",
      "Your Overview shows Your move so far: what has come over and what is left. Choose We had none for anything your old shop didn't have.",
    ],
    where: ["Books › Import spreadsheet", "Customers › Bring customers over", "Gift cards › Bring gift cards over", "Discounts › Bring codes over", "Orders › Bring past orders over", "Settings › General"],
  },
  {
    id: "switch-day",
    topic: "Bringing your shop over",
    question: "What do I do on the day I move from my old shop?",
    answer: [
      "Move once your new shop is open and you have placed a practice order. Doing it in this order means shoppers are never left without a shop.",
    ],
    steps: [
      "Take your last orders in your old shop, then close its checkout.",
      "Open Settings › General and use Check your old links under URL redirects, so none of your old addresses show page not found.",
      "Connect your web address in Settings › General: press Allow where you bought it, or copy across the lines it shows.",
      "Tell your mailing list where to find you.",
      "Tick Move over from your old shop in Set up your shop on the Overview.",
    ],
    where: ["Settings › General"],
  },
  {
    id: "own-address",
    topic: "Bringing your shop over",
    question: "Can my shop use my own web address?",
    answer: [
      "Yes. While you set up, open Settings › General and choose I already have a domain under Your web address. Type it, like yourpress.com, and we find where you bought it. Nothing changes for your old site yet.",
      "No domain yet? Choose I need a domain and buy one at GoDaddy, then come back and add it. Or keep the free address for now and add your own any time.",
      "Every shop gets a free address made from your press's name. To use another name, press Pick another name in setup. Once your shop is open, press Change name in Settings › General. The address before keeps working, so anyone who has it still reaches you.",
      "Once your shop is made, we connect it for you. At most domain sellers, GoDaddy among them, you press Allow once in their window. At any other, we show you exactly what to copy across, with a Copy button on each line, or you can email it to your web person in one step.",
      "Your domain becomes your shop's main address as soon as it works, padlock included, and www.yourpress.com opens it too. We email you when it's live. Your free address keeps working the whole time.",
      "Before you say yes, take your last orders in your old shop and close its checkout: once you do, your domain shows this shop instead.",
    ],
    where: ["Settings › General"],
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
      "Open Settings › Payments and connect your payments account. Money from each sale goes into that account, and from there to your bank. Colophon never holds your money and never sees a card number: customers pay your payments provider, not us.",
      "Before you tell people about your shop, buy one book yourself to check that a payment goes all the way through.",
    ],
    where: ["Settings › Payments"],
    plans: ["shop"],
  },
  {
    id: "taxes",
    topic: "Selling",
    question: "How do I set up sales tax?",
    answer: [
      "Open Settings › Taxes and add the rates you're registered to collect, such as GST or HST in Canada, or your state's sales tax in the United States. Checkout works out the tax from where each shopper is.",
      "Not registered yet? Switch tax off there, and turn it on when you are. In Canada you register once your sales pass $30,000 over four quarters. In the United States you register with your own state, and with another state once your sales there pass its line.",
    ],
    where: ["Settings › Taxes"],
    plans: ["shop"],
  },
  {
    id: "sell-on-social",
    topic: "Selling",
    question: "Can I sell on Instagram, Facebook, Pinterest or TikTok?",
    answer: [
      "Yes. Open Sales channels and connect the accounts you use. Your books go to each one's shop, so people can buy from your posts.",
      "Then post a book from Social posts, now or at a time you choose. Connecting is optional, and you can do it any time.",
    ],
    where: ["Sales channels", "Social posts"],
    plans: ["shop"],
  },
  {
    id: "policies",
    topic: "Selling",
    question: "Which store policies does my shop need?",
    answer: [
      "Four: shipping, returns, privacy and terms. Shoppers read them before they buy, and the law and the card companies ask for them. Your shop won't open until all four have words.",
      "Open Settings › General › Store policies. Each one has a Start from our wording button: read it, change what doesn't fit your press, and save.",
    ],
    where: ["Settings › General"],
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
      "It first checks that your shop can sell: a published book, shipping, payments, your store policies and your address for emails. If something is missing, it says what and takes you there. You can close the shop again from Settings › General › Store status.",
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
    topic: "Stockroom",
    question: "How do I sell at a fair or a market?",
    answer: [
      "Open the stockroom on your phone and go to Event POS. Add each sale as you make it.",
      "Sales at the fair come off the same stock as your website, so you never sell a copy twice.",
    ],
    plans: ["stockroom"],
  },
  {
    id: "stock-everywhere",
    topic: "Stockroom",
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
    id: "close-shop",
    topic: "Your account",
    question: "How do I cancel my plan and close my shop?",
    answer: [
      "Open your shop's admin and go to Settings › Billing, then scroll to Close your shop. It has three steps, in order.",
      "Nothing is deleted the day you cancel. Your shop stays open until the time you've paid for ends, and you can change your mind until then.",
      "After that your shop closes. For 90 days you can still sign in, download everything or start again. We email you 30 and 7 days before it's deleted for good.",
    ],
    steps: [
      "Press Download your shop. You get one zip with your products, customers, orders, pages, settings and photos.",
      "Press Cancel plan and confirm. Telling us why is optional.",
      "Read What happens next, so you know the dates.",
    ],
    where: ["Settings › Billing"],
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
      "If you have added a card, your plan simply carries on. If you haven't, your shop pauses. Everything is kept for 60 days, and adding a card opens it again.",
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
  taxes: "taxes",
  payments: "get-paid",
  policies: "policies",
  address: "own-address",
  practice: "test-order",
  open: "open-shop",
  google: "google-sign-in",
  channels: "sell-on-social",
  switch: "switch-day",
});

/**
 * The Get started run's stages (apps/shop startRun.ts `RunStep`, plan 17.15): the help answer for each. Kept apart from
 * CHECKLIST_ANSWERS, which is the setup guide's own list. help.test.js checks this list against the run's stages.
 */
export const RUN_ANSWERS = Object.freeze({
  details: "your-press",
  bring: "bring-books",
  look: "look",
  payments: "get-paid",
  shipping: "shipping",
  final: "open-shop",
});

/** True for a shop with no books at all: not a books shop, and not one that sells books and other things. */
const noBooks = (sells) => !sellsBooks(sells) && sells !== "mixed";

/** One article in a shop's words: its `goods` words as written, the rest through `w`. */
function worded(a, w) {
  const goods = a.goods || {};
  return {
    ...a,
    question: goods.question ?? w(a.question),
    answer: goods.answer ?? a.answer.map(w),
    ...(a.steps ? { steps: a.steps.map(w) } : {}),
    ...(a.where ? { where: a.where.map(w) } : {}),
  };
}

/**
 * The articles for a plan ("both", "shop" or "stockroom"); everyone gets the ones with no plan. `sells` is the shop's
 * answer to "What do you sell?": a books shop (or no answer) gets the articles exactly as written.
 */
export function articlesFor(plan, sells = null) {
  const apps = plan === "both" ? ["shop", "stockroom"] : [plan];
  const list = ARTICLES.filter((a) => (!a.plans || a.plans.some((p) => apps.includes(p))) && !(a.books && noBooks(sells)));
  if (sellsBooks(sells)) return list;
  const w = wordsFor(sells);
  return list.map((a) => worded(a, w));
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
