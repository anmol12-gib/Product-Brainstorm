import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';

export type ShapeType = 'rect'|'circle'|'triangle'|'square'|'arrow'|'hexagon'|'pentagon'|'star'|'diamond'|'parallelogram'|'trapezium';
export type Role = 'owner'|'editor'|'viewer';
export type ConnectionStatus = 'loading'|'connecting'|'connected'|'offline'|'error';
export interface BoardObject {
  id: string;
  type: 'sticky'|'text'|'path'|'shape'|'image';
  x:number; y:number; width:number; height:number; color:string;
  text?:string; title?:string; rotation?:number; shapeType?:ShapeType;
  showHandles?:boolean; points?:{x:number;y:number}[]; imageUrl?:string;
  version?:number;
}
interface RemoteUser {id:string;x:number;y:number;color:string;role:Role}
interface Event {seq:number;operationId:string;kind:'create'|'update'|'delete'|'clear';objectId:string|null;object:BoardObject|null}
interface Snapshot {boardId:string;title:string;seq:number;objects:BoardObject[];role:Role}
interface Ack {ok:boolean;event?:Event;error?:string;code?:string}
type HistoryEntry={kind:'create'|'update'|'delete';before:BoardObject|null;after:BoardObject|null;expectedVersion:number|null};
const SOCKET_URL=import.meta.env.VITE_SOCKET_URL || window.location.origin;
let queue:Promise<unknown>=Promise.resolve();
let requestsInFlight=0;
const stripVersion=(obj:BoardObject):BoardObject=>{const {version: _version,...clean}=obj;void _version;return clean;};
const differentFields=(source:BoardObject, target:BoardObject):Partial<BoardObject>=>{
  const patch:Record<string,unknown>={};
  for(const field of ['x','y','width','height','text','title','color','rotation','shapeType','showHandles','points','imageUrl'] as const){
    if(JSON.stringify(source[field])!==JSON.stringify(target[field])){
      // Optional deleted string values restore to a reasonable blank value.
      patch[field]=target[field]===undefined && ['text','title'].includes(field)?'':target[field];
    }
  }
  return patch as Partial<BoardObject>;
};
interface WhiteboardState {
  boardId:string;token:string;role:Role|null;status:ConnectionStatus;error:string|null;sequence:number;
  boardObjects:BoardObject[];history:HistoryEntry[];redoStack:HistoryEntry[];
  viewport:{x:number;y:number;zoom:number;currentX:number;currentY:number};
  activeTool:string;selectedColor:string;selectedShapeType:ShapeType;
  socket:Socket|null;others:RemoteUser[];pending:number;
  setCredentials:(id:string,token:string)=>void;
  setActiveTool:(tool:string)=>void;
  setSelectedColor:(color:string)=>void;
  setSelectedShapeType:(type:ShapeType)=>void;
  updateViewport:(delta:Partial<WhiteboardState['viewport']>)=>void;
  addObject:(obj:BoardObject,emit?:boolean)=>void;
  startDraft:(obj:BoardObject)=>void;
  finishDraft:(id:string)=>void;
  updateObject:(id:string,updates:Partial<BoardObject>,emit?:boolean)=>void;
  previewObject:(id:string,updates:Partial<BoardObject>)=>void;
  commitPreview:(id:string,before:BoardObject,updates:Partial<BoardObject>)=>void;
  deleteObject:(id:string)=>void;
  undo:()=>void;redo:()=>void;resetBoard:()=>void;
  initCollaboration:()=>void;terminateCollaboration:()=>void;
  broadcastCursor:(x:number,y:number)=>void;
  broadcastObjectUpdate:(id:string,updates:Partial<BoardObject>)=>void;
  refresh:()=>void;setError:(message:string|null)=>void;
}
export const useStore=create<WhiteboardState>((set,get)=>{
  function refresh(){get().socket?.emit('board:resync');}
  function applyEvent(evt:Event){
    const current=get();
    if(!Number.isSafeInteger(evt.seq) || evt.seq<=current.sequence)return;
    if(evt.seq!==current.sequence+1){refresh();return;}
    set(s=>({
      sequence:evt.seq,
      boardObjects:evt.kind==='clear'?[]:evt.kind==='delete'?s.boardObjects.filter(o=>o.id!==evt.objectId):evt.object
        ?s.boardObjects.some(o=>o.id===evt.objectId)
          ?s.boardObjects.map(o=>o.id===evt.objectId?evt.object!:o)
          :[...s.boardObjects,evt.object]
        :s.boardObjects,
      history:evt.kind==='clear'?[]:s.history,
      redoStack:evt.kind==='clear'?[]:s.redoStack,
    }));
  }
  function schedule(input:() => Record<string,unknown>, onSuccess?:(event:Event)=>void){
    requestsInFlight++;
    set(s=>({pending:s.pending+1}));
    queue=queue.catch(()=>{}).then(async()=>{
      const socket=get().socket;
      if(!socket?.connected || get().status!=='connected')throw new Error('Offline: wait for the board to reconnect');
      const payload=input();
      const ack=await new Promise<Ack>((resolve,reject)=>{
        socket.timeout(10000).emit('board:operation',payload,(error:Error|null,response:Ack)=>error?reject(error):resolve(response));
      });
      if(!ack.ok || !ack.event)throw new Error(ack.error||'Update not saved');
      applyEvent(ack.event);
      onSuccess?.(ack.event);
    }).catch((err:unknown)=>{
      set({error:err instanceof Error?err.message:'Update failed'});
      refresh();
    }).finally(()=>{
      requestsInFlight=Math.max(0,requestsInFlight-1);
      set(s=>({pending:Math.max(0,s.pending-1)}));
    });
  }
  function writable(){
    if(get().status!=='connected' || get().role==='viewer'){
      set({error:get().role==='viewer'?'This link is view-only.':'Board is offline; please reconnect.'});
      return false;
    }
    return true;
  }
  function create(obj:BoardObject,alreadyVisible=false){
    if(!writable())return;
    if(!alreadyVisible)set(s=>({boardObjects:[...s.boardObjects,{...obj,version:0}]}));
    schedule(()=>({operationId:crypto.randomUUID(),kind:'create',objectId:obj.id,object:stripVersion(get().boardObjects.find(o=>o.id===obj.id)||obj)}),
      event=>set(s=>({history:[...s.history,{kind:'create',before:null,after:event.object,expectedVersion:event.object?.version||null}],redoStack:[]})));
  }
  function update(id:string,patch:Partial<BoardObject>,beforeOverride?:BoardObject){
    if(!writable())return;
    const before=beforeOverride||get().boardObjects.find(o=>o.id===id);
    if(!before)return;
    set(s=>({boardObjects:s.boardObjects.map(o=>o.id===id?{...o,...patch}:o)}));
    schedule(()=>({operationId:crypto.randomUUID(),kind:'update',objectId:id,
      expectedVersion:before.version||1,patch}),
    event=>set(s=>({history:[...s.history,{kind:'update',before,after:event.object,expectedVersion:event.object?.version||null}],redoStack:[]})));
  }
  function remove(id:string){
    if(!writable())return;
    const before=get().boardObjects.find(o=>o.id===id);
    if(!before)return;
    set(s=>({boardObjects:s.boardObjects.filter(o=>o.id!==id)}));
    schedule(()=>({operationId:crypto.randomUUID(),kind:'delete',objectId:id,expectedVersion:before.version||1}),
      ()=>set(s=>({history:[...s.history,{kind:'delete',before,after:null,expectedVersion:null}],redoStack:[]})));
  }
  function invert(entry:HistoryEntry,undo:boolean){
    const desired=undo?entry.before:entry.after;
    const current=get().boardObjects.find(o=>o.id===(entry.after||entry.before)?.id);
    const required=entry.expectedVersion;
    if(required!==null && current?.version!==required){
      set({error:'Another edit changed this object. Cannot safely undo/redo it.'});return;
    }
    if(!writable())return;
    const id=(entry.before||entry.after)!.id;
    let kind:'create'|'update'|'delete';
    let patch:Partial<BoardObject>|undefined;
    if(!desired)kind='delete';
    else if(!current)kind='create';
    else {kind='update';patch=differentFields(current,desired);if(!Object.keys(patch).length){set({error:'Nothing to reverse'});return;}}
    const old=current;
    if(kind==='delete')set(s=>({boardObjects:s.boardObjects.filter(o=>o.id!==id)}));
    else if(kind==='create')set(s=>({boardObjects:[...s.boardObjects,{...desired!,version:0}]}));
    else set(s=>({boardObjects:s.boardObjects.map(o=>o.id===id?{...o,...patch}:o)}));
    const opId=crypto.randomUUID();
    schedule(()=>({operationId:opId,kind,objectId:id,
      ...(kind==='create'?{object:stripVersion(desired!)}:{}),
      ...(kind==='update'?{expectedVersion:old?.version||1,patch}:{}),
      ...(kind==='delete'?{expectedVersion:old?.version||1}:{})}),
      event=>{
        const replacement={...entry,expectedVersion:event.object?.version||null};
        if(undo)set(s=>({history:s.history.filter(e=>e!==entry),redoStack:[...s.redoStack,replacement]}));
        else set(s=>({redoStack:s.redoStack.filter(e=>e!==entry),history:[...s.history,replacement]}));
      });
  }
  return {
    boardId:'',token:'',role:null,status:'loading',error:null,sequence:0,
    boardObjects:[],history:[],redoStack:[],viewport:{x:0,y:0,zoom:1,currentX:0,currentY:0},
    activeTool:'select',selectedColor:'#3b82f6',selectedShapeType:'rect',socket:null,others:[],pending:0,
    setCredentials:(boardId,token)=>set({boardId,token,role:null,status:'connecting',error:null,boardObjects:[],history:[],redoStack:[],sequence:0}),
    setActiveTool:activeTool=>set({activeTool}),setSelectedColor:selectedColor=>set({selectedColor}),setSelectedShapeType:selectedShapeType=>set({selectedShapeType}),
    updateViewport:delta=>set(s=>({viewport:{...s.viewport,...delta}})),
    setError:error=>set({error}),refresh,
    addObject:(obj,emit=true)=>emit?create(obj):set(s=>({boardObjects:[...s.boardObjects,obj]})),
    startDraft:obj=>{if(writable())set(s=>({boardObjects:[...s.boardObjects,{...obj,version:0}]}));},
    finishDraft:id=>{const obj=get().boardObjects.find(o=>o.id===id);if(obj)create(obj,true);},
    updateObject:(id,patch,emit=true)=>emit?update(id,patch):set(s=>({boardObjects:s.boardObjects.map(o=>o.id===id?{...o,...patch}:o)})),
    previewObject:(id,patch)=>set(s=>({boardObjects:s.boardObjects.map(o=>o.id===id?{...o,...patch}:o)})),
    commitPreview:(id,before,patch)=>update(id,patch,before),
    deleteObject:remove,
    undo:()=>{if(requestsInFlight>0)return;const a=get().history.at(-1);if(a)invert(a,true);},
    redo:()=>{if(requestsInFlight>0)return;const a=get().redoStack.at(-1);if(a)invert(a,false);},
    resetBoard:()=>{
      if(get().role!=='owner'){set({error:'Only the board owner can clear the entire board'});return;}
      if(!writable())return;
      schedule(()=>({operationId:crypto.randomUUID(),kind:'clear'}),()=>set({history:[],redoStack:[]}));
    },
    initCollaboration:()=>{
      const state=get();
      if(!state.boardId||!state.token||state.socket)return;
      const socket=io(SOCKET_URL,{autoConnect:false,transports:['websocket'],reconnection:true,
        auth:{boardId:state.boardId,token:state.token}});
      let hydrated=false;
      let buffered:Event[]=[];
      socket.on('connect',()=>{hydrated=false;buffered=[];set({status:'connecting',error:null});});
      socket.on('connect_error',(error:Error)=>set({status:'error',error:error.message}));
      socket.on('disconnect',()=>{hydrated=false;set({status:'offline',others:[],error:'Connection lost. Unsaved changes may need retrying.'});});
      socket.on('board:snapshot',(snapshot:Snapshot)=>{
        set({boardObjects:snapshot.objects,sequence:snapshot.seq,role:snapshot.role,status:'connected',error:null,history:[],redoStack:[]});
        hydrated=true;
        const ordered=buffered.sort((a,b)=>a.seq-b.seq);
        buffered=[];
        for(const event of ordered)applyEvent(event);
      });
      socket.on('board:applied',(event:Event)=>hydrated?applyEvent(event):buffered.push(event));
      socket.on('presence:update',(users:RemoteUser[])=>set({others:users.filter(u=>u.id!==socket.id)}));
      socket.on('cursor:update',(cursor:RemoteUser)=>set(s=>({others:s.others.map(u=>u.id===cursor.id?{...u,x:cursor.x,y:cursor.y}:u)})));
      set({socket});socket.connect();
    },
    terminateCollaboration:()=>{get().socket?.removeAllListeners();get().socket?.disconnect();set({socket:null,others:[]});},
    broadcastCursor:(x,y)=>{const s=get();if(s.status==='connected')s.socket?.emit('cursor:move',{x,y});},
    broadcastObjectUpdate:(id,patch)=>update(id,patch),
  };
});
