import { useEffect, useState } from 'react';
import { adminApi } from './api';
import type { LocalFulfillmentConfig } from '../features/site/types';
import { quoteLocalFulfillment, validateLocalFulfillment } from '../features/site/localFulfillment';
import { SecondaryButton, DestructiveButton, SectionCard, TextField, TextArea, Toggle, SelectField, SaveBar, useConfirm } from './riso/components';
import { useSettingsDirty } from './settingsDirty';
import { friendlyError } from './settingsLayout';

const ROW = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--rp-border)' } as const;
const GRID = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', alignItems: 'start' } as const;

// Toronto postal codes all begin with M.
const TORONTO_AREA = ['M'];
const newTorontoPickup = () => ({ id: crypto.randomUUID(), enabled: false, name: 'Local pickup', price: 0, postalPrefixes: [...TORONTO_AREA], address: { street: '', city: 'Toronto', state: 'ON', zip: '', country: 'Canada' }, instructions: 'Free pickup for those in Toronto. We\u2019ll email you the pickup details.', hours: '', estimate: '' });

export function useLocalFulfillmentDraft(load = true) {
  const [config, setConfig] = useState<LocalFulfillmentConfig>({ enabled: false, pickupLocations: [], deliveryZones: [] });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // What is saved in Firestore, so the quick pickup switch can save only its own change.
  const [saved, setSaved] = useState<LocalFulfillmentConfig | null>(null);
  useEffect(() => {
    if (!load) return;
    let active = true;
    adminApi.getSettings().then(settings => {
      if (!active) return;
      const raw = settings.localFulfillment ?? { enabled: false, pickupLocations: [], deliveryZones: [] };
      const text = (value: unknown) => typeof value === 'string' ? value : '';
      const records = (value: unknown) => Array.isArray(value) ? value : [];
      const common = (record: any) => ({ ...record, id: text(record?.id) || crypto.randomUUID(), enabled: record?.enabled === true, name: text(record?.name), price: typeof record?.price === 'number' ? record.price : NaN, instructions: text(record?.instructions), estimate: text(record?.estimate) });
      const next: LocalFulfillmentConfig = { enabled: raw.enabled === true, pickupLocations: records(raw.pickupLocations).map(record => ({ ...common(record), hours: text(record?.hours), postalPrefixes: records(record?.postalPrefixes).map(text), address: Object.fromEntries(['street', 'city', 'state', 'zip', 'country'].map(field => [field, text(record?.address?.[field])])) as any })), deliveryZones: records(raw.deliveryZones).map(record => ({ ...common(record), minimumSubtotal: typeof record?.minimumSubtotal === 'number' ? (record as any).minimumSubtotal : NaN, postalPrefixes: records(record?.postalPrefixes).map(text), postalCodes: records(record?.postalCodes).map(text) })) };
      setConfig(next);
      setSaved(next);
      if (validateLocalFulfillment(raw).length) setNotice('Saved local configuration needs repair. Review all fields before saving.');
      setLoaded(true);
    }).catch(() => { if (active) setNotice('Could not load local fulfillment. Reload before saving.'); });
    return () => { active = false; };
  }, [load]);
  return { config, setConfig, notice, setNotice, busy, setBusy, loaded, saved, setSaved };
}

