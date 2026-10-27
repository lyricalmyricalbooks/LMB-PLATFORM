// Checkout's first steps: contact (email, name, phone, Google sign-in) and the ship-to address (or, for an
// e-book-only bag, the shopper's location). Display only: Checkout.tsx owns the details and checks them.
import type React from "react";
import { CheckCircle2 } from "lucide-react";
import { accountsEnabled } from "./customerAccounts";
import { CountryField } from "./CountryField";
import { applySuggestion } from "./addressSuggest";
import { detailInputId, postalCodeOptional, type DetailField } from "./checkoutDetails";
import { regionsFor } from "./postalRegion";
import { AddressField, Field, RegionField, SectionHead } from "./CheckoutFields";

type Copy = (key: string, vars?: Record<string, string | number>) => string;
export type CheckoutCustomer = {
  name: string; email: string; phone: string;
  address: { street: string; unit: string; city: string; state: string; zip: string; country: string };
  billingAddress: { state: string; country: string };
};

export function CheckoutAddressStep({ c, mark, checkoutDesign, currentUser, handleGoogleLogin, customer, setCustomer, fieldErrors, labelsAbove, pinnedCountryCodes, showShipTo, digitalOnly }: {
  c: Copy; mark: (key: string) => string | null; checkoutDesign: any; currentUser: any; handleGoogleLogin: () => void;
  customer: CheckoutCustomer; setCustomer: React.Dispatch<React.SetStateAction<CheckoutCustomer>>;
  fieldErrors: Partial<Record<DetailField, string>>; labelsAbove: boolean; pinnedCountryCodes: string[]; showShipTo: boolean; digitalOnly: boolean;
}) {
  return (
    <>
      <section className="fm-co-section">
        <SectionHead marker={mark("contact")} title={c("coContact")} />
        {currentUser ? (
          <div className="fm-co-box flex items-center justify-between gap-4">
            <div>
              <p className="fm-co-mono">{c("coSignedIn")}</p>
              <p className="fm-co-note">{currentUser.email}</p>
            </div>
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
          </div>
        ) : accountsEnabled(checkoutDesign) && (
          <button type="button" onClick={handleGoogleLogin} className="fm-co-btn-outline fm-co-mono w-full">
            {c("coGoogle")}
          </button>
        )}
        <div className="flex flex-col gap-2">
          <Field label={c("coEmail")} type="email" value={customer.email} onChange={v => setCustomer({ ...customer, email: v })} autoComplete="email" inputMode="email" required id={detailInputId("email")} error={fieldErrors.email} />
          {c("coEmailNote") && <p className="fm-co-note">{c("coEmailNote")}</p>}
        </div>
        <div className="fm-co-row fm-co-row-phone-stack">
          <Field label={c("coName")} value={customer.name} onChange={v => setCustomer({ ...customer, name: v })} autoComplete="name" required id={detailInputId("name")} error={fieldErrors.name} />
          <Field label={c("coPhone")} type="tel" value={customer.phone} onChange={v => setCustomer({ ...customer, phone: v })} autoComplete="tel" inputMode="tel" />
        </div>
      </section>

      {showShipTo && (
      <section className="fm-co-section">
        <SectionHead marker={mark("shipTo")} title={c(digitalOnly ? "coYourLocation" : "coShipTo")} />
        <CountryField label={c("coCountry")} id={detailInputId("country")} error={fieldErrors.country} stacked={labelsAbove}
          pinnedCodes={pinnedCountryCodes} showFlags={!checkoutDesign.hideCountryFlags}
          words={{ search: c("coCountrySearch"), popular: c("coCountryPopular"), all: c("coCountryAll"), none: (q: string) => c("coCountryNone", { query: q }) }}
          value={customer.address.country} onChange={v => setCustomer({ ...customer, address: { ...customer.address, country: v, state: v === customer.address.country ? customer.address.state : "" } })} />
        {!digitalOnly && (checkoutDesign.hideAddressSuggestions
          ? <Field label={c("coAddress")} value={customer.address.street} onChange={v => setCustomer({ ...customer, address: { ...customer.address, street: v } })} autoComplete="address-line1" required id={detailInputId("street")} error={fieldErrors.street} />
          : <AddressField label={c("coAddress")} value={customer.address.street} country={customer.address.country} state={customer.address.state} id={detailInputId("street")} error={fieldErrors.street}
              listLabel={c("coAddressSuggestions")} attribution={c("coAddressAttribution")} googleAttribution={c("coAddressAttributionGoogle")} enterHint={c("coAddressEnter")}
              onChange={v => setCustomer(prev => ({ ...prev, address: { ...prev.address, street: v } }))}
              onPick={sug => setCustomer(prev => ({ ...prev, address: { ...prev.address, ...applySuggestion(prev.address, sug, { unitField: !checkoutDesign.hideCheckoutAddressUnit }) } }))} />)}
        {!digitalOnly && (
          <div className={checkoutDesign.hideCheckoutAddressUnit ? "" : "fm-co-row fm-co-row-phone-stack"}>
            {!checkoutDesign.hideCheckoutAddressUnit && <div data-studio-target="copy:Checkout|style:checkout" data-studio-label="Apartment or unit"><Field label={c("coAddressUnit")} value={customer.address.unit} onChange={v => setCustomer(prev => ({ ...prev, address: { ...prev.address, unit: v } }))} autoComplete="address-line2" /></div>}
            <Field label={c("coCity")} value={customer.address.city} onChange={v => setCustomer({ ...customer, address: { ...customer.address, city: v } })} autoComplete="address-level2" required id={detailInputId("city")} error={fieldErrors.city} />
          </div>
        )}
        <div className={digitalOnly ? "" : "fm-co-row"}>
          {regionsFor(customer.address.country)
            ? <RegionField id={detailInputId("state")} error={fieldErrors.state} label={c("coState")} choose={c("coStateChoose")} regions={regionsFor(customer.address.country)!} value={customer.address.state} onChange={v => setCustomer({ ...customer, address: { ...customer.address, state: v } })} />
            : <Field label={c("coState")} value={customer.address.state} onChange={v => setCustomer({ ...customer, address: { ...customer.address, state: v } })} autoComplete="address-level1" id={detailInputId("state")} error={fieldErrors.state} />}
          {!digitalOnly && <Field label={c("coZip")} value={customer.address.zip} onChange={v => setCustomer({ ...customer, address: { ...customer.address, zip: v } })} autoComplete="postal-code" required={!postalCodeOptional(customer.address.country)} id={detailInputId("zip")} error={fieldErrors.zip} />}
        </div>
      </section>
      )}
    </>
  );
}
