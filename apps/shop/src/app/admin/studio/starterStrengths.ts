// What each starter is good at (26 November 2026, plan "Starters vs Shopify and Squarespace", step 6). Theme stores tell
// a shop owner how big a catalogue a design suits and what it does well; ours did not. One list feeds both places that
// show starters: the public starter pages (/demo/starters/, demoShop/libraryPage.ts) and Choose your website in the
// admin (StarterCards.tsx). Plain words only, three short lines per starter (`starterStrengths.test.ts`).

export type CatalogueSize = "few" | "range" | "either" | "services";

/** The "Good for" line: how big a shop the starter suits. */
export const CATALOGUE_SIZE_LABEL: Record<CatalogueSize, string> = {
  few: "Good for a few products",
  range: "Good for a big range",
  either: "Good for a few products or a big range",
  services: "Good for appointments and classes",
};

export const STARTER_STRENGTHS: Record<string, { size: CatalogueSize; strengths: [string, string, string] }> = {
  "juniper-slow-season": { size: "few", strengths: ["Big photos that tell a seasonal story", "Two featured products side by side", "A story band about how things are made"] },
  "juniper-catalogue": { size: "either", strengths: ["A bold headline beside the opening photo", "A moving line for news and offers", "Everything in one clear, even grid"] },
  "aurel-editorial": { size: "few", strengths: ["A magazine-style opening", "Large product photos with room to breathe", "A story about your workshop"] },
  "starter-gallery": { size: "few", strengths: ["Each product shown like a piece on a wall", "Quiet type that lets photos lead", "A photo shoppers can buy straight from"] },
  "starter-warehouse": { size: "range", strengths: ["Shop by category right under the opening", "New arrivals in a dense, framed grid", "Categories two to a row on phones"] },
  "starter-larder": { size: "either", strengths: ["Three promises right under the opening", "A box or bundle offer with its own photo", "Questions answered before people buy"] },
  "starter-salon": { size: "services", strengths: ["A price list people can book from", "Your team with their own photos", "Opening hours and where to find you"] },
  "starter-workshop": { size: "services", strengths: ["Upcoming classes with dates and places left", "What every class includes, at a glance", "A friendly, bright look"] },
  "starter-commission": { size: "few", strengths: ["Recent work shown large", "How a commission works, step by step", "An enquiry form on the home page"] },
};

export const goodFor = (id: string | undefined | null): string => {
  const entry = id ? STARTER_STRENGTHS[id] : undefined;
  return entry ? CATALOGUE_SIZE_LABEL[entry.size] : "";
};

export const strengthsOf = (id: string | undefined | null): string[] => (id && STARTER_STRENGTHS[id]?.strengths) || [];
