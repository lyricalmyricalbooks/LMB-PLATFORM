// What each admin page is for, in plain words, and the parts worth pointing at (Julian, 18 November 2026: "the
// question mark should actually help explain what is on the page, even give a tour of features on the page").
//
// Keys are the page the "?" sits on: a page id (`orders`), `settings/<page>` or `stockroom/<page>` (pageHelp.ts
// `pageHelpKey`). Words are written for a bookshop; every other shop reads them through the admin's word swap
// (`useShopWords`), so write "book" where a product shop should read "product". A part marked `booksOnly` shows only
// in a shop that sells books.
//
// `at` says where a part is on the page, first match wins: a word or two the page shows (a heading, a tab, a button,
// a column) or `$` and a CSS selector. A part not on screen is still listed, it just has no tour stop. Keep each
// `text` to one short sentence (pageHelp.test.ts checks lengths and that every page in the menu has an entry).

export interface HelpPart {
  title: string;
  text: string;
  /** The words for a shop that sells books, when they differ from `text`. */
  books?: string;
  at?: string[];
  /** Only in a shop that sells books (artists, ISBNs). */
  booksOnly?: boolean;
}

export interface PageHelpEntry {
  /** One or two sentences: what the page is for. */
  intro: string;
  books?: string;
  parts: HelpPart[];
}

const TABS = "$[role=tablist]";
const TABLE = "$table";
const YEAR = "$.rp-yearswitch";

/** Bookkeeping's pills share one title; each still explains itself. */
const BOOKKEEPING_INTRO = "Bookkeeping is the record of money in and out. Each pill along the top is one job.";

