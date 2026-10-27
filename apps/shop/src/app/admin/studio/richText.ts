const tags = new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","U","S","STRIKE","A","H1","H2","H3","H4","H5","H6","UL","OL","LI","BLOCKQUOTE"]);
export function safeRichHref(value:string):boolean {
 const text=value.trim(); return !/[\u0000-\u0020\u007f]/.test(text) && (/^(https?:|mailto:|tel:)/i.test(text) || /^(\/|#|\?|\.\.?\/)/.test(text) && !text.startsWith("//") || !/[:\\]/.test(text));
}
const styleValues:Record<string,string[]>={"text-align":["left","center","right","justify"],"font-weight":["bold","normal","700"],"font-style":["italic","normal"],"text-decoration":["underline","line-through","none"]};
function allowedAttribute(element:Element, attr:Attr):boolean {
 if(attr.name==="href")return element.tagName==="A"&&safeRichHref(attr.value);
 if(attr.name==="title")return element.tagName==="A";
 if(attr.name==="class")return attr.value.split(/\s+/).every(v=>/^ql-(align-(left|center|right|justify)|indent-[1-8])$/.test(v));
 if(attr.name==="style")return Array.from((element as HTMLElement).style).every(key=>styleValues[key]?.includes((element as HTMLElement).style.getPropertyValue(key).trim()));
 return false;
}
export function canInlineFormat(html:string):boolean {
 if(typeof document==="undefined")return false;
 const root=document.createElement("template");root.innerHTML=html;
 return Array.from(root.content.querySelectorAll("*")).every(n=>tags.has(n.tagName)&&Array.from(n.attributes).every(a=>allowedAttribute(n,a)));
}
/** Allow only the markup the canvas formatting controls can produce. */
export function sanitizeRichText(html:string):string {
 if(typeof document==="undefined")return "";
 const root=document.createElement("template");root.innerHTML=html;
 const walk=(node:ParentNode)=>Array.from(node.childNodes).forEach(child=>{
  if(child.nodeType===8){child.remove();return;}
  if(child.nodeType!==1)return; const element=child as HTMLElement;
  if(!tags.has(element.tagName)){element.remove();return;}
  for(const attr of Array.from(element.attributes))if(!allowedAttribute(element,attr))element.removeAttribute(attr.name);
  if(element.hasAttribute("style"))element.setAttribute("style",element.style.cssText);
  walk(element);
 });walk(root.content);return root.innerHTML;
}
