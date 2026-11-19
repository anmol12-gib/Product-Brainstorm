import { useRef, useState } from 'react';
import type React from 'react';
import { useStore, type BoardObject, type ShapeType } from '../store/useStore';
import { useCoordinates } from '../hooks/useCoordinates';

type Drag = {id:string;before:BoardObject;kind:'move'|'rotate'|'resize';handle?:string;offsetX?:number;offsetY?:number};
function clip(type?:ShapeType){
  const paths:Partial<Record<ShapeType,string>>={
    triangle:'polygon(50% 0%,0% 100%,100% 100%)',hexagon:'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)',
    pentagon:'polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)',arrow:'polygon(0% 20%,60% 20%,60% 0%,100% 50%,60% 100%,60% 80%,0% 80%)',
    star:'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
    diamond:'polygon(50% 0%,100% 50%,50% 100%,0% 50%)',parallelogram:'polygon(25% 0%,100% 0%,75% 100%,0% 100%)',
    trapezium:'polygon(20% 0%,80% 0%,100% 100%,0% 100%)',circle:'circle(50% at 50% 50%)'
  };
  return paths[type||'rect']||'none';
}
const handles=['nw','n','ne','e','se','s','sw','w'];
const handlePosition:Record<string,string>={
  nw:'-top-1.5 -left-1.5 cursor-nw-resize',n:'-top-1.5 left-1/2 -translate-x-1/2 cursor-n-resize',ne:'-top-1.5 -right-1.5 cursor-ne-resize',
  e:'top-1/2 -right-1.5 -translate-y-1/2 cursor-e-resize',se:'-bottom-1.5 -right-1.5 cursor-se-resize',s:'-bottom-1.5 left-1/2 -translate-x-1/2 cursor-s-resize',
  sw:'-bottom-1.5 -left-1.5 cursor-sw-resize',w:'top-1/2 -left-1.5 -translate-y-1/2 cursor-w-resize'
};
export default function RenderLayer(){
  const boardObjects=useStore(s=>s.boardObjects);
  const activeTool=useStore(s=>s.activeTool);
  const role=useStore(s=>s.role);
  const preview=useStore(s=>s.previewObject);
  const commit=useStore(s=>s.commitPreview);
  const remove=useStore(s=>s.deleteObject);
  const {screenToWorld}=useCoordinates();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const drag=useRef<Drag|null>(null);
  const editBefore=useRef<BoardObject|null>(null);
  const canEdit=activeTool==='select'&&role!=='viewer';
  const pointerMove=(e:React.PointerEvent)=>{
    const d=drag.current;
    if(!d)return;
    const p=screenToWorld(e.clientX,e.clientY);
    const o=d.before;
    if(d.kind==='move')preview(d.id,{x:p.x-(d.offsetX||0),y:p.y-(d.offsetY||0)});
    if(d.kind==='rotate'){
      const angle=Math.atan2(p.y-(o.y+o.height/2),p.x-(o.x+o.width/2))*180/Math.PI+90;
      preview(d.id,{rotation:Math.round(angle)});
    }
    if(d.kind==='resize'){
      const h=d.handle||'';
      let x=o.x,y=o.y,width=o.width,height=o.height;
      if(h.includes('e'))width=Math.max(20,p.x-o.x);
      if(h.includes('s'))height=Math.max(20,p.y-o.y);
      if(h.includes('w')){x=Math.min(p.x,o.x+o.width-20);width=o.width+o.x-x;}
      if(h.includes('n')){y=Math.min(p.y,o.y+o.height-20);height=o.height+o.y-y;}
      preview(d.id,{x,y,width,height});
    }
  };
  const stop=()=>{
    if(!drag.current)return;
    const {id,before}=drag.current;
    drag.current=null;
    const latest=useStore.getState().boardObjects.find(o=>o.id===id);
    if(!latest)return;
    const patch:Partial<BoardObject>={};
    for(const field of ['x','y','width','height','rotation'] as const) if(latest[field]!==before[field]){
      if(field==='rotation')patch.rotation=latest.rotation||0;
      else patch[field]=latest[field];
    }
    if(Object.keys(patch).length)commit(id,before,patch);
  };
  const onEditBlur=(obj:BoardObject,key:'title'|'text',value:string)=>{
    const before=editBefore.current||obj;
    editBefore.current=null;
    if(before[key]!==value)commit(obj.id,before,{[key]:value});
  };
  return <div className="relative w-full h-full pointer-events-none z-[100]" onPointerMove={pointerMove} onPointerUp={stop} onPointerCancel={stop}>
    <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-[5]">
      {boardObjects.filter(o=>o.type==='path').map(o=><polyline key={o.id} points={o.points?.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={o.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>)}
    </svg>
    {boardObjects.filter(o=>o.type!=='path').map(obj=><div key={obj.id} className="group"
      onPointerDown={e=>{
        if(!canEdit||e.button!==0)return;
        const target=e.target as HTMLElement;
        if(['TEXTAREA','INPUT','BUTTON'].includes(target.tagName))return;
        const handle=target.getAttribute('data-handle');
        const p=screenToWorld(e.clientX,e.clientY);
        e.stopPropagation();setSelectedId(obj.id);
        drag.current={id:obj.id,before:{...obj},kind:handle==='rotate'?'rotate':handle?'resize':'move',handle:handle||undefined,offsetX:p.x-obj.x,offsetY:p.y-obj.y};
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      style={{position:'absolute',left:obj.x,top:obj.y,width:obj.width,height:obj.height,transform:`rotate(${obj.rotation||0}deg)`,zIndex:selectedId===obj.id?150:20,pointerEvents:canEdit?'auto':'none'}}>
      <div className="w-full h-full relative pointer-events-none">
        {obj.type==='shape'?<div className="w-full h-full" style={{backgroundColor:obj.color,clipPath:clip(obj.shapeType)}}/>:
         obj.type==='sticky'?<div className="w-full h-full flex flex-col rounded-xl border border-stone-200/50 overflow-hidden" style={{backgroundColor:obj.color}}>
           <input aria-label="Sticky title" className="bg-black/5 px-3 py-3 border-b border-black/5 text-[10px] font-bold uppercase tracking-widest outline-none pointer-events-auto" placeholder="ADD TITLE" value={obj.title||''}
             onFocus={()=>{editBefore.current={...obj};}} onPointerDown={e=>e.stopPropagation()} onChange={e=>preview(obj.id,{title:e.target.value})} onBlur={e=>onEditBlur(obj,'title',e.target.value)}/>
           <textarea aria-label="Sticky contents" className="w-full h-full p-4 bg-transparent outline-none resize-none pointer-events-auto font-medium" placeholder="Write a note..." value={obj.text||''}
             onFocus={()=>{editBefore.current={...obj};}} onPointerDown={e=>e.stopPropagation()} onChange={e=>preview(obj.id,{text:e.target.value})} onBlur={e=>onEditBlur(obj,'text',e.target.value)}/>
         </div>:
         obj.type==='text'?<textarea aria-label="Text contents" className="w-full h-full bg-transparent outline-none resize-none pointer-events-auto font-bold text-xl p-2" style={{color:obj.color}} placeholder="Type text..." value={obj.text||''}
           onFocus={()=>{editBefore.current={...obj};}} onPointerDown={e=>e.stopPropagation()} onChange={e=>preview(obj.id,{text:e.target.value})} onBlur={e=>onEditBlur(obj,'text',e.target.value)}/>:
         obj.type==='image'?<img alt="Uploaded board element" src={obj.imageUrl} className="w-full h-full object-cover rounded-lg shadow-lg"/>:null}
      </div>
      {canEdit&&<button aria-label="Select object" className="absolute -top-7 right-0 bg-slate-700/90 text-white rounded px-2 py-0.5 text-[10px] opacity-0 group-hover:opacity-100 pointer-events-auto" onPointerDown={e=>e.stopPropagation()} onClick={()=>setSelectedId(selectedId===obj.id?null:obj.id)}>⋮</button>}
      {selectedId===obj.id&&canEdit&&<>
        <button className="absolute -top-7 left-0 bg-red-600 text-white rounded px-2 py-0.5 text-[10px] pointer-events-auto" onPointerDown={e=>e.stopPropagation()} onClick={()=>{remove(obj.id);setSelectedId(null);}}>Delete</button>
        <div className="absolute -inset-1 border-2 border-amber-400 pointer-events-none z-[200]">
          {handles.map(h=><div key={h} data-handle={h} className={`absolute w-3 h-3 rounded-sm bg-white border-2 border-amber-500 pointer-events-auto ${handlePosition[h]}`}/>)}
          <div data-handle="rotate" className="absolute -top-10 left-1/2 -translate-x-1/2 w-4 h-4 bg-amber-500 rounded-full border-2 border-white cursor-alias pointer-events-auto shadow-lg"/>
        </div>
      </>}
    </div>)}
  </div>;
}