export const PAGE_HELP: Record<string, PageHelpEntry> = {
  // ── Website ──
  alerts: {
    intro: "Anything in your shop that needs you, most urgent first. When nothing does, it says All clear.",
    parts: [
      { title: "The list", text: "Each alert says what's wrong and has a button that takes you straight to the fix.", at: ["All clear", "$.rp-alerts-page"] },
      { title: "Hide for now", text: "Seen it and dealing with it later? Hide it; it comes back if the problem is still there." },
      { title: "The count in the top bar", text: "The number beside the bell is how many alerts are waiting, on every page.", at: ["$.rp-alerts-pill"] },
    ],
  },
  analytics: {
    intro: "How your shop is doing: visitors, sales and what people look at, for the dates you pick.",
    parts: [
      { title: "Pages", text: "Overview, Traffic, Books and Checkout each look at one side of your shop.", at: ["$.rp-page-tabs", "Overview"] },
      { title: "Dates", text: "Pick today, a week, a month or a year. Every figure follows.", at: ["Today", "7 days"] },
      { title: "Visitors per day", text: "The chart shows how many people came each day.", at: ["Visitors per day"] },
      { title: "Refresh", text: "Fetch the latest figures without leaving the page.", at: ["Refresh"] },
    ],
  },
  orders: {
    intro: "Every order from your website. Open one to check the payment, pack it, print a label and mark it shipped.",
    parts: [
      { title: "The order list", text: "Oldest first, so nothing waits too long. Tick several to pack them together.", at: ["$.od-list", TABLE] },
      { title: "Create order", text: "Take an order by phone or email and send the customer a payment link.", at: ["Create order"] },
      { title: "Export CSV", text: "Download your orders as a spreadsheet.", at: ["Export CSV"] },
    ],
  },
  sales: {
    intro: "Every sale in one list: website orders beside fairs, stockists and sales you typed in, counted once.",
    parts: [
      { title: "Channels", text: "Pick a channel to see only those sales. The number is how many there are.", at: ["All channels"] },
      { title: "Figures", text: "Copies sold and your best channel for the dates shown.", at: ["Copies sold", "Best channel"] },
      { title: "The list", text: "Each sale with what sold, where and what you took.", at: [TABLE] },
      { title: "Download", text: "Save the list as a spreadsheet for your records.", at: ["Download spreadsheet"] },
    ],
  },
  reorder: {
    intro: "Books about to run out, most urgent first, with how many to order or reprint.",
    books: "Titles about to run out, most urgent first, with how many copies to reprint.",
    parts: [
      { title: "Suggestions", text: "Worked out from how fast each one sells and how many you have.", at: ["Reprint suggestions"] },
      { title: "Weeks left", text: "How long your stock lasts at today's pace.", at: ["Weeks left"] },
      { title: "To order", text: "A suggested amount to order. Change it to suit you.", at: ["To order"] },
      { title: "Download", text: "Send the list to your printer or supplier as a spreadsheet.", at: ["Download Excel", "Download CSV"] },
    ],
  },
  customers: {
    intro: "Everyone who buys from you: what they spent, when they last ordered, and who to win back.",
    parts: [
      { title: "Figures", text: "How many customers you have, how many come back and what each is worth.", at: ["Repeat rate", "Avg lifetime value"] },
      { title: "Groups", text: "VIPs, new, returning and at risk. Tap one to see just them.", at: ["VIP", TABS] },
      { title: "Search and sort", text: "Find someone by name or email, or sort by what they spent.", at: ["$input[type=search]", "Search customers"] },
      { title: "Bring customers over", text: "Moving from another shop system? Bring your customer list with you.", at: ["Bring customers over"] },
    ],
  },
  inventory: {
    intro: "How many of each book you have, what's running low, and quick fixes to a count.",
    books: "How many copies of each title you have, what's running low, and quick fixes to a count.",
    parts: [
      { title: "On hand", text: "The count right now. Use − and + to fix it, and say why.", at: ["On hand"] },
      { title: "Days of cover", text: "How long stock lasts at the pace it sells.", at: ["Days of cover"] },
      { title: "Receive stock", text: "A delivery arrived? Add it here so the counts go up.", at: ["Receive stock"] },
      { title: "Count stock", text: "Walk the shelves and type what's there; we show what changed.", at: ["Count stock"] },
    ],
  },
  catalog: {
    intro: "Every book in your shop. Add one, change its price or photos, and publish it when it's ready.",
    parts: [
      { title: "Add book", text: "Start a new book. It stays a draft only you see until you publish.", at: ["Add book"] },
      { title: "Your books", text: "Click a row to edit it. Tick several to change them together.", at: [TABLE] },
      { title: "Status", text: "Draft, published or hidden: what shoppers can see.", at: ["Status"] },
      { title: "Import", text: "Add many books at once from a spreadsheet or another shop system.", at: ["Import"] },
    ],
  },
  discounts: {
    intro: "Codes and offers that take money off, now or between dates you pick.",
    parts: [
      { title: "Your discounts", text: "Each one says what it takes off and whether it's on, paused or ended.", at: ["$.rp-page-body ul", "$.rp-page-body table", "Active"] },
      { title: "New discount", text: "Make a code, an automatic offer, or free shipping.", at: ["New discount"] },
      { title: "The ⋯ menu", text: "Pause, copy, share or delete a discount.", at: ["⋯"] },
      { title: "Bring codes over", text: "Moving from another shop? Bring your codes with you.", at: ["Bring codes over"] },
    ],
  },
  giftCards: {
    intro: "Gift cards people bought, and ones you gave away, with what's left on each.",
    parts: [
      { title: "Your cards", text: "The last four characters, who has it and its balance. Click one for its history.", at: ["$.rp-page-body ul", "$.rp-page-body table"] },
      { title: "Issue gift card", text: "Give someone a card, as a thank-you or a refund.", at: ["Issue gift card"] },
      { title: "Bring gift cards over", text: "Moving from another shop? Bring your cards and balances with you.", at: ["Bring gift cards over"] },
    ],
  },
  reviews: {
    intro: "What customers say about your books. Nothing shows on your website until you approve it.",
    parts: [
      { title: "Waiting", text: "New reviews land here. Approve them, or hide the ones you don't want shown.", at: ["Waiting"] },
      { title: "Views", text: "Switch between waiting, published, hidden or all.", at: [TABS] },
      { title: "Search and stars", text: "Find a review by words or by its star rating.", at: ["Search reviews", "All ratings"] },
    ],
  },
  messages: {
    intro: "Notes people send from the contact form on your website. Reply here and your answer goes by email.",
    parts: [
      { title: "Inbox", text: "New messages, with unread ones counted.", at: ["Inbox"] },
      { title: "Views", text: "Unread, replied or archived.", at: [TABS] },
      { title: "Search", text: "Find a message by name, email or words.", at: ["Search messages"] },
      { title: "Mark all read", text: "Clear the unread count in one click.", at: ["Mark all read"] },
    ],
  },
  bookings: {
    intro: "Times customers book with you: your week, the services you offer, your hours and your team.",
    parts: [
      { title: "Calendar", text: "Your week. Click a booking to move it, cancel it or mark it paid.", at: ["Calendar"] },
      { title: "Services", text: "What people can book, how long it takes and what it costs.", at: ["Services"] },
      { title: "Hours & rules", text: "When you're open, how far ahead people can book, and reminders.", at: ["Hours & rules"] },
      { title: "Week or list", text: "See the week as a calendar or as a list you can search.", at: ["Week", "List"] },
      { title: "New booking", text: "Add a booking someone made by phone or in person.", at: ["New booking"] },
    ],
  },
  takePayment: {
    intro: "Take payment at the desk: on a card reader, or with a code the client scans.",
    parts: [
      { title: "Someone at the desk", text: "Pick the service, type the amount, and take the payment.", at: ["Someone at the desk"] },
      { title: "Still to pay today", text: "Today's bookings that still owe something.", at: ["Still to pay today"] },
      { title: "Card readers", text: "Pair a card reader once; then send payments straight to it.", at: ["Card readers"] },
    ],
  },
  events: {
    intro: "Readings, launches and workshops: their tickets, who's coming, and checking people in at the door.",
    parts: [
      { title: "Coming and past", text: "Your events, the next one first.", at: ["Coming", TABS] },
      { title: "An event", text: "Tickets sold, places left, and the guest list. At the door scans tickets.", at: ["$.evt-card", "$.rp-page-body h3"] },
      { title: "New event", text: "Add a date, tickets and a picture, then put it on sale.", at: ["New event"] },
    ],
  },
  classes: {
    intro: "Your weekly timetable, who is in each class, and the classes you run.",
    parts: [
      { title: "This week", text: "Every class this week. Click one to see who's coming and check them in.", at: ["$.cls-week", "$.rp-page-body h2"] },
      { title: "Your classes", text: "Each class you run, its places and its times.", at: ["Your classes"] },
      { title: "New class", text: "Add a weekly class or a course with set dates.", at: ["New class"] },
    ],
  },
  giving: {
    intro: "Gifts and tips from your Support page: who gave, how much, and the amounts you suggest.",
    parts: [
      { title: "Fundraiser", text: "A goal people can see filling up, if you're running one.", at: ["Fundraiser"] },
      { title: "Gifts", text: "Every gift. Send the receipt again, or give a refund.", at: ["Gifts"] },
      { title: "Amounts & choices", text: "The amounts you suggest, tips at checkout and your thank-you words.", at: ["Amounts & choices"] },
      { title: "View Support page", text: "See the page givers see.", at: ["View Support page"] },
    ],
  },
  memberships: {
    intro: "Your membership plans, who is a member, and when each pays next.",
    parts: [
      { title: "Plans", text: "What members get and what it costs each month or year.", at: ["Plans"] },
      { title: "Posts for members", text: "News only members can read.", at: ["Posts for members"] },
      { title: "People", text: "Every member, their plan and their next payment.", at: ["People"] },
      { title: "New plan", text: "Add a level of membership.", at: ["New plan"] },
    ],
  },
  rentals: {
    intro: "Things you rent out by the hour or the day, and who is picking up or bringing back.",
    parts: [
      { title: "Items", text: "What you rent, how many you have and the price.", at: ["Items"] },
      { title: "Coming up and out now", text: "Who's picking up soon and what's out today.", at: ["Coming up and out now"] },
      { title: "Back recently", text: "Rentals returned in the last two weeks.", at: ["Back in the last two weeks"] },
      { title: "New item", text: "Add something people can rent.", at: ["New item"] },
    ],
  },
  channels: {
    intro: "Places your books can show up besides your website: Facebook, Instagram, Pinterest, TikTok and Google.",
    parts: [
      { title: "Your website", text: "Always on. This is your own shop.", at: ["Your website"] },
      { title: "Connected places", text: "Each one says whether it's connected and when your books were last sent.", at: ["Facebook & Instagram"] },
      { title: "Connect", text: "Sign in once to list your books there.", at: ["Connect"] },
    ],
  },
  socialPosts: {
    intro: "Post your books to your connected accounts, now or at a time you pick.",
    parts: [
      { title: "Your posts", text: "Posted, scheduled and failed posts, newest first.", at: [TABLE] },
      { title: "New post", text: "Pick a book, write a line and choose where it goes.", at: ["New post"] },
    ],
  },
  design: {
    intro: "How your website looks: the theme that's live, changes waiting to go live, and your pages.",
    parts: [
      { title: "Live theme", text: "The look shoppers see now.", at: ["Live theme"] },
      { title: "Unpublished changes", text: "Changes you made in Studio that aren't live yet.", at: ["Unpublished changes"] },
      { title: "Pages", text: "Your website's pages. Click one to edit it in Studio.", at: ["Pages"] },
      { title: "Open Studio", text: "Change colours, words and pages. Nothing changes for shoppers until you publish.", at: ["Open Studio"] },
      { title: "URL redirects", text: "Send old addresses to new pages, so old links never break.", at: ["URL redirects"] },
    ],
  },

  // ── Settings ──
  "settings/general": {
    intro: "Your shop's name, contact details, address, web address and policies, and whether the shop is open.",
    parts: [
      { title: "Your shop", text: "The name, email and short description shoppers see.", at: ["Your shop"] },
      { title: "Address", text: "Where parcels ship from, and the address on receipts.", at: ["Address"] },
      { title: "Web address", text: "Your shop's address online, or your own domain.", at: ["Web address"] },
      { title: "Store policies", text: "Returns, privacy and terms. Start from our wording if you like.", at: ["Store policies"] },
      { title: "Store status", text: "Open the shop, or close it for a while.", at: ["Store status"] },
    ],
  },
  "settings/shipping": {
    intro: "Where you ship to and what it costs. Set this before you open, so checkout can work out postage.",
    parts: [
      { title: "Tabs", text: "Overview, your shipping profiles, labels, pickup and returns.", at: [TABS] },
      { title: "Checkout readiness", text: "Whether every book has a shipping price, and what to fix if not.", at: ["Checkout readiness"] },
      { title: "Profiles", text: "Groups of books that ship the same way, with zones and prices.", at: ["Profiles"] },
      { title: "Carrier & labels", text: "Connect Canada Post to print labels and show live rates.", at: ["Carrier & labels"] },
    ],
  },
  "settings/payments": {
    intro: "How customers pay you, and in which currency.",
    parts: [
      { title: "Ready to take payments?", text: "A checklist of what's left before cards work.", at: ["Ready to take payments?"] },
      { title: "Ways to pay", text: "Cards, PayPal and other ways customers can pay.", at: ["Ways to pay"] },
      { title: "Test sale walkthrough", text: "Make a pretend purchase to check everything works.", at: ["Test sale walkthrough"] },
    ],
  },
  "settings/taxes": {
    intro: "The sales tax your checkout charges. Start from a preset for your province or add your own.",
    parts: [
      { title: "Registered?", text: "Tell us whether you're registered, so we know whether to charge tax.", at: ["Are you registered"] },
      { title: "Tax rates", text: "The rates checkout charges, by place.", at: ["Tax rates"] },
      { title: "Start from a preset", text: "Fill in the usual rates for your province in one click.", at: ["Start from a preset"] },
      { title: "Duties on parcels abroad", text: "Who pays import duties when you ship overseas.", at: ["Duties on parcels abroad"] },
    ],
  },
  "settings/notifications": {
    intro: "The emails your shop sends to customers and to you, and who they come from.",
    parts: [
      { title: "Emails", text: "Pick an email to change its words. The preview shows what customers get.", at: ["Emails"] },
      { title: "Live preview", text: "Exactly what the email looks like, as you type.", at: ["Live preview"] },
      { title: "Sending setup", text: "The address your emails come from.", at: ["Sending setup"] },
      { title: "Deliveries", text: "Recent emails and whether they arrived.", at: ["Deliveries"] },
    ],
  },
  "settings/google": {
    intro: "Every Google service with one sign-in: visitor figures, search results, Shopping listings and your sales spreadsheet.",
    parts: [
      { title: "Google", text: "Connect once and see which services are working.", at: ["Google"] },
      { title: "Your own visits", text: "Keep your own visits out of your figures.", at: ["Your own visits"] },
      { title: "Ad tracking", text: "Measure sales from ads you run, if you run any.", at: ["Ad tracking"] },
    ],
  },
  "settings/apps": {
    intro: "Apps that work with your shop, what each one can see, and what they changed.",
    parts: [
      { title: "Installed", text: "Your apps and what each can see or change.", at: ["Installed"] },
      { title: "App store", text: "Find an app to add.", at: ["App store"] },
      { title: "Activity", text: "What apps changed, and anything we stopped.", at: ["Activity"] },
      { title: "AI writing assistant", text: "Drafts descriptions and photo text for you to check.", at: ["AI writing assistant"] },
    ],
  },
  "settings/data": {
    intro: "Your customers' privacy requests, your backups and downloads, and problems shoppers hit.",
    parts: [
      { title: "Privacy requests", text: "Copy or erase a customer's data when they ask.", at: ["Privacy requests"] },
      { title: "Backups & downloads", text: "Where to find your nightly backups and full download.", at: ["Backups & downloads"] },
      { title: "Shop errors", text: "Anything that broke on a shopper's screen.", at: ["Shop errors"] },
    ],
  },
  "settings/team": {
    intro: "People who help run your shop, and what each one can do.",
    parts: [
      { title: "People", text: "Everyone with access and their role. Change a role from its list.", at: ["People"] },
      { title: "Invite someone", text: "Add a person by their Google email. They sign in with it.", at: ["Invite someone", "Invite person"] },
    ],
  },
  "settings/security": {
    intro: "Two-step sign-in: a code from your phone after Google, so a stolen password isn't enough.",
    parts: [
      { title: "Two-step sign-in", text: "Turn it on with an authenticator app on your phone.", at: ["Two-step sign-in"] },
      { title: "Backup codes", text: "Codes to get in if you lose your phone. Keep them somewhere safe.", at: ["Backup codes"] },
    ],
  },
  "settings/plan": {
    intro: "Your plan, your card, your bills and what next month will cost.",
    parts: [
      { title: "Your plan", text: "What you pay, when, and what's included.", at: ["Your plan"] },
      { title: "Next bill", text: "What the next bill will be, line by line.", at: ["Next bill"] },
      { title: "Running costs", text: "What your shop has used this month, and an estimate for month end.", at: ["Running costs"] },
      { title: "Bills", text: "Past bills to download.", at: ["Bills"] },
      { title: "Close your shop", text: "What happens if you leave, step by step.", at: ["Close your shop"] },
    ],
  },

  // ── Stockroom ──
  "stockroom/todo": {
    intro: "Everything waiting for you in the stockroom, grouped by job, most urgent first.",
    parts: [
      { title: "Orders & payments", text: "Orders to send and payments to sort.", at: ["Orders & payments to sort"] },
      { title: "Stock & reordering", text: "Books running low.", at: ["Stock & reordering"] },
      { title: "Money to chase", text: "Late invoices and stockists who owe you.", at: ["Money to chase"] },
      { title: "Missing details", text: "Book details to fill in when you have a minute.", at: ["Missing book details"] },
    ],
  },
  "stockroom/dashboard": {
    intro: "Each book's copies on hand, sales everywhere, and where its copies are.",
    books: "Each title's copies on hand, sales everywhere, and where its copies are.",
    parts: [
      { title: "Figures", text: "Copies on hand, sold, out at stores and needing a restock.", at: ["On hand", "Need restocking"] },
      { title: "Website orders", text: "Whether website sales have reached the stockroom.", at: ["Website orders"] },
      { title: "Every book", text: "Click a row for its full history.", at: [TABLE] },
      { title: "Add book", text: "Add a book to the stockroom.", at: ["Add book"] },
    ],
  },
  "stockroom/history": {
    intro: "Every sale the stockroom recorded. Look one up, change it or void it.",
    parts: [
      { title: "Channels", text: "Pick where it sold to see just those sales.", at: ["All channels"] },
      { title: "Figures", text: "Money taken and copies sold.", at: ["Money taken"] },
      { title: "The list", text: "Click a sale to change or void it.", at: [TABLE] },
      { title: "Record a sale", text: "Add a sale made somewhere else.", at: ["Record a sale"] },
    ],
  },
  "stockroom/manual": {
    intro: "Add a sale made somewhere else, so stock and totals stay right.",
    parts: [
      { title: "Where it sold", text: "The channel and date, and an order number if there is one.", at: ["Where it sold"] },
      { title: "What was sold", text: "The book, how many and the price each.", at: ["What was sold"] },
      { title: "Note", text: "Anything to remember about this sale.", at: ["Note"] },
    ],
  },
  "stockroom/pos": {
    intro: "Sell at a fair, a market or your counter. It keeps selling when the signal drops.",
    parts: [
      { title: "Books", text: "Tap a book to add it to the cart.", at: ["$.rp-till-grid"] },
      { title: "Cart", text: "What's being bought. Charge opens the payment sheet.", at: ["Cart"] },
      { title: "Till-only items", text: "Things you sell only at the till, like bags or badges.", at: ["Till-only items"] },
      { title: "End of day", text: "Count the cash and see the day's takings.", at: ["End of day"] },
    ],
  },
  "stockroom/shipping": {
    intro: "Postage and labels for parcels that aren't website orders, such as copies for stockists.",
    parts: [
      { title: "Parcels", text: "Each parcel, who it's to and whether it's gone.", at: [TABLE] },
      { title: "Buy label", text: "Print a label for a parcel that's ready.", at: ["Buy label"] },
    ],
  },
  "stockroom/consignment": {
    intro: "Shops holding your copies: what they have, what they sold and what they owe you.",
    books: "Bookshops holding your copies: what they have, what they sold and what they owe you.",
    parts: [
      { title: "Totals", text: "Copies out, sold but not paid, and settled this year.", at: ["$.rp-sk-tiles"] },
      { title: "Stockists", text: "Each shop, what they owe and when you last settled.", at: ["Stockists"] },
      { title: "Settle or bill", text: "One button per shop: settle up, or send them an invoice.", at: ["Action"] },
      { title: "Recent movements", text: "Copies sent out and sales reported, newest first.", at: ["Recent movements"] },
    ],
  },
  "stockroom/invoices": {
    intro: "Invoices for stockists and buyers: make them, send them, chase them and mark them paid.",
    parts: [
      { title: "Totals", text: "What's owed, what's late and what came in this month.", at: ["Outstanding", "Overdue"] },
      { title: "Filters", text: "Drafts, sent, overdue or paid.", at: ["All"] },
      { title: "Create invoice", text: "Make a new invoice from your books and prices.", at: ["Create invoice"] },
      { title: "Reminders", text: "Gentle emails for invoices that are late.", at: ["Reminders"] },
      { title: "Letterhead", text: "Your logo and details on every invoice.", at: ["Letterhead"] },
    ],
  },
  "stockroom/quotes": {
    intro: "Send a price first. When they say yes, turn the quote into an invoice in one click.",
    parts: [
      { title: "Filters", text: "Drafts, waiting for an answer, accepted or expired.", at: ["All"] },
      { title: "Your quotes", text: "Click one to send it, or mark it accepted.", at: [TABLE] },
      { title: "Create quote", text: "Make a new quote.", at: ["Create quote"] },
    ],
  },
  "stockroom/recurring": {
    intro: "Invoices made and emailed for you on a schedule, like a monthly standing order.",
    parts: [
      { title: "Your repeating invoices", text: "Who it's for, how often, and when the next one goes.", at: [TABLE] },
      { title: "Set one up", text: "Pick the customer, the lines and how often.", at: ["Set up a repeating invoice"] },
    ],
  },
  "stockroom/qrcodes": {
    intro: "Codes to print for card payments, your shop, or any link you choose.",
    parts: [
      { title: "Codes", text: "Your codes. Print one, or download it for a poster.", at: ["Codes"] },
      { title: "New code", text: "Make a code for a book, a payment or a link.", at: ["New code"] },
      { title: "Tally sheet and hang tags", text: "Print-ready sheets for a fair table.", at: ["Tally sheet", "Hang tags"] },
    ],
  },
  "stockroom/payouts": {
    intro: "Money on its way to your bank from card sales, and your payment links.",
    parts: [
      { title: "Payouts", text: "What's been paid out and what's on its way.", at: ["Payouts"] },
      { title: "Pay by QR and links", text: "Payment links and codes that are still open.", at: ["Pay by QR and links"] },
    ],
  },
  "stockroom/taxcenter": {
    intro: "The sales tax you collected, what you owe, and when to file.",
    parts: [
      { title: "Periods", text: "Pick a quarter or the whole year.", at: [TABS] },
      { title: "Tax by rate and place", text: "What you collected under each rate.", at: ["Tax by rate and place"] },
      { title: "Tax by channel", text: "The same tax, split by where you sold.", at: ["Tax by channel"] },
      { title: "Past filings", text: "Periods you've filed and what you paid.", at: ["Past filings"] },
      { title: "Mark period filed", text: "Filed with the government? Mark it here so we stop reminding you.", at: ["Mark period filed"] },
    ],
  },
  "stockroom/books": {
    intro: BOOKKEEPING_INTRO + " Overview is your year at a glance.",
    parts: [
      { title: "The pills", text: "Overview, transactions, expenses, receipts, bills and reports.", at: ["$.rp-page-tabs"] },
      { title: "Year", text: "Switch years. Every figure follows.", at: [YEAR] },
      { title: "Profit and loss", text: "Money in, money out and what's left.", at: ["Profit and loss"] },
      { title: "Where the money goes", text: "Your costs, biggest first.", at: ["Where the money goes"] },
      { title: "Export for accountant", text: "The year's records as one spreadsheet.", at: ["Export for accountant"] },
    ],
  },
  "stockroom/reconcile": {
    intro: BOOKKEEPING_INTRO + " Transactions is every line of money in and out.",
    parts: [
      { title: "Bank feed", text: "Connect your bank and match each line to a sale or a cost.", at: ["Bank feed"] },
      { title: "Ledger", text: "Every sale, cost and payout, newest first.", at: ["Ledger"] },
      { title: "Log expense", text: "Add a cost with its receipt.", at: ["Log expense"] },
    ],
  },
  "stockroom/expenses": {
    intro: BOOKKEEPING_INTRO + " Expenses is what you spend to run the shop.",
    parts: [
      { title: "Costs that may be missing", text: "Costs we expected but haven't seen, so nothing is forgotten.", at: ["Costs that may be missing"] },
      { title: "Log an expense", text: "Add one cost, or several at once.", at: ["Log a business expense"] },
      { title: "Recurring subscriptions", text: "Costs that come every month, added for you.", at: ["Recurring subscriptions"] },
      { title: "Sorting rules", text: "Put costs from the same place in the same category every time.", at: ["Sorting rules"] },
    ],
  },
  "stockroom/receipts": {
    intro: BOOKKEEPING_INTRO + " Receipts keeps a photo of every receipt beside its cost.",
    parts: [
      { title: "Receipts by email", text: "Forward receipts to your own address and they arrive here.", at: ["Receipts by email"] },
      { title: "Filed and missing", text: "Costs with a receipt, and the ones still missing one.", at: ["Receipts filed", "Need a receipt"] },
      { title: "Log expense", text: "Drop a photo and we fill in what we can read.", at: ["Log expense"] },
    ],
  },
  "stockroom/artists": {
    intro: BOOKKEEPING_INTRO + " Artist payouts is what you owe each artist from their books' sales.",
    parts: [
      { title: "Owed to artists", text: "The total you owe right now.", at: ["Owed to artists"], booksOnly: true },
      { title: "Each artist", text: "Copies sold, their share and what's owed. Click one to settle.", at: ["Artist", TABLE], booksOnly: true },
    ],
  },
  "stockroom/bills": {
    intro: BOOKKEEPING_INTRO + " Bills to pay is what suppliers have asked you to pay.",
    parts: [
      { title: "Filters", text: "To pay, due soon, late or paid.", at: ["To pay"] },
      { title: "Your bills", text: "Mark one paid and it goes into your expenses.", at: [TABLE] },
      { title: "Add a bill", text: "Type it in or drop the supplier's file.", at: ["Add a bill"] },
    ],
  },
  "stockroom/bkreports": {
    intro: BOOKKEEPING_INTRO + " Reports gives you the big picture and the year-end pack.",
    parts: [
      { title: "Balance sheet", text: "What you own and owe on any day.", at: ["Balance sheet"] },
      { title: "Cash flow, next 90 days", text: "What's coming in and going out, week by week.", at: ["Cash flow, next 90 days"] },
      { title: "Coming up", text: "Invoices, bills and tax due soon.", at: ["Coming up"] },
      { title: "Tax pack", text: "Every record and receipt for the year, ready for your accountant.", at: ["Tax pack", "Download tax pack"] },
    ],
  },
  "stockroom/intel": {
    intro: "Your best seller, your best channel, and other things worth knowing.",
    parts: [
      { title: "Worth knowing", text: "Short notes about what's selling and where.", at: ["Worth knowing"] },
      { title: "Ask about your sales", text: "Type a question in your own words.", at: ["Ask about your sales"] },
    ],
  },
  "stockroom/customers": {
    intro: "People who bought at fairs, from invoices or in person: not website customers.",
    parts: [
      { title: "Buyers", text: "Each buyer, how often they bought and what they spent.", at: [TABLE] },
      { title: "Last seen", text: "When they last bought from you.", at: ["Last seen"] },
    ],
  },
  "stockroom/sheets": {
    intro: "Your stock, sales and costs copied to a Google Sheet in your own Drive, kept up to date.",
    parts: [
      { title: "Your spreadsheet", text: "Connect Google once and the sheet fills itself.", at: ["$.rp-page-main .rp-card", "$.rp-page-main section"] },
    ],
  },
  "stockroom/backups": {
    intro: "Your data is backed up every night. Download everything, or keep a copy on this computer.",
    parts: [
      { title: "Backups", text: "When the last nightly backup ran, and how long they're kept.", at: ["Backed up", "Last night"] },
      { title: "Download all your data", text: "Everything in one zip, or choose the parts.", at: ["Download all your data"] },
      { title: "Back up to a folder", text: "A second copy on this computer, made once a day.", at: ["Back up to a folder"] },
      { title: "Spreadsheets", text: "Your catalog, customers, orders and books as spreadsheets.", at: ["Spreadsheets"] },
    ],
  },
};

/** Pages that are another name for one above. */
export const PAGE_HELP_ALIASES: Record<string, string> = {
  "settings/billing": "settings/plan",
  "settings/communications": "settings/notifications",
  shipping: "settings/shipping",
  payments: "settings/payments",
};
