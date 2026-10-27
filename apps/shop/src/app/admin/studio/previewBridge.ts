import { CANVAS_TOOLS_SOURCE } from "./canvasBridge";
import { GRID_ARRANGE_SOURCE } from "./gridBridge";
// Same-origin iframe bridge. Unsaved design stays in iframe memory.
export const PREVIEW_BRIDGE_SOURCE = String.raw`(function(){
  if(window.__studioBridge){parent.postMessage({type:'PREVIEW_READY'},location.origin);return;}
  window.__studioBridge=true;
  var O=location.origin,selected=null,block=null,selectedKey=null,pickedEl=null,mode='edit',copyMap=[],editMap=[],styleTextMap=[],editing=null,editingNode=null,textAttrs=new WeakMap();
  var SEC='[data-fm-section],[data-section-id]',BLK='[data-fm-block],[data-block-id]',TGT='[data-studio-target]';
  function closest(n,s){return n&&n.closest?n.closest(s):null;}
  function sid(n){return n&&(n.getAttribute('data-fm-section')||n.getAttribute('data-section-id'));}
  function bid(n){return n&&(n.getAttribute('data-fm-block')||n.getAttribute('data-block-id'));}
  function send(d){parent.postMessage(d,O);}
  function find(sel,id,read,root){return Array.from((root||document).querySelectorAll(sel)).find(function(n){return read(n)===id;});}
  function box(color,tools){var n=document.createElement('div');n.setAttribute('data-studio-overlay','');
    n.style.cssText='position:fixed;pointer-events:none;display:none;z-index:99999;border:2px solid '+color+';box-sizing:border-box;';
    var label=document.createElement('span');label.style.cssText='position:absolute;left:0;top:0;background:'+color+';color:white;padding:3px 6px;font:11px sans-serif;';n.appendChild(label);
    if(tools){var bar=document.createElement('span');bar.style.cssText='position:absolute;right:0;top:0;display:flex;pointer-events:auto;background:'+color;
      [['Edit',function(){send({type:'SECTION_SELECT',instanceId:selected,blockId:block});}],['+ Block',function(){send({type:'ADD_BLOCK',sectionId:selected});}]].forEach(function(x){var b=document.createElement('button');b.type='button';b.textContent=x[0];b.style.cssText='border:0;border-left:1px solid rgba(255,255,255,.5);background:transparent;color:white;padding:5px 8px;font:11px sans-serif;cursor:pointer;';b.onclick=function(e){e.preventDefault();e.stopPropagation();x[1]();};bar.appendChild(b);});n.appendChild(bar);}
    document.body.appendChild(n);return n;}
  var hover=box('#2563eb'),selection=box('#059669',false),hoverNode=null;
  function place(b,n,label){if(b===hover)hoverNode=mode==='edit'&&n?n:null;if(mode!=='edit'||!n){b.style.display='none';return;}
    var r=n.getBoundingClientRect();b.style.display='block';b.style.top=r.top+'px';b.style.left=r.left+'px';b.style.width=r.width+'px';b.style.height=r.height+'px';b.firstChild.textContent=label||'Section';}
  function selectedNode(){if(!selected&&selectedKey)return pickedEl&&pickedEl.isConnected&&nodeKey(pickedEl)===selectedKey?pickedEl:findNode(selectedKey);var s=find(SEC,selected,sid);return block&&s?find(BLK,block,bid,s)||s:s;}
  function draw(){if(hoverNode)place(hover,hoverNode.isConnected?hoverNode:null,hover.firstChild.textContent);var n=selectedNode();place(selection,n,selected==='__studio-candidate'||block==='__studio-block-candidate'?'Preview · not added yet':!selected&&selectedKey&&n?nodeLabel(n):block?'Selected block':'Selected section');drawCanvasTools();}
  var scheduled=false;
  function redraw(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;draw();});}
  function route(){send({type:'STUDIO_ROUTE',href:location.pathname+location.search});send({type:'PREVIEW_READY'});scheduleScan();}
  ['pushState','replaceState'].forEach(function(method){var original=history[method];history[method]=function(state,title,url){
    if(url!=null){var next=new URL(url,location.href);if(next.origin===O){next.searchParams.set('preview','true');url=next.href;}}
    var result=original.call(history,state,title,url);setTimeout(route,0);return result;};});
  window.addEventListener('popstate',route);window.addEventListener('scroll',redraw,true);window.addEventListener('resize',function(){redraw();scheduleScan();});
  var observer=new MutationObserver(function(records){if(editing&&editingNode&&!document.contains(editingNode))editing();if(records.some(function(r){if(closest(r.target,'[data-studio-overlay]'))return false;var nodes=Array.from(r.addedNodes).concat(Array.from(r.removedNodes));return !nodes.length||!nodes.every(function(n){return n.nodeType===1&&n.hasAttribute('data-studio-overlay');});})){refreshTextHints();Array.from(document.querySelectorAll(SEC+','+BLK)).forEach(function(n){n.draggable=mode==='edit';});redraw();scheduleScan();}});
  observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',function(){clearTimeout(scanTimer);if(editing)editing();if(spacingSession)spacingSession.finish(true);observer.disconnect();});
  window.addEventListener('message',function(e){if(e.origin!==O||e.source!==parent||!e.data)return;var d=e.data;
    if((d.type==='THEME_UPDATE'||d.type==='STUDIO_PREVIEW_STATE')&&d.design&&typeof d.design==='object')window.__studioPreviewDesign=d.design;
    if(d.type==='STUDIO_MODE'&&(d.mode==='edit'||d.mode==='browse')){if(editing)editing();if(spacingSession)spacingSession.finish(true);mode=d.mode;document.documentElement.dataset.studioMode=mode;refreshTextHints();Array.from(document.querySelectorAll(SEC+','+BLK)).forEach(function(n){n.draggable=mode==='edit';});place(hover,null);draw();window.dispatchEvent(new CustomEvent('studio:mode',{detail:mode}));}
    if(d.type==='HIGHLIGHT_SECTION'){selected=typeof d.instanceId==='string'?d.instanceId:null;if(selected)selectedKey=null;block=typeof d.blockId==='string'?d.blockId:null;
      window.dispatchEvent(new CustomEvent('studio:selection',{detail:{sectionId:selected,blockId:block}}));
      requestAnimationFrame(function(){draw();var n=selectedNode();if(n&&d.scroll)n.scrollIntoView({behavior:'smooth',block:'center'});});}
    if(d.type==='SET_CANVAS_MAP'&&Array.isArray(d.items)){canvasMap=d.items;canvasDevice=d.device||'desktop';draw();}
    if(d.type==='SET_COPY_MAP'&&Array.isArray(d.items)){copyMap=d.items;refreshTextHints();}
    if(d.type==='SET_EDIT_MAP'&&Array.isArray(d.items)){editMap=d.items;refreshTextHints();}
    if(d.type==='SET_STYLE_TEXT_MAP'&&Array.isArray(d.items)){styleTextMap=d.items;refreshTextHints();}
  });
  // Studio shortcuts keep working while the preview has focus (Ctrl/Cmd + K, S, Z, Y, D; Alt + Left = Back in Edit mode).
  document.addEventListener('keydown',function(e){if(!editing&&mode==='edit'&&e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.key==='ArrowLeft'&&!closest(e.target,'input,textarea,select,[contenteditable=true]')){e.preventDefault();send({type:'KEY_COMMAND',key:'ArrowLeft',ctrl:false,meta:false,shift:false,alt:true});return;}if(editing&&(e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key||'').toLowerCase()==='s'){e.preventDefault();send({type:'KEY_COMMAND',key:'s',ctrl:e.ctrlKey,meta:e.metaKey,shift:false,alt:false});return;}if(editing||!(e.ctrlKey||e.metaKey)||e.altKey||closest(e.target,'input,textarea,select,[contenteditable=true]'))return;var k=(e.key||'').toLowerCase();if(['k','s','z','y','d'].indexOf(k)<0)return;e.preventDefault();send({type:'KEY_COMMAND',key:k,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,alt:false});},true);
  document.addEventListener('mouseover',function(e){if(mode!=='edit'||closest(e.target,'[data-studio-overlay]'))return;var b=closest(e.target,BLK),sec=closest(e.target,SEC);
    var textTarget=resolveTextTarget(e.target);if(textTarget){place(hover,textTarget.node,textTarget.editable?'Text · double-click to type':'Formatted text · use inspector');return;}
    if(b||sec){place(hover,b||sec,b?'Block · click to edit':'Section · click to edit');return;}
    var t=closest(e.target,TGT);place(hover,t,t?(t.getAttribute('data-studio-label')||'Element')+' · click to edit':'');},true);
  document.addEventListener('mouseout',function(){place(hover,null);},true);
  var dragging=null,draggingBlock=null,dragSection=null;
  document.addEventListener('dragstart',function(e){if(mode!=='edit')return;if(editing||spacingSession||closest(e.target,'[contenteditable]')){e.preventDefault();return;}var section=closest(e.target,SEC),b=closest(e.target,BLK);if(!section)return;
    dragSection=sid(section);if(b){draggingBlock=bid(b);e.dataTransfer.setData('text/plain',draggingBlock);}else{dragging=dragSection;e.dataTransfer.setData('text/plain',dragging);}e.dataTransfer.effectAllowed='move';},true);
  document.addEventListener('dragover',function(e){if(mode!=='edit')return;var section=closest(e.target,SEC),b=closest(e.target,BLK);
    if(draggingBlock&&b&&bid(b)!==draggingBlock&&section){e.preventDefault();e.dataTransfer.dropEffect='move';place(hover,b,sid(section)===dragSection?'Drop block here':'Move block into this section');return;}
    if(dragging&&section&&sid(section)!==dragging){e.preventDefault();e.dataTransfer.dropEffect='move';place(hover,section,'Drop section here');}},true);
  document.addEventListener('drop',function(e){var section=closest(e.target,SEC),b=closest(e.target,BLK);
    if(draggingBlock&&b&&bid(b)!==draggingBlock&&section){e.preventDefault();if(sid(section)===dragSection)send({type:'BLOCK_MOVE',sectionId:dragSection,blockId:draggingBlock,beforeId:bid(b)});else send({type:'BLOCK_MOVE_TO',fromSectionId:dragSection,blockId:draggingBlock,toSectionId:sid(section),beforeId:bid(b)});}
    else if(dragging){var before=section&&sid(section);if(before&&before!==dragging){e.preventDefault();send({type:'SECTION_MOVE',sectionId:dragging,beforeId:before});}}
    dragging=null;draggingBlock=null;dragSection=null;},true);
  document.addEventListener('dragend',function(){dragging=null;draggingBlock=null;dragSection=null;place(hover,null);},true);
  var linkTold=false;
  document.addEventListener('click',function(e){var link=closest(e.target,'a[href]');
    if(mode==='browse'){if(link){var url=new URL(link.href,location.href);if(url.origin===O){url.searchParams.set('preview','true');link.href=url.href;}else{link.target='_blank';link.rel='noopener noreferrer';}}return;}
    if(closest(e.target,'[contenteditable]')){e.stopPropagation();return;}
    if(editing&&editingNode&&e.detail===0&&e.target.contains&&e.target.contains(editingNode)){e.preventDefault();e.stopPropagation();return;}
    if(closest(e.target,'[data-studio-overlay]'))return;
    if(link&&!linkTold){linkTold=true;send({type:'LINK_BLOCKED'});}
    var section=closest(e.target,SEC),textTarget=resolveTextTarget(e.target);
    if(textTarget&&textTarget.editable&&(section||!closest(e.target,NODE))){e.preventDefault();e.stopPropagation();if(section){selected=sid(section);selectedKey=null;pickedEl=null;block=bid(closest(e.target,BLK));send({type:'CANVAS_SELECT',sectionId:selected,blockId:block});draw();}return;}
    if(!section){var t=closest(e.target,NODE);if(!t)return;e.preventDefault();e.stopPropagation();
      selected=null;block=null;selectedKey=nodeKey(t);pickedEl=t;draw();send(elementInfo(t,'STUDIO_ELEMENT'));
      return;}e.preventDefault();e.stopPropagation();selected=sid(section);selectedKey=null;pickedEl=null;block=bid(closest(e.target,BLK));draw();send({type:'SECTION_SELECT',instanceId:selected,blockId:block});
  },true);
  // Page structure: every section and built-in region in document order, so Studio can list
  // the real page (header, page content, footer, pop-overs) and point at any part of it.
  var NODE=SEC+',[data-studio-target],[data-store-region]',scanTimer=null,hoverKey=null;
  function nodeKey(n){var s=sid(n);if(s)return 's:'+s;var r=n.getAttribute('data-store-region');if(r)return 'r:'+r;return 't:'+(n.getAttribute('data-studio-target')||'')+'|'+(n.getAttribute('data-studio-label')||'');}
  function zoneOf(n){if(closest(n,'[role=dialog],dialog,[aria-modal=true]'))return 'overlay';if(closest(n,'header'))return 'header';if(closest(n,'footer'))return 'footer';return 'main';}
  function shown(n){try{var cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden')return false;}catch(err){return true;}var r=n.getBoundingClientRect();return r.width>0||r.height>0;}
  function scanStructure(){var seen={},out=[];Array.from(document.querySelectorAll(NODE)).forEach(function(n){if(closest(n,'[data-studio-overlay]'))return;var k=nodeKey(n);
    if(seen[k]){seen[k].count++;if(seen[k].hidden&&shown(n))seen[k].hidden=false;return;}
    var p=n.parentElement&&closest(n.parentElement,NODE);
    var item={key:k,label:n.getAttribute('data-studio-label')||'',target:n.getAttribute('data-studio-target')||'',region:n.getAttribute('data-store-region')||'',section:sid(n)||'',parent:p?nodeKey(p):'',zone:zoneOf(n),hidden:!shown(n),count:1};
    seen[k]=item;out.push(item);});
    send({type:'STRUCTURE',nodes:out.slice(0,800),href:location.pathname+location.search});}
  function scheduleScan(){clearTimeout(scanTimer);scanTimer=setTimeout(scanStructure,300);}
  function findNode(key){var all=Array.from(document.querySelectorAll(NODE)).filter(function(n){return nodeKey(n)===key;});return all.find(shown)||all[0]||null;}
  function nodeLabel(n){return n.getAttribute('data-studio-label')||'Section';}
  function elementInfo(n,type){return {type:type,key:nodeKey(n),label:n.getAttribute('data-studio-label')||'',target:n.getAttribute('data-studio-target')||'',region:n.getAttribute('data-store-region')||'',text:(n.textContent||'').replace(/\s+/g,' ').trim().slice(0,2000)};}
  window.addEventListener('message',function(e){if(e.origin!==O||e.source!==parent||!e.data)return;var d=e.data;
    if(d.type==='SCAN_STRUCTURE')scanStructure();
    if(d.type==='HOVER_NODE'){var h=typeof d.key==='string'?findNode(d.key):null;place(hover,h,h?nodeLabel(h):'');}
    if(d.type==='HIGHLIGHT_NODE'&&typeof d.key==='string'){var n=findNode(d.key);if(!n)return;n.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){place(hover,n,nodeLabel(n));},400);}
    if(d.type==='OPEN_OVERLAY'&&(d.overlay==='cart'||d.overlay==='search'||d.overlay==='popup'||d.overlay==='cookie'||d.overlay==='close')){window.__studioOpenOverlay=d.overlay;window.dispatchEvent(new CustomEvent('fm:studio-open-overlay',{detail:{overlay:d.overlay}}));scheduleScan();}
    if(d.type==='SELECT_NODE'){selectedKey=typeof d.key==='string'?d.key:null;if(selectedKey){selected=null;block=null;}draw();var sn=selectedKey&&findNode(selectedKey);if(sn){if(d.scroll)sn.scrollIntoView({behavior:'smooth',block:'center'});send(elementInfo(sn,'ELEMENT_INFO'));}}
  });
  document.addEventListener('mouseover',function(e){if(mode!=='edit'||closest(e.target,'[data-studio-overlay]'))return;var n=closest(e.target,NODE),k=n?nodeKey(n):null;if(k!==hoverKey){hoverKey=k;send({type:'NODE_HOVER',key:k});}},true);
  document.documentElement.addEventListener('mouseleave',function(){if(hoverKey){hoverKey=null;send({type:'NODE_HOVER',key:null});}});
${CANVAS_TOOLS_SOURCE}
${GRID_ARRANGE_SOURCE}
  function norm(t){return String(t||'').replace(/\s+/g,' ').trim().toLowerCase();}
  // Resolve only schema-backed fields. Plain text never flattens a formatted field or a composite label.
  function resolveTextTarget(node){
    var copyNode=closest(node,'[data-studio-copy]'),styleNode=closest(node,'[data-studio-style-text]');
    if(copyNode){var c=copyMap.find(function(x){return x.key===copyNode.getAttribute('data-studio-copy');});if(c)return Object.assign({},c,{node:copyNode,kind:'copy'});}
    if(styleNode){var st=styleTextMap.find(function(x){return x.key===styleNode.getAttribute('data-studio-style-text');});if(st)return Object.assign({},st,{node:styleNode,kind:'style',text:styleNode.getAttribute('data-studio-edit-value')||styleNode.textContent||''});}
    var section=closest(node,SEC),blockId=bid(closest(node,BLK)),field=closest(node,'[data-theme-field]');
    if(section){
      var key=field&&field.getAttribute('data-theme-field');
      var explicit=key&&editMap.find(function(x){return x.sectionId===sid(section)&&x.blockId===blockId&&x.key===key;});
      if(explicit)return Object.assign({},explicit,{node:field,kind:'section'});
      if(field)return null;
      for(var m=node,depth=0;m&&m!==section&&depth<4;m=m.parentElement,depth++){
        if(m.querySelector&&m.querySelector('a,button,input,svg'))continue;
        var hits=editMap.filter(function(x){return x.sectionId===sid(section)&&x.blockId===blockId&&x.editable&&x.text&&norm(x.text)===norm(m.textContent);});
        if(hits.length===1)return Object.assign({},hits[0],{node:m,kind:'section'});
      }
      return null;
    }
    for(var n=node,level=0;n&&n!==document.body&&level<4;n=n.parentElement,level++){
      if(!n.textContent||n.querySelector&&n.querySelector('a,button,input,svg'))continue;
      var region=closest(n,TGT),targets=region&&(region.getAttribute('data-studio-target')||''),group=targets&&targets.split('|').find(function(t){return t.indexOf('copy:')===0;});
      var candidates=copyMap.filter(function(c){return c.editable&&c.text&&norm(c.text)===norm(n.textContent)&&(!group||c.group===group.slice(5));});
      if(candidates.length===1)return Object.assign({},candidates[0],{node:n,kind:'copy'});
    }
    return null;
  }
  function refreshTextHints(){Array.from(document.querySelectorAll('[data-theme-field],[data-studio-copy],[data-studio-style-text]')).forEach(function(n){
    var t=resolveTextTarget(n);if(!t)return;
    if(!textAttrs.has(n))textAttrs.set(n,{tabindex:n.getAttribute('tabindex'),title:n.getAttribute('title')});
    var attrs=textAttrs.get(n);
    if(mode==='browse'){
      n.removeAttribute('data-studio-text-editable');
      ['tabindex','title'].forEach(function(key){if(attrs[key]===null)n.removeAttribute(key);else n.setAttribute(key,attrs[key]);});return;
    }
    n.setAttribute('data-studio-text-editable',t.editable?'true':'false');n.setAttribute('tabindex','0');
    n.setAttribute('title',t.editable?'Double-click or press Enter to edit text':'Formatted text: double-click or press Enter to open the inspector');
  });}
  function plainText(n){
    var out='';Array.from(n.childNodes||[]).forEach(function(child){
      if(child.nodeType===3){out+=child.nodeValue||'';return;}
      if(child.nodeType!==1)return;
      if(child.tagName==='BR'){out+='\n';return;}
      if((child.tagName==='DIV'||child.tagName==='P')&&out&&out.slice(-1)!=='\n')out+='\n';
      out+=plainText(child);
    });return out;
  }
  function startTextEdit(target){
    if(!target)return;
    if(spacingSession)spacingSession.finish(true);
    if(!target.editable){send({type:'INLINE_TEXT_UNAVAILABLE',kind:target.kind,sectionId:target.sectionId,blockId:target.blockId,key:target.key});return;}
    if(editing)editing();
    var field=target.node,originalHtml=field.innerHTML,originalValue=target.format==='html'?field.innerHTML:target.kind==='style'?target.text:field.textContent||'';
    var toolbar=document.createElement('div');toolbar.setAttribute('data-studio-overlay','');toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Edit preview text');
    toolbar.style.cssText='flex-wrap:wrap;position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:100001;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:10px;background:#fff;color:#111;border:2px solid #111;box-shadow:3px 3px 0 #111;font:12px system-ui;';
    var label=document.createElement('span');label.textContent=(target.label||'Text')+(target.shared?' · Linked block':target.kind!=='section'?' · All pages':'')+' · Draft only';label.style.cssText='min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';toolbar.appendChild(label);
    function finish(cancel){
      if(!editing)return;
      var value=target.format==='html'?field.innerHTML:plainText(field);editing=null;editingNode=null;
      field.removeAttribute('contenteditable');field.removeEventListener('keydown',keydown);field.removeEventListener('blur',blur);
      document.removeEventListener('focusin',focusOutside,true);if(richCleanup)richCleanup();toolbar.remove();
      field.innerHTML=originalHtml;
      if(!cancel&&value!==originalValue)send({type:'INLINE_TEXT_COMMIT',kind:target.kind,sectionId:target.sectionId,blockId:target.blockId,key:target.key,value:value,format:target.format});
      send({type:'TEXT_EDIT_END',cancelled:!!cancel});draw();
    }
    [['Done',function(){finish(false);}],['Cancel',function(){finish(true);}]].forEach(function(item){var button=document.createElement('button');button.type='button';button.textContent=item[0];button.style.cssText='min-height:36px;padding:6px 12px;border:1px solid #111;background:#fff;color:#111;font:inherit;cursor:pointer;';button.addEventListener('mousedown',function(e){e.preventDefault();});button.addEventListener('click',item[1]);toolbar.appendChild(button);});
    var richCleanup=target.format==='html'?addFormatting(toolbar,field):null;
    document.body.appendChild(toolbar);editingNode=field;editing=function(){finish(false);};
    send({type:'TEXT_EDIT_START',label:target.label||'Text'});draw();
    if(target.format!=='html')field.textContent=originalValue;field.setAttribute('contenteditable',target.format==='html'?'true':'plaintext-only');field.focus();
    var range=document.createRange();range.selectNodeContents(field);var selectionRange=window.getSelection();selectionRange.removeAllRanges();selectionRange.addRange(range);
    function keydown(ev){
      ev.stopPropagation();
      if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();finish(true);}
      else if(ev.key==='Enter'&&(!target.multiline||ev.ctrlKey||ev.metaKey)){ev.preventDefault();finish(false);}
    }
    function blur(ev){if(toolbar.contains(ev.relatedTarget))return;finish(false);}
    function focusOutside(ev){if(ev.target!==field&&!field.contains(ev.target)&&!toolbar.contains(ev.target))finish(false);}
    field.addEventListener('keydown',keydown);field.addEventListener('blur',blur);document.addEventListener('focusin',focusOutside,true);
  }
  document.addEventListener('dblclick',function(e){if(mode!=='edit'||closest(e.target,'[data-studio-overlay]'))return;var target=resolveTextTarget(e.target);if(!target)return;e.preventDefault();e.stopPropagation();startTextEdit(target);},true);
  document.addEventListener('keydown',function(e){if(mode!=='edit'||editing||e.key!=='Enter'||closest(e.target,'input,textarea,select,[data-studio-overlay]'))return;var target=resolveTextTarget(e.target);if(target){e.preventDefault();startTextEdit(target);}},true);
  var style=document.createElement('style');style.textContent='html[data-studio-mode="edit"] [data-studio-text-editable="true"]:is(:hover,:focus){outline:1px dashed #2563eb;outline-offset:2px;cursor:text}html[data-studio-mode="edit"] .animate-marquee:has([contenteditable]){animation-play-state:paused!important}html[data-studio-mode="edit"] [contenteditable]{outline:2px solid #2563eb;cursor:text}html[data-studio-mode="edit"] [data-fm-section],html[data-studio-mode="edit"] [data-fm-block]{cursor:grab}';document.head.appendChild(style);Array.from(document.querySelectorAll(SEC+','+BLK)).forEach(function(n){n.draggable=true;});document.documentElement.dataset.studioMode=mode;route();
})();`;
