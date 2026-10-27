import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { cleanMeasurementId, cleanPropertyId, googleAnalyticsApi, type Ga4Answer } from "./googleAnalytics";
import { bigQueryDatasetProblem, cleanBigQueryDataset, type JourneyAnswer } from "./bigQueryJourneys";
import { HowTo, friendlyError } from "./settingsLayout";
import { shopProfile } from "../../lib/shopProfile";
import { PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField } from "./riso/components";

// Settings › General › Google Analytics. The measurement ID turns on Google's tag for shoppers (consent-aware,
// lib/ga4.ts); the property ID lets the Overview read Google's reports through the shop's own server. The optional
// BigQuery export dataset feeds Overview › Visitor journeys / Last page before leaving (functions/bigQueryJourneys.js).
export function GoogleAnalyticsCard() {
  const [loaded, setLoaded] = useState<{ measurementId: string; propertyId: string; bigQueryDataset: string } | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [measurementId, setMeasurementId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<Ga4Answer | null>(null);
  const [dataset, setDataset] = useState("");
  const [bqChecking, setBqChecking] = useState(false);
  const [bqCheck, setBqCheck] = useState<JourneyAnswer | null>(null);

  const load = () => {
    setReadFailed(false);
    googleAnalyticsApi.load().then((v) => { setLoaded(v); setMeasurementId(v.measurementId); setPropertyId(v.propertyId); setDataset(v.bigQueryDataset); })
      .catch(() => setReadFailed(true));
  };
  useEffect(load, []);

  const midProblem = measurementId.trim() && !cleanMeasurementId(measurementId) ? "A measurement ID looks like G-ABC123XYZ (Admin › Data streams › your web stream)." : "";
  const pidProblem = propertyId.trim() && !cleanPropertyId(propertyId) ? "A property ID is a number of 6–15 digits (Admin › Property details), not the G-… ID." : "";
  const dsProblem = bigQueryDatasetProblem(dataset);
  const datasetDirty = !!loaded && cleanBigQueryDataset(dataset) !== cleanBigQueryDataset(loaded.bigQueryDataset);
  // The property the reports read must hold the tag the shop sends, or every visitor figure reads 0.
  const wrongProperty = !!check?.connected && Array.isArray(check.streamIds) && !!loaded?.measurementId
    && !check.streamIds.map(t => t.toUpperCase()).includes(loaded.measurementId.toUpperCase());
  const dirty = !!loaded && (cleanMeasurementId(measurementId) !== loaded.measurementId || cleanPropertyId(propertyId) !== loaded.propertyId || datasetDirty);

  const verifyBigQuery = async () => {
    setBqChecking(true); setBqCheck(null);
    try { setBqCheck(await googleAnalyticsApi.bigQueryStatus()); }
    catch (err: any) { setBqCheck({ connected: false, error: friendlyError(err, "check BigQuery") }); }
    finally { setBqChecking(false); }
  };

  const verify = async () => {
    setChecking(true); setCheck(null);
    try { setCheck(await googleAnalyticsApi.status()); }
    catch (err: any) { setCheck({ connected: false, error: friendlyError(err, "check the connection") }); }
    finally { setChecking(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await googleAnalyticsApi.save(measurementId, propertyId);
      if (datasetDirty) await googleAnalyticsApi.saveBigQueryDataset(dataset);
      const next = { measurementId: cleanMeasurementId(measurementId), propertyId: cleanPropertyId(propertyId), bigQueryDataset: cleanBigQueryDataset(dataset) };
      setLoaded(next); setMeasurementId(next.measurementId); setPropertyId(next.propertyId); setDataset(next.bigQueryDataset);
      toast.success("Google Analytics settings saved");
      if (next.propertyId) await verify();
    } catch (err: any) {
      toast.error(friendlyError(err, "save the Google Analytics settings"));
    } finally {
      setSaving(false);
    }
  };

  const tracking = !!loaded?.measurementId;
  const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");
  const checkTone = wrongProperty ? "--rp-warning" : check ? tone(check.connected) : "";

  return (
    <SectionCard title="Google Analytics"
      description="Traffic, channels and who's on the site now."
      actions={loaded && <StatusBadge tone={tracking ? "success" : "neutral"}>{tracking ? "Tracking on" : "Off"}</StatusBadge>}>
      <HowTo summary="Setup steps" open={!!loaded && !loaded.measurementId}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>
          <li>At <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">analytics.google.com</a> create a GA4 property for the shop (time zone: Toronto, currency: Canadian dollar) and a <strong>Web</strong> data stream for the shop's address.</li>
          <li>Copy the stream's <strong>Measurement ID</strong> (G-…) into the first box and save: the shop starts sending visits straight away.</li>
          <li>In the same web stream, open <strong>Enhanced measurement</strong> › Page views › Show advanced settings and turn off <strong>Page changes based on browser history events</strong> (the shop sends its own page views; leaving it on counts each page twice). Then under <strong>Configure tag settings › List unwanted referrals</strong> add <span className="rp-mono">paypal.com</span> and <span className="rp-mono">stripe.com</span>, so a sale isn't credited to the payment page.</li>
          <li>For the Overview figures, copy the <strong>Property ID</strong> (Admin › Property details) into the second box, then save and press <strong>Check connection</strong>. It tells you the one email to add in Admin › Property access management as a <strong>Viewer</strong>, and whether Google's reporting API needs switching on.</li>
        </ol>
      </HowTo>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
        <TextField label="Measurement ID" value={measurementId} placeholder="G-XXXXXXXXXX" autoComplete="off"
          hint="Public." error={midProblem || undefined} onChange={(e) => setMeasurementId(e.target.value)} />
        <TextField label="Property ID" value={propertyId} placeholder="123456789" autoComplete="off" inputMode="numeric"
          hint="Private. Server only." error={pidProblem || undefined} onChange={(e) => setPropertyId(e.target.value)} />
      </div>
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "8px 0 0", color: "var(--rp-danger)" }}>
          ✕ Couldn't read the saved settings. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={load}>Try again</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <PrimaryButton disabled={!dirty || !!midProblem || !!pidProblem || !!dsProblem || saving} onClick={save}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        {loaded?.propertyId && <SecondaryButton disabled={checking || saving} onClick={verify}>{checking ? "Checking…" : "Check connection"}</SecondaryButton>}
      </div>
      {check && (
        <div role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${checkTone})`, color: `var(${checkTone})`, background: `var(${checkTone}-tint)` }}>
          {check.connected && wrongProperty
            ? <>! Connected, but this property doesn't hold your tag {loaded?.measurementId}. Its tags: {check.streamIds!.join(", ") || "none"}. Use the property ID of the one that holds it.</>
            : check.connected
            ? <>✓ Connected. {check.activeNow ?? 0} on the site right now.</>
            : <>✕ {check.error || "Not connected yet."}</>}
          {!check.connected && check.serviceAccount && (
            <div style={{ marginTop: 8, color: "var(--rp-text)" }}>
              Shop's service account (add as Viewer): <span className="rp-mono" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{check.serviceAccount}</span>
            </div>
          )}
          {check.code === "api_disabled" && check.enableApiUrl && (
            <div style={{ marginTop: 8 }}><a href={check.enableApiUrl} target="_blank" rel="noopener noreferrer">Switch on the Google Analytics Data API</a></div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--rp-border)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "var(--rp-text-base)", fontWeight: 800 }}>Visitor journeys <span className="rp-hint" style={{ fontWeight: 400 }}>· BigQuery, optional</span></h3>
        <p className="rp-hint" style={{ margin: "0 0 8px" }}>The real paths people take, and where they leave.</p>
        <HowTo summary="Setup steps" open={false}>
          <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>
            <li>In Google Analytics › Admin › Product links › <strong>BigQuery links</strong> › Link, choose this Firebase project (<span className="rp-mono">{shopProfile.firebase.projectId}</span>), tick <strong>Daily</strong> export and submit. The first day's data appears about a day later.</li>
            <li>In <a href={`https://console.cloud.google.com/iam-admin/iam?project=${encodeURIComponent(shopProfile.firebase.projectId)}`} target="_blank" rel="noopener noreferrer">Google Cloud › IAM</a>, give the shop's service account (shown by <strong>Check BigQuery</strong>) the roles <strong>BigQuery Data Viewer</strong> and <strong>BigQuery Job User</strong>.</li>
            <li>Leave the box below empty: the shop reads <span className="rp-mono">analytics_&lt;property ID&gt;</span> in this project. Only if the export lives elsewhere, write its <span className="rp-mono">project.dataset</span>. Then press <strong>Check BigQuery</strong>.</li>
          </ol>
        </HowTo>
        <div style={{ marginTop: 12, maxWidth: 520 }}>
          <TextField label="BigQuery export dataset" value={dataset} autoComplete="off"
            placeholder={loaded?.propertyId ? `analytics_${loaded.propertyId} (automatic)` : "analytics_<property ID> (automatic)"}
            hint="Leave empty unless the export lives elsewhere."
            error={dsProblem || undefined} onChange={(e) => setDataset(e.target.value)} />
        </div>
        {(loaded?.propertyId || loaded?.bigQueryDataset) && (
          <div style={{ marginTop: 12 }}>
            <SecondaryButton disabled={bqChecking || saving || datasetDirty} onClick={verifyBigQuery}>{bqChecking ? "Checking…" : "Check BigQuery"}</SecondaryButton>
          </div>
        )}
        {bqCheck && (
          <div role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${tone(bqCheck.connected)})`, color: `var(${tone(bqCheck.connected)})`, background: `var(${tone(bqCheck.connected)}-tint)` }}>
            {bqCheck.connected
              ? <>✓ Connected to <span className="rp-mono">{bqCheck.dataset}</span>.</>
              : <>✕ {bqCheck.error || "Not connected yet."}</>}
            {!bqCheck.connected && bqCheck.serviceAccount && (
              <div style={{ marginTop: 8, color: "var(--rp-text)" }}>
                Shop's service account (BigQuery Data Viewer + BigQuery Job User): <span className="rp-mono" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{bqCheck.serviceAccount}</span>
              </div>
            )}
            {bqCheck.code === "api_disabled" && bqCheck.enableApiUrl && (
              <div style={{ marginTop: 8 }}><a href={bqCheck.enableApiUrl} target="_blank" rel="noopener noreferrer">Switch on the BigQuery API</a></div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