export function LocalFulfillmentSettings({ draft }: { draft?: ReturnType<typeof useLocalFulfillmentDraft> } = {}) {
  const localDraft = useLocalFulfillmentDraft(!draft);
  const { config, setConfig, notice, setNotice, busy, setBusy, loaded, saved, setSaved } = draft ?? localDraft;
  const dirty = loaded && !!saved && JSON.stringify(saved) !== JSON.stringify(config);
  useSettingsDirty('local-fulfillment', dirty);
  const [postal, setPostal] = useState('');
  const [askConfirm, confirmNode] = useConfirm();
  // The chosen "Who can choose pickup" mode per location: a custom list of just ['M'] would otherwise read back as Toronto only.
  const [areaModes, setAreaModes] = useState<Record<string, 'toronto' | 'custom' | 'everyone'>>({});
  async function remove(kind: 'pickupLocations' | 'deliveryZones', id: string, name: string) {
    const what = kind === 'pickupLocations' ? 'pickup location' : 'delivery zone';
    if (!(await askConfirm({ title: `Remove this ${what}?`, message: `${name ? `“${name}”` : `This ${what}`} will be removed when you save. Discard instead of saving to keep it.`, confirmLabel: `Remove ${what}` }))) return;
    setConfig(current => ({ ...current, [kind]: current[kind].filter((item: any) => item.id !== id) }));
  }
  const [subtotal, setSubtotal] = useState('0');
  const errors = validateLocalFulfillment(config);
  function patch(kind: 'pickupLocations' | 'deliveryZones', id: string, change: any) {
    setConfig(current => ({ ...current, [kind]: current[kind].map(record => record.id === id ? { ...record, ...change } : record) }));
  }
  function move(kind: 'pickupLocations' | 'deliveryZones', index: number, offset: number) {
    setConfig(current => { const records = [...current[kind]]; const target = index + offset; if (target < 0 || target >= records.length) return current; [records[index], records[target]] = [records[target], records[index]]; return { ...current, [kind]: records }; });
  }
  const pickupOn = config.enabled && config.pickupLocations.some(location => location.enabled);
  async function save(next: LocalFulfillmentConfig) {
    const problems = validateLocalFulfillment(next);
    if (problems.length) { setNotice(problems.join(' ')); return false; }
    setBusy(true);
    try { await adminApi.updateLocalFulfillment(next); setSaved(next); setNotice('Local fulfillment saved.'); return true; }
    catch (error) { setNotice(friendlyError(error, 'save pickup & local delivery') + ' Your changes are still here.'); return false; }
    finally { setBusy(false); }
  }
  // One click: turn on (creating a Toronto pickup if there isn't one) or off, and save straight away.
  // Applied to the saved settings only, so other unsaved edits on this page are never saved with it.
  const withQuickPickup = (base: LocalFulfillmentConfig, on: boolean): LocalFulfillmentConfig => {
    const locations = base.pickupLocations.length ? base.pickupLocations : [newTorontoPickup()];
    return on
      ? { ...base, enabled: true, pickupLocations: locations.map((location, index) => index === 0 ? { ...location, enabled: true, address: { ...location.address, state: location.address.state || 'ON', country: location.address.country || 'Canada' } } : location) }
      : { ...base, pickupLocations: base.pickupLocations.map(location => ({ ...location, enabled: false })) };
  };
  async function setQuickPickup(on: boolean) {
    const base = saved ?? config;
    const nextSaved = withQuickPickup(base, on);
    if (!(await save(nextSaved))) return;
    // Keep the owner's other unsaved edits on screen, with the pickup switch applied.
    setConfig(current => (current === base || JSON.stringify(current) === JSON.stringify(base)) ? nextSaved : withQuickPickup(current, on));
  }
  const noticeOk = notice === 'Local fulfillment saved.';
  const quotes = quoteLocalFulfillment(config, { country: 'CA', zip: postal }, subtotal === '' ? NaN : Number(subtotal), [{ quantity: 1 }]);
  return <div className="rp-stack">
    <fieldset disabled={!loaded || busy} style={{ border: 0, padding: 0, margin: 0 }} className="rp-stack">
    <SectionCard title="Pickup & local delivery" description="Pickup and nearby delivery. Off until you switch it on.">
      <Toggle label="Free local pickup for Toronto shoppers" checked={pickupOn} onChange={on => void setQuickPickup(on)} />
      <p className="rp-hint">{pickupOn ? 'On — shoppers with a Toronto postal code (starting with M) see a free "Local pickup" option at checkout. This switch saves straight away, on its own — other edits below still need Save.' : 'Off. Switch on to offer free pickup to Toronto shoppers — no other setup needed. You can add your address, hours and instructions below.'}</p>
      <Toggle label="Enable local fulfillment (pickup and delivery)" checked={config.enabled} onChange={enabled => setConfig({ ...config, enabled })} />
    </SectionCard>

    <SectionCard title="Local pickup" description="Collect in person. Toronto codes start with M." actions={<SecondaryButton onClick={() => setConfig({ ...config, pickupLocations: [...config.pickupLocations, newTorontoPickup()] })}>Add pickup location</SecondaryButton>}>
      {!config.pickupLocations.length && <p className="rp-hint">No pickup spot yet. Add one, fill in the address, switch it on.</p>}
    </SectionCard>
    {config.pickupLocations.map((record, index) => {
      const areas = record.postalPrefixes ?? [];
      const area = areaModes[record.id] ?? (!areas.length ? 'everyone' : areas.length === 1 && areas[0].trim().toUpperCase() === 'M' ? 'toronto' : 'custom');
      return <SectionCard key={record.id} title={record.name || 'New pickup location'}>
        <div className="rp-stack">
          <Toggle label="Show this pickup at checkout" checked={record.enabled} onChange={enabled => patch('pickupLocations', record.id, { enabled })} />
          <TextField label="Name shoppers see" value={record.name} onChange={e => patch('pickupLocations', record.id, { name: e.target.value })} />
          <SelectField label="Who can choose pickup" hint="Checked against the postal code the shopper enters at checkout." value={area} onChange={e => { const mode = e.target.value as 'toronto' | 'custom' | 'everyone'; setAreaModes(current => ({ ...current, [record.id]: mode })); patch('pickupLocations', record.id, { postalPrefixes: mode === 'toronto' ? [...TORONTO_AREA] : mode === 'everyone' ? [] : areas.length ? areas : ['M'] }); }}>
            <option value="toronto">Toronto only (postal codes starting with M)</option>
            <option value="custom">Specific postal areas…</option>
            <option value="everyone">Everyone, anywhere</option>
          </SelectField>
          {area === 'custom' && <TextArea label="Pickup postal areas" hint="M = all of Toronto. M6G = one area." value={areas.join(', ')} onChange={e => patch('pickupLocations', record.id, { postalPrefixes: e.target.value.split(/[,\n]/).map(v => v.trim()).filter(Boolean) })} />}
          <TextField label="Pickup fee (CAD)" hint="Use 0 for free pickup." type="number" min={0} step="0.01" value={Number.isFinite(record.price) ? record.price : ''} onChange={e => patch('pickupLocations', record.id, { price: e.target.value === '' ? NaN : Number(e.target.value) })} />
          <div className="rp-sect" style={{ margin: '8px 0 0' }}>Where shoppers collect it</div>
          <div style={GRID}>{(['street', 'city', 'state', 'zip', 'country'] as const).map(field => <TextField key={field} label={{ street: 'Street address (optional)', city: 'City', state: 'Province (e.g. ON)', zip: 'Postal code (optional)', country: 'Country' }[field]} value={record.address[field]} onChange={e => patch('pickupLocations', record.id, { address: { ...record.address, [field]: e.target.value } })} />)}</div>
          <TextArea label="Opening hours" value={record.hours ?? ''} onChange={e => patch('pickupLocations', record.id, { hours: e.target.value })} />
          <TextArea label="Pickup instructions" hint="E.g. ring the bell, bring your order number." value={record.instructions ?? ''} onChange={e => patch('pickupLocations', record.id, { instructions: e.target.value })} />
          <TextField label="When it's ready" hint="E.g. Ready in 1–2 business days." value={record.estimate ?? ''} onChange={e => patch('pickupLocations', record.id, { estimate: e.target.value })} />
          <div style={ROW}><SecondaryButton size="sm" disabled={index === 0} onClick={() => move('pickupLocations', index, -1)}>Move up</SecondaryButton><SecondaryButton size="sm" disabled={index === config.pickupLocations.length - 1} onClick={() => move('pickupLocations', index, 1)}>Move down</SecondaryButton><span style={{ flex: 1 }} /><DestructiveButton size="sm" onClick={() => void remove('pickupLocations', record.id, record.name)}>Remove</DestructiveButton></div>
        </div>
      </SectionCard>;
    })}

    <SectionCard title="Local delivery" description="Hand-delivered to nearby postal areas." actions={<SecondaryButton onClick={() => setConfig({ ...config, deliveryZones: [...config.deliveryZones, { id: crypto.randomUUID(), enabled: false, name: '', price: 0, minimumSubtotal: 0, postalPrefixes: [], postalCodes: [], instructions: '', estimate: '' }] })}>Add delivery zone</SecondaryButton>}>
      {!config.deliveryZones.length && <p className="rp-hint">No delivery zones yet. Choose <strong>Add delivery zone</strong>, list the postal areas you deliver to, set a fee, then switch it on.</p>}
    </SectionCard>
    {config.deliveryZones.map((record, index) => <SectionCard key={record.id} title={record.name || 'New delivery zone'}>
      <div className="rp-stack">
        <Toggle label="Offer this delivery zone at checkout" checked={record.enabled} onChange={enabled => patch('deliveryZones', record.id, { enabled })} />
        <TextField label="Name shoppers see" value={record.name} onChange={e => patch('deliveryZones', record.id, { name: e.target.value })} />
        <div style={GRID}><TextField label="Delivery fee (CAD)" hint="Use 0 for free delivery." type="number" min={0} step="0.01" value={Number.isFinite(record.price) ? record.price : ''} onChange={e => patch('deliveryZones', record.id, { price: e.target.value === '' ? NaN : Number(e.target.value) })} />
        <TextField label="Minimum physical merchandise subtotal (CAD)" hint="Printed books, after discounts. 0 = none." type="number" min={0} step="0.01" value={Number.isFinite(record.minimumSubtotal) ? record.minimumSubtotal : ''} onChange={e => patch('deliveryZones', record.id, { minimumSubtotal: e.target.value === '' ? NaN : Number(e.target.value) })} /></div>
        <TextArea label="Postal prefixes" rows={2} hint="Three characters each, separated by commas or new lines." value={record.postalPrefixes.join(', ')} onChange={e => patch('deliveryZones', record.id, { postalPrefixes: e.target.value.split(/[,\n]/).map(v => v.trim()).filter(Boolean) })} />
        <TextArea label="Exact postal codes" rows={2} hint="Comma or line separated." value={record.postalCodes.join(', ')} onChange={e => patch('deliveryZones', record.id, { postalCodes: e.target.value.split(/[,\n]/).map(v => v.trim()).filter(Boolean) })} />
        <TextArea label="Delivery instructions shoppers see" value={record.instructions ?? ''} onChange={e => patch('deliveryZones', record.id, { instructions: e.target.value })} />
        <TextField label="When it arrives" hint="Shown to shoppers, e.g. Delivered within 2 business days." value={record.estimate ?? ''} onChange={e => patch('deliveryZones', record.id, { estimate: e.target.value })} />
        <div style={ROW}><SecondaryButton size="sm" disabled={index === 0} onClick={() => move('deliveryZones', index, -1)}>Move up</SecondaryButton><SecondaryButton size="sm" disabled={index === config.deliveryZones.length - 1} onClick={() => move('deliveryZones', index, 1)}>Move down</SecondaryButton><span style={{ flex: 1 }} /><DestructiveButton size="sm" onClick={() => void remove('deliveryZones', record.id, record.name)}>Remove</DestructiveButton></div>
      </div>
    </SectionCard>)}
    <SectionCard title="Try a postal code" description="What a shopper there would see.">
      <div style={GRID}>
        <TextField label="Canadian postal code" placeholder="M6G 3H1" value={postal} onChange={e => setPostal(e.target.value)} />
        <TextField label="Discounted physical merchandise subtotal (CAD)" type="number" min={0} step="0.01" value={subtotal} onChange={e => setSubtotal(e.target.value)} />
      </div>
      <p role="status" className="rp-hint" style={{ margin: '12px 0 0', padding: 12, border: '1px solid var(--rp-border)', background: 'var(--rp-surface-sunken)' }}>{quotes.length ? <><strong>Offered:</strong> {quotes.map(q => `${q.name}: CAD ${q.price.toFixed(2)}`).join(' · ')}</> : 'No pickup or delivery option for this postal code and subtotal.'}</p>
    </SectionCard>
    {!!errors.length && <SectionCard title="Fix before saving" collapsible={false}><ul className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, color: 'var(--rp-danger)' }}>{errors.map(error => <li key={error}>✕ {error}</li>)}</ul></SectionCard>}
    <p role="status" className="rp-hint" style={notice ? { margin: 0, padding: 12, border: `1px solid var(${noticeOk ? '--rp-success' : '--rp-danger'})`, background: `var(${noticeOk ? '--rp-success-tint' : '--rp-danger-tint'})`, color: 'var(--rp-text)' } : { margin: 0 }}>{notice ? `${noticeOk ? '✓' : '✕'} ${notice}` : ''}</p>
    </fieldset>
    <SaveBar dirty={dirty} saving={busy} message={errors.length ? `Fix before saving: ${errors[0]}` : 'You have unsaved pickup & delivery changes.'}
      onSave={() => { if (!errors.length) void save(config); else setNotice(errors.join(' ')); }} onDiscard={() => { if (saved) setConfig(saved); setAreaModes({}); setNotice(''); }} />
    {confirmNode}
  </div>;
}
