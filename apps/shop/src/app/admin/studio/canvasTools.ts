import { duplicateSection, freshBlockIds, MAX_BLOCK_DEPTH, patchSectionSettings, type Section } from "./studioModel";
import { findSectionOwner, writeSections } from "./studioWorkflow";
import { GAP_KEYS, PADDING_KEYS, spacingKey, type Device } from "../../features/site/breakpoints";
export { GAP_KEYS, PADDING_KEYS, spacingKey, type Device };
const store = (design: any, owner: any, sections: Section[]) => writeSections(design, owner.surface, sections);
function siblings(list: any[], id: string, depth = 0): any[] | undefined {
 if (depth >= MAX_BLOCK_DEPTH) return;
 if (list.some(b => b.id === id)) return list;
 for (const b of list) { const found=siblings(b.children || [],id,depth+1); if(found)return found; }
}
export function contextCapabilities(design: any, sectionId: string, blockId: string | undefined, blocksKey: (type:string)=>string) {
 const owner=findSectionOwner(design,sectionId);if(!owner)return null;
 const list=blockId?siblings(owner.section.settings[blocksKey(owner.section.type)] || owner.section.settings.blocks || [],blockId):owner.sections;
 if(!list)return null; const i=list.findIndex(b=>b.id===(blockId || sectionId));if(i<0)return null;
 return {up:i>0,down:i<list.length-1,hidden:blockId?Boolean(list[i].hidden):list[i].visible===false};
}
export function applyContextAction(design: any, action: {sectionId:string;blockId?:string;action:string}, blocksKey: (type:string)=>string) {
 const owner=findSectionOwner(design,action.sectionId); if(!owner || !contextCapabilities(design,action.sectionId,action.blockId,blocksKey))return design;
 const edit=(list:any[],id:string,depth=0):any[]=>{
  if(depth>=MAX_BLOCK_DEPTH)return list;
  const i=list.findIndex(b=>b.id===id);
  if(i<0)return list.map(b=>b.children?.length?{...b,children:edit(b.children,id,depth+1)}:b);
  const next=[...list];
  if(action.action==="delete")next.splice(i,1);
  else if(action.action==="hide")next[i]=action.blockId?{...list[i],hidden:!list[i].hidden}:{...list[i],visible:list[i].visible===false};
  else if(action.action==="duplicate") { if(!action.blockId)return duplicateSection(list,id).list; next.splice(i+1,0,freshBlockIds(list[i])); }
  else if(action.action==="up"||action.action==="down") {const to=i+(action.action==="up"?-1:1);if(to<0||to>=list.length)return list;[next[i],next[to]]=[next[to],next[i]];}
  else return list;
  return next;
 };
 const key=blocksKey(owner.section.type);
 const sections=action.blockId?patchSectionSettings(owner.sections,action.sectionId,{[key]:edit(owner.section.settings[key] || owner.section.settings.blocks || [],action.blockId)}):edit(owner.sections,action.sectionId);
 return store(design,owner,sections);
}
export function applySpacing(design:any,action:{sectionId:string;key:string;device:Device;value:number|null},allowed:string[]) {
 if(!allowed.includes(action.key)||!["desktop","tablet","mobile"].includes(action.device)||action.value!==null&&(!Number.isFinite(action.value)||action.value<0||action.value>240))return design;
 const owner=findSectionOwner(design,action.sectionId);if(!owner)return design;
 return store(design,owner,patchSectionSettings(owner.sections,action.sectionId,{[spacingKey(action.key,action.device)]:action.value===null?undefined:action.value}));
}
