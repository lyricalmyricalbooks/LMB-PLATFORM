// Each starter's own pages (26 November 2026, plan "Starters on par", step 2, owner's yes and pick C): About, Contact and
// Shipping & returns written for the starter's made-up brand instead of bracketed prompts, an About photo beside the
// story, a contact form on Contact (and a map for starters with a shop or studio to visit), and the two booking
// starters' own price lists and teams. A real shop gets these pages as drafts marked Sample (presetPagesToAdd), and their
// sections arrive marked Sample like the home page's, so nothing reaches shoppers until the owner publishes the page.
//
// Words are plain and the brand's own; never an email address, a review or a made-up press quote.

/** One of a booking starter's own services, shown in its price list and on Book a time in a preview. */
export type StarterService = { name: string; minutes: number; price: number; description: string; group: string; photo: string; places?: number };
/** One person on a booking starter's team. */
export type StarterTeamMember = { name: string; bio: string };

export type StarterPageSet = {
  /** Page words by Studio › Pages starter id (about, contact, shipping): plain HTML, headings and paragraphs only. */
  words: Partial<Record<"about" | "contact" | "shipping", string>>;
  /** The About page's photo band. */
  about: { eyebrow: string; title: string; body: string; photo: string; alt: string; ctaText: string; ctaUrl: string };
  /** The Contact page's form heading, and where the shop is when it has a place to visit (a map). */
  contact: { title: string; subtitle: string; buttonLabel: string; map?: { title: string; address: string } };
  services?: StarterService[];
  team?: StarterTeamMember[];
};

const h2 = (t: string) => `<h2>${t}</h2>`;
const p = (t: string) => `<p>${t}</p>`;
const page = (...parts: string[]) => parts.join("");

/** Delivery words most product starters share, with their own free-delivery line. */
const shipping = (free: string, extra: string) => page(
  h2("Delivery"), p(`${free} Orders placed before 2 pm on a weekday leave the same day; anything later goes out the next morning.`),
  h2("How long it takes"), p("Two to four working days within Canada and four to eight to the United States. You get a tracking link as soon as the parcel leaves."),
  h2("Returns"), p(`You have 30 days to send back anything unused, in its original packaging. ${extra}`),
  h2("Damaged or missing parcels"), p("Write to us through the Contact page with your order number and a photo, and we'll send a replacement or a refund straight away."),
);

