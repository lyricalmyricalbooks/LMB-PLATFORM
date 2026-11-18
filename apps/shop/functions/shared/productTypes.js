// GENERATED from src/shared/productTypes.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Product types (product types plan, change 2, 18 November 2026): 16 groups and about 100 types of thing an independent
// shop sells, each built from a few shared traits. The add-product window finds a type from the owner's own words, and
// the type then shapes the product page: which size list it offers, which choices it suggests (Scent, Metal), which
// facts it asks for (burn time, fibre), its safety line, how it ships and its Google category.
//
// The rule: today's eight kinds keep working. Every type names one of PRODUCT_KINDS as its `kind`, and a product saved
// with a type also keeps that kind, so tax, customs, weights and book-only fields (which all read the kind) are exactly as
// before. A product with no type gets its group from its kind (a printed book is in Books and paper).
//
// Google categories are the nearest heading in Google's product list (checked November 2026), a starting point the owner
// can change. Pure: the shop imports this file and the Functions run its generated copy (functions/shared/productTypes.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWN_TYPES_MAX = exports.PRODUCT_TYPES = exports.TYPE_GROUPS = void 0;
exports.typeById = typeById;
exports.typeGroup = typeGroup;
exports.typeOfProduct = typeOfProduct;
exports.productGroup = productGroup;
exports.sellsGroups = sellsGroups;
exports.shopGroups = shopGroups;
exports.searchTypes = searchTypes;
exports.lawFacts = lawFacts;
exports.typeStart = typeStart;
exports.cleanOwnTypes = cleanOwnTypes;
exports.ownTypeId = ownTypeId;
exports.searchOwnTypes = searchOwnTypes;
exports.namesAType = namesAType;
exports.sizeListsFor = sizeListsFor;
const productOptions_1 = require("./productOptions");
const productSizes_1 = require("./productSizes");
exports.TYPE_GROUPS = [
    { id: "clothing", name: "Clothing", blurb: "Tops, dresses, trousers, kids' and baby clothes" },
    { id: "shoes", name: "Shoes", blurb: "Shoes, boots, sandals and slippers" },
    { id: "bags", name: "Bags and accessories", blurb: "Bags, wallets, hats, scarves, pins and patches" },
    { id: "jewelry", name: "Jewelry", blurb: "Rings, necklaces, earrings and watches" },
    { id: "art", name: "Art and prints", blurb: "Originals, prints, posters, cards and stickers" },
    { id: "books", name: "Books and paper", blurb: "Books, zines, comics, notebooks and stationery" },
    { id: "music", name: "Music and film", blurb: "Records, CDs, tapes and films" },
    { id: "home", name: "Home and living", blurb: "Ceramics, candles, textiles, decor and lighting" },
    { id: "beauty", name: "Beauty and care", blurb: "Skincare, soap, hair care and perfume" },
    { id: "food", name: "Food and drink", blurb: "Coffee, tea, sweets, baking and pantry" },
    { id: "kids", name: "Kids and toys", blurb: "Toys, games, puzzles and baby gear" },
    { id: "plants", name: "Plants and garden", blurb: "Plants, seeds, pots and tools" },
    { id: "craft", name: "Craft supplies", blurb: "Yarn, fabric, patterns, beads and kits" },
    { id: "pets", name: "Pets", blurb: "Treats, toys, beds, collars and leads" },
    { id: "tech", name: "Tech and gadgets", blurb: "Phone cases, accessories and small electronics" },
    { id: "not-parcel", name: "Not a parcel", blurb: "Downloads, gift cards, bundles and made-to-order" },
];
const SAFETY_CANDLE = "Never leave a burning candle unattended. Keep away from children, pets and anything that can catch fire. Trim the wick to ¼ inch before lighting.";
const SAFETY_SMALL_PARTS = "Warning: small parts. Not for children under 3 years.";
const SAFETY_BATTERY = "Contains a battery. Keep away from children; if swallowed, get medical help right away.";
const F = {
    material: { key: "material", label: "Material", example: "100% organic cotton" },
    care: { key: "care", label: "Care", example: "Machine wash cold, hang to dry" },
    fit: { key: "fit", label: "Fit", example: "Relaxed, true to size" },
    dimensions: { key: "dimensions", label: "Dimensions", example: "30 × 40 cm" },
    madeIn: { key: "madeIn", label: "Made in", example: "Toronto, Canada" },
    ingredients: { key: "ingredients", label: "Ingredients", example: "Organic shea butter, olive oil, lavender oil", law: true },
    allergens: { key: "allergens", label: "Allergens", example: "Contains milk and tree nuts", law: true },
    bestBefore: { key: "bestBefore", label: "Best before", example: "6 months from the roast date", law: true },
    storage: { key: "storage", label: "Storage", example: "Keep cool and dry" },
    howToUse: { key: "howToUse", label: "How to use", example: "Massage into damp skin, rinse" },
    netAmount: { key: "netAmount", label: "Net amount", example: "100 ml", law: true },
    ages: { key: "ages", label: "Ages", example: "3 years and up", law: true },
    metal: { key: "metal", label: "Metal", example: "Sterling silver" },
    stones: { key: "stones", label: "Stones", example: "Freshwater pearl" },
    nickelFree: { key: "nickelFree", label: "Nickel-free", example: "Yes" },
    medium: { key: "medium", label: "Medium", example: "Risograph, two colours" },
    edition: { key: "edition", label: "Edition", example: "Edition of 50, signed and numbered" },
    paper: { key: "paper", label: "Paper", example: "Mohawk Superfine 100 lb" },
    format: { key: "format", label: "Format", example: "12-inch LP, 180 g" },
    label: { key: "label", label: "Label", example: "Self-released" },
    release: { key: "release", label: "Release date", example: "March 2026" },
    tracklist: { key: "tracklist", label: "Tracklist", example: "A1 Opening, A2 …" },
    pages: { key: "pages", label: "Pages", example: "96" },
    binding: { key: "binding", label: "Binding", example: "Saddle-stitched" },
    compatible: { key: "compatible", label: "Works with", example: "iPhone 17 and 17 Pro" },
    warranty: { key: "warranty", label: "Warranty", example: "1 year" },
    light: { key: "light", label: "Light", example: "Bright, indirect light" },
    water: { key: "water", label: "Water", example: "When the top 2 cm are dry" },
    leadTime: { key: "leadTime", label: "Made in", example: "2 to 3 weeks" },
};
const GROUP_DEFAULTS = {
    clothing: { kind: "clothing", sizes: ["letters"], choices: ["Colour"], facts: [F.material, F.care, F.fit] },
    shoes: { kind: "shoes", sizes: ["shoes-na", "shoes-eu", "shoes-uk", "widths"], choices: ["Colour"], facts: [{ key: "upper", label: "Upper", example: "Full-grain leather" }, { key: "sole", label: "Sole", example: "Natural rubber" }, F.fit], google: "Apparel & Accessories > Shoes" },
    bags: { kind: "other", choices: ["Colour"], facts: [F.material, F.dimensions, F.care] },
    jewelry: { kind: "jewelry", choices: ["Metal"], facts: [F.metal, F.stones, F.nickelFree], traits: { personalised: true } },
    art: { kind: "art", sizes: ["prints"], choices: ["Framed"], facts: [F.medium, F.paper, F.edition, F.dimensions], traits: { flat: true } },
    books: { kind: "book", facts: [F.pages, F.binding], traits: { taxGroup: "books" } },
    music: { kind: "music", choices: ["Format"], facts: [F.format, F.label, F.release, F.tracklist] },
    home: { kind: "other", choices: ["Colour"], facts: [F.material, F.dimensions, F.care] },
    beauty: { kind: "other", sizes: ["bottle"], choices: ["Scent"], facts: [F.ingredients, F.howToUse, F.netAmount], traits: { ingredients: true } },
    food: { kind: "other", sizes: ["bag"], facts: [F.ingredients, F.allergens, F.bestBefore, F.storage, F.netAmount], traits: { ingredients: true, allergens: true, taxGroup: "grocery" } },
    kids: { kind: "other", facts: [F.ages, F.material], traits: { safety: SAFETY_SMALL_PARTS } },
    plants: { kind: "other", facts: [F.light, F.water], google: "Home & Garden > Plants" },
    craft: { kind: "other", choices: ["Colour"], facts: [F.material], google: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts" },
    pets: { kind: "other", sizes: ["pets"], facts: [F.material, F.dimensions], google: "Animals & Pet Supplies > Pet Supplies" },
    tech: { kind: "other", facts: [F.compatible, F.warranty], google: "Electronics > Electronics Accessories" },
    "not-parcel": { kind: "other", facts: [] },
};
const TYPE_DRAFTS = {
    clothing: [
        ["tops", "T-shirts and tops", { words: ["t-shirt", "tee", "tshirt", "tank", "top", "crop top", "long sleeve"], google: "Apparel & Accessories > Clothing > Shirts & Tops" }],
        ["shirts", "Shirts and blouses", { words: ["shirt", "blouse", "button-up", "button down"], google: "Apparel & Accessories > Clothing > Shirts & Tops" }],
        ["knits", "Sweaters and knits", { words: ["sweater", "jumper", "hoodie", "sweatshirt", "cardigan", "knitwear", "crewneck"], google: "Apparel & Accessories > Clothing > Shirts & Tops" }],
        ["dresses", "Dresses and skirts", { words: ["dress", "skirt", "jumpsuit", "romper"], sizes: ["letters", "numbers"], google: "Apparel & Accessories > Clothing > Dresses" }],
        ["trousers", "Trousers and shorts", { words: ["trousers", "pants", "jeans", "shorts", "leggings", "overalls"], sizes: ["letters", "waist", "numbers"], google: "Apparel & Accessories > Clothing > Pants" }],
        ["outerwear", "Jackets and coats", { words: ["jacket", "coat", "parka", "vest", "raincoat", "blazer"], google: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets" }],
        ["activewear", "Activewear", { words: ["sportswear", "yoga", "gym", "running", "athletic"], google: "Apparel & Accessories > Clothing > Activewear" }],
        ["underwear", "Underwear and socks", { words: ["underwear", "socks", "bra", "boxers", "briefs", "lingerie", "pyjamas", "pajamas"], google: "Apparel & Accessories > Clothing > Underwear & Socks" }],
        ["swimwear", "Swimwear", { words: ["swimsuit", "bikini", "swim trunks", "bathing suit"], google: "Apparel & Accessories > Clothing > Swimwear" }],
        ["kids-clothing", "Kids' clothing", { words: ["kids", "children", "youth", "toddler"], sizes: ["kids"], traits: { taxGroup: "kids-clothing" }, google: "Apparel & Accessories > Clothing" }],
        ["baby-clothing", "Baby clothing", { words: ["baby", "onesie", "bodysuit", "infant", "newborn"], sizes: ["baby"], traits: { taxGroup: "kids-clothing" }, google: "Apparel & Accessories > Clothing > Baby & Toddler Clothing" }],
    ],
    shoes: [
        ["shoes", "Shoes", { words: ["sneakers", "trainers", "loafers", "flats", "heels", "clogs", "runners"] }],
        ["boots", "Boots", { words: ["boot", "chelsea", "ankle boots", "work boots"] }],
        ["sandals", "Sandals", { words: ["sandal", "slides", "flip flops", "mules"] }],
        ["slippers", "Slippers", { words: ["slipper", "house shoes", "moccasins"], sizes: ["letters", "shoes-na"] }],
        ["kids-shoes", "Kids' shoes", { words: ["children's shoes", "baby shoes", "toddler shoes"], sizes: ["shoes-kids"], traits: { taxGroup: "kids-clothing" } }],
    ],
    bags: [
        ["bags", "Bags and totes", { words: ["bag", "tote", "backpack", "purse", "handbag", "crossbody", "pouch", "fanny pack"], google: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags" }],
        ["wallets", "Wallets", { words: ["wallet", "card holder", "coin purse"], traits: { personalised: true }, google: "Apparel & Accessories > Handbags, Wallets & Cases > Wallets & Money Clips" }],
        ["hats", "Hats", { kind: "clothing", words: ["hat", "cap", "beanie", "toque", "bucket hat"], sizes: ["hats"], google: "Apparel & Accessories > Clothing Accessories > Hats" }],
        ["scarves", "Scarves", { kind: "clothing", words: ["scarf", "shawl", "bandana", "wrap"], google: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls" }],
        ["belts", "Belts", { words: ["belt"], sizes: ["small-large", "waist"], google: "Apparel & Accessories > Clothing Accessories > Belts" }],
        ["gloves", "Gloves", { kind: "clothing", words: ["glove", "mittens", "mitts"], sizes: ["small-large"], google: "Apparel & Accessories > Clothing Accessories > Gloves & Mittens" }],
        ["hair", "Hair accessories", { words: ["scrunchie", "hair clip", "headband", "barrette", "hair tie"], google: "Apparel & Accessories > Clothing Accessories > Hair Accessories" }],
        ["pins", "Pins and patches", { words: ["pin", "enamel pin", "badge", "button", "patch", "iron-on"], facts: [F.material, F.dimensions], google: "Apparel & Accessories > Clothing Accessories > Brooches & Lapel Pins" }],
    ],
    jewelry: [
        ["rings", "Rings", { words: ["ring", "band", "signet"], sizes: ["rings"], facts: [F.metal, F.stones, { key: "bandWidth", label: "Band width", example: "2 mm" }, F.nickelFree], google: "Apparel & Accessories > Jewelry > Rings" }],
        ["necklaces", "Necklaces", { words: ["necklace", "pendant", "chain", "choker", "locket"], sizes: ["chains"], google: "Apparel & Accessories > Jewelry > Necklaces" }],
        ["earrings", "Earrings", { words: ["earring", "studs", "hoops", "huggies", "ear cuff"], sizes: ["pair"], google: "Apparel & Accessories > Jewelry > Earrings" }],
        ["bracelets", "Bracelets", { words: ["bracelet", "bangle", "cuff", "anklet"], sizes: ["bracelets"], google: "Apparel & Accessories > Jewelry > Bracelets" }],
        ["brooches", "Brooches", { words: ["brooch"], google: "Apparel & Accessories > Jewelry > Brooches & Lapel Pins" }],
        ["watches", "Watches", { words: ["watch", "wristwatch"], facts: [F.metal, { key: "movement", label: "Movement", example: "Quartz" }, F.warranty], traits: { groundOnly: true, personalised: true }, google: "Apparel & Accessories > Jewelry > Watches" }],
    ],
    art: [
        ["originals", "Original artwork", { words: ["painting", "drawing", "original", "canvas", "watercolour", "sculpture"], sizes: [], facts: [F.medium, F.dimensions, { key: "signed", label: "Signed", example: "Signed on the back" }], google: "Home & Garden > Decor > Artwork > Paintings" }],
        ["prints", "Prints", { words: ["print", "art print", "risograph", "riso", "screen print", "giclée", "linocut", "etching"], google: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork" }],
        ["photography", "Photography", { words: ["photo", "photograph", "photo print"], google: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork" }],
        ["posters", "Posters", { words: ["poster", "gig poster"], google: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork" }],
        ["cards", "Cards and postcards", { words: ["card", "greeting card", "postcard", "birthday card", "note cards"], sizes: [], choices: ["Design"], facts: [F.paper, F.dimensions, { key: "envelope", label: "Envelope", example: "Kraft envelope included" }], google: "Arts & Entertainment > Party & Celebration > Gift Giving > Greeting & Note Cards" }],
        ["stickers", "Stickers", { words: ["sticker", "decal", "vinyl sticker"], sizes: [], choices: ["Design"], facts: [F.material, F.dimensions], google: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Decorative Stickers" }],
        ["framed", "Framed pieces", { words: ["framed", "framed print", "frame"], traits: { flat: false, fragile: true }, facts: [F.medium, { key: "frame", label: "Frame", example: "Oak, with glass" }, F.dimensions], google: "Home & Garden > Decor > Artwork" }],
    ],
    books: [
        ["printed-books", "Printed books", { words: ["book", "novel", "paperback", "hardcover", "poetry", "art book", "photobook", "chapbook"], google: "Media > Books > Print Books" }],
        ["ebooks", "E-books", { kind: "ebook", words: ["ebook", "e-book", "epub", "pdf book", "digital book"], facts: [F.pages], traits: { taxGroup: "digital", noParcel: true }, google: "Media > Books > E-books" }],
        ["zines", "Zines", { words: ["zine", "fanzine", "minicomic", "pamphlet"], google: "Media > Books > Print Books" }],
        ["comics", "Comics", { words: ["comic", "graphic novel", "manga", "comic book"], google: "Media > Books > Print Books" }],
        ["magazines", "Magazines", { words: ["magazine", "journal", "periodical", "issue", "quarterly"], google: "Media > Magazines & Newspapers" }],
        ["notebooks", "Notebooks and journals", { kind: "other", words: ["notebook", "journal", "sketchbook", "diary", "notepad"], choices: ["Ruling"], facts: [F.pages, F.paper, F.binding, F.dimensions], traits: { personalised: true }, google: "Office Supplies > General Office Supplies > Paper Products > Notebooks & Notepads" }],
        ["calendars", "Calendars and planners", { kind: "other", words: ["calendar", "planner", "agenda", "wall calendar", "datebook"], facts: [F.pages, F.paper, F.dimensions], google: "Office Supplies > Office Equipment > Calendars, Organizers & Planners" }],
        ["stationery", "Stationery", { kind: "other", words: ["stationery", "pens", "pencils", "envelopes", "letterpress", "paper goods", "bookmark", "washi tape"], facts: [F.material, F.dimensions], traits: {}, google: "Office Supplies" }],
    ],
    music: [
        ["vinyl", "Vinyl records", { words: ["vinyl", "record", "lp", "7 inch", "12 inch", "ep"], choices: ["Pressing colour"], traits: { flat: true }, google: "Media > Music & Sound Recordings > Vinyl" }],
        ["cds", "CDs", { words: ["cd", "compact disc", "album"], google: "Media > Music & Sound Recordings > Music CDs" }],
        ["cassettes", "Cassettes", { words: ["cassette", "tape", "mixtape"], choices: ["Shell colour"], google: "Media > Music & Sound Recordings > Music Cassette Tapes" }],
        ["digital-albums", "Digital albums", { words: ["digital album", "mp3", "flac", "download", "single", "wav"], choices: ["File type"], traits: { noParcel: true, taxGroup: "digital" }, google: "Media > Music & Sound Recordings > Digital Music Downloads" }],
        ["films", "Films", { words: ["film", "movie", "dvd", "blu-ray", "documentary", "vhs"], facts: [F.format, { key: "runtime", label: "Running time", example: "92 minutes" }, F.release], google: "Media > DVDs & Videos" }],
    ],
    home: [
        ["ceramics", "Ceramics and tableware", { words: ["mug", "cup", "bowl", "plate", "vase", "pottery", "ceramic", "stoneware", "glassware", "teapot"], facts: [F.material, F.dimensions, { key: "dishwasher", label: "Dishwasher safe", example: "Yes, top rack" }, { key: "foodSafe", label: "Food safe", example: "Yes, lead-free glaze" }], traits: { fragile: true }, google: "Home & Garden > Kitchen & Dining > Tableware" }],
        ["candles", "Candles", { words: ["candle", "soy candle", "beeswax", "tealight", "taper", "pillar candle"], sizes: ["candle"], choices: ["Scent"], facts: [{ key: "wax", label: "Wax", example: "Coconut soy" }, { key: "wick", label: "Wick", example: "Cotton" }, { key: "burnTime", label: "Burn time", example: "About 50 hours" }, { key: "vessel", label: "Vessel", example: "Amber glass jar" }], traits: { fragile: true, safety: SAFETY_CANDLE }, google: "Home & Garden > Decor > Home Fragrances > Candles" }],
        ["home-scents", "Home scents", { words: ["diffuser", "incense", "room spray", "wax melts", "potpourri", "essential oil"], sizes: ["bottle"], choices: ["Scent"], facts: [F.ingredients, F.howToUse, F.netAmount], traits: { groundOnly: true, ingredients: true }, google: "Home & Garden > Decor > Home Fragrances" }],
        ["textiles", "Cushions and throws", { words: ["cushion", "pillow", "throw", "blanket", "quilt", "tea towel", "napkins", "tablecloth", "bedding", "rug"], google: "Home & Garden > Linens & Bedding" }],
        ["decor", "Decor", { words: ["decor", "ornament", "figurine", "mirror", "bookends", "frame", "candle holder", "candlestick"], google: "Home & Garden > Decor" }],
        ["wall-hangings", "Wall hangings", { words: ["wall hanging", "tapestry", "macrame", "weaving", "banner", "pennant"], google: "Home & Garden > Decor > Tapestries" }],
        ["lighting", "Lighting", { words: ["lamp", "light", "pendant light", "lampshade", "sconce"], facts: [F.material, F.dimensions, { key: "bulb", label: "Bulb", example: "E26, LED, not included" }], traits: { fragile: true }, google: "Home & Garden > Lighting" }],
        ["furniture", "Furniture", { words: ["chair", "table", "stool", "shelf", "bench", "cabinet", "desk"], facts: [F.material, F.dimensions, { key: "assembly", label: "Assembly", example: "Arrives assembled" }], google: "Furniture" }],
        ["kitchen", "Kitchen", { words: ["cutting board", "spoon", "utensils", "apron", "oven mitt", "kitchenware", "tea towel"], facts: [F.material, F.dimensions, F.care], google: "Home & Garden > Kitchen & Dining" }],
    ],
    beauty: [
        ["skincare", "Skincare", { words: ["cream", "serum", "lotion", "balm", "moisturiser", "moisturizer", "face oil", "lip balm", "salve"], google: "Health & Beauty > Personal Care > Cosmetics > Skin Care" }],
        ["soap", "Soap and bath", { words: ["soap", "bar soap", "bath bomb", "bath salts", "body wash", "scrub"], sizes: ["jar"], google: "Health & Beauty > Personal Care > Cosmetics > Bath & Body" }],
        ["hair-care", "Hair care", { words: ["shampoo", "conditioner", "hair oil", "shampoo bar", "pomade"], google: "Health & Beauty > Personal Care > Hair Care" }],
        ["makeup", "Makeup", { words: ["lipstick", "mascara", "blush", "eyeshadow", "nail polish", "foundation"], choices: ["Shade"], sizes: [], traits: { ingredients: true, groundOnly: true }, google: "Health & Beauty > Personal Care > Cosmetics > Makeup" }],
        ["perfume", "Perfume", { words: ["perfume", "fragrance", "cologne", "eau de parfum", "solid perfume", "roll-on"], traits: { ingredients: true, groundOnly: true }, google: "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne" }],
        ["grooming", "Grooming", { words: ["beard oil", "shaving", "razor", "deodorant", "comb", "brush"], google: "Health & Beauty > Personal Care > Shaving & Grooming" }],
    ],
    food: [
        ["coffee", "Coffee", { words: ["coffee", "beans", "espresso", "ground coffee", "roast"], choices: ["Grind"], facts: [{ key: "origin", label: "Origin", example: "Huila, Colombia" }, { key: "roast", label: "Roast", example: "Medium" }, { key: "notes", label: "Tasting notes", example: "Cherry, cocoa, brown sugar" }, F.bestBefore, F.netAmount], traits: { taxGroup: "grocery" }, google: "Food, Beverages & Tobacco > Beverages > Coffee" }],
        ["tea", "Tea", { words: ["tea", "loose leaf", "matcha", "tisane", "herbal tea", "chai"], google: "Food, Beverages & Tobacco > Beverages > Tea & Infusions" }],
        ["sweets", "Chocolate and sweets", { words: ["chocolate", "candy", "sweets", "fudge", "caramel", "toffee", "bonbons"], google: "Food, Beverages & Tobacco > Food Items > Candy & Chocolate" }],
        ["baked", "Baked goods", { words: ["bread", "cookies", "cake", "pastry", "brownies", "granola", "baking"], sizes: [], traits: { perishable: true }, google: "Food, Beverages & Tobacco > Food Items > Bakery" }],
        ["preserves", "Jams and sauces", { words: ["jam", "sauce", "hot sauce", "honey", "pickles", "preserves", "syrup", "chutney"], sizes: ["jar"], google: "Food, Beverages & Tobacco > Food Items > Condiments & Sauces" }],
        ["spices", "Spices", { words: ["spice", "seasoning", "salt", "rub", "herbs"], sizes: ["jar"], google: "Food, Beverages & Tobacco > Food Items > Seasonings & Spices" }],
        ["drinks", "Drinks", { words: ["juice", "kombucha", "soda", "cordial", "wine", "beer", "spirits", "cider", "alcohol"], sizes: ["bottle"], traits: { groundOnly: true, approval: true }, google: "Food, Beverages & Tobacco > Beverages" }],
    ],
    kids: [
        ["toys", "Toys", { words: ["toy", "plush", "stuffed animal", "doll", "blocks", "wooden toy", "teddy"], google: "Toys & Games > Toys" }],
        ["games", "Games and puzzles", { words: ["game", "board game", "puzzle", "jigsaw", "card game"], facts: [F.ages, { key: "players", label: "Players", example: "2 to 4" }, { key: "pieces", label: "Pieces", example: "500" }], google: "Toys & Games > Games" }],
        ["baby-gear", "Baby gear", { words: ["teether", "rattle", "bib", "swaddle", "baby blanket", "mobile"], google: "Baby & Toddler" }],
        ["kids-books", "Kids' books", { kind: "book", words: ["picture book", "children's book", "board book", "colouring book", "coloring book"], facts: [F.ages, F.pages], traits: { taxGroup: "books" }, google: "Media > Books > Print Books" }],
    ],
    plants: [
        ["plants", "Plants", { words: ["plant", "houseplant", "succulent", "cactus", "bulbs", "cuttings"], sizes: ["pots"], traits: { perishable: true } }],
        ["seeds", "Seeds", { words: ["seeds", "seed packet", "heirloom"], facts: [{ key: "sow", label: "When to sow", example: "Indoors in March" }, { key: "seeds", label: "Seeds per packet", example: "About 30" }], traits: { flat: true }, google: "Home & Garden > Plants > Seeds" }],
        ["pots", "Pots and planters", { words: ["pot", "planter", "plant pot", "hanging planter"], sizes: ["pots"], facts: [F.material, F.dimensions, { key: "drainage", label: "Drainage hole", example: "Yes" }], traits: { fragile: true }, google: "Home & Garden > Lawn & Garden > Gardening > Pots & Planters" }],
        ["garden-tools", "Garden tools", { words: ["trowel", "pruners", "gloves", "watering can", "garden tool"], facts: [F.material, F.dimensions], google: "Home & Garden > Lawn & Garden > Gardening > Gardening Tools" }],
    ],
    craft: [
        ["yarn", "Yarn", { words: ["yarn", "wool", "skein", "fingering", "worsted", "dk", "hand-dyed"], choices: ["Colourway"], facts: [{ key: "fibre", label: "Fibre", example: "100% merino" }, { key: "weight", label: "Weight", example: "Fingering" }, { key: "length", label: "Length", example: "400 m per 100 g" }, { key: "needles", label: "Needle size", example: "3 to 3.5 mm" }, { key: "dyeLot", label: "Dye lot", example: "Lot 0425" }], traits: { soldBy: "skein" }, google: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Textiles > Yarn" }],
        ["fabric", "Fabric", { words: ["fabric", "cotton", "linen", "quilting", "fat quarter", "textile"], facts: [F.material, { key: "width", label: "Width", example: "150 cm" }, F.care], traits: { soldBy: "metre" }, google: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Textiles > Fabric" }],
        ["patterns", "Patterns", { words: ["pattern", "sewing pattern", "knitting pattern", "crochet pattern", "cross stitch"], choices: ["Format"], facts: [{ key: "skill", label: "Skill level", example: "Beginner" }, { key: "includes", label: "Includes", example: "Printed booklet, sizes XS to 3XL" }], google: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Crafting Patterns & Molds" }],
        ["beads", "Beads and findings", { words: ["beads", "findings", "clasps", "charms", "jump rings"], facts: [F.material, { key: "count", label: "Count", example: "50 per pack" }], traits: { soldBy: "gram" } }],
        ["kits", "Kits", { words: ["kit", "craft kit", "embroidery kit", "candle-making", "diy kit", "starter kit"], facts: [{ key: "includes", label: "In the kit", example: "Hoop, threads, needle, pattern" }, { key: "skill", label: "Skill level", example: "Beginner" }], google: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits" }],
        ["craft-tools", "Tools", { words: ["needles", "hooks", "scissors", "brushes", "craft tools", "loom", "hoop"], facts: [F.material, F.dimensions] }],
    ],
    pets: [
        ["pet-treats", "Treats", { words: ["dog treats", "cat treats", "pet food", "biscuits", "chews"], sizes: ["bag"], facts: [F.ingredients, F.bestBefore, F.netAmount], traits: { ingredients: true } }],
        ["pet-toys", "Toys", { words: ["dog toy", "cat toy", "chew toy", "ball", "catnip"], sizes: ["small-large"] }],
        ["pet-beds", "Beds", { words: ["dog bed", "cat bed", "pet bed", "pet blanket"], facts: [F.material, F.dimensions, F.care] }],
        ["collars", "Collars and leads", { words: ["collar", "leash", "lead", "harness", "bandana"], facts: [F.material, { key: "neck", label: "Fits neck", example: "30 to 45 cm" }], traits: { personalised: true } }],
    ],
    tech: [
        ["phone-cases", "Phone cases", { words: ["phone case", "iphone case", "cover", "phone grip"], sizes: ["phones"], facts: [F.material, F.compatible], google: "Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Cases" }],
        ["tech-accessories", "Accessories", { words: ["cable", "charger", "laptop sleeve", "stand", "keyboard", "mouse pad"] }],
        ["electronics", "Small electronics", { words: ["speaker", "headphones", "earbuds", "synth", "pedal", "gadget", "battery"], traits: { groundOnly: true, safety: SAFETY_BATTERY }, google: "Electronics" }],
    ],
    "not-parcel": [
        ["downloads", "Digital downloads", { words: ["download", "digital", "pdf", "printable", "template", "font", "preset", "file"], facts: [{ key: "files", label: "Files", example: "One PDF, 24 pages" }], traits: { noParcel: true, taxGroup: "digital" }, google: "Media" }],
        ["gift-cards", "Gift cards", { words: ["gift card", "gift certificate", "voucher"], traits: { noParcel: true }, google: "Arts & Entertainment > Party & Celebration > Gift Giving > Gift Cards & Certificates" }],
        ["bundles", "Bundles and gift boxes", { words: ["bundle", "gift box", "gift set", "hamper", "box set", "set"], facts: [{ key: "includes", label: "What's inside", example: "Candle, soap and a card" }], google: "Arts & Entertainment > Party & Celebration > Gift Giving" }],
        ["made-to-order", "Made to order", { words: ["made to order", "handmade to order", "pre-made", "bespoke"], facts: [F.leadTime], traits: { madeToOrder: true } }],
        ["custom", "Custom orders", { words: ["custom", "commission", "personalised", "personalized", "portrait"], facts: [F.leadTime, { key: "brief", label: "What to send us", example: "A photo and the name to paint" }], traits: { madeToOrder: true, personalised: true } }],
    ],
};
const GOOGLE_FALLBACK = {
    clothing: "Apparel & Accessories > Clothing",
    bags: "Apparel & Accessories",
    jewelry: "Apparel & Accessories > Jewelry",
    art: "Home & Garden > Decor > Artwork",
    books: "Media > Books",
    music: "Media > Music & Sound Recordings",
    home: "Home & Garden",
    beauty: "Health & Beauty > Personal Care",
    food: "Food, Beverages & Tobacco",
    kids: "Toys & Games",
    "not-parcel": "",
};
function build(group, [id, name, draft = {}]) {
    const base = GROUP_DEFAULTS[group];
    return {
        id,
        name,
        group,
        kind: draft.kind ?? base.kind,
        words: draft.words ?? [],
        sizes: draft.sizes ?? base.sizes ?? [],
        choices: draft.choices ?? base.choices ?? [],
        facts: draft.facts ?? base.facts ?? [],
        traits: { ...base.traits, ...draft.traits },
        google: draft.google ?? base.google ?? GOOGLE_FALLBACK[group] ?? "",
    };
}
/** Every type, in group order and then in the order a shop most often meets them. */
exports.PRODUCT_TYPES = exports.TYPE_GROUPS.flatMap((g) => TYPE_DRAFTS[g.id].map((row) => build(g.id, row)));
const BY_ID = new Map(exports.PRODUCT_TYPES.map((t) => [t.id, t]));
/** A type by its id, or null. */
function typeById(id) {
    return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}
/** A group by its id, or null. */
function typeGroup(id) {
    return exports.TYPE_GROUPS.find((g) => g.id === id) ?? null;
}
/** The group a product saved before types existed belongs to, from its kind. */
const KIND_GROUP = {
    book: "books",
    ebook: "books",
    clothing: "clothing",
    shoes: "shoes",
    jewelry: "jewelry",
    art: "art",
    music: "music",
    other: null,
};
/** The type a kind stands for when it means one thing (a printed book, an e-book, shoes); else null. */
const KIND_TYPE = { book: "printed-books", ebook: "ebooks", shoes: "shoes" };
/**
 * The product's type: its own (`typeId`) when it names one, else the one its kind clearly means, else null. (The older
 * `productType` field only marks gift cards and stays as it is.)
 */
function typeOfProduct(product) {
    if (product?.productType === "giftCard")
        return typeById("gift-cards");
    const own = typeById(product?.typeId);
    if (own)
        return own;
    const fallback = KIND_TYPE[(0, productOptions_1.productKind)(product)];
    return fallback ? typeById(fallback) : null;
}
/** The product's group: its type's, else its kind's (null for a product of kind "other" with no type). */
function productGroup(product) {
    return typeOfProduct(product)?.group ?? KIND_GROUP[(0, productOptions_1.productKind)(product)];
}
/** The groups a sign-up answer ("What do you sell?") points to; [] means every group, none first. */
const SELLS_GROUPS = {
    books: ["books", "art", "not-parcel"],
    zines: ["books", "art", "not-parcel"],
    comics: ["books", "art", "not-parcel"],
    mix: ["books", "art", "music", "not-parcel"],
    prints: ["art", "books", "not-parcel"],
    clothing: ["clothing", "bags", "shoes", "jewelry"],
    shoes: ["shoes", "clothing", "bags"],
    jewelry: ["jewelry", "bags", "clothing"],
    music: ["music", "clothing", "art", "not-parcel"],
    hair: ["beauty"],
    wellness: ["beauty", "food"],
};
function sellsGroups(answer) {
    return answer ? SELLS_GROUPS[answer] ?? [] : SELLS_GROUPS.books;
}
/** The groups a shop sells in, picked at sign-up; an unknown or empty list means every group. */
function shopGroups(picked) {
    const list = Array.isArray(picked) ? picked.filter((g) => !!typeGroup(g)) : [];
    return list.length ? [...new Set(list)] : exports.TYPE_GROUPS.map((g) => g.id);
}
const fold = (s) => s.toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stem = (w) => (w.length > 3 && w.endsWith("es") && /(ch|sh|x|s)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
/** How well one of the type's names matches what the owner typed: 0 for no match, higher for better. */
function scoreName(name, query) {
    const n = fold(name);
    if (!n)
        return 0;
    if (n === query)
        return 100;
    const nWords = n.split(" ").map(stem);
    const qWords = query.split(" ").map(stem);
    if (nWords.join(" ") === qWords.join(" "))
        return 95;
    if (n.startsWith(query))
        return 80;
    if (qWords.every((q) => nWords.some((w) => w.startsWith(q))))
        return 60;
    if (n.includes(query))
        return 40;
    return 0;
}
/**
 * Types matching what the owner typed ("cand", "mug", "earrings"), best first. A match on the type's own name beats a
 * match on one of its other words; within a tie, the shop's own groups come first, then the list's order.
 */
function searchTypes(query, options = {}) {
    const q = fold(query);
    if (!q)
        return [];
    const mine = new Set(options.groups ?? []);
    const out = [];
    exports.PRODUCT_TYPES.forEach((type, order) => {
        const byName = scoreName(type.name, q);
        const byWord = Math.max(0, ...type.words.map((w) => scoreName(w, q))) * 0.9;
        const score = Math.max(byName, byWord) + (mine.has(type.group) ? 5 : 0);
        if (Math.max(byName, byWord) > 0)
            out.push({ type, score, order });
    });
    return out
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .slice(0, options.limit ?? 8)
        .map(({ type, score }) => ({ type, score }));
}
/** The facts the law requires for this type before it can be sold (ingredients, allergens, ages). */
function lawFacts(type) {
    return type ? type.facts.filter((f) => f.law) : [];
}
/**
 * What a new product starts with once its type is picked: the type, and the kind everything else reads (a printed book
 * keeps no kind, as before). A gift card also becomes the gift card product the editor already knows.
 */
function typeStart(type, own) {
    const start = { typeId: type.id };
    if (own)
        start.typeName = own.name;
    if (type.kind !== "book") {
        start.kind = type.kind;
        start.format = "";
        if (type.google)
            start.googleCategory = type.google;
    }
    return start;
}
exports.OWN_TYPES_MAX = 60;
/** A tidy list of own types from saved data: a known base, a name of 1 to 40 letters, no repeated names. */
function cleanOwnTypes(raw) {
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        const name = typeof item?.name === "string" ? item.name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
        const base = typeof item?.base === "string" && typeById(item.base) ? item.base : "";
        const key = fold(name);
        if (!name || !base || !key || seen.has(key))
            continue;
        seen.add(key);
        out.push({ id: typeof item.id === "string" && item.id ? item.id : ownTypeId(name), name, base });
        if (out.length >= exports.OWN_TYPES_MAX)
            break;
    }
    return out;
}
/** A stable id for an own type, from its name. */
function ownTypeId(name) {
    return "own-" + (fold(name).replace(/ /g, "-").slice(0, 40) || "type");
}
/** The own types matching what the owner typed, best first. */
function searchOwnTypes(query, own) {
    const q = fold(query);
    if (!q)
        return [];
    return own
        .map((t, order) => ({ t, order, score: scoreName(t.name, q) }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((m) => m.t);
}
/** True when the owner's words already name one of our types or their own exactly ("Candles", "candle"). */
function namesAType(query, own = []) {
    const q = fold(query).split(" ").map(stem).join(" ");
    if (!q)
        return false;
    const same = (name) => fold(name).split(" ").map(stem).join(" ") === q;
    return exports.PRODUCT_TYPES.some((t) => same(t.name) || t.words.some(same)) || own.some((t) => same(t.name));
}
/** The ready-made size lists a type offers, first one first. */
function sizeListsFor(type) {
    return type ? type.sizes.map((id) => (0, productSizes_1.sizeSet)(id)).filter((set) => !!set) : [];
}
