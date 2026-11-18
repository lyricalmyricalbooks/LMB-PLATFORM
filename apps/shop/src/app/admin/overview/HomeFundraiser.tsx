// Home's fundraiser card (Donations & tips beta, G2): while a fundraiser runs, how far along it is, so the owner sees the
// goal fill without opening Donations. Only read when Donations & tips is on; nothing shows when none runs or the read fails.
import { useEffect, useState } from "react";
import { givingAdmin, type AdminFundraiser, type GivingList } from "../givingApi";
import { fundraiserLines } from "../givingView";
import { goalProgress } from "../../../shared/fundraiserRules";
import { useWaysOn } from "../waysApi";
import { moneyText } from "../eventsView";
import "../giving.css";

export function HomeFundraiser({ onOpen }: { onOpen: () => void }) {
  const on = useWaysOn().includes("giving");
  const [found, setFound] = useState<{ f: AdminFundraiser; currency: string; today?: string } | null>(null);
  useEffect(() => {
    if (!on) { setFound(null); return; }
    let live = true;
    givingAdmin<GivingList>("list").then((list) => {
      const f = (list.fundraisers || []).find((x) => x.state === "live");
      if (live) setFound(f ? { f, currency: list.currency, today: list.today } : null);
    }).catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [on]);
  if (!found) return null;
  const { f, currency, today } = found;
  const money = (minor: number) => moneyText(minor, currency);
  const { bar } = goalProgress(f.raisedMinor, f.goalMinor);
  const lines = fundraiserLines(f, money, today);
  return (
    <section className="rp-home-card rp-home-fund" aria-labelledby="home-fund">
      <div className="rp-home-card-head">
        <p className="rp-home-kicker" id="home-fund">Fundraiser</p>
        <button type="button" className="rp-home-link" onClick={onOpen}>Open donations</button>
      </div>
      <strong className="rp-home-fund-title">{f.title}</strong>
      <p className="rp-home-line"><span className="rp-home-money rp-home-fund-raised">{money(f.raisedMinor)}</span> raised of {money(f.goalMinor)}</p>
      <div className="gvg-bar" role="progressbar" aria-label="Toward the goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar}><span style={{ width: `${bar}%` }} /></div>
      <p className="rp-home-line rp-home-empty">{[lines.percent, f.supporters === 1 ? "1 supporter" : `${f.supporters} supporters`, lines.when].join(" · ")}</p>
    </section>
  );
}