export const STARTER_PAGES: Record<string, StarterPageSet> = {
  "juniper-slow-season": {
    words: {
      about: page(h2("A shop for the slow months"), p("We started with a market stall and a box of mugs from a friend's studio. Ten years on we still sell only what we would keep at home: wool, wax and stoneware made in small runs."), h2("Who makes it"), p("Six makers within a day's drive of the shop. We visit each studio, pay on time and order again when a run sells out, never a cheaper copy."), h2("Made to last"), p("Anything we sell, we will mend. Send it back with a note and we'll fix it or find someone who can.")),
      contact: page(h2("Write to us"), p("We answer every message within a day, Monday to Friday."), h2("For shops and studios"), p("We sell to a small number of shops each season. Tell us about yours and we'll send the wholesale list.")),
      shipping: shipping("Delivery is free on orders over $100, and $9 below that.", "We refund the price as soon as it reaches us; return postage is yours unless the piece arrived damaged."),
    },
    about: { eyebrow: "How we work", title: "Small runs, made near the shop", body: "Every candle, throw and mug comes from a maker we know by name. When a run is gone, it's gone until the next one.", photo: "/starters/slow-season/still-life.jpg", alt: "A mug, a candle and a folded throw on a wooden table", ctaText: "See the collection", ctaUrl: "/collections/all" },
    contact: { title: "Send us a message", subtitle: "Questions about an order, a piece or a gift: we reply within a day.", buttonLabel: "Send message" },
  },
  "juniper-catalogue": {
    words: {
      about: page(h2("A numbered catalogue"), p("We put out four catalogues a year, each a short list of paper, clay and cloth from small studios. Every piece is in stock when it's listed."), h2("How we choose"), p("We buy what we would use every day and nothing that needs explaining. Each catalogue keeps a few favourites and adds about a dozen new things."), h2("Where we are"), p("A small packing room and an office upstairs. Orders go out within two days, wrapped in paper we can recycle.")),
      contact: page(h2("Write to us"), p("Questions about an order or a piece in the catalogue: send a message and we reply within a day."), h2("For makers"), p("We look at new work twice a year, before each spring and autumn catalogue. Send a few photos and your prices.")),
      shipping: shipping("Delivery is free on orders over $90, and $8 below that.", "We refund the price as soon as it reaches us."),
    },
    about: { eyebrow: "Catalogue No. 14", title: "Chosen slowly, sent quickly", body: "Every piece in this catalogue is in stock and ships within two days, wrapped by hand.", photo: "/starters/catalogue/clay-vase.jpg", alt: "A clay vase on a pale table", ctaText: "Browse the catalogue", ctaUrl: "/collections/all" },
    contact: { title: "Send us a message", subtitle: "We reply within a day, Monday to Friday.", buttonLabel: "Send message" },
  },
  "aurel-editorial": {
    words: {
      about: page(h2("Cut and stitched by hand"), p("It started at a kitchen table in 2014 with one bag and a borrowed sewing machine. Today four of us make every piece in a studio on Rue Bernard in Montréal."), h2("Our leather"), p("Vegetable-tanned hides from one tannery in Italy, chosen for how they age. Thread, buckles and lining are the best we can find, because they wear out first."), h2("Repaired for life"), p("Send any piece back, however old, and we'll repair it. Straps, zips and corners are free; anything bigger we quote first.")),
      contact: page(h2("Write to us"), p("Questions about a bag, a repair or an order: we reply within one working day."), h2("Visit the studio"), p("We open the studio on Saturdays from 11 to 4. Come and see the bags being made."), h2("Repairs"), p("Tell us what needs fixing and send a photo. We'll reply with a label and a date.")),
      shipping: shipping("Shipping is free on orders over $150, and $12 below that.", "Monogrammed pieces can't be returned, but they can always be repaired."),
    },
    about: { eyebrow: "The studio", title: "Four of us, one long table", body: "Every bag is cut, stitched and edged by one person from start to finish, then signed inside.", photo: "/starters/aurel/atelier.jpg", alt: "The leather studio with tools on a long table", ctaText: "See the collection", ctaUrl: "/collections/all" },
    contact: { title: "Send us a message", subtitle: "About a bag, a repair or an order. We reply within one working day.", buttonLabel: "Send message", map: { title: "The studio", address: "Rue Bernard, Montréal" } },
  },
  "starter-gallery": {
    words: {
      about: page(h2("Two potters, one kiln"), p("We throw plates, bowls and cups in a small studio and fire them in batches of about two hundred pieces. Each firing goes on sale on a Friday morning."), h2("Made to be used"), p("Everything is food safe, goes in the dishwasher and is meant for every day. Small marks from the kiln are part of each piece."), h2("When a firing sells out"), p("Join the letter and we'll tell you a week before the next one opens.")),
      contact: page(h2("Write to us"), p("Questions about a piece, an order or a custom set: we reply within two working days."), h2("Visit the studio"), p("Open on the first Saturday of each month, 10 to 4. Seconds are half price on those days."), h2("Restaurants and cafés"), p("We make sets for a few restaurants each year. Tell us how many pieces you need and when.")),
      shipping: shipping("Delivery is free on orders over $120, and $14 below that. Every piece is wrapped twice.", "If anything breaks in the post, send a photo and we'll make you another from the next firing."),
    },
    about: { eyebrow: "The studio", title: "Thrown, glazed and fired by hand", body: "We make in small batches, so no two plates are quite alike. That's the point.", photo: "/starters/gallery/breakfast.jpg", alt: "A breakfast table set with handmade plates and cups", ctaText: "See the latest firing", ctaUrl: "/collections/all" },
    contact: { title: "Send us a message", subtitle: "We reply within two working days.", buttonLabel: "Send message", map: { title: "Visit the studio", address: "Leslieville, Toronto" } },
  },
  "starter-warehouse": {
    words: {
      about: page(h2("Knitwear, made in one run"), p("We make sweaters, cardigans and tees in a single run each season and never discount them later. Fewer pieces, better wool and fair pay at the mill."), h2("Where it's made"), p("Our knits come from one family mill in Portugal that we've worked with since we started. The tees are cut and sewn in Montréal."), h2("Sizing"), p("Every product page has its measurements laid flat. If you're between sizes, write to us and we'll help you choose.")),
      contact: page(h2("Write to us"), p("Questions about fit, an order or a return: someone on the team answers within a day, seven days a week."), h2("Wholesale"), p("We sell to a few shops in each city. Tell us about yours and we'll send the line sheet.")),
      shipping: shipping("Order by 2 pm on a weekday and it leaves the same day. Delivery is free over $75, and $8 below that.", "There's a prepaid return label in every box, so returns cost you nothing."),
    },
    about: { eyebrow: "Our knits", title: "Better wool, fewer pieces", body: "One run a season, folded and shipped from our own warehouse the day you order.", photo: "/starters/warehouse/shelves.jpg", alt: "Shelves of folded sweaters in neat stacks", ctaText: "Shop everything", ctaUrl: "/collections/all" },
    contact: { title: "Send us a message", subtitle: "We answer within a day, seven days a week.", buttonLabel: "Send message" },
  },
  "starter-larder": {
    words: {
      about: page(h2("One oven and a sourdough starter"), p("We opened in 2016 with one oven and a sourdough starter from a grandmother's kitchen. We still bake every loaf by hand, starting at four in the morning."), h2("The pantry"), p("Alongside the bread we roast coffee on Mondays and stock jam, tea, oil and chocolate from producers we visit ourselves."), h2("Delivery across the city"), p("Order by 8 pm and it arrives the next morning, still wrapped in paper.")),
      contact: page(h2("Write to us"), p("Questions about an order, a cake or an allergy: we reply the same day."), h2("Visit the bakery"), p("Tuesday to Sunday, 7 am to 3 pm. The bread is usually gone by one on Saturdays."), h2("Cafés and restaurants"), p("We bake for a few cafés nearby. Tell us what you need and how often.")),
      shipping: page(h2("Delivery"), p("Order by 8 pm for delivery the next morning anywhere in the city. Delivery is $6, and free on orders over $60."), h2("Pick up"), p("Choose pick-up at checkout and collect from the bakery from 7 am the next day."), h2("Something not right?"), p("Write to us the same day with your order number and we'll replace it or refund it.")),
    },
    about: { eyebrow: "Baked at 4 am", title: "Everything by hand, every morning", body: "Sourdough, rye and a short list of pastries, baked before the city wakes up.", photo: "/starters/larder/baker.jpg", alt: "A baker shaping loaves on a floured table", ctaText: "See the larder", ctaUrl: "/collections/all" },
    contact: { title: "Send us a message", subtitle: "We reply the same day.", buttonLabel: "Send message", map: { title: "Visit the bakery", address: "Roncesvalles Avenue, Toronto" } },
  },
  "starter-salon": {
    words: {
      about: page(h2("Four chairs and plenty of light"), p("We opened in 2019 in an old print shop with big windows. Tea is always on, nobody is rushed, and each stylist sees one client at a time."), h2("How a visit works"), p("Every appointment starts with a proper chat about what you want and how you wear your hair. Prices include a wash and finish."), h2("Products we use"), p("Gentle colour, salon-only care and refills, so less plastic leaves the studio.")),
      contact: page(h2("Write to us"), p("Questions about a service or a booking: we reply within a day."), h2("Opening times"), p("Tuesday to Friday, 9 am to 7 pm. Saturday, 9 am to 5 pm. Closed Sunday and Monday."), h2("Changing a booking"), p("You can change or cancel up to 24 hours before your visit from the link in your booking email.")),
    },
    about: { eyebrow: "The studio", title: "Good hair, no rush", body: "Cuts, colour and care in a bright studio. Every visit starts with a chat.", photo: "/samples/beauty/story.webp", alt: "A stylist's brushes, scissors and tint brush", ctaText: "Book a time", ctaUrl: "/book" },
    contact: { title: "Send us a message", subtitle: "We reply within a day.", buttonLabel: "Send message", map: { title: "Find the studio", address: "Dundas Street West, Toronto" } },
    services: [
      { name: "Cut and finish", minutes: 60, price: 72, description: "A consultation, wash, cut and blow-dry. Bring a photo if you have one in mind.", group: "Cuts", photo: "/samples/beauty/cut-and-style.webp" },
      { name: "Full colour", minutes: 120, price: 150, description: "All-over colour with a gloss, then a cut-in finish.", group: "Colour", photo: "/samples/beauty/colour.webp" },
      { name: "Gloss and tone", minutes: 45, price: 70, description: "Refreshes colour and shine between full colour visits.", group: "Colour", photo: "/samples/beauty/colour.webp" },
      { name: "Calming facial", minutes: 45, price: 85, description: "Cleanse, mask and a slow massage, with products chosen for your skin.", group: "Care", photo: "/samples/beauty/facial.webp" },
      { name: "Gel manicure", minutes: 40, price: 45, description: "Shape, cuticle care and a gel colour that lasts two weeks.", group: "Care", photo: "/samples/beauty/manicure.webp" },
    ],
    team: [
      { name: "Mara", bio: "Owner and colourist. Twenty years behind the chair and still loves a big change." },
      { name: "Theo", bio: "Precise cuts and short hair. Calm, quick and happy to talk you out of a fringe." },
      { name: "Ines", bio: "Facials and nails, Thursday to Saturday." },
    ],
  },
  "starter-workshop": {
    words: {
      about: page(h2("Classes for everyone"), p("Clayhouse is a small pottery studio with six wheels, two kilns and a long table for hand-building. Most people who come have never touched clay before."), h2("How classes work"), p("Eight people at most, with clay, tools, glazes and two firings included. Your finished pieces are ready to collect two weeks later."), h2("Who teaches"), p("Fifteen years at the wheel and ten teaching. Classes are slow, messy and full of laughing.")),
      contact: page(h2("Write to us"), p("Questions about a class, a gift or a private group: we reply within a day."), h2("Private groups"), p("Birthdays, teams and families: book the whole studio for up to ten people on a Sunday."), h2("Changing a booking"), p("Change or cancel up to 48 hours before your class from the link in your booking email.")),
    },
    about: { eyebrow: "The studio", title: "Six wheels and a long table", body: "Come for one evening or a whole term. We'll have the clay ready.", photo: "/samples/studio/about.webp", alt: "Shaping a vase on a pottery wheel", ctaText: "See the classes", ctaUrl: "/book" },
    contact: { title: "Send us a message", subtitle: "We reply within a day.", buttonLabel: "Send message", map: { title: "Find the studio", address: "Queen Street East, Toronto" } },
    services: [
      { name: "Saturday beginners' class", minutes: 120, price: 55, description: "Your first time on the wheel. You'll make two or three pieces to glaze next week.", group: "Classes", photo: "/samples/studio/group-class.webp", places: 8 },
      { name: "Hand-building evening", minutes: 180, price: 90, description: "Pinch, coil and slab a small set of bowls or a planter, no wheel needed.", group: "Classes", photo: "/samples/studio/hand-building.webp", places: 6 },
      { name: "Glazing session", minutes: 60, price: 25, description: "Glaze pieces from an earlier class, with help choosing colours.", group: "Classes", photo: "/samples/studio/glazing.webp", places: 6 },
      { name: "One-to-one wheel lesson", minutes: 60, price: 75, description: "An hour on the wheel with a teacher, at your own pace.", group: "One-to-one", photo: "/samples/studio/wheel-lesson.webp" },
    ],
    team: [
      { name: "Noor", bio: "Runs the studio and teaches most classes. Fifteen years at the wheel." },
      { name: "Sam", bio: "Teaches the hand-building evenings and looks after the kilns." },
    ],
  },
  "starter-commission": {
    words: {
      about: page(h2("A joinery workshop"), p("Two of us make chairs, tables and shelves in solid oak, ash and walnut, to the measurements of the room they're going into."), h2("How we build"), p("Traditional joints, pegged and glued, finished in hard wax oil. Nothing is screwed together that could be joined instead."), h2("Built to be handed on"), p("Every piece comes with a care card, and we'll refinish it for free in its first ten years.")),
      contact: page(h2("Start an enquiry"), p("Send a few photos of the room, rough sizes and a budget, and we'll reply within two working days."), h2("Visit the workshop"), p("By appointment on weekdays. Come and see the wood and finishes before you decide.")),
      shipping: page(h2("Delivery"), p("We deliver and set up every piece ourselves within 200 km of the workshop. Delivery is free within 50 km and at cost beyond that."), h2("How long it takes"), p("Pieces made to order take six to ten weeks. Pieces in stock are delivered within two weeks."), h2("Returns"), p("Pieces in stock can be returned within 14 days. Made-to-order pieces can't be returned, but we'll fix anything that isn't right.")),
    },
    about: { eyebrow: "The workshop", title: "Built for one room", body: "We draw every piece for the room it's going into, then make it by hand in about eight weeks.", photo: "/samples/made/story.webp", alt: "Hands carving wood with a chisel", ctaText: "Start an enquiry", ctaUrl: "/page/contact" },
    contact: { title: "Tell us about your project", subtitle: "Photos, sizes and a budget help. We reply within two working days.", buttonLabel: "Send enquiry" },
  },
};

