import { useRef } from 'react';
import type React from 'react';
import { useStore, type BoardObject } from '../store/useStore';
import { useCoordinates } from '../hooks/useCoordinates';
export default function InteractionLayer(){
  const activeTool=useStore(s=>s.activeTool);
  const selectedColor=useStore(s=>s.selectedColor);
  const selectedShapeType=useStore(s=>s.selectedShapeType);
  const role=useStore(s=>s.role);
  const {screenToWorld}=useCoordinates();
  const drawing=useRef<string|null>(null);
  const isCreationTool=['draw','shape','sticky','text'].includes(activeTool)&&role!=='viewer';
  const down=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!isCreationTool||e.button!==0)return;
    const world=screenToWorld(e.clientX,e.clientY);
    const id=crypto.randomUUID();
    const base={id,color:selectedColor,showHandles:false};
    let obj:BoardObject;
    if(activeTool==='draw'){
      obj={...base,type:'path',x:0,y:0,width:0,height:0,points:[world]};
      drawing.current=id;
      e.currentTarget.setPointerCapture(e.pointerId);
      useStore.getState().startDraft(obj);
      return;
    }
    if(activeTool==='sticky')obj={...base,type:'sticky',x:world.x-100,y:world.y-100,width:200,height:200,text:'',title:''};
    else if(activeTool==='text')obj={...base,type:'text',x:world.x-75,y:world.y-25,width:150,height:50,text:''};
    else obj={...base,type:'shape',shapeType:selectedShapeType,x:world.x-50,y:world.y-50,width:100,height:100};
    useStore.getState().addObject(obj);
  };
  const move=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!drawing.current || activeTool!=='draw')return;
    const world=screenToWorld(e.clientX,e.clientY);
    const path=useStore.getState().boardObjects.find(o=>o.id===drawing.current);
    if(!path?.points||path.points.length>=5000)return;
    const prev=path.points.at(-1);
    if(prev&&Math.hypot(world.x-prev.x,world.y-prev.y)<2)return;
    useStore.getState().previewObject(path.id,{points:[...path.points,world]});
  };
  const stop=()=>{if(drawing.current){useStore.getState().finishDraft(drawing.current);drawing.current=null;}};
  return <div className={`absolute inset-0 z-[500] touch-none ${isCreationTool?'pointer-events-auto cursor-crosshair':'pointer-events-none'}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/>;
}
