// The label step's state (parcel, saved parcels, rates, buying), shared by the order page and Stockroom › Shipping so both
// buy through the same server path: createShippingLabel "rates" then "purchase" (functions/shippingLabels.js claims the
// order first, so a second purchase for the same order is refused there, whichever page asked).
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { adminApi } from "./api";
import { matchesCustomerService, suggestedParcelWeightGrams } from "./fulfillment";
import type { Parcel, ParcelPreset } from "./LabelBuyer";
import { plainError } from "./plainError";

export function useLabelPurchase(orderId: string, order: any, reload: () => Promise<unknown> | void) {
  const [parcel, setParcel] = useState<Parcel>({ length: "10", width: "8", height: "2", weight: "680", distance_unit: "in", mass_unit: "g" });
  const touched = useRef(false);
  const [presets, setPresets] = useState<ParcelPreset[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [shipmentId, setShipmentId] = useState("");
  const [selectedRate, setSelectedRate] = useState("");
  // Rates were asked for the current parcel (cleared whenever the parcel changes, so a label is never bought for an old size).
  const [searched, setSearched] = useState(false);
  const [finding, setFinding] = useState(false);
  const [buying, setBuying] = useState(false);

  // Parcel presets live in settings/parcelPresets (shared by every browser). Presets saved in
  // this browser's localStorage before that are copied across once, then removed locally.
  useEffect(() => {
    let alive = true;
    let local: any[] = [];
    try { local = JSON.parse(localStorage.getItem("publisher-parcels") || "[]"); } catch { local = []; }
    if (!Array.isArray(local)) local = [];
    adminApi.getParcelPresets().then(async (remote) => {
      const merged = [...(remote || [])];
      for (const p of local) if (p?.name && !merged.some((m) => m.name === p.name)) merged.push(p);
      if (local.length && merged.length !== (remote || []).length) await adminApi.saveParcelPresets(merged);
      if (local.length) { try { localStorage.removeItem("publisher-parcels"); } catch { /* ignore */ } }
      if (alive) setPresets(merged);
    }).catch(() => { if (alive) setPresets(local); });
    return () => { alive = false; };
  }, []);

  // Start from the items' catalog weights (grams), not a fixed guess, until the owner changes the parcel.
  useEffect(() => {
    if (order && !touched.current) setParcel((p) => ({ ...p, weight: suggestedParcelWeightGrams(order), mass_unit: "g" }));
  }, [order]);

  const forgetRates = () => {
    setRates([]);
    setShipmentId("");
    setSelectedRate("");
    setSearched(false);
  };
  const changeParcel = (patch: Partial<Parcel>) => {
    touched.current = true;
    setParcel((prev) => ({ ...prev, ...patch }));
    forgetRates();
  };
  // A saved parcel sets the box size; the weight still comes from this order's items, in grams
  // (presets saved before weights went metric carry mass_unit "lb").
  const pickPreset = (preset: ParcelPreset) =>
    changeParcel({ ...preset.parcel, weight: String(suggestedParcelWeightGrams(order)), mass_unit: "g" });
  const savePreset = async (name: string) => {
    const next = [...presets.filter((p) => p.name !== name), { name: name.slice(0, 60), parcel }].slice(-30);
    try {
      await adminApi.saveParcelPresets(next);
      setPresets(next);
      toast.success("Parcel saved");
      return true;
    } catch {
      toast.error("Could not save the parcel");
      return false;
    }
  };

  const findRates = async () => {
    setFinding(true);
    try {
      const result = await adminApi.getCanadaPostLabelRates(orderId, parcel);
      setRates(result.rates || []);
      setShipmentId(result.shipmentId || "");
      // Pre-select the service the customer paid for at checkout; never silently swap it.
      const chosen = (result.rates || []).find((r: any) => matchesCustomerService(r.name, order?.shippingMethod));
      setSelectedRate(chosen?.id || (order?.shippingMethod ? "" : result.rates?.[0]?.id || ""));
      setSearched(true);
    } catch (err: any) {
      toast.error(plainError(err, "Couldn't load Canada Post rates"));
    } finally {
      setFinding(false);
    }
  };

  /** Buys the chosen rate. True when the label was bought; the order is read again either way. */
  const buy = async (): Promise<boolean> => {
    if (!selectedRate || !shipmentId || buying) return false;
    setBuying(true);
    try {
      await adminApi.buyCanadaPostLabel(orderId, shipmentId, selectedRate);
      forgetRates();
      await reload();
      toast.success("Label bought. Print it, then mark the parcel shipped when it leaves.");
      return true;
    } catch (err: any) {
      toast.error(plainError(err, "Couldn't purchase the label"));
      await reload();
      return false;
    } finally {
      setBuying(false);
    }
  };

  return { parcel, changeParcel, presets, pickPreset, savePreset, rates, searched, selectedRate, setSelectedRate, finding, buying, findRates, buy };
}