/** The section lists a starter's About and Contact pages arrive with (Studio page templates `page:about`, `page:contact`). */
export function starterPageSections(id: string): Record<string, { type: string; settings?: Record<string, any> }[]> {
  const set = STARTER_PAGES[id];
  if (!set) return {};
  const a = set.about, c = set.contact;
  return {
    "page:about": [
      { type: "PageContentSection", settings: { showTitle: true, showBody: true } },
      { type: "ImageWithTextSection", settings: { eyebrow: a.eyebrow, title: a.title, body: a.body, imageUrl: a.photo, imageAlt: a.alt, layout: "image-left", ctaText: a.ctaText, ctaUrl: a.ctaUrl, colorSchemeId: "scheme-accent" } },
    ],
    "page:contact": [
      { type: "PageContentSection", settings: { showTitle: true, showBody: true } },
      { type: "ContactFormSection", settings: { title: c.title, subtitle: c.subtitle, buttonLabel: c.buttonLabel, showPhone: false, showSubject: true } },
      ...(c.map ? [{ type: "MapSection", settings: { title: c.map.title, address: c.map.address } }] : []),
    ],
  };
}

/**
 * The library with every starter's pages added: its page words, its About and Contact sections and, for the booking
 * starters, its own price list and team. Looks without an entry come back unchanged.
 */
