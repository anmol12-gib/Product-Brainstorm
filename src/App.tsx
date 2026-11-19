import { useEffect, useState } from 'react';
import Viewport from './canvas/Viewport';
import ToolsPanel from './components/ToolsPanel';
import TopToolbar from './components/TopToolbar';
import BottomStatusBar from './components/BottomStatusBar';
import { useStore } from './store/useStore';

function getBoardAccess():{id:string;token:string}|null{
  const id=/^\/b\/([0-9a-f-]{36})\/?$/i.exec(window.location.pathname)?.[1];
  const token=new URLSearchParams(window.location.hash.slice(1)).get('token');
  return id&&token?{id,token}:null;
}
let initialCreation:Promise<{boardId:string;token:string}>|null=null;
async function createInitialBoard(){
  if(!initialCreation) initialCreation=fetch('/api/boards',{method:'POST'}).then(async response=>{
    if(!response.ok)throw new Error('Cannot create a board. Is the backend and database running?');
    return response.json() as Promise<{boardId:string;token:string}>;
  }).catch(error=>{initialCreation=null;throw error;});
  return initialCreation;
}
export default function App(){
  const [bootError,setBootError]=useState<string|null>(null);
  const status=useStore(s=>s.status);
  const error=useStore(s=>s.error);
  const setCredentials=useStore(s=>s.setCredentials);
  const init=useStore(s=>s.initCollaboration);
  const terminate=useStore(s=>s.terminateCollaboration);
  useEffect(()=>{
    let cancelled=false;
    async function start(){
      try{
        let access=getBoardAccess();
        if(!access){
          if(window.location.pathname!=='/')throw new Error('This board link is incomplete. Ask the owner for a full invitation link.');
          const data=await createInitialBoard();
          access={id:data.boardId,token:data.token};
          if(cancelled)return;
          window.history.replaceState(null,'',`/b/${access.id}#token=${encodeURIComponent(access.token)}`);
        }
        if(cancelled)return;
        setCredentials(access.id,access.token);
        init();
      }catch(e){if(!cancelled)setBootError(e instanceof Error?e.message:'Cannot open board');}
    }
    void start();
    return()=>{cancelled=true;terminate();};
  },[setCredentials,init,terminate]);
  if(bootError)return <div className="min-h-screen bg-stone-100 grid place-content-center p-6 text-center gap-4"><h1 className="font-bold text-2xl">Cannot open board</h1><p>{bootError}</p><a className="text-blue-600 underline" href="/">Create a new board</a></div>;
  return <div className="relative w-screen h-screen overflow-hidden bg-[#E7E2D8]">
    <div className="absolute inset-0 z-[1]"><Viewport/></div>
    <div className="absolute inset-0 pointer-events-none z-[9999]">
      <div className="pointer-events-auto contents"><TopToolbar/><ToolsPanel/><BottomStatusBar/></div>
    </div>
    {status!=='connected'&&<div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10000] bg-white/95 border border-stone-200 shadow-xl px-5 py-3 rounded-xl text-sm">{status==='loading'||status==='connecting'?'Connecting to board…':error||'Reconnecting…'}</div>}
  </div>;
}
