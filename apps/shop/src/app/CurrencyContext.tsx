import { displayPrice } from "./features/site/displayPrice";
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { saleActive } from "./features/site/promotions";
import { FALLBACK_RATES, RATES_CACHE_MS, loadRates, type RatesSource } from "./features/site/exchangeRates";
import { currencyForCountry, loadVisitorCountry } from "./features/site/visitorCurrency";

export type Currency = "CAD" | "USD" | "EUR";

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: Record<Currency, number>;
  /** live · cached · fallback (the feed was unreachable, so prices use fixed rates). */
  ratesSource: RatesSource;
  convertPrice: (priceInCAD: number) => number;
  formatPrice: (priceInCAD: number) => string;
  getBookPrice: (book: any, ignoreSale?: boolean) => number;
  formatBookPrice: (book: any, ignoreSale?: boolean) => string;
  getVariantPrice: (variant: any, parentBook?: any) => number;
  formatVariantPrice: (variant: any, parentBook?: any) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);


const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CAD: "CA$ ",
  USD: "$ ",
  EUR: "€ ",
};

// Every Canadian IANA zone, so a shopper in Calgary or Halifax starts in CAD, not USD.
const CANADIAN_ZONES = new Set([
  "America/St_Johns", "America/Halifax", "America/Glace_Bay", "America/Moncton", "America/Goose_Bay",
  "America/Blanc-Sablon", "America/Toronto", "America/Montreal", "America/Nipigon", "America/Thunder_Bay",
  "America/Iqaluit", "America/Pangnirtung", "America/Atikokan", "America/Winnipeg", "America/Rainy_River",
  "America/Resolute", "America/Rankin_Inlet", "America/Regina", "America/Swift_Current", "America/Edmonton",
  "America/Cambridge_Bay", "America/Yellowknife", "America/Inuvik", "America/Creston", "America/Dawson_Creek",
  "America/Fort_Nelson", "America/Whitehorse", "America/Dawson", "America/Vancouver",
]);

