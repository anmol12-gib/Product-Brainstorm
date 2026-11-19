import type React from 'react';
import { useRef } from 'react';
import { useStore } from '../store/useStore';
import { useCoordinates } from '../hooks/useCoordinates';
import RenderLayer from './RenderLayer';
import InteractionLayer from './InteractionLayer';
import CollaborationLayer from './CollaborationLayer';
export default function Viewport(){
  const offsetX=useStore(s=>s.viewport.x);
  const offsetY=useStore(s=>s.viewport.y);
  const zoom=useStore(s=>s.viewport.zoom);
  const update=useStore(s=>s.updateViewport);
  const activeTool=useStore(s=>s.activeTool);
  const broadcastCursor=useStore(s=>s.broadcastCursor);
  const {screenToWorld}=useCoordinates();
  const lastCursor=useRef(0);
  const onMove=(e:React.PointerEvent)=>{
    const now=performance.now();
    if(now-lastCursor.current>=50){const world=screenToWorld(e.clientX,e.clientY);broadcastCursor(world.x,world.y);lastCursor.current=now;}
    update({currentX:Math.round(e.clientX),currentY:Math.round(e.clientY)});
    if(activeTool==='pan'&&e.buttons===1)update({x:offsetX+e.movementX,y:offsetY+e.movementY});
  };
  return <div id="board-root" className={`w-full h-full overflow-hidden relative touch-none ${activeTool==='pan'?'cursor-grab active:cursor-grabbing':''}`}
    onPointerMove={onMove} style={{backgroundColor:'#E7E2D8',backgroundImage:'radial-gradient(#00000015 1px, transparent 1px)',backgroundSize:'30px 30px'}}>
    <div id="board-content" className="absolute inset-0 pointer-events-none" style={{transform:`translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,transformOrigin:'0 0'}}>
      <div className="pointer-events-auto w-full h-full"><InteractionLayer/><RenderLayer/></div>
    </div>
    <CollaborationLayer/>
  </div>;
}
