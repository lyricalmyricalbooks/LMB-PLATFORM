import { useEffect, useState } from 'react';
import { adminApi } from './api';
import { SectionCard, TextField, Toggle, SaveBar } from './riso/components';
import { useSettingsDirty } from './settingsDirty';
import { friendlyError } from './settingsLayout';
import { RETURN_WINDOW_MAX, returnSettings, returnSettingsProblem, type ReturnSettings as Saved } from '../../shared/returnRequests';

/**
 * Settings › Shipping › Returns: whether shoppers may ask for a return from their order page, and for how many days after
 * delivery. Off by default. A request never moves money or stock: it opens the returns desk on the order (Orders).
 */
export function ReturnSettings() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    adminApi.getSettings().then(settings => {
      if (!active) return;
      const current = returnSettings(settings?.returns);
      setSaved(current);
      setEnabled(current.enabled);
      setDays(String(current.windowDays));
    }).catch(() => { if (active) setNotice('Could not load the returns setting. Reload before saving.'); });
    return () => { active = false; };
  }, []);
  const draft = { enabled, windowDays: Number(days) };
  const problem = returnSettingsProblem(draft);
  const dirty = !!saved && (saved.enabled !== draft.enabled || String(saved.windowDays) !== days);
  useSettingsDirty('returns', dirty);
  async function save() {
    if (problem) { setNotice(problem); return; }
    setBusy(true);
    try { await adminApi.updateReturnSettings(draft); setSaved(draft); setNotice('Returns saved.'); }
    catch (error) { setNotice(friendlyError(error, 'save returns') + ' Your changes are still here.'); }
    finally { setBusy(false); }
  }
  const discard = () => { if (!saved) return; setEnabled(saved.enabled); setDays(String(saved.windowDays)); setNotice(''); };
  return (
    <div className="rp-stack">
      <SectionCard title="Returns" description="Let shoppers ask for a return from their order page. Off until you switch it on.">
        <Toggle label="Take returns" checked={enabled} onChange={setEnabled} disabled={!saved || busy} />
        <TextField label="Days to ask, after delivery" type="number" inputMode="numeric" min={1} max={RETURN_WINDOW_MAX} value={days}
          disabled={!saved || busy || !enabled} onChange={event => setDays(event.target.value)}
          hint="Counted from the day the order was delivered (or shipped, if there's no delivery date)."
          error={enabled && problem ? problem : undefined} />
        <p className="rp-hint">{enabled
          ? 'After an order ships, its page shows Ask for a return until the time is up. Each request lands in Orders under Needs me, where you approve or decline it, give return instructions, check what came back, and refund or swap for another size. Nothing is refunded until you do.'
          : 'Shoppers can only ask to cancel, before an order ships.'}</p>
        {notice && <p role="status" className="rp-hint">{notice}</p>}
      </SectionCard>
      <SaveBar dirty={dirty} saving={busy} onSave={() => void save()} onDiscard={discard}
        message={problem ? `Fix before saving: ${problem}` : 'You have unsaved returns changes.'} />
    </div>
  );
}
