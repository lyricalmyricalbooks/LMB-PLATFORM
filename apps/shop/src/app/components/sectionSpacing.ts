import { GAP_KEYS, PADDING_KEYS, spacingKey, UP_TO } from "../features/site/breakpoints";
/** One padding owner per section; responsive overrides target that same content box. */
export function sectionSpacingCss(id:string,s:any):string {
 const root='#section-'+String(id).replace(/[^a-zA-Z0-9_-]/g,'');
 let css=`${root}:has([data-studio-spacing]){padding-top:0!important;padding-bottom:0!important;padding-left:0!important;padding-right:0!important;}`;
 const valid=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=240;
 for(const [device,query] of [["tablet",UP_TO.tablet],["mobile",UP_TO.mobile]] as const){
  let rules='';
  for(const key of PADDING_KEYS){const value=s[spacingKey(key,device)];if(valid(value))rules+=`${root}:not(:has([data-studio-spacing])),${root} [data-studio-spacing]{${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${value}px!important;}`;}
  for(const key of GAP_KEYS){const value=s[spacingKey(key,device)];if(valid(value))rules+=`${root} [${key === "rowGap" ? "data-studio-row-gap" : "data-studio-gap"}="${key}"]{${key==='rowGap'?'row-gap':key==='gridGap'?'column-gap':'gap'}:${value}px!important;}`;}
  if(valid(s[spacingKey('gridGap',device)]))rules+=`${root} [data-studio-gap-property="gap"]{gap:${s[spacingKey('gridGap',device)]}px!important;}`;
  if(rules)css+=`@media${query}{${rules}}`;
 }
 return css;
}