/** Starting currency for a first visit, from the browser's time zone. Exported for tests. */
export function currencyForTimeZone(tz: string): Currency {
  if (!tz || tz.startsWith("Canada/") || CANADIAN_ZONES.has(tz)) return "CAD";
  if (tz.startsWith("Europe/")) return "EUR";
  if (tz.startsWith("America/") || tz.startsWith("US/") || tz === "Pacific/Honolulu") return "USD";
  return "CAD";
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("CAD");
  const [rates, setRates] = useState<Record<Currency, number>>(FALLBACK_RATES);
  const [ratesSource, setRatesSource] = useState<RatesSource>("fallback");

  // Set once the shopper picks a currency, so a late country answer never overrides their choice.
  const chosenRef = useRef(false);

  const setCurrency = (c: Currency) => {
    chosenRef.current = true;
    setCurrencyState(c);
    // Storage can be blocked (strict privacy settings, some in-app browsers): the choice still works for this visit.
    try { localStorage.setItem("fm_currency", c); } catch { /* not remembered */ }
  };

  // Starting currency: the shopper's own saved choice, else the country their IP address is in
  // (features/site/visitorCurrency.ts, asked of the shop's server), with the time zone as the instant guess
  // while that answer arrives or when the platform can't tell.
  useEffect(() => {
    let saved: Currency | null = null;
    try { saved = localStorage.getItem("fm_currency") as Currency | null; } catch { /* storage blocked */ }
    if (saved && ["CAD", "USD", "EUR"].includes(saved)) {
      chosenRef.current = true;
      setCurrencyState(saved);
      return;
    }

    try {
      setCurrencyState(currencyForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || ""));
    } catch {
      setCurrencyState("CAD");
    }

    // The Studio preview shows the shop as the owner sees it and asks no server for a shopper's location.
    if (typeof window !== "undefined" && window.location.search.includes("preview=true")) return;
    let cancelled = false;
    loadVisitorCountry().then(country => {
      const fromCountry = currencyForCountry(country);
      if (!cancelled && fromCountry && !chosenRef.current) setCurrencyState(fromCountry);
    });
    return () => { cancelled = true; };
  }, []);

  // Today's exchange rates: the shop's saved daily copy (the same numbers checkout charges), with a timeout and a
  // one-hour per-tab cache (features/site/exchangeRates.ts). A tab left open re-reads them every hour, so prices
  // follow the next day's rates without a reload. `ratesSource` says whether they are live, cached or the fallback.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => loadRates().then(({ rates: next, source }) => {
      if (cancelled) return;
      setRates(prev => (prev.USD === next.USD && prev.EUR === next.EUR && prev.CAD === next.CAD ? prev : next));
      setRatesSource(source);
      if (source === "fallback") console.warn("Exchange rates unreachable: showing the fixed fallback rates.");
      try { document.documentElement.dataset.ratesSource = source; } catch { /* no document */ }
    });
    refresh();
    const timer = setInterval(refresh, RATES_CACHE_MS / 4);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const convertPrice = (priceInCAD: number) => {
    return priceInCAD * (rates[currency] || FALLBACK_RATES[currency]);
  };

  const formatPrice = (priceInCAD: number) => {
    const converted = convertPrice(priceInCAD);
    const symbol = CURRENCY_SYMBOLS[currency];
    return `${symbol}${converted.toFixed(2)}`;
  };

  const getBookPrice = (book: any, ignoreSale: boolean = false) => {
    if (!book) return 0;
    // Own (sale) price, or the cheapest edition for a book sold only in editions.
    const priceToUse = displayPrice(book, ignoreSale);

    // Shoppers are charged the CAD catalog price converted at today's rate
    // (functions/index.js), so that is the only price shown. Stored USD/EUR
    // figures are ignored here — showing them would promise a different amount.
    return priceToUse * (rates[currency] || 1.0);
  };

  const formatBookPrice = (book: any, ignoreSale: boolean = false) => {
    const price = getBookPrice(book, ignoreSale);
    const symbol = CURRENCY_SYMBOLS[currency];
    return `${symbol}${price.toFixed(2)}`;
  };

  const getVariantPrice = (variant: any, parentBook?: any) => {
    if (!variant) return 0;
    // Same rule as getBookPrice: CAD converted at today's rate, as charged.
    const base = variant.price || (parentBook ? (saleActive(parentBook) ? parentBook.salePrice : parentBook.retailPrice) : 0) || 0;
    return base * (rates[currency] || 1.0);
  };

  const formatVariantPrice = (variant: any, parentBook?: any) => {
    const price = getVariantPrice(variant, parentBook);
    const symbol = CURRENCY_SYMBOLS[currency];
    return `${symbol}${price.toFixed(2)}`;
  };

  return (
    <CurrencyContext.Provider value={{ 
      currency, 
      setCurrency, 
      rates, 
      ratesSource,
      convertPrice, 
      formatPrice,
      getBookPrice,
      formatBookPrice,
      getVariantPrice,
      formatVariantPrice
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
};

// Reusable CurrencySelector UI Dropdown Component
export function CurrencySelector({ label = "CURRENCY", ariaLabel = "Select currency" }: { label?: string; ariaLabel?: string } = {}) {
  const { currency, setCurrency } = useCurrency();

  return (
    <div className="flex items-center gap-1.5 bg-current/[0.05] hover:bg-current/[0.1] border border-current/[0.05] rounded-full px-3 py-1.5 transition-all text-current opacity-70 hover:opacity-100 group relative">
      <span className="text-[8px] font-black tracking-widest uppercase opacity-60">{label}</span>
      <div className="flex items-center gap-1">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          aria-label={ariaLabel}
          className="bg-transparent border-none outline-none text-[9px] font-black tracking-widest text-current cursor-pointer uppercase appearance-none pr-4"
        >
          <option value="CAD" className="bg-[var(--surface,#050508)] text-[var(--text-color,#fff)]">CAD</option>
          <option value="USD" className="bg-[var(--surface,#050508)] text-[var(--text-color,#fff)]">USD</option>
          <option value="EUR" className="bg-[var(--surface,#050508)] text-[var(--text-color,#fff)]">EUR</option>
        </select>
        <ChevronDown size={10} className="absolute right-3 pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity" />
      </div>
    </div>
  );
}
