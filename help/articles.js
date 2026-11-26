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
 * @typedef {{ id: string, topic: string, question: string, answer: string[], steps?: string[], where?: string[], plans?: string[], books?: boolean, side?: "products" | "services", goods?: { question?: string, answer?: string[] } }} Article
 * `where`: click paths in the shop's admin, written "Page › Part". `plans`: only for presses whose plan includes these
 * apps ("shop", "stockroom"); missing means everyone. `books`: only for shops that have books. `side`: only for shops
 * that sell things ("products") or take bookings ("services"); a shop that does both sees both. `goods`: the words for a
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
      "Your press is the seller, so the shopping, privacy and tax rules of the places you sell to apply to you. This is a short list of what most presses need.",
      "Fill in your own name, address and email under Settings › Your shop. Every order email and shipping label shows them, and the law asks for them.",
      "Write your shipping, returns, privacy and terms pages. Each has a Start from our wording button, and your shop won't open until all four have words.",
      "Your returns page can say no to change-of-mind returns, but shoppers always keep their rights for faulty items. Shoppers in Europe and the United Kingdom can cancel within 14 days of delivery.",
      "In Canada, register for GST/HST once your sales pass $30,000 over four quarters. Quebec and British Columbia have their own sales tax lines. In the United States, register for sales tax in your own state before you sell there; each other state has its own line of sales before you must register.",
      "Selling to another country, such as Canada, the United States, Europe, the United Kingdom or Australia, can bring its own sales tax or VAT once your sales there pass a line. Check that country's line before you sell a lot there.",
      "Selling to shoppers in Quebec means your shop's pages, checkout and policies must also be in French. Your shop can translate its pages for you; check the wording before you rely on it.",
      "Send newsletters only to people who asked for them. Your sign-up form already asks them to confirm by email, and every newsletter has a way to stop.",
      "Your shop asks shoppers before it counts their visits. Leave the cookie banner on if you sell to Europe, the United Kingdom or Quebec.",
      "When a shopper asks for a copy of their details or to be deleted, answer within 30 days under Settings › Your data › Privacy requests.",
    ],
    where: ["Settings › Your shop", "Settings › Your data"],
  },
  {
    id: "add-a-book", side: "products",
    topic: "Getting started",
    question: "How do I add my first book?",
    answer: [
      "Open Books and press Add book. A title, a price and a photo are enough to start. You can fill in the rest later.",
      "A new book starts as a draft, so shoppers can't see it yet. When it's ready, choose Publish. The shop checks the book first and tells you if anything is missing.",
    ],
    where: ["Books › Add book"],
  },
  {
    id: "take-bookings", side: "services",
    topic: "Getting started",
    question: "How do I take bookings?",
    answer: [
      "Open your calendar and add what people can book under Services: a name, how long it takes and a price. Then set your opening hours under Hours and rules, so people are only offered times when you're open.",
      "When you're ready, turn Bookings on with the switch at the top of the calendar. Your website then shows Book a time, and every booking lands in your calendar with an email to you and to the person who booked.",
    ],
  },
  {
    id: "change-shop-type",
    topic: "Your account",
    question: "How do I change what kind of shop I am?",
    answer: [
      "Your shop is a Product shop, Services (people book a time with you), or Products and services. To change it, open Settings › Your shop and press Change type under What you offer.",
      "Pick the new type and answer the one question it needs, such as what people book. The next step shows what stays, what's added to your menu and what's hidden. Nothing is deleted: products, orders, services, bookings and clients all stay.",
      "Then choose how your website changes. Keep your design and its matching version goes into your website's draft, so you can look it over before you publish. Your own design always stays as it is.",
      "Leaving services? Upcoming bookings stay unless you tick the box to cancel them, which refunds each person in full and emails them.",
      "Changed your mind? Switch back is right there under What you offer for 30 days, and puts your type and website back.",
    ],
    where: ["Settings › Your shop"],
  },
  {
    id: "booking-calendar", side: "services",
    topic: "Selling",
    question: "How do I use the bookings calendar?",
    answer: [
      "Your calendar shows the week as hours. Click an empty time to book someone in, or drag a booking to move it. Pull its bottom edge to make it longer.",
      "Press Block time to keep clients out of a lunch, a break or a day away, once or every week. You can still book over blocked time yourself.",
      "A taken time can be booked over after a warning, when you know you can see both clients.",
      "For a service with a wait in the middle, like colour setting, turn on Processing time. Clients can then book a short service with you during that wait.",
      "If you need set-up or travel time before a service, set Time before when you edit it. That much time is kept free before each booking, so nobody is booked right up to it.",
      "For different hours on a few dates, like December or a long weekend, add Holiday hours under Hours & rules. They replace your weekly hours on those days, and you can mark a day closed. Each person on your team can have their own too.",
      "To keep a day from getting too full, set Most online bookings a day under Hours & rules. Once a day has that many, clients can't book it online, but you can still add more yourself.",
      "A room or machine that takes more than one booking at once, like three massage tables or two kilns, can say so under Team & rooms › Rooms and equipment. Pick how many it takes at once, and it fills only when all are in use.",
      "Clients can book several services in one visit, like a cut and a colour, with up to three services one after another. The calendar shows each service as its own card, and moving one moves the whole visit. A service can also come in several lengths, each with its own price. Open the service and press Offer several lengths. To sort your services, give each one a group, like Cuts or Colour, and a picture. Your booking page shows each group under its own heading.",
      "Under Team & rooms, give each person a photo and a short bio, and they show on your booking page. On your booking page lets clients pick who they see, book anyone available with no picking, or hide names from clients altogether.",
      "If you have another website, press Share above the calendar and copy the Book now button. Paste it where that website takes code. Clients then book on top of your page without leaving it, and on a phone it opens in a new tab.",
      "To check each booking before it's confirmed, open a free or pay-at-the-shop service and turn on Ask me before confirming. Clients then send a request, and you have two days to accept or decline it from the Requests box at the top of the calendar. A request you don't answer in time is declined for you, and the client gets an email either way.",
      "Share also has a link for each of Instagram, Facebook and Google, with where to paste it. Print a poster puts your QR code on a page for the window or the till. Figures then shows where your bookings came from.",
      "Clients who sign in to their account on your website see a Your bookings box. It lists what they have coming up and their past visits, with Open to move or cancel one and Book again.",
      "To move from another booking tool, export its services as a spreadsheet. Under Services, press Bring your services from a spreadsheet and choose the file. They come in hidden, so you can check each one first.",
      "Under Hours & rules, Forms before a visit holds a health form, a waiver or an agreement. Clients sign each one on their booking page. Set Sign again to ask once a year.",
      "Open a client under Clients to keep files with them, like a signed contract or a doctor's note. Press Add files and choose PDFs, documents or pictures. Only your team can open them.",
      "If you go to your clients, open the service and turn on Visit them at their place. Clients then give their address when they book. List the postal codes you travel to, and set Time before to your travel time.",
      "For a video call service, clients in another time zone see the times on their own clock, with a link to switch to yours. Their emails show both times.",
      "To know who is coming, open Hours & rules and turn on Ask clients to confirm. The reminder email then has a Yes, I'll be there button. Your calendar marks each booking Confirmed or Not confirmed.",
      "With text reminders on, turn on Let clients answer by text. Clients reply Y to confirm, C to cancel or M to move, and your calendar follows within a few minutes.",
      "To change what booking emails and texts say, open Hours & rules and find Emails and texts to clients. Write in English and French, and use {client} or {when} to fill in details.",
      "When a client asks for a time in Messages, open their message and press Make a booking. Their name, email, phone and the service they named are filled in for you.",
      "To answer messages while you're closed, open Hours & rules and turn on Away reply. People who write through your contact form then hear back at once, with the time you open again.",
      "To take your past visits away as a spreadsheet, open the calendar's List, choose Past and press Spreadsheet. Pick the days, and keep only the no-shows if you like.",
      "Someone who only answers the door or does the visits can have the Front desk or Service provider role under Settings › Team. They sign in and see just the day's bookings.",
      "People on the Front desk or Service provider role clock in and out, with breaks, when they sign in. Their hours show under Team pay, times their hourly rate if they have one.",
      "Plan who works when under Bookings › Shifts & time off, and copy last week to save typing. Your team sees their shifts when they sign in.",
      "Your team asks for time off from their own sign-in. Approve it under Shifts & time off, and clients can't book them on those days.",
      "To pay a higher share in a good month, open a person in Team & rooms and add a step under Their pay. The higher share counts only on takings above that amount.",
      "If a service uses product, like colour or wax, add what it costs per visit in the service. Team pay takes it off before working out commission.",
      "On a phone, a service provider's own day shows their next client first. They can check them in, take payment and keep a note on the visit.",
      "Bookings › Figures › Coming up shows the next 30, 60 or 90 days: bookings, what they're worth, what's paid and what's left to take. Save it as a spreadsheet.",
      "Bookings › Figures › How your team did shows each person's visits, takings, hours and how many of their clients booked again, for this month or longer.",
      "Bookings › Figures › No-shows shows who missed a booking, what it cost and which days it happens. Clients who miss twice or more are marked.",
      "Bookings › Hours & rules › Keep in touch sends a welcome after a first visit, a birthday note and a \"we miss you\" email. Clients who unsubscribed get none.",
      "Bookings › Hours & rules › Loyalty points gives clients points for visits and orders. At the level you set, they get a money-off code by email.",
      "Bookings › Hours & rules › Promo texts sends one text to clients who ticked \"Text me offers\". It goes out in the daytime, at most once a day.",
      "Bookings › Hours & rules › Other calendars takes a link to an Outlook, Apple or other calendar. Clients can't book the times it shows busy.",
      "Bookings › Hours & rules › Send bookings to other apps sends each new, moved or cancelled booking to a web address another app gives you.",
    ],
  },
  {
    id: "booking-reminders", side: "services",
    topic: "Selling",
    question: "How do booking reminders work, and what do texts cost?",
    answer: [
      "Everyone who books gets a reminder by email before their visit. Choose how long before under Hours and rules in your calendar, and add a second reminder closer to the time if you like.",
      "To send reminders by text as well, turn on Send reminders by text too in the same place. People then see a Text me reminders box when they book, and only those who tick it and give a mobile number get texts.",
      "Each text costs about two cents and is added to your monthly bill at cost, with nothing on top. A long text counts as two. Anyone can reply STOP to stop getting texts.",
    ],
  },
  {
    id: "booking-no-shows", side: "services",
    topic: "Selling",
    question: "How do I stop people missing their bookings?",
    answer: [
      "Reminders help most, so keep them on. For each service you can also ask for a deposit when people book, or the whole price.",
      "You can keep a card on file and set a missed-visit fee. If someone doesn't come, or cancels too late, open their booking and charge the fee in one step.",
      "A free service can keep a card on file too, so even free visits are held to their time.",
    ],
  },
  {
    id: "packs-of-visits", side: "services",
    topic: "Selling",
    question: "Can I sell a pack of visits?",
    answer: [
      "Yes. Open a service in your calendar, turn on Sell a pack of visits, and set how many visits, the pack's price and how long people have to use it.",
      "The client gets a code by email and uses it when they book, one visit at a time. You see every open pack and how many visits are left, and you can close a pack with a refund for what wasn't used.",
    ],
  },
  {
    id: "editions", side: "products",
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
    id: "sizes-and-colours", side: "products",
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
      "Yes. Open Settings › Your shop and find What you sell. Choose books, zines, comics, art and prints, clothing, shoes, jewelry, music, something else, or Books and other things if you sell both.",
      "The shop's pages and emails change their words at once. Your stockroom changes the next time you open it, and Settings tells you when it has. Products you already made stay as they are.",
    ],
    where: ["Settings › Your shop"],
  },
  {
    id: "stock-places", side: "products",
    topic: "Stockroom",
    question: "Some of my copies are at a market stall. Can the stockroom track that?",
    answer: [
      "Yes. Open a product in the stockroom and choose the Move between places button on its dashboard. Pick where the copies are now, where they are going and how many. Type a new place name the first time, such as Studio or Market stall.",
      "Everything you have not put in a place is called Main. The total on hand never changes when you move copies, and your sales and taxes are not affected. When something sells, Main goes down first. Close a place any time and its copies go back to Main.",
    ],
    plans: ["stockroom"],
  },
  {
    id: "size-guide", side: "products",
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
      "The first time you open your shop's admin, you choose your website. Then your Overview shows Set up your shop: eight steps from your logo to opening your shop, in an order chosen from how you said you sell today.",
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
    id: "import-spreadsheet", side: "products",
    topic: "Getting started",
    question: "How do I bring in my books from a spreadsheet?",
    answer: [
      "Save your list of books as a CSV file. Most spreadsheet programs can do this from Save as or Download.",
      "Open Books, press Import spreadsheet and choose the file. You see every book before anything is saved, and each one arrives as a draft.",
    ],
    where: ["Books"],
  },
  {
    id: "photos", side: "products",
    topic: "Getting started",
    question: "How do I add photos to my books?",
    answer: [
      "Open the book in Books and add one or more photos, then save the book.",
      "Books with a photo sell far better, and the shop looks finished.",
    ],
    where: ["Books"],
  },
  {
    id: "isbn", side: "products",
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
    id: "publish", side: "products",
    topic: "Getting started",
    question: "How do I put a book on sale?",
    answer: [
      "Open the book and choose Publish. The shop checks the book first and tells you if anything is missing, such as a price or a photo.",
      "You can also pick a date, and the book goes on sale by itself that day.",
    ],
    where: ["Books"],
  },
  {
    id: "bring-books", side: "products",
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
      "The redirects start working once your web address leads to this shop. Redirects you made yourself are never replaced. You can see or remove them in Online store › URL redirects.",
      "For your other pages, such as About or a collection, use Check your old links under URL redirects before you move your web address. It reads your old shop's list of pages, tries each one here and suggests a new home for any that would show page not found. Add them one by one or all at once.",
      "Bring your own pages over brings pages such as About, FAQ or Contact here as drafts, with their words, headings, lists and links, and a redirect from each old address. Photos on those pages stay behind, so open Settings › Design, go to Pages, add them again, read each page through and publish it.",
    ],
    where: ["Settings › Your shop"],
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
      "Your own pages and old links: open Online store and use Check your old links under URL redirects, then Bring your own pages over for pages such as About or FAQ.",
      "On the day you move, follow What do I do on the day I move from my old shop?",
      "Your Overview shows Your move so far: what has come over and what is left. Choose We had none for anything your old shop didn't have.",
    ],
    where: ["Books › Import spreadsheet", "Customers › Bring customers over", "Gift cards › Bring gift cards over", "Discounts › Bring codes over", "Orders › Bring past orders over", "Settings › Your shop"],
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
      "Open Online store and use Check your old links under URL redirects, so none of your old addresses show page not found.",
      "Connect your web address in Settings › Your shop: press Allow where you bought it, or copy across the lines it shows.",
      "Tell your mailing list where to find you.",
      "Tick Move over from your old shop in Set up your shop on the Overview.",
    ],
    where: ["Settings › Your shop"],
  },
  {
    id: "own-address",
    topic: "Bringing your shop over",
    question: "Can my shop use my own web address?",
    answer: [
      "Yes. While you set up, open Settings › Your shop and choose I already have a domain under Your web address. Type it, like yourpress.com, and we find where you bought it. Nothing changes for your old site yet.",
      "No domain yet? Choose I need a domain and buy one at GoDaddy, then come back and add it. Or keep the free address for now and add your own any time.",
      "Every shop gets a free address made from your press's name. To use another name, press Pick another name in setup. Once your shop is open, press Change name in Settings › Your shop. The address before keeps working, so anyone who has it still reaches you.",
      "Once your shop is made, we connect it for you. At most domain sellers, GoDaddy among them, you press Allow once in their window. At any other, we show you exactly what to copy across, with a Copy button on each line, or you can email it to your web person in one step.",
      "Your domain becomes your shop's main address as soon as it works, padlock included, and www.yourpress.com opens it too. We email you when it's live. Your free address keeps working the whole time.",
      "Before you say yes, take your last orders in your old shop and close its checkout: once you do, your domain shows this shop instead.",
    ],
    where: ["Settings › Your shop"],
  },
  {
    id: "shipping", side: "products",
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
      "Open Settings › Your shop › Store policies. Each one has a Start from our wording button: read it, change what doesn't fit your press, and save.",
    ],
    where: ["Settings › Your shop"],
    plans: ["shop"],
  },
  {
    id: "look",
    topic: "Selling",
    question: "How do I change how my shop looks?",
    answer: [
      "Open Online store. Your website is at the top with its colours: tap one to try it. To start from another website, pick one under Change your website, or press Preview to see it with sample products first.",
      "Use this puts it in your draft. Change words, photos and sections in Studio, then press Publish. Shoppers see nothing until you publish, and you can switch back to your old website for 30 days.",
    ],
    where: ["Online store"],
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
    id: "pre-orders", side: "products",
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
    id: "refund-order",
    topic: "Orders",
    question: "How do I refund or cancel an order?",
    answer: [
      "Open the order in Orders and choose More order actions, then Refund. Pick the whole order or just some items, give a reason, and say whether the copies go back into stock.",
      "You see the amount before anything is sent. The money goes back to the customer's card, and they get an email. It can take a few days to show on their statement.",
    ],
    steps: ["Open the order in Orders", "Press More order actions, then Refund", "Choose the items and the reason", "Check the amount and confirm"],
    where: ["Orders"],
    plans: ["shop"],
  },
  {
    id: "open-shop",
    topic: "Getting started",
    question: "How do I open my shop to shoppers?",
    answer: [
      "A new shop starts private: shoppers see an under-construction page while you set it up. When you are ready, press Open your shop, the last step of Set up your shop on the Overview.",
      "It first checks that your shop can sell: a published book, shipping, payments, your store policies and your address for emails. If something is missing, it says what and takes you there. You can close the shop again from Settings › Your shop › Store status.",
    ],
    where: ["Overview", "Settings › Your shop"],
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
    id: "new-order", side: "products",
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
    id: "send-order", side: "products",
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
    id: "fairs", side: "products",
    topic: "Stockroom",
    question: "How do I sell at a fair or a market?",
    answer: [
      "Open the stockroom on your phone and go to Event POS. Add each sale as you make it.",
      "Sales at the fair come off the same stock as your website, so you never sell a copy twice.",
    ],
    plans: ["stockroom"],
  },
  {
    id: "stock-everywhere", side: "products",
    topic: "Stockroom",
    question: "How do I keep my stock right on the website and in the stockroom?",
    answer: [
      "You don't need to do anything. The stockroom keeps the count, website sales come off it by themselves, and the website shows what the stockroom says.",
      "To check one book, open it and look at its Stock and sales tab. A book that isn't matched yet shows a Match them button there.",
    ],
    where: ["Books › a book › Stock and sales"],
    plans: ["shop", "stockroom"],
  },
  {
    id: "team",
    topic: "Your account",
    question: "Can someone help me run the shop?",
    answer: [
      "Yes. Open Settings › Team and add them with the Google email address they sign in with.",
      "Staff can do everything except change the team or your payment and email settings. Authors only see their own books, in the stockroom.",
      "If you take bookings, Front desk sees the day, books clients and checks them in. A Service provider sees only their own visits and checks people in.",
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
      "Open your shop's admin and go to Settings › Close shop. Download everything first, then press Close shop and say yes.",
      "If you've paid for this month, your shop stays open until that time ends, and you can keep it open until then. On a free trial it closes right away.",
      "Once it's closed, shoppers see a closed page. For 90 days you can still sign in, download everything or press Open my shop again. We email you 30 and 7 days before it's deleted for good.",
    ],
    steps: [
      "Press Download your shop. You get one zip with your products, customers, orders, pages, settings and photos.",
      "Press Close shop, then Yes, close my shop.",
      "Check the dates under What happens next.",
    ],
    where: ["Settings › Close shop"],
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
  "add-services": "take-bookings",
  hours: "take-bookings",
  "booking-page": "take-bookings",
});

/**
 * The Get started run's stages (apps/shop startRun.ts `RunStep`, plan 17.15): the help answer for each. Kept apart from
 * CHECKLIST_ANSWERS, which is the setup guide's own list. help.test.js checks this list against the run's stages.
 */
export const RUN_ANSWERS = Object.freeze({
  offer: "what-you-sell",
  details: "your-press",
  bring: "bring-books",
  services: "take-bookings",
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
 * answer to "What do you sell?": a books shop (or no answer) gets the articles exactly as written. `kind` is the
 * shop's type ("products", "services" or "both"); a product shop sees no booking answers and a services shop no
 * stock or shipping ones. Missing means every answer.
 */
export function articlesFor(plan, sells = null, kind = null) {
  const apps = plan === "both" ? ["shop", "stockroom"] : [plan];
  const list = ARTICLES.filter((a) => (!a.plans || a.plans.some((p) => apps.includes(p))) && !(a.books && noBooks(sells))
    && !(a.side && kind && kind !== "both" && a.side !== kind));
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
