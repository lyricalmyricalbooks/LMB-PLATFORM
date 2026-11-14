// Guess the state / province from a postal code so shoppers don't have to pick it.

const CA_FIRST_LETTER: Record<string, string> = {
  A: "NL", B: "NS", C: "PE", E: "NB", G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON", R: "MB", S: "SK",
  T: "AB", V: "BC", Y: "YT",
};

// [first 3-digit prefix, last prefix, state] — USPS ZIP prefix ranges.
const US_ZIP3: [number, number, string][] = [
  [5, 5, "NY"], [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"],
  [197, 199, "DE"], [200, 200, "DC"], [201, 201, "VA"], [202, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"],
  [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"],
  [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"],
  [569, 569, "DC"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"],
  [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"], [700, 715, "LA"], [716, 729, "AR"],
  [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"],
  [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"],
  [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

const PLACEHOLDERS = new Set(["please select", "select", "select one", "choose", "-", "—"]);

/** Treat leftover dropdown placeholders ("Please select") as empty. */
export function cleanRegion(value: string | undefined | null): string {
  const v = (value || "").trim();
  return PLACEHOLDERS.has(v.toLowerCase()) ? "" : v;
}

/** Returns a 2-letter state/province code, or "" when it can't tell. */
export function provinceFromPostal(country: string, postal: string): string {
  const code = (postal || "").trim().toUpperCase();
  const c = (country || "").trim().toLowerCase();
  if (c === "canada" || c === "ca") {
    if (!/^[A-Z]\d[A-Z]/.test(code)) return "";
    if (code[0] === "X") return code.startsWith("X0A") || code.startsWith("X0B") || code.startsWith("X0C") ? "NU" : "NT";
    return CA_FIRST_LETTER[code[0]] || "";
  }
  if (c === "united states" || c === "us" || c === "usa") {
    const m = code.match(/^(\d{3})\d{2}/);
    if (!m) return "";
    const n = Number(m[1]);
    return US_ZIP3.find(([lo, hi]) => n >= lo && n <= hi)?.[2] || "";
  }
  return "";
}

const CA_REGIONS: [string, string][] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"],
  ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
  ["SK", "Saskatchewan"], ["YT", "Yukon"],
];

const US_REGIONS: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["PR", "Puerto Rico"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

/** [code, name] list for countries with a fixed set of regions, else null (free text). */
export function regionsFor(country: string): [string, string][] | null {
  const c = (country || "").trim().toLowerCase();
  if (c === "canada" || c === "ca") return CA_REGIONS;
  if (c === "united states" || c === "us" || c === "usa") return US_REGIONS;
  return null;
}
