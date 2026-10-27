// GENERATED from src/shared/shippingZones.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Shipping zones — shared geography model used by the admin zone editor, the
// storefront checkout and the Functions (one copy: src/shared/CLAUDE.md).
//
// A zone targets geography three ways (any combination):
//   • countries:   explicit ISO country codes (most specific — always wins)
//   • continents:  whole continents
//   • restOfWorld: catch-all for anywhere not covered by another zone
//
// Legacy zones created before this model only have a free-text `region`
// ("Europe", "Canada"…) — matching falls back to comparing that text against
// the customer's country and continent so old data keeps working.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCatchAll = exports.resolveCountry = exports.COUNTRIES = exports.CONTINENTS = void 0;
exports.findCountry = findCountry;
exports.isCatchAllZone = isCatchAllZone;
exports.describeZoneGeography = describeZoneGeography;
exports.matchShippingZone = matchShippingZone;
exports.computeShippingCost = computeShippingCost;
exports.CONTINENTS = [
    "Africa",
    "Antarctica",
    "Asia",
    "Europe",
    "North America",
    "South America",
    "Oceania",
];
const C = (code, name, continent) => ({ code, name, continent });
exports.COUNTRIES = [
    // Africa
    C("DZ", "Algeria", "Africa"), C("AO", "Angola", "Africa"), C("BJ", "Benin", "Africa"),
    C("BW", "Botswana", "Africa"), C("BF", "Burkina Faso", "Africa"), C("BI", "Burundi", "Africa"),
    C("CV", "Cabo Verde", "Africa"), C("CM", "Cameroon", "Africa"), C("CF", "Central African Republic", "Africa"),
    C("TD", "Chad", "Africa"), C("KM", "Comoros", "Africa"), C("CG", "Congo", "Africa"),
    C("CD", "DR Congo", "Africa"), C("CI", "Côte d'Ivoire", "Africa"), C("DJ", "Djibouti", "Africa"),
    C("EG", "Egypt", "Africa"), C("GQ", "Equatorial Guinea", "Africa"), C("ER", "Eritrea", "Africa"),
    C("SZ", "Eswatini", "Africa"), C("ET", "Ethiopia", "Africa"), C("GA", "Gabon", "Africa"),
    C("GM", "Gambia", "Africa"), C("GH", "Ghana", "Africa"), C("GN", "Guinea", "Africa"),
    C("GW", "Guinea-Bissau", "Africa"), C("KE", "Kenya", "Africa"), C("LS", "Lesotho", "Africa"),
    C("LR", "Liberia", "Africa"), C("LY", "Libya", "Africa"), C("MG", "Madagascar", "Africa"),
    C("MW", "Malawi", "Africa"), C("ML", "Mali", "Africa"), C("MR", "Mauritania", "Africa"),
    C("MU", "Mauritius", "Africa"), C("MA", "Morocco", "Africa"), C("MZ", "Mozambique", "Africa"),
    C("NA", "Namibia", "Africa"), C("NE", "Niger", "Africa"), C("NG", "Nigeria", "Africa"),
    C("RW", "Rwanda", "Africa"), C("ST", "São Tomé and Príncipe", "Africa"), C("SN", "Senegal", "Africa"),
    C("SC", "Seychelles", "Africa"), C("SL", "Sierra Leone", "Africa"), C("SO", "Somalia", "Africa"),
    C("ZA", "South Africa", "Africa"), C("SS", "South Sudan", "Africa"), C("SD", "Sudan", "Africa"),
    C("TZ", "Tanzania", "Africa"), C("TG", "Togo", "Africa"), C("TN", "Tunisia", "Africa"),
    C("UG", "Uganda", "Africa"), C("ZM", "Zambia", "Africa"), C("ZW", "Zimbabwe", "Africa"),
    C("YT", "Mayotte", "Africa"), C("RE", "Réunion", "Africa"), C("SH", "Saint Helena", "Africa"),
    C("EH", "Western Sahara", "Africa"),
    // Antarctica
    C("AQ", "Antarctica", "Antarctica"), C("BV", "Bouvet Island", "Antarctica"),
    C("TF", "French Southern Territories", "Antarctica"), C("HM", "Heard Island and McDonald Islands", "Antarctica"),
    C("GS", "South Georgia and the South Sandwich Islands", "Antarctica"),
    // Asia
    C("AF", "Afghanistan", "Asia"), C("AM", "Armenia", "Asia"), C("AZ", "Azerbaijan", "Asia"),
    C("BH", "Bahrain", "Asia"), C("BD", "Bangladesh", "Asia"), C("BT", "Bhutan", "Asia"),
    C("BN", "Brunei", "Asia"), C("KH", "Cambodia", "Asia"), C("CN", "China", "Asia"),
    C("CY", "Cyprus", "Asia"), C("GE", "Georgia", "Asia"), C("HK", "Hong Kong", "Asia"),
    C("IN", "India", "Asia"), C("ID", "Indonesia", "Asia"), C("IR", "Iran", "Asia"),
    C("IQ", "Iraq", "Asia"), C("IL", "Israel", "Asia"), C("JP", "Japan", "Asia"),
    C("JO", "Jordan", "Asia"), C("KZ", "Kazakhstan", "Asia"), C("KW", "Kuwait", "Asia"),
    C("KG", "Kyrgyzstan", "Asia"), C("LA", "Laos", "Asia"), C("LB", "Lebanon", "Asia"),
    C("MO", "Macao", "Asia"), C("MY", "Malaysia", "Asia"), C("MV", "Maldives", "Asia"),
    C("MN", "Mongolia", "Asia"), C("MM", "Myanmar", "Asia"), C("NP", "Nepal", "Asia"),
    C("KP", "North Korea", "Asia"), C("OM", "Oman", "Asia"), C("PK", "Pakistan", "Asia"),
    C("PS", "Palestine", "Asia"), C("PH", "Philippines", "Asia"), C("QA", "Qatar", "Asia"),
    C("SA", "Saudi Arabia", "Asia"), C("SG", "Singapore", "Asia"), C("KR", "South Korea", "Asia"),
    C("LK", "Sri Lanka", "Asia"), C("SY", "Syria", "Asia"), C("TW", "Taiwan", "Asia"),
    C("TJ", "Tajikistan", "Asia"), C("TH", "Thailand", "Asia"), C("TL", "Timor-Leste", "Asia"),
    C("TR", "Türkiye", "Asia"), C("TM", "Turkmenistan", "Asia"), C("AE", "United Arab Emirates", "Asia"),
    C("UZ", "Uzbekistan", "Asia"), C("VN", "Vietnam", "Asia"), C("YE", "Yemen", "Asia"),
    C("IO", "British Indian Ocean Territory", "Asia"),
    // Europe
    C("AL", "Albania", "Europe"), C("AD", "Andorra", "Europe"), C("AT", "Austria", "Europe"),
    C("BY", "Belarus", "Europe"), C("BE", "Belgium", "Europe"), C("BA", "Bosnia and Herzegovina", "Europe"),
    C("BG", "Bulgaria", "Europe"), C("HR", "Croatia", "Europe"), C("CZ", "Czechia", "Europe"),
    C("DK", "Denmark", "Europe"), C("EE", "Estonia", "Europe"), C("FI", "Finland", "Europe"),
    C("FR", "France", "Europe"), C("DE", "Germany", "Europe"), C("GR", "Greece", "Europe"),
    C("HU", "Hungary", "Europe"), C("IS", "Iceland", "Europe"), C("IE", "Ireland", "Europe"),
    C("IT", "Italy", "Europe"), C("LV", "Latvia", "Europe"), C("LI", "Liechtenstein", "Europe"),
    C("LT", "Lithuania", "Europe"), C("LU", "Luxembourg", "Europe"), C("MT", "Malta", "Europe"),
    C("MD", "Moldova", "Europe"), C("MC", "Monaco", "Europe"), C("ME", "Montenegro", "Europe"),
    C("NL", "Netherlands", "Europe"), C("MK", "North Macedonia", "Europe"), C("NO", "Norway", "Europe"),
    C("PL", "Poland", "Europe"), C("PT", "Portugal", "Europe"), C("RO", "Romania", "Europe"),
    C("RU", "Russia", "Europe"), C("SM", "San Marino", "Europe"), C("RS", "Serbia", "Europe"),
    C("SK", "Slovakia", "Europe"), C("SI", "Slovenia", "Europe"), C("ES", "Spain", "Europe"),
    C("SE", "Sweden", "Europe"), C("CH", "Switzerland", "Europe"), C("UA", "Ukraine", "Europe"),
    C("GB", "United Kingdom", "Europe"), C("VA", "Vatican City", "Europe"),
    C("AX", "Åland Islands", "Europe"), C("FO", "Faroe Islands", "Europe"),
    C("GG", "Guernsey", "Europe"), C("GI", "Gibraltar", "Europe"),
    C("IM", "Isle of Man", "Europe"), C("JE", "Jersey", "Europe"),
    C("SJ", "Svalbard and Jan Mayen", "Europe"),
    // North America (incl. Central America & Caribbean)
    C("AG", "Antigua and Barbuda", "North America"), C("BS", "Bahamas", "North America"),
    C("BB", "Barbados", "North America"), C("BZ", "Belize", "North America"),
    C("BM", "Bermuda", "North America"), C("CA", "Canada", "North America"),
    C("CR", "Costa Rica", "North America"), C("CU", "Cuba", "North America"),
    C("DM", "Dominica", "North America"), C("DO", "Dominican Republic", "North America"),
    C("SV", "El Salvador", "North America"), C("GL", "Greenland", "North America"),
    C("GD", "Grenada", "North America"), C("GT", "Guatemala", "North America"),
    C("HT", "Haiti", "North America"), C("HN", "Honduras", "North America"),
    C("JM", "Jamaica", "North America"), C("MX", "Mexico", "North America"),
    C("NI", "Nicaragua", "North America"), C("PA", "Panama", "North America"),
    C("PR", "Puerto Rico", "North America"), C("KN", "Saint Kitts and Nevis", "North America"),
    C("LC", "Saint Lucia", "North America"), C("VC", "Saint Vincent and the Grenadines", "North America"),
    C("TT", "Trinidad and Tobago", "North America"), C("US", "United States", "North America"),
    C("AI", "Anguilla", "North America"), C("AW", "Aruba", "North America"),
    C("BL", "Saint Barthélemy", "North America"), C("BQ", "Bonaire, Sint Eustatius and Saba", "North America"),
    C("KY", "Cayman Islands", "North America"), C("CW", "Curaçao", "North America"),
    C("GP", "Guadeloupe", "North America"), C("MQ", "Martinique", "North America"),
    C("MS", "Montserrat", "North America"), C("MF", "Saint Martin", "North America"),
    C("PM", "Saint Pierre and Miquelon", "North America"), C("SX", "Sint Maarten", "North America"),
    C("TC", "Turks and Caicos Islands", "North America"), C("VG", "British Virgin Islands", "North America"),
    C("VI", "U.S. Virgin Islands", "North America"),
    // South America
    C("AR", "Argentina", "South America"), C("BO", "Bolivia", "South America"),
    C("BR", "Brazil", "South America"), C("CL", "Chile", "South America"),
    C("CO", "Colombia", "South America"), C("EC", "Ecuador", "South America"),
    C("GY", "Guyana", "South America"), C("PY", "Paraguay", "South America"),
    C("PE", "Peru", "South America"), C("SR", "Suriname", "South America"),
    C("UY", "Uruguay", "South America"), C("VE", "Venezuela", "South America"),
    C("FK", "Falkland Islands", "South America"), C("GF", "French Guiana", "South America"),
    // Oceania
    C("AU", "Australia", "Oceania"), C("FJ", "Fiji", "Oceania"), C("KI", "Kiribati", "Oceania"),
    C("MH", "Marshall Islands", "Oceania"), C("FM", "Micronesia", "Oceania"), C("NR", "Nauru", "Oceania"),
    C("NZ", "New Zealand", "Oceania"), C("PW", "Palau", "Oceania"), C("PG", "Papua New Guinea", "Oceania"),
    C("WS", "Samoa", "Oceania"), C("SB", "Solomon Islands", "Oceania"), C("TO", "Tonga", "Oceania"),
    C("TV", "Tuvalu", "Oceania"), C("VU", "Vanuatu", "Oceania"),
    C("AS", "American Samoa", "Oceania"), C("CX", "Christmas Island", "Oceania"),
    C("CC", "Cocos (Keeling) Islands", "Oceania"), C("CK", "Cook Islands", "Oceania"),
    C("PF", "French Polynesia", "Oceania"), C("GU", "Guam", "Oceania"),
    C("NC", "New Caledonia", "Oceania"), C("NU", "Niue", "Oceania"),
    C("NF", "Norfolk Island", "Oceania"), C("MP", "Northern Mariana Islands", "Oceania"),
    C("PN", "Pitcairn", "Oceania"), C("TK", "Tokelau", "Oceania"),
    C("UM", "U.S. Outlying Islands", "Oceania"), C("WF", "Wallis and Futuna", "Oceania"),
];
// ⚡ Bolt: Cache lowercased country codes and names for O(1) lookups
// Measured impact: Eliminates hundreds of string allocations and O(N) searches
// per lookup during checkout operations.
const countryLookupMap = new Map();
exports.COUNTRIES.forEach((c) => {
    countryLookupMap.set(c.code.toLowerCase(), c);
    countryLookupMap.set(c.name.toLowerCase(), c);
});
// Common aliases
const usCountry = exports.COUNTRIES.find((c) => c.code === "US");
if (usCountry) {
    ["usa", "u.s.", "u.s.a.", "america", "united states of america"].forEach((alias) => countryLookupMap.set(alias, usCountry));
}
const gbCountry = exports.COUNTRIES.find((c) => c.code === "GB");
if (gbCountry) {
    ["uk", "great britain", "england"].forEach((alias) => countryLookupMap.set(alias, gbCountry));
}
// "CA", "ca", "Canada", "usa"… -> the country, or null. Takes any value (the server passes stored data).
function findCountry(nameOrCode) {
    const q = String(nameOrCode || "").trim().toLowerCase();
    return (q && countryLookupMap.get(q)) || null;
}
/** The Functions' name for findCountry. */
exports.resolveCountry = findCountry;
// A zone is a catch-all if explicitly flagged, or named like one (preserves the
// semantics of pre-existing free-text zones such as "International").
const REST_OF_WORLD_NAMES = /^(international|everywhere else|rest of world|worldwide|global|anywhere)$/i;
function isCatchAllZone(zone) {
    return zone.restOfWorld === true || REST_OF_WORLD_NAMES.test(String(zone.region || "").trim());
}
/** The Functions' name for isCatchAllZone. */
exports.isCatchAll = isCatchAllZone;
/** Human summary of a zone's geography for admin display. */
function describeZoneGeography(zone) {
    if (zone.restOfWorld)
        return "Rest of world (everywhere not covered by another zone)";
    const parts = [];
    if (zone.continents?.length)
        parts.push(zone.continents.join(", "));
    if (zone.countries?.length) {
        const names = zone.countries
            .map((code) => exports.COUNTRIES.find((c) => c.code === code)?.name || code)
            .slice(0, 4);
        const extra = zone.countries.length - names.length;
        parts.push(names.join(", ") + (extra > 0 ? ` +${extra} more` : ""));
    }
    if (parts.length === 0)
        return zone.region || "No geography set";
    return parts.join(" · ");
}
/**
 * Pick the zone that applies to a customer's country.
 * Specificity: explicit country > continent > legacy region text > rest of world.
 */
