// Homepage layout templates — full curated section arrangements, one click.

export type HomeLayoutTemplate = {
  id: string;
  name: string;
  description: string;
  sections: { type: string; settings?: Record<string, any> }[];
};

export const HOME_LAYOUT_TEMPLATES: HomeLayoutTemplate[] = [
  {
    id: "press-riso-noir",
    name: "Riso Noir",
    description: "Black-and-white print-shop homepage: cover carousel, flare marquee, product grid, print-room notes and newsletter.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "Books for looking / books for keeping", tagline: "Independent books, printed in small runs." } },
      { type: "MarqueeSection", settings: { text: "SMALL RUNS  /  LOUD INK  /  INDEPENDENT PUBLISHING", separator: "✦", speed: 28, fontSize: 13, bold: true, fontWeight: 900, letterSpacing: 0.18, uppercase: true, background: "#e8402a", color: "#100f0d" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh off the press" } },
      { type: "StaffNotesTableSection", settings: { title: "From the print room", backgroundColor: "#0d0d0d" } },
      { type: "NewsletterSection", settings: { title: "Ink in your inbox", description: "New books, studio notes and edition alerts. No filler." } },
    ],
  },
  {
    id: "press-riso",
    name: "Riso",
    description: "A print-led storefront with a bold cover carousel, overprint-colored marquee, catalog grid and editorial notes.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "Books for looking / books for keeping", tagline: "Independent books, printed in small runs." } },
      { type: "MarqueeSection", settings: { text: "SMALL RUNS  /  LOUD INK  /  INDEPENDENT PUBLISHING", separator: "✦", speed: 28, fontSize: 13, bold: true, fontWeight: 900, letterSpacing: 0.18, uppercase: true, background: "#100f0d", color: "#faf6ec" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh off the press" } },
      { type: "StaffNotesTableSection", settings: { title: "From the print room", backgroundColor: "#f0e9da" } },
      { type: "NewsletterSection", settings: { title: "Ink in your inbox", description: "New books, studio notes and edition alerts. No filler." } },
    ],
  },
  {
    id: "press-marquee",
    name: "Marquee",
    description: "Loud, clean homepage: a cover wall up top, a lime marquee strip, a bold product grid, notes and newsletter.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "{{shop.name}}", tagline: "New things, made in small batches." } },
      { type: "MarqueeSection", settings: { text: "NEW DROPS  /  SMALL BATCHES  /  SHIPS FROM THE STUDIO", separator: "✦", speed: 26, fontSize: 14, bold: true, fontWeight: 900, letterSpacing: 0.14, uppercase: true, background: "#c8f31d", color: "#0b0b0b" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Just in" } },
      { type: "StaffNotesTableSection", settings: { title: "From the studio", backgroundColor: "#f2f2ee" } },
      { type: "NewsletterSection", settings: { title: "First to know", description: "New drops and restocks, straight to your inbox." } },
    ],
  },
  {
    id: "press-shelf",
    name: "Shelf",
    description: "Warm colour-block hero with a white shelf of products that overlaps it, a short promise band and newsletter.",
    sections: [
      { type: "HeroSection", settings: {
        title: "Good things, made with care", subtitle: "Small runs, honest materials and a shop you can actually talk to.",
        ctaText: "Shop the shelf", height: "medium", align: "left", bgColor: "#e9b44c", overlayOpacity: 0,
        textTransform: "none", headingWeight: 400,
      } },
      { type: "ProductShowcaseGridSection", settings: {
        title: "On the shelf",
        overlapAbove: 72, boxMaxWidth: 1180, panelFill: "box", cornerRadius: "lg", boxShadow: "lg",
      } },
      { type: "StaffNotesTableSection", settings: { title: "Why you will like it", backgroundColor: "#fbf6ea" } },
      { type: "NewsletterSection", settings: { title: "Letters from the shelf", description: "New arrivals and restocks, once in a while." } },
    ],
  },
  {
    id: "press-atlas",
    name: "Atlas",
    description: "Clean catalogue homepage: a short pale band, every product in a tidy grid, good-to-know notes and newsletter.",
    sections: [
      { type: "HeroSection", settings: {
        title: "Everything in one place", subtitle: "Browse the whole range, filter by what you need.",
        ctaText: "Shop all", height: "small", align: "left", bgColor: "#dfeae7", overlayOpacity: 0,
        textTransform: "none", headingWeight: 600,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "All products" } },
      { type: "StaffNotesTableSection", settings: { title: "Good to know", backgroundColor: "#ffffff" } },
      { type: "NewsletterSection", settings: { title: "Stay in the loop", description: "New arrivals and restocks, once in a while." } },
    ],
  },
  {
    id: "press-mosaic",
    name: "Mosaic",
    description: "Playful homepage: a cover carousel, a cobalt marquee strip, the product mosaic, notes and newsletter.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "{{shop.name}}", tagline: "Bright things, made with care." } },
      { type: "MarqueeSection", settings: { text: "NEW IN  /  SMALL BATCHES  /  MADE BY HAND", separator: "✦", speed: 26, fontSize: 14, bold: true, fontWeight: 800, letterSpacing: 0.08, uppercase: true, background: "#2d4ef5", color: "#ffffff" } },
      { type: "ProductShowcaseGridSection", settings: { title: "The mosaic" } },
      { type: "StaffNotesTableSection", settings: { title: "Why we love it", backgroundColor: "#ffffff" } },
      { type: "NewsletterSection", settings: { title: "Get the colours first", description: "New drops and restocks, straight to your inbox." } },
    ],
  },
  {
    id: "press-market",
    name: "Market stall",
    description: "Loud homepage: a cover carousel, a scrolling banner, fresh stickers-and-zines grid, notes and newsletter.",
    sections: [
      { type: "HeroSection", settings: {
        title: "Fresh off the table", subtitle: "Zines, comics and small-batch things, made by hand.",
        ctaText: "Shop the drop", height: "medium", align: "left", bgColor: "#ff7ab0", overlayOpacity: 0,
        textTransform: "uppercase", headingWeight: 400,
      } },
      { type: "MarqueeSection", settings: { text: "FREE STICKER WITH EVERY ORDER  /  NEW DROPS WEEKLY  /  MADE BY HAND", separator: "★", speed: 24, fontSize: 14, bold: true, fontWeight: 800, letterSpacing: 0.06, uppercase: true, background: "#16130c", color: "#ffe14d" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh off the table" } },
      { type: "StaffNotesTableSection", settings: { title: "Why we love it", backgroundColor: "#ffffff" } },
      { type: "NewsletterSection", settings: { title: "Get the drops first", description: "New zines, restocks and fair dates, straight to your inbox." } },
    ],
  },
  {
    id: "press-rows",
    name: "Index",
    description: "Catalogue homepage: a plain heading, the full product list as ruled rows, short notes and a newsletter.",
    sections: [
      { type: "ProductShowcaseGridSection", settings: { title: "Catalogue" } },
      { type: "StaffNotesTableSection", settings: { title: "Notes", backgroundColor: "#ffffff" } },
      { type: "NewsletterSection", settings: { title: "Catalogue updates", description: "New titles and restocks, by email." } },
    ],
  },
  {
    id: "press-arch",
    name: "Arch",
    description: "Calm homepage: a soft clay band, arch-topped products, a short note and newsletter.",
    sections: [
      { type: "HeroSection", settings: {
        title: "Made slowly, by hand", subtitle: "Small batches and honest materials.",
        ctaText: "See the collection", height: "medium", align: "center", bgColor: "#d9b99b", overlayOpacity: 0,
        textTransform: "none", headingWeight: 500,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "The collection" } },
      { type: "StaffNotesTableSection", settings: { title: "From the workshop", backgroundColor: "#fbf6ee" } },
      { type: "NewsletterSection", settings: { title: "Letters from the workshop", description: "New pieces and restocks, once in a while." } },
    ],
  },
  {
    id: "press-folio",
    name: "Folio",
    description: "A literary front page: one featured book beside its description, then the list and a letter from the press.",
    sections: [
      { type: "HeroSection", settings: {
        eyebrow: "FEATURED", title: "Salt Season", subtitle: "Forty poems from a year on the tidal flats. Letterpress cover, sewn binding.",
        ctaText: "Add to bag", secondaryCtaText: "Read an excerpt", height: "medium", align: "left", bgColor: "#e4dccb", overlayOpacity: 0,
        textTransform: "none", headingWeight: 500,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "The list" } },
      { type: "NewsletterSection", settings: { title: "Letters from the press", description: "New books and readings, a few times a year." } },
    ],
  },
  {
    id: "press-lantern",
    name: "Lantern",
    description: "Night-blue home with an amber glow behind a centred headline, then the books on rounded cards.",
    sections: [
      { type: "HeroSection", settings: {
        eyebrow: "NIGHT READING", title: "Stories for the small hours", subtitle: "Short fiction and quiet essays, printed in small runs and posted to your door.",
        ctaText: "Browse the list", height: "medium", align: "center", bgColor: "#101a2c", overlayOpacity: 0,
        textTransform: "none", headingWeight: 400,
        bgPattern: "glow",
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "On the nightstand" } },
      { type: "NewsletterSection", settings: { title: "A letter at dusk", description: "New stories and restocks, once in a while." } },
    ],
  },
  {
    id: "press-gutter",
    name: "Gutter",
    description: "Comic-panel home: a loud scrolling strip, a halftone headline tile and heavy-outlined product panels.",
    sections: [
      { type: "MarqueeSection", settings: { text: "NEW DROP  /  LIMITED RUN  /  FREE STICKER INSIDE", separator: "★", speed: 24, fontSize: 13, bold: true, fontWeight: 800, letterSpacing: 0.08, uppercase: true, background: "#111111", color: "#f7f4ea" } },
      { type: "HeroSection", settings: {
        eyebrow: "ISSUE #12 OUT NOW", title: "New drop!", subtitle: "Risograph zines and comics, stapled by hand.",
        ctaText: "Shop #12", accentColor: "#111111", height: "medium", align: "left", bgColor: "#e6007e", overlayOpacity: 0,
        textTransform: "uppercase", headingWeight: 400,
        bgPattern: "dots", outlineWidth: 4, outerGap: 16,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh off the press" } },
      { type: "NewsletterSection", settings: { title: "Get the drops first", description: "New issues and restocks, straight to your inbox." } },
    ],
  },
  {
    id: "press-signal",
    name: "Signal",
    description: "Swiss and loud: one huge headline, then the whole catalogue as numbered rows.",
    sections: [
      { type: "HeroSection", settings: {
        title: "Printed matter.", subtitle: "Essays, artist editions and prints. Every run small.",
        ctaText: "Browse the catalogue", height: "medium", align: "left", bgColor: "#ffffff", overlayOpacity: 0,
        textTransform: "none", headingWeight: 700,
        headingSize: 150, mobileHeadingSize: 56, headingLineHeight: 0.86, letterSpacingOverride: -0.045,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Catalogue" } },
      { type: "NewsletterSection", settings: { title: "Catalogue updates", description: "New titles and restocks, by email." } },
    ],
  },
  {
    id: "press-kiln",
    name: "Kiln",
    description: "Warm and handmade: a clay-coloured welcome, then round covers and pill buttons.",
    sections: [
      { type: "HeroSection", settings: {
        eyebrow: "HAND-THROWN  /  SMALL BATCH", title: "Made by hand, read by heart.", subtitle: "Books and objects from our studio.",
        ctaText: "Shop the collection", accentColor: "#3b2418", height: "medium", align: "center", bgColor: "#e3b778", overlayOpacity: 0,
        textTransform: "none", headingWeight: 800,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "From the kiln" } },
      { type: "NewsletterSection", settings: { title: "Letters from the studio", description: "New pieces and restocks, once in a while." } },
    ],
  },
  {
    id: "press-almanac",
    name: "Almanac",
    description: "A reference book: a boxed masthead, the book of the month and the full contents list with prices.",
    sections: [
      { type: "TextContentSection", settings: {
        title: "{{shop.name}}", content: "<p>Books worth keeping.</p>", align: "center", headingWeight: 700,
        outlineWidth: 2, outlineColor: "var(--accent-2)", boxMaxWidth: 1100, outerGap: 24,
      } },
      { type: "BookSpotlightSection", settings: { eyebrow: "BOOK OF THE MONTH" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Contents" } },
      { type: "NewsletterSection", settings: { title: "The next edition", description: "New titles, once a season." } },
    ],
  },
  {
    id: "press-console",
    name: "Console",
    description: "A terminal: green text on near-black, a welcome file and the books listed like a directory.",
    sections: [
      { type: "TextContentSection", settings: {
        title: "$ hello", content: "<p>Speculative fiction, compiled weekly. Novellas and zines from the edge of the solar system.</p>", align: "left",
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "$ ls books/ --sort=new" } },
      { type: "NewsletterSection", settings: { title: "$ subscribe", description: "One email per new release." } },
    ],
  },
  {
    id: "press-picnic",
    name: "Picnic",
    description: "Bubbly and kind: a gingham welcome, then rounded cards with pastel stickers. Made for children's books.",
    sections: [
      { type: "HeroSection", settings: {
        eyebrow: "AGES 0 TO 8", title: "Bedtime stories with big feelings", subtitle: "Picture books for little readers and the grown-ups who read to them.",
        ctaText: "Start reading!", accentColor: "#3d2b5a", height: "medium", align: "center", bgColor: "#ffd9e1", overlayOpacity: 0,
        textTransform: "none", headingWeight: 600,
        bgPattern: "gingham",
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Pick a story" } },
      { type: "NewsletterSection", settings: { title: "Story time, by email", description: "New books and reading ideas, once a month." } },
    ],
  },
  {
    id: "press-cutout",
    name: "Cutout",
    description: "Paper collage: a yellow strip, a three-word headline in coloured blocks, and tilted product cards.",
    sections: [
      { type: "HeroSection", settings: {
        title: "Cut. Paste. Print.", subtitle: "Zines and prints, made on a kitchen table.",
        ctaText: "Shop new zines", height: "medium", align: "left", bgColor: "#ff5a36", overlayOpacity: 0,
        textTransform: "uppercase", headingWeight: 400,
        tilt: "-1", outerGap: 24,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh cuts" } },
      { type: "NewsletterSection", settings: { title: "Get the drops first", description: "New zines and fair dates, straight to your inbox." } },
    ],
  },
  {
    id: "press-reel",
    name: "Reel",
    description: "Cinematic: a dark full-width feature, then a numbered strip of covers with condensed titles.",
    sections: [
      { type: "HeroSection", settings: {
        eyebrow: "NEW RELEASE", title: "Small Hours", subtitle: "Vinyl and book, out now.",
        ctaText: "Order", height: "", align: "left", overlayOpacity: 0.5, textTransform: "uppercase", headingWeight: 700,
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Now showing" } },
      { type: "NewsletterSection", settings: { title: "First to hear", description: "New releases and restocks, by email." } },
    ],
  },
  {
    id: "press-punk",
    name: "Punk",
    description: "Book-cover carousel hero, scrolling marquee, releases grid, staff notes table and a featured release banner.",
    sections: [
      // The homepage header is fixed/transparent, so the full-bleed carousel
      // leads and the marquee strip sits below it (a first-section marquee
      // would collide with the header).
      { type: "ProductCoverCarouselSection", settings: {
        title: "{{shop.name}}",
        tagline: "An independent publishing house specializing in contemporary photography and art books.",
      } },
      { type: "MarqueeSection", settings: {
        text: "INDEPENDENT PUBLISHING HOUSE SPECIALIZING IN CONTEMPORARY PHOTOGRAPHY AND EPHEMERA",
        separator: "", speed: 24, fontSize: 11, bold: false, fontWeight: 600, letterSpacing: 0.14, uppercase: true,
        background: "#141219", color: "rgba(243,241,238,0.56)",
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Recent Releases" } },
      { type: "StaffNotesTableSection", settings: { title: "Staff Notes", backgroundColor: "#0c0b12" } },
      { type: "HeroSection", settings: {
        eyebrow: "FEATURED RELEASE", title: "Roadkill", titleItalic: true,
        subtitle: "Photographs taken along secondary highways — a document of what gets left behind.",
        ctaText: "SHOP NOW", metaText: "Softcover · 112pp", height: "medium", align: "left",
        overlayOpacity: 0.55, textTransform: "none", headingWeight: 600,
      } },
    ],
  },
  {
    id: "press-broadsheet",
    name: "Broadsheet",
    description: "A newspaper front page: a lead book, a ruled ticker, this week's titles in columns, reviews and a subscribe box.",
    sections: [
      { type: "BookSpotlightSection", settings: { eyebrow: "LEAD STORY" } },
      { type: "MarqueeSection", settings: { text: "NEW TITLES  /  REVIEWS  /  EVENTS  /  BACKLIST", separator: "■", speed: 32, fontSize: 12, bold: true, fontWeight: 700, letterSpacing: 0.16, uppercase: true, background: "#141414", color: "#f4f1ea" } },
      { type: "ProductShowcaseGridSection", settings: { title: "This week's titles" } },
      { type: "PraiseQuotesSection", settings: { title: "The reviews" } },
      { type: "NewsletterSection", settings: { title: "Subscribe to the edition", description: "New titles and events, once a week. Unsubscribe any time." } },
    ],
  },
  {
    id: "press-imprint",
    name: "Imprint",
    description: "A publisher's list: a quiet welcome, the books in three columns, praise for the list and a letter from the press.",
    sections: [
      { type: "TextContentSection", settings: { title: "{{shop.name}}", content: "<p>Books we publish, in the order we love them.</p>", align: "center" } },
      { type: "ProductShowcaseGridSection", settings: { title: "The list" } },
      { type: "PraiseQuotesSection", settings: { title: "Praise for the list" } },
      { type: "NewsletterSection", settings: { title: "Letters from the press", description: "New books and readings, a few times a year." } },
    ],
  },
  {
    id: "press-zine",
    name: "Zine",
    description: "A zine table: a ticker of news, the latest issues, a short note on how they're made and a mailing list.",
    sections: [
      { type: "MarqueeSection", settings: { text: "NEW ISSUE OUT NOW  /  MAIL ORDER  /  TRADES WELCOME", separator: "★", speed: 28, fontSize: 12, bold: true, fontWeight: 700, letterSpacing: 0.12, uppercase: true } },
      { type: "ProductShowcaseGridSection", settings: { title: "Latest issues" } },
      { type: "TextContentSection", settings: { title: "Made by hand", content: "<p>Photocopied, folded and stapled in small runs. When a run is gone, it's gone.</p>" } },
      { type: "NewsletterSection", settings: { title: "Get the next issue", description: "A short email when something new is printed." } },
    ],
  },
  {
    id: "press-letterpress",
    name: "Letterpress",
    description: "A quiet title page, one book in the spotlight, the books in print and news from the press.",
    sections: [
      { type: "TextContentSection", settings: { title: "{{shop.name}}", content: "<p>Books set, printed and bound with care.</p>", align: "center" } },
      { type: "BookSpotlightSection", settings: { eyebrow: "NEW FROM THE PRESS" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Books in print" } },
      { type: "NewsletterSection", settings: { title: "News from the press", description: "New books and readings, a few times a year." } },
    ],
  },
  {
    id: "press-index",
    name: "Index",
    description: "An art-book index: new titles in a row, every title in a tight grid, the collections and a mailing list.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "New titles", tagline: "Art books and editions." } },
      { type: "ProductShowcaseGridSection", settings: { title: "All titles" } },
      { type: "CollectionListSection", settings: { title: "Series", columns: 3 } },
      { type: "NewsletterSection", settings: { title: "New titles by email", description: "One email per new title. Unsubscribe any time." } },
    ],
  },
  {
    id: "press-chapbook",
    name: "Chapbook",
    description: "A short welcome, a featured collection of poems, every chapbook in four columns and a mailing list.",
    sections: [
      { type: "TextContentSection", settings: { title: "{{shop.name}}", content: "<p>Small books of poems, sewn by hand.</p>", align: "center" } },
      { type: "BookSpotlightSection", settings: { eyebrow: "NEW POEMS" } },
      { type: "ProductShowcaseGridSection", settings: { title: "All chapbooks" } },
      { type: "NewsletterSection", settings: { title: "A poem now and then", description: "New chapbooks and readings, a few times a year." } },
    ],
  },
  {
    id: "press-archive",
    name: "Archive",
    description: "A catalogue: the collections first, then every title in a square grid, and a note on how to visit.",
    sections: [
      { type: "CollectionListSection", settings: { title: "Collections", columns: 3 } },
      { type: "ProductShowcaseGridSection", settings: { title: "Holdings" } },
      { type: "TextContentSection", settings: { title: "About the archive", content: "<p>Every title is catalogued here. Write to us with questions about an edition.</p>" } },
      { type: "NewsletterSection", settings: { title: "New acquisitions", description: "An email when new titles join the archive." } },
    ],
  },
  {
    id: "press-poster",
    name: "Poster",
    description: "A loud front page: a scrolling headline, new books on big covers, the full list and a sign-up.",
    sections: [
      { type: "MarqueeSection", settings: { text: "NEW BOOKS  /  SIGNED COPIES  /  OUT NOW", separator: "●", speed: 30, fontSize: 14, bold: true, fontWeight: 700, letterSpacing: 0.08, uppercase: true } },
      { type: "ProductCoverCarouselSection", settings: { title: "Out now", tagline: "Books worth pinning to the wall." } },
      { type: "ProductShowcaseGridSection", settings: { title: "Everything" } },
      { type: "NewsletterSection", settings: { title: "Don't miss the next one", description: "One email per new book." } },
    ],
  },
  {
    id: "press-about",
    name: "About page",
    description: "Jumbo centered headline, ephemera object row, 'Why this exists' columns and a photo + contact block — apply on an About page template.",
    sections: [
      { type: "TextContentSection", settings: {
        title: "About", align: "center", headingSize: 96, headingWeight: 800, content: "",
      } },
      { type: "EphemeraRowSection", settings: { align: "center" } },
      { type: "RowSection", settings: { layout: "33-67", gap: 48, verticalAlign: "top", items: [
        { kind: "text", title: "WHY THIS EXISTS", body: "" },
        { kind: "text", title: "", body: "{{shop.name}} is an independent imprint publishing contemporary photography and art books in small, considered runs. We care more about ink, paper, and sequence than trends. Independently run, and updated whenever there's something worth printing." },
      ] } },
      { type: "ImageWithTextSection", settings: {
        eyebrow: "CONTACT", title: "Got a manuscript, a proposal, or a question about an order?",
        body: "Write to us and we'll answer within a few days.", ctaText: "Email us", ctaUrl: "mailto:owner@example.com", layout: "image-left",
      } },
    ],
  },
  {
    id: "press-journal",
    name: "Journal",
    description: "Jumbo centered headline plus editorial article cards — apply on a Journal page template.",
    sections: [
      { type: "TextContentSection", settings: {
        title: "Journal", align: "center", headingSize: 96, headingWeight: 800,
        content: "Essays, studio notes, and press.",
      } },
      { type: "BlogPostsSection", settings: { eyebrow: "", title: "", columns: 3 } },
    ],
  },
  {
    id: "editorial-launch",
    name: "Editorial Launch",
    description: "Hero, story, featured title, social proof and email capture — a classic publisher homepage.",
    sections: [
      { type: "HeroSection", settings: { title: "THE NEW COLLECTION", subtitle: "Photography & art books", ctaText: "EXPLORE", align: "center", overlayOpacity: 0.5 } },
      { type: "ImageWithTextSection", settings: { eyebrow: "OUR STORY", title: "Independent by design", body: "Tell the story behind your imprint — what you publish and why it matters.", ctaText: "Read more", layout: "image-left" } },
      { type: "FeaturedProductSection", settings: { eyebrow: "FEATURED", ctaText: "View product" } },
      { type: "TestimonialsSection", settings: { title: "WHAT COLLECTORS SAY" } },
      { type: "NewsletterSection", settings: { title: "JOIN THE ARCHIVE", description: "Occasional dispatches about new publications." } },
    ],
  },
  {
    id: "conversion-focused",
    name: "Conversion Focused",
    description: "Promo marquee, collections, benefits and a countdown — built to sell.",
    sections: [
      { type: "HeroSection", settings: { title: "SHOP THE DROP", subtitle: "Limited editions, while they last", ctaText: "SHOP NOW", height: "medium", align: "center" } },
      { type: "MarqueeSection", settings: { text: "Free shipping over $100 · New arrivals weekly", speed: 20, fontSize: 24 } },
      { type: "CollectionListSection", settings: { title: "Shop by collection", columns: 3 } },
      { type: "FeatureGridSection", settings: { title: "WHY SHOP WITH US", columns: 3 } },
      { type: "CountdownSection", settings: { eyebrow: "LIMITED TIME", title: "Sale ends soon", ctaText: "Shop the sale" } },
      { type: "NewsletterSection", settings: { title: "10% OFF YOUR FIRST ORDER", description: "Join the list for the code." } },
    ],
  },
  {
    id: "storyteller",
    name: "Storyteller",
    description: "Slideshow, long-form copy, side-by-side columns, gallery and FAQ — editorial depth.",
    sections: [
      { type: "SlideshowSection", settings: { autoplay: true, autoplaySpeed: 5000 } },
      { type: "TextContentSection", settings: { title: "Our story", content: "Add your mission statement or store introduction here." } },
      { type: "RowSection", settings: { layout: "50-50", gap: 48, items: [
        { kind: "text", title: "Crafted with care", body: "Use rows to pair copy with imagery.", buttonText: "Discover", buttonUrl: "#" },
        { kind: "image", imageUrl: "" },
      ] } },
      { type: "GallerySection", settings: { title: "Gallery", columns: 3 } },
      { type: "FAQSection", settings: { title: "FREQUENTLY ASKED QUESTIONS" } },
      { type: "ContactFormSection", settings: { title: "Get in touch" } },
    ],
  },
  {
    id: "minimal-gallery",
    name: "Minimal Gallery",
    description: "A quiet, image-first page: hero, gallery, one paragraph, email capture.",
    sections: [
      { type: "HeroSection", settings: { title: "{{shop.name}}", subtitle: "Photography & art books", ctaText: "ENTER", overlayOpacity: 0.35, align: "center" } },
      { type: "GallerySection", settings: { columns: 3 } },
      { type: "TextContentSection", settings: { title: "", content: "A short statement about your practice." } },
      { type: "NewsletterSection", settings: { title: "STAY IN TOUCH" } },
    ],
  },
];