export function withStarterPages<T extends readonly any[]>(library: T): T {
  return library.map((look: any) => {
    const set = STARTER_PAGES[look.id];
    if (!set) return look;
    const content = look.content || {};
    return {
      ...look,
      content: {
        ...content,
        pageWords: set.words,
        sections: { ...(content.sections || {}), ...starterPageSections(look.id) },
        ...(set.services ? { sampleServices: set.services } : {}),
        ...(set.team ? { sampleTeam: set.team } : {}),
      },
    };
  }) as unknown as T;
}

/**
 * A booking starter's own price list and team in the shape Book a time's preview answers with (bookTimePreview.ts), for
 * the demo shops' preview snapshot. Empty lists for a starter without its own.
 */
export function starterBookingSamples(look: any): { starterServices: any[]; starterTeam: any[] } {
  const services: StarterService[] = look?.content?.sampleServices || [];
  const team: StarterTeamMember[] = look?.content?.sampleTeam || [];
  return {
    starterServices: services.map((s, i) => ({
      id: `starter-service-${i + 1}`, name: s.name, description: s.description, minutes: s.minutes, priceMinor: Math.round(s.price * 100),
      payment: "full", location: "The studio", group: s.group, photo: s.photo, ...(s.places && s.places > 1 ? { places: s.places } : {}),
    })),
    starterTeam: team.map((t, i) => ({ id: `starter-team-${i + 1}`, name: t.name, bio: t.bio, serviceIds: [] })),
  };
}