function matchShippingZone(countryNameOrCode, zones) {
    if (!zones || zones.length === 0)
        return null;
    const country = findCountry(countryNameOrCode);
    if (country) {
        // Zone lists hold ISO codes (current editor) or names (older saves): compare resolved codes.
        const byCountry = zones.find((z) => (z.countries || []).some((entry) => findCountry(entry)?.code === country.code));
        if (byCountry)
            return byCountry;
        const byContinent = zones.find((z) => (z.continents || []).includes(country.continent));
        if (byContinent)
            return byContinent;
        // Legacy free-text zones: region equals the country or continent name
        const byLegacy = zones.find((z) => {
            const r = String(z.region || "").trim().toLowerCase();
            return r === country.name.toLowerCase() || r === country.continent.toLowerCase();
        });
        if (byLegacy)
            return byLegacy;
    }
    return zones.find(isCatchAllZone) || null;
}
/** base + additional × (items − 1), waived past the zone's free threshold. */
function computeShippingCost(zone, itemCount, cartSubtotal, fallback = 15) {
    if (!zone)
        return fallback;
    const freeOver = Number(zone.freeOver ?? zone.freeThreshold);
    if (freeOver > 0 && cartSubtotal >= freeOver)
        return 0;
    const base = Number(zone.base) || 0;
    const additional = Number(zone.additional) || 0;
    return base + additional * Math.max(0, itemCount - 1);
}
