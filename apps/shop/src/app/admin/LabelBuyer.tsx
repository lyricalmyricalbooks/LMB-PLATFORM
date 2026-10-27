import React, { useState } from "react";
import { matchesCustomerService } from "./fulfillment";
import { PrimaryButton, SecondaryButton, StatusBadge, TextField } from "./riso/components";
import { formatGrams } from "../features/site/metricWeight";

export type Parcel = { length: string; width: string; height: string; weight: string; distance_unit: string; mass_unit: string };
export type ParcelPreset = { name: string; parcel: Partial<Parcel> };

type Props = {
  order: any;
  parcel: Parcel;
  /** Changes the parcel. The parent forgets any rates found for the old parcel. */
  onParcel: (patch: Partial<Parcel>) => void;
  presets: ParcelPreset[];
  onPreset: (preset: ParcelPreset) => void;
  suggestedWeight: string | number;
  rates: any[];
  /** Rates were asked for this parcel (an empty `rates` then means none came back). */
  searched: boolean;
  selectedRate: string;
  onSelectRate: (id: string) => void;
  finding: boolean;
  buying: boolean;
  busy: boolean;
  /** Why the order can't ship yet ("" = it can). */
  problem: string;
  onFindRates: () => void;
  onBuy: () => void;
  onDispatch: () => void;
  onSavePreset: (name: string) => Promise<boolean>;
};

const same = (a: Partial<Parcel>, b: Partial<Parcel>) =>
  (["length", "width", "height"] as const).every((k) => Number(a[k]) > 0 && Number(a[k]) === Number(b[k]));
const price = (rate: any) => new Intl.NumberFormat("en-CA", { style: "currency", currency: rate?.currency || "CAD" }).format(Number(rate?.amount) || 0);

/**
 * Ship station, step 3: the parcel, the carrier rates and the Buy label button, right inside the order
 * (they used to be two dialogs). Buying still goes through the server's label purchase (claim lock,
 * Shippo, recorded in one transaction); a label never dispatches the order or emails the customer.
 */
export function LabelBuyer({
  order, parcel, onParcel, presets, onPreset, suggestedWeight, rates, searched, selectedRate, onSelectRate,
  finding, buying, busy, problem, onFindRates, onBuy, onDispatch, onSavePreset,
}: Props) {
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const valid = (["length", "width", "height", "weight"] as const).every((k) => Number.isFinite(Number(parcel[k])) && Number(parcel[k]) > 0);
  const picked = rates.find((r) => r.id === selectedRate);
  const locked = busy || finding || buying;
  const customerService = order?.shippingMethod ? rates.some((r) => matchesCustomerService(r.name, order.shippingMethod)) : true;
  const savePreset = async () => {
    if (savingPreset || !presetName.trim()) return;
    setSavingPreset(true);
    try { if (await onSavePreset(presetName.trim())) setPresetName(""); } finally { setSavingPreset(false); }
  };
  return (
    <div className="ss-label" aria-label="Buy the label">
      <div className="ss-label-row">
        <span className="rp-label">Parcel</span>
        {presets.length > 0 && (
          <div className="ss-chips" role="group" aria-label="Saved parcels">
            {presets.map((p) => {
              const on = same(p.parcel, parcel);
              return (
                <button key={p.name} type="button" className={`ss-chip${on ? " is-on" : ""}`} aria-pressed={on} disabled={locked} onClick={() => onPreset(p)}>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="ss-dims">
          {(["length", "width", "height", "weight"] as const).map((k) => (
            <TextField
              key={k}
              label={`${k[0].toUpperCase() + k.slice(1)} (${k === "weight" ? "g" : "in"})`}
              type="number"
              inputMode="decimal"
              min={k === "weight" ? "1" : "0.01"}
              step={k === "weight" ? "1" : "0.01"}
              value={parcel[k]}
              disabled={locked}
              onChange={(e) => onParcel({ [k]: e.target.value })}
            />
          ))}
        </div>
        <p className="rp-hint" style={{ margin: 0 }}>
          Suggested weight {formatGrams(Number(suggestedWeight))}, from the books' catalog weights plus packaging.
        </p>
        <details className="ss-preset">
          <summary>Save this size as a parcel</summary>
          <div className="ss-preset-form">
            <TextField label="Parcel name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Two paperbacks" />
            <SecondaryButton size="sm" disabled={savingPreset || !presetName.trim() || !valid} onClick={savePreset}>
              {savingPreset ? "Saving…" : "Save parcel"}
            </SecondaryButton>
          </div>
        </details>
      </div>

      {!searched ? (
        <div className="fw-actions">
          <PrimaryButton disabled={locked || !valid || !!problem} onClick={onFindRates}>
            {finding ? "Finding rates…" : "Find label rates"}
          </PrimaryButton>
          <SecondaryButton disabled={locked} onClick={onDispatch}>Ship without a label</SecondaryButton>
        </div>
      ) : (
        <fieldset className="ss-rates">
          <legend className="rp-label">Rate · the service the customer paid for first</legend>
          {rates.length === 0 ? (
            <p className="fw-problems" role="alert">
              No label rates came back for this parcel and address. Check the address and the parcel size, then find rates again.
            </p>
          ) : (
            <>
              {!customerService && (
                <p className="fw-problems" role="alert">The customer's service isn't offered for this parcel. Choose the closest one yourself.</p>
              )}
              {rates.map((rate, index) => {
                const on = rate.id === selectedRate;
                const chosen = matchesCustomerService(rate.name, order?.shippingMethod);
                const days = rate.estimatedDays ? `${rate.estimatedDays} day${rate.estimatedDays === 1 ? "" : "s"}` : "Delivery estimate unavailable";
                return (
                  <label key={rate.id} className={`ss-rate${on ? " is-on" : ""}`}>
                    <input type="radio" name="label-rate" value={rate.id} checked={on} disabled={locked} onChange={() => onSelectRate(rate.id)} />
                    <span className="ss-rate-name">
                      <strong>
                        {rate.name}
                        {rate.carrier && !String(rate.name).toLowerCase().includes(String(rate.carrier).toLowerCase()) ? ` · ${rate.carrier}` : ""}
                      </strong>{" "}
                      {chosen ? <StatusBadge tone="info">Customer chose</StatusBadge> : index === 0 ? <StatusBadge tone="success">Cheapest</StatusBadge> : null}
                      <span className="rp-hint" style={{ display: "block" }}>{days}{rate.durationTerms ? ` · ${rate.durationTerms}` : ""}</span>
                    </span>
                    <strong className="rp-mono">{price(rate)}</strong>
                  </label>
                );
              })}
              {picked && Number(picked.amount) > Number(order?.shipping || 0) && (
                <p className="rp-hint" role="status" style={{ margin: 0 }}>This label costs more than the customer paid for shipping.</p>
              )}
            </>
          )}
          <div className="fw-actions">
            <PrimaryButton disabled={locked || !picked || !!problem} onClick={onBuy}>
              {buying ? "Buying label…" : picked ? `Buy label · ${price(picked)}` : "Choose a rate"}
            </PrimaryButton>
            <SecondaryButton disabled={locked || !valid} onClick={onFindRates}>{finding ? "Finding rates…" : "Find rates again"}</SecondaryButton>
            <SecondaryButton disabled={locked} onClick={onDispatch}>Ship without a label</SecondaryButton>
          </div>
          <p className="rp-hint" style={{ margin: 0 }}>Buying charges your Shippo account. The customer is emailed only when you mark the parcel shipped.</p>
        </fieldset>
      )}
    </div>
  );
}
