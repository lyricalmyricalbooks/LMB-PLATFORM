// Runs inside previewBridge's same-origin closure; mutations commit once to the parent draft.
export const CANVAS_TOOLS_SOURCE = String.raw`
  function addFormatting(toolbar,field){
    var savedRange=null;
    function remember(){var sel=window.getSelection();if(sel.rangeCount&&field.contains(sel.anchorNode)&&field.contains(sel.focusNode))savedRange=sel.getRangeAt(0).cloneRange();}
    document.addEventListener('selectionchange',remember);
    function restore(){field.focus();if(savedRange){var sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedRange);}}
    function command(name,value){restore();document.execCommand(name,false,value||null);remember();}
    [['Bold','bold'],['Italic','italic'],['Underline','underline'],['Align left','justifyLeft'],['Align center','justifyCenter'],['Align right','justifyRight'],['Clear formatting','removeFormat']].forEach(function(item){var b=toolButton(item[0],function(){command(item[1]);});b.onmousedown=function(e){e.preventDefault();remember();};toolbar.appendChild(b);});
    var heading=document.createElement('select');heading.setAttribute('aria-label','Text style');heading.style.cssText='min-height:36px;background:#fff;color:#111;border:1px solid #111;';
    [['p','Paragraph'],['h2','Heading 2'],['h3','Heading 3']].forEach(function(item){var option=document.createElement('option');option.value=item[0];option.textContent=item[1];heading.appendChild(option);});heading.onmousedown=remember;heading.onchange=function(){command('formatBlock',heading.value);};toolbar.appendChild(heading);
    var linkBox=document.createElement('span');linkBox.hidden=true;var input=document.createElement('input');input.type='url';input.placeholder='https://… or /page/…';input.setAttribute('aria-label','Link address');input.style.cssText='min-height:36px;max-width:180px;color:#111;background:#fff;border:1px solid #111;';linkBox.appendChild(input);
    var error=document.createElement('span');error.setAttribute('role','status');
    var apply=toolButton('Apply link',function(){var url=input.value.trim();if(/^\/\/[^\/\s]/.test(url))url='https:'+url;else if(/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([\/?#]\S*)?$/i.test(url)&&!/\.(html?|php|aspx?)$/i.test(url))url='https://'+url;input.value=url;if(!url||/[\u0000-\u0020\u007f]/.test(url)||!(/^(https?:|mailto:|tel:)/i.test(url)||/^(\/|#|\?|\.\.?\/)/.test(url)&&!url.startsWith('//')||!/[:\\]/.test(url))){error.textContent='Enter a web, email or relative link.';return;}command('createLink',url);linkBox.hidden=true;error.textContent='';});linkBox.appendChild(apply);linkBox.appendChild(error);
    var link=toolButton('Link',function(){remember();linkBox.hidden=!linkBox.hidden;if(!linkBox.hidden)input.focus();});link.onmousedown=function(e){e.preventDefault();remember();};toolbar.appendChild(link);toolbar.appendChild(linkBox);
    var unlink=toolButton('Remove link',function(){command('unlink');});unlink.onmousedown=function(e){e.preventDefault();remember();};toolbar.appendChild(unlink);
    function paste(e){e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));}
    field.addEventListener('paste',paste);
    return function(){document.removeEventListener('selectionchange',remember);field.removeEventListener('paste',paste);};
  }
  var canvasMap=[],canvasDevice='desktop',fadeBar=function(bar){if(!bar||!bar.style)return;var more=bar.scrollLeft+bar.clientWidth<bar.scrollWidth-2,m=more?'linear-gradient(to right,#000 80%,transparent)':'none';bar.style.setProperty('mask-image',m);bar.style.setProperty('-webkit-mask-image',m);bar.title=more?'Swipe for more tools':'';},canvasBar=null,spacingOverlay=null,spacingOpen=false,spacingSession=null;
  function canvasMeta(){return canvasMap.find(function(x){return x.sectionId===selected&&x.blockId===block;});}
  function toolButton(label,fn,disabled){var b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=!!disabled;b.setAttribute('aria-label',label);b.style.cssText='flex-shrink:0;white-space:nowrap;min-height:32px;padding:5px 8px;background:#fff;color:#111;border:1px solid #111;font:12px system-ui;cursor:pointer;';b.onclick=function(e){e.preventDefault();e.stopPropagation();fn();};return b;}
  function overlay(role,label){var n=document.createElement('div');n.setAttribute('data-studio-overlay','');n.setAttribute('role',role);n.setAttribute('aria-label',label);document.body.appendChild(n);return n;}
  function drawCanvasTools(){
    var focusedKey=document.activeElement&&document.activeElement.getAttribute('data-spacing-key');
    if(canvasBar)canvasBar.remove();canvasBar=null;
    if(spacingOverlay&&!spacingSession){spacingOverlay.remove();spacingOverlay=null;}
    var node=selectedNode(),meta=canvasMeta();if(mode!=='edit'||!selected||selected==='__studio-candidate'||block==='__studio-block-candidate'||!node||editing||spacingSession)return;
    canvasBar=overlay('toolbar',block?'Selected block actions':'Selected section actions');
    canvasBar.style.cssText='position:fixed;z-index:100000;display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100vw - 16px);padding:5px;background:#fff;color:#111;border:2px solid #059669;box-shadow:2px 2px 0 #111;';
    // Phone-width previews dock the bar at the bottom: one row that scrolls sideways, so it covers as little of the page as possible.
    if(innerWidth<600){canvasBar.style.flexWrap='nowrap';canvasBar.style.overflowX='auto';canvasBar.style.width='calc(100vw - 16px)';var bar=canvasBar;bar.addEventListener('scroll',function(){fadeBar(bar);},{passive:true});}
    var action=function(name){send({type:'CONTEXT_ACTION',sectionId:selected,blockId:block,action:name});};
    canvasBar.appendChild(toolButton('Edit',function(){if(block&&meta&&!meta.actions){var field=node.querySelector('[data-theme-field]'),target=resolveTextTarget(field);if(target&&target.editable){startTextEdit(target);return;}}send({type:'SECTION_SELECT',instanceId:selected,blockId:meta&&!meta.actions?null:block});}));
    if(meta&&meta.actions){canvasBar.appendChild(toolButton('Move up',function(){action('up');},!meta.actions.up));canvasBar.appendChild(toolButton('Move down',function(){action('down');},!meta.actions.down));
      ['Duplicate','Hide','Delete'].forEach(function(label){canvasBar.appendChild(toolButton(label,function(){action(label.toLowerCase());}));});}
    if(meta&&meta.addBlock&&!block)canvasBar.appendChild(toolButton('+ Block',function(){send({type:'ADD_BLOCK',sectionId:selected});}));
    if(!block){canvasBar.appendChild(toolButton('+ Section above',function(){send({type:'INSERT_AT',sectionId:selected,position:'before'});}));canvasBar.appendChild(toolButton('+ Section below',function(){send({type:'INSERT_AT',sectionId:selected,position:'after'});}));}
    if(!block)canvasBar.appendChild(toolButton(spacingOpen?'Close spacing':'Spacing',function(){spacingOpen=!spacingOpen;draw();}));
    var r=node.getBoundingClientRect(),bar=canvasBar.getBoundingClientRect();canvasBar.style.left=Math.max(8,Math.min(r.left,innerWidth-bar.width-8))+'px';canvasBar.style.top=(innerWidth<600?innerHeight-bar.height-8:Math.max(8,Math.min(r.top-bar.height-4,innerHeight-bar.height-8)))+'px';if(innerWidth<600)fadeBar(canvasBar);
    if(spacingOpen&&!block){drawSpacing(node,meta);if(focusedKey){var focus=spacingOverlay.querySelector('[data-spacing-key="'+focusedKey+'"]');if(focus)focus.focus({preventScroll:true});}}
  }
  function spacingTarget(node,key){if(key.indexOf('padding')===0)return node.querySelector('[data-studio-spacing]')||node;return node.querySelector('['+(key==='rowGap'?'data-studio-row-gap':'data-studio-gap')+'="'+key+'"]');}
  function spacingProperty(key,target){return key==='gridGap'?(target.getAttribute('data-studio-gap-property')||'column-gap'):key==='navGap'?'gap':key.replace(/([A-Z])/g,'-$1').toLowerCase();}
  function spacingValue(target,key){return parseFloat(getComputedStyle(target).getPropertyValue(spacingProperty(key,target)))||0;}
  function spacingCommit(key,value){send({type:'SPACING_COMMIT',sectionId:selected,key:key,device:canvasDevice,value:value});}
  function drawSpacing(node,meta){
    spacingOverlay=overlay('group','Visual spacing controls');spacingOverlay.style.cssText='position:fixed;inset:0;z-index:100002;pointer-events:none;';
    var keys=['paddingTop','paddingBottom','paddingLeft','paddingRight'].concat(meta?meta.gaps:[]);
    keys.forEach(function(key){var target=spacingTarget(node,key);if(!target)return;var value=spacingValue(target,key),r=target.getBoundingClientRect();
      var label=key.replace(/([A-Z])/g,' $1').replace(/^./,function(c){return c.toUpperCase();});var limits=meta&&meta.bounds[key]||{min:0,max:240};
      var handle=toolButton(label+' '+Math.round(value)+'px',function(){});handle.setAttribute('role','slider');handle.setAttribute('data-spacing-key',key);handle.setAttribute('aria-label',label+' · '+canvasDevice);handle.setAttribute('aria-valuemin',limits.min);handle.setAttribute('aria-valuemax',limits.max);handle.setAttribute('aria-valuenow',Math.round(value));handle.setAttribute('aria-valuetext',Math.round(value)+' pixels · '+canvasDevice);handle.title='Drag to adjust; arrow keys change 4px; Shift changes 1px; Escape cancels';
      handle.style.cssText+='position:absolute;pointer-events:auto;border:2px solid #2563eb;touch-action:none;';
      var x=r.left+r.width/2,y=r.top+r.height/2;
      if(key==='paddingTop')y=r.top+value;else if(key==='paddingBottom')y=r.bottom-value;else if(key==='paddingLeft')x=r.left+value;else if(key==='paddingRight')x=r.right-value;
      handle.style.left=Math.max(4,Math.min(x-50,innerWidth-110))+'px';handle.style.top=Math.max(48,Math.min(y-16,innerHeight-40))+'px';
      var clamp=function(v){return Math.max(limits.min,Math.min(limits.max,v));};
      handle.onkeydown=function(e){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Escape'].indexOf(e.key)<0)return;e.preventDefault();e.stopPropagation();if(e.key==='Escape'){spacingOpen=false;draw();return;}var next=e.key==='Home'?limits.min:e.key==='End'?limits.max:clamp(value+(['ArrowUp','ArrowRight'].indexOf(e.key)>=0?1:-1)*(e.shiftKey?1:4));spacingCommit(key,next);};
      handle.onpointerdown=function(e){e.preventDefault();e.stopPropagation();if(spacingSession)return;try{window.focus();handle.focus({preventScroll:true});}catch(_){}
        var sectionId=selected,device=canvasDevice,original=target.getAttribute('style'),startX=e.screenX,startY=e.screenY,next=value;
        send({type:'TEXT_EDIT_START',label:label+' · '+device});
        var property=spacingProperty(key,target);
        function move(ev){var horizontal=key==='paddingLeft'||key==='paddingRight'||key==='gridGap'||key==='navGap';var delta=horizontal?ev.screenX-startX:ev.screenY-startY;if(key==='paddingBottom'||key==='paddingRight')delta=-delta;var step=ev.shiftKey?1:4;next=clamp(Math.round((value+delta)/step)*step);target.style.setProperty(property,next+'px','important');handle.textContent=label+' '+next+'px';handle.setAttribute('aria-valuenow',next);}
        function finish(cancel){if(!spacingSession)return;spacingSession=null;document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancelPointer);document.removeEventListener('keydown',escape,true);if(original===null)target.removeAttribute('style');else target.setAttribute('style',original);if(!cancel&&next!==value)send({type:'SPACING_COMMIT',sectionId:sectionId,key:key,device:device,value:next});send({type:'TEXT_EDIT_END',cancelled:!!cancel});draw();}
        function up(){finish(false);}function cancelPointer(){finish(true);}function escape(ev){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();finish(true);}}
        spacingSession={finish:finish};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancelPointer);document.addEventListener('keydown',escape,true);
        // Keep the drag's pointer even when it is released outside the preview frame; otherwise the session
        // (and Studio's "editing in the preview" pause on preview updates) would never end.
        try{handle.setPointerCapture(e.pointerId);}catch(_){}handle.addEventListener('lostpointercapture',up,{once:true});
      };
      spacingOverlay.appendChild(handle);
    });
    var reset=toolButton('Reset '+canvasDevice+' spacing',function(){send({type:'SPACING_RESET',sectionId:selected,device:canvasDevice});});reset.style.cssText+='position:absolute;top:8px;left:12px;pointer-events:auto;';spacingOverlay.appendChild(reset);
  }
`;
