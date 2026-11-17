// Checkout's delivery step: shipping, pickup or local delivery (FulfillmentMethodPicker), with the billing region
// a pickup order is taxed by. Hidden for an e-book-only bag. Display only: Checkout.tsx owns the quotes and the choice.
import type React from "react";
import { CountryField } from "./CountryField";
import { regionsFor } from "./postalRegion";
import { regionProps } from "./storefrontRegions";
import { FulfillmentMethodPicker, type FulfillmentSelection } from "./FulfillmentMethodPicker";
import { Field, RegionField, SectionHead } from "./CheckoutFields";
import type { CheckoutCustomer } from "./CheckoutAddressStep";
import { PickupTimePicker } from "./PickupTimePicker";
import type { PickupTimes } from "./pickupTimes";

type Copy = (key: string, vars?: Record<string, string | number>) => string;
type PickerProps = React.ComponentProps<typeof FulfillmentMethodPicker>;

export function CheckoutDeliveryStep({ c, mark, checkoutDesign, physicalItems, fulfillmentSelection, selectFulfillment, availableRates, localQuotes, availableFulfillmentMethods, shippoRatesLoading, formatPrice, pickupNeedsAddress, labelsAbove, pinnedCountryCodes, customer, setCustomer, selectedLocalQuote, pickupTime }: {
  c: Copy; mark: (key: string) => string | null; checkoutDesign: any; physicalItems: unknown[];
  fulfillmentSelection: FulfillmentSelection; selectFulfillment: (value: FulfillmentSelection) => void;
  availableRates: PickerProps["shippingQuotes"]; localQuotes: PickerProps["localQuotes"]; availableFulfillmentMethods: FulfillmentSelection["method"][];
  shippoRatesLoading: boolean; formatPrice: (priceInCAD: number) => string; pickupNeedsAddress: boolean; labelsAbove: boolean; pinnedCountryCodes: string[];
  customer: CheckoutCustomer; setCustomer: React.Dispatch<React.SetStateAction<CheckoutCustomer>>;
  selectedLocalQuote: PickerProps["localQuotes"][number] | undefined;
  /** Pickup times: the shop's open times, the chosen one and whether Pay found it missing. */
  pickupTime?: { times: PickupTimes | null; loading: boolean; value: string; onChange: (iso: string) => void; invalid: boolean };
}) {
  return (
    <section className="fm-co-section">
      <SectionHead marker={mark("delivery")} title={c("coDelivery")} tag={c("coDeliveryTag")} />
      {physicalItems.length > 0 && <FulfillmentMethodPicker
        method={fulfillmentSelection.method}
        optionId={fulfillmentSelection.optionId}
        onSelect={selectFulfillment}
        shippingQuotes={availableRates}
        localQuotes={localQuotes}
        availableMethods={availableFulfillmentMethods}
        loading={shippoRatesLoading && fulfillmentSelection.method !== "local_delivery"}
        words={{
          group: c("coFulfillmentGroup"),
          shipping: c("coFulfillmentShipping"),
          pickup: c("coFulfillmentPickup"),
          local_delivery: c("coFulfillmentDelivery"),
          review: c("coFulfillmentReview"),
          unavailable: c("coFulfillmentUnavailable"),
          addressPrompt: c("coFulfillmentAddressPrompt"),
          loading: c("coRates"),
          instructions: c("coFulfillmentInstructions"),
          hours: c("coFulfillmentHours"),
          estimate: c("coFulfillmentEstimate"),
          carrierTransit: c("coCarrierTransit"),
          carrierUnavailable: c("coCarrierTimingUnavailable"),
          deliveryDays: c("coEstimated"),
          free: c("coFree"),
        }}
        formatPrice={formatPrice}
      />}
      {c("coShipMethodNote") && <p className="fm-co-note">{c("coShipMethodNote")}</p>}
      {physicalItems.length > 0 && fulfillmentSelection.method === "pickup" && fulfillmentSelection.optionId && pickupTime && <PickupTimePicker
        times={pickupTime.times} loading={pickupTime.loading} value={pickupTime.value} onChange={pickupTime.onChange} invalid={pickupTime.invalid}
        words={{
          title: c("coPickupTimeTitle"), note: c("coPickupTimeNote"), days: c("coPickupTimeDays"), times: c("coPickupTimeTimes"),
          loading: c("coPickupTimeLoading"), none: c("coPickupTimeNone"), choose: c("coPickupTimeChoose"), chosen: c("coPickupTimeChosen"),
        }} />}
      {fulfillmentSelection.method === "pickup" && !pickupNeedsAddress && <section {...regionProps("checkoutFulfillment")} className="fm-co-box flex flex-col gap-4">
        <div><h3 className="fm-co-mono">{c("coBillingTitle")}</h3><p className="fm-co-note mt-1">{c("coBillingNote")}</p></div>
        <CountryField label={c("coBillCountry")} stacked={labelsAbove}
          pinnedCodes={pinnedCountryCodes} showFlags={!checkoutDesign.hideCountryFlags}
          words={{ search: c("coCountrySearch"), popular: c("coCountryPopular"), all: c("coCountryAll"), none: (q: string) => c("coCountryNone", { query: q }) }}
          value={customer.billingAddress.country} onChange={v => setCustomer(prev => ({ ...prev, billingAddress: { country: v, state: v === prev.billingAddress.country ? prev.billingAddress.state : "" } }))} />
        {regionsFor(customer.billingAddress.country)
          ? <RegionField label={c("coBillState")} choose={c("coBillStateChoose")} regions={regionsFor(customer.billingAddress.country)!} value={customer.billingAddress.state} onChange={v => setCustomer(prev => ({ ...prev, billingAddress: { ...prev.billingAddress, state: v } }))} />
          : <Field label={c("coBillState")} value={customer.billingAddress.state} onChange={v => setCustomer(prev => ({ ...prev, billingAddress: { ...prev.billingAddress, state: v } }))} autoComplete="billing address-level1" required />}
        {selectedLocalQuote?.address && <p className="fm-co-note">{c("coFulfillmentTaxLocation")} {selectedLocalQuote.address.city}, {selectedLocalQuote.address.state}</p>}
      </section>}
    </section>
  );
}
