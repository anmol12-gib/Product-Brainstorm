import { useStore } from '../store/useStore';
export const useCoordinates=()=>{
  // Subscribe only to transform fields. Pointer-status changes should not
  // force the entire drawing layer to rerender every time the mouse moves.
  const x=useStore(s=>s.viewport.x);
  const y=useStore(s=>s.viewport.y);
  const zoom=useStore(s=>s.viewport.zoom);
  const screenToWorld=(clientX:number,clientY:number)=>{
    const rect=document.getElementById('board-root')?.getBoundingClientRect();
    return {x:(clientX-(rect?.left||0)-x)/zoom,y:(clientY-(rect?.top||0)-y)/zoom};
  };
  return {screenToWorld};
};
