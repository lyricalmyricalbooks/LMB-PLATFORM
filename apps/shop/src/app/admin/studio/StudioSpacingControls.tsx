import { GAP_KEYS, PADDING_KEYS, spacingKey, type Device } from "./canvasTools";
import { fieldBounds, getSectionFields } from "../ThemeEditorExtensions";
import type { Section } from "./studioModel";
export function StudioSpacingControls({section,device,onPatch}:{section:Section;device:Device;onPatch:(patch:any)=>void}) {
 const gaps=getSectionFields(section.type).filter(f=>GAP_KEYS.includes(f.key));
 const fields=[...PADDING_KEYS.map(key=>({key,label:key.replace(/[A-Z]/g,m=>" "+m.toLowerCase()),min:0,max:240})),...gaps.map(f=>({key:f.key,label:f.label,...fieldBounds(f)}))];
 return <div className="studio-control-card"><strong>Spacing · {device}</strong><p className="studio-hint">Drag the preview spacing handles or enter pixels here. Blank removes this override.</p>
 <div className="grid grid-cols-2 gap-2">{fields.map(f=>{const key=spacingKey(f.key,device);return <label key={key} className="text-xs">{f.label}<input key={String(section.settings[key])} aria-label={`${f.label} · ${device}`} type="number" min={f.min ?? 0} max={f.max ?? 240} defaultValue={section.settings[key] ?? ""} placeholder={device==="desktop"?"Automatic":String(section.settings[f.key] ?? "Inherited")} className="w-full mt-1 border rounded px-2 py-2" onBlur={e=>{const v=e.currentTarget.value;const value=v===""?undefined:Number(v);if(value===undefined||Number.isFinite(value)&&value>=(f.min ?? 0)&&value<=(f.max ?? 240))onPatch({[key]:value});else e.currentTarget.value=String(section.settings[key] ?? "");}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} /></label>;})}</div></div>;
}
