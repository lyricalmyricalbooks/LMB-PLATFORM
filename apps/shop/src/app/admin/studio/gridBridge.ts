// Free placement on a grid (Studio 3.0 phase 3), inside the preview. Runs in previewBridge's closure (uses its `send`,
// `mode`, `overlay`). While Studio asks for it (GRID_ARRANGE), a Flexible composition's grid gets a column overlay and
// every block a move area plus a resize corner. A drop, resize or arrow-key nudge is reported as GRID_PLACE with the
// pixel rectangle and the grid's measurements; Studio turns that into cells (gridPlacement.ts) as one undoable change.
// Nothing here edits the page itself: the preview redraws from Studio's next snapshot.
export const GRID_ARRANGE_SOURCE = String.raw`
  var gridArrange=null,gridLayer=null,gridDrag=null;
  function gridMeasure(grid){var cs=getComputedStyle(grid);var cols=String(cs.gridTemplateColumns||'').split(' ').filter(Boolean).length||12;var rows=String(cs.gridTemplateRows||'').split(' ').map(parseFloat).filter(function(n){return !isNaN(n);});var r=grid.getBoundingClientRect();return {width:r.width,columns:cols,gap:parseFloat(cs.columnGap)||0,rowGap:parseFloat(cs.rowGap)||0,rows:rows,rect:r};}
  function gridNode(){if(!gridArrange)return null;var sec=document.querySelector('[data-fm-section="'+CSS.escape(gridArrange.sectionId)+'"]');return sec&&sec.querySelector('.fm-composition-grid');}
  function gridRel(el,m){var r=el.getBoundingClientRect();return {x:r.left-m.rect.left,y:r.top-m.rect.top,w:r.width,h:r.height};}
  function gridPlace(blockId,rect,m,by){send({type:'GRID_PLACE',sectionId:gridArrange.sectionId,blockId:blockId,device:gridArrange.device,rect:rect,grid:{width:m.width,columns:m.columns,gap:m.gap,rowGap:m.rowGap,rows:m.rows},by:by||null});}
  function clearGrid(){if(gridLayer){gridLayer.remove();gridLayer=null;}}
  function drawGrid(){
    if(gridDrag)return;
    var focusId=document.activeElement&&document.activeElement.getAttribute('data-grid-block');
    clearGrid();var grid=gridNode();if(!grid||mode!=='edit'||editing)return;
    var m=gridMeasure(grid);
    gridLayer=overlay('group','Arrange blocks on the grid');gridLayer.setAttribute('data-studio-grid','');
    gridLayer.style.cssText='position:absolute;left:'+(m.rect.left+scrollX)+'px;top:'+(m.rect.top+scrollY)+'px;width:'+m.width+'px;height:'+Math.max(m.rect.height,40)+'px;z-index:2147482000;pointer-events:none;';
    var colW=(m.width-m.gap*(m.columns-1))/m.columns;
    for(var i=0;i<m.columns;i++){var c=document.createElement('div');c.style.cssText='position:absolute;top:0;bottom:0;left:'+(i*(colW+m.gap))+'px;width:'+colW+'px;background:rgba(37,99,235,.07);outline:1px dashed rgba(37,99,235,.45);';gridLayer.appendChild(c);}
    Array.from(grid.children).forEach(function(el){
      var id=el.getAttribute('data-fm-block');if(!id)return;
      var rect=gridRel(el,m);
      var label=(el.textContent||'').trim().slice(0,32)||'Block';
      var box=document.createElement('div');box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('data-grid-block',id);
      box.setAttribute('aria-label','Move '+label+' on the grid. Arrow keys move it, Shift with arrow keys resizes it.');
      box.style.cssText='position:absolute;left:'+rect.x+'px;top:'+rect.y+'px;width:'+rect.w+'px;height:'+rect.h+'px;pointer-events:auto;cursor:move;outline:2px solid #2563eb;background:rgba(37,99,235,.06);touch-action:none;';
      var corner=document.createElement('span');corner.setAttribute('data-grid-resize','');corner.setAttribute('aria-hidden','true');
      corner.style.cssText='position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;background:#2563eb;border:2px solid #fff;cursor:nwse-resize;';
      box.appendChild(corner);
      function start(e,kind){
        if(e.button!==0)return;e.preventDefault();e.stopPropagation();
        var sx=e.clientX,sy=e.clientY,base=gridRel(el,m),next=base;box.setPointerCapture(e.pointerId);
        gridDrag={cancel:function(){done(true);}};send({type:'TEXT_EDIT_START',label:kind==='move'?'Moving a block':'Resizing a block'});
        function move(ev){var dx=ev.clientX-sx,dy=ev.clientY-sy;next=kind==='move'?{x:base.x+dx,y:base.y+dy,w:base.w,h:base.h}:{x:base.x,y:base.y,w:Math.max(24,base.w+dx),h:Math.max(24,base.h+dy)};box.style.left=next.x+'px';box.style.top=next.y+'px';box.style.width=next.w+'px';box.style.height=next.h+'px';}
        function up(){done(false);}
        function key(ev){if(ev.key==='Escape'){ev.preventDefault();done(true);}}
        function done(cancel){if(!gridDrag)return;gridDrag=null;box.removeEventListener('pointermove',move);box.removeEventListener('pointerup',up);box.removeEventListener('pointercancel',up);document.removeEventListener('keydown',key,true);
          send({type:'TEXT_EDIT_END',cancelled:!!cancel});
          if(!cancel&&(next.x!==base.x||next.y!==base.y||next.w!==base.w||next.h!==base.h))gridPlace(id,next,m);else drawGrid();}
        box.addEventListener('pointermove',move);box.addEventListener('pointerup',up);box.addEventListener('pointercancel',up);document.addEventListener('keydown',key,true);
      }
      box.addEventListener('pointerdown',function(e){start(e,e.target===corner?'resize':'move');});
      box.addEventListener('keydown',function(e){var k=e.key,d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];if(!d)return;e.preventDefault();e.stopPropagation();
        gridPlace(id,gridRel(el,m),m,e.shiftKey?{dw:d[0],dh:d[1]}:{dx:d[0],dy:d[1]});});
      gridLayer.appendChild(box);
      if(focusId===id)setTimeout(function(){var again=document.querySelector('[data-grid-block="'+CSS.escape(id)+'"]');if(again)again.focus();},0);
    });
  }
  var gridTimer=0;function gridSoon(){clearTimeout(gridTimer);gridTimer=setTimeout(drawGrid,80);}
  window.addEventListener('message',function(e){if(e.origin!==O||e.source!==parent||!e.data)return;var d=e.data;
    if(d.type==='GRID_ARRANGE'){gridArrange=d.sectionId?{sectionId:String(d.sectionId),device:d.device||'desktop'}:null;if(!gridArrange){if(gridDrag)gridDrag.cancel();clearGrid();}else gridSoon();}
    if(gridArrange&&(d.type==='STUDIO_PREVIEW_STATE'||d.type==='THEME_UPDATE'||d.type==='STUDIO_MODE'))gridSoon();
  });
  window.addEventListener('resize',function(){if(gridArrange)gridSoon();});
`;
