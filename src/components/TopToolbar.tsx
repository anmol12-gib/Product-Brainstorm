import { useState } from 'react';
import { useStore } from '../store/useStore';
export default function TopToolbar(){
  const undo=useStore(s=>s.undo);
  const redo=useStore(s=>s.redo);
  const canUndo=useStore(s=>s.history.length>0);
  const canRedo=useStore(s=>s.redoStack.length>0);
  const resetBoard=useStore(s=>s.resetBoard);
  const updateViewport=useStore(s=>s.updateViewport);
  const onlineCount=useStore(s=>s.others.length+1);
  const boardId=useStore(s=>s.boardId);
  const token=useStore(s=>s.token);
  const role=useStore(s=>s.role);
  const status=useStore(s=>s.status);
  const pending=useStore(s=>s.pending);
  const error=useStore(s=>s.error);
  const setError=useStore(s=>s.setError);
  const [shareOpen,setShareOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const makeLink=(key:string)=>`${window.location.origin}/b/${boardId}#token=${encodeURIComponent(key)}`;
  async function copy(text:string){
    try{await navigator.clipboard.writeText(text);setError('Link copied to clipboard.');}
    catch{window.prompt('Copy this link:',text);}
  }
  async function invite(target:'editor'|'viewer'){
    if(!window.confirm(`Create a fresh ${target} invitation? Existing ${target} links will stop working.`))return;
    setBusy(true);
    try{
      const response=await fetch(`/api/boards/${boardId}/invites/${target}`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Unable to create invitation');
      await copy(makeLink(result.token));
    }catch(e){setError(e instanceof Error?e.message:'Invitation failed');}
    finally{setBusy(false);}
  }
  async function exportImage(){
    try{
      const {toPng}=await import('html-to-image');
      const root=document.getElementById('board-root');
      if(!root)return;
      const img=await toPng(root,{cacheBust:true,backgroundColor:'#E7E2D8',pixelRatio:1});
      const anchor=document.createElement('a');anchor.download='product-brainstorm.png';anchor.href=img;anchor.click();
    }catch{setError('Image export failed. Try a smaller board.');}
  }
  return <header className="fixed top-4 left-4 right-4 z-[100] flex items-center justify-between pointer-events-none gap-2 max-md:top-2 max-md:left-2 max-md:right-2">
    <div className="bg-white/95 px-4 py-2 rounded-2xl shadow-sm border border-slate-200 flex gap-3 items-center pointer-events-auto max-md:px-2 max-md:gap-1">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">P</div>
      <div><h1 className="text-sm font-bold text-slate-800 leading-none">Product Brainstorm</h1><p className="text-[10px] text-slate-500 max-md:hidden">Board {boardId.slice(0,8)} · {role||'Loading'} · {status}</p></div>
    </div>
    <div className="bg-white/95 p-1 rounded-2xl shadow-sm border border-slate-200 flex gap-1 pointer-events-auto max-md:gap-0">
      <button aria-label="Undo" onClick={undo} disabled={!canUndo||pending>0||role==='viewer'} className="px-3 py-1.5 text-xs font-bold hover:bg-slate-100 rounded-xl disabled:opacity-30">UNDO</button>
      <button aria-label="Redo" onClick={redo} disabled={!canRedo||pending>0||role==='viewer'} className="px-3 py-1.5 text-xs font-bold hover:bg-slate-100 rounded-xl disabled:opacity-30">REDO</button>
      {role==='owner'&&<button onClick={()=>{if(window.confirm('Clear this entire shared board? This cannot be undone.')){resetBoard();updateViewport({x:0,y:0,zoom:1});}}} className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl">CLEAR</button>}
    </div>
    <div className="bg-white/95 px-3 py-2 rounded-2xl shadow-sm border border-slate-200 flex gap-3 items-center pointer-events-auto relative max-md:px-1 max-md:gap-1">
      <span className="text-xs text-slate-600 max-md:hidden" title="Other users on this board">{onlineCount} online</span>
      <button onClick={()=>window.location.assign('/')} className="text-xs font-bold text-slate-600 hover:text-blue-600">NEW</button>
      <button disabled={!boardId} onClick={()=>setShareOpen(s=>!s)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold">SHARE</button>
      {shareOpen&&<div className="absolute top-14 right-0 bg-white border rounded-xl shadow-xl w-60 p-2 z-[200] flex flex-col gap-1 text-sm">
        <button onClick={()=>{void exportImage();setShareOpen(false);}} className="text-left px-3 py-2 hover:bg-slate-100 rounded-lg">Download PNG</button>
        {role==='owner'?<>
          <button disabled={busy} onClick={()=>void invite('editor')} className="text-left px-3 py-2 hover:bg-slate-100 rounded-lg">Copy new editing invitation</button>
          <button disabled={busy} onClick={()=>void invite('viewer')} className="text-left px-3 py-2 hover:bg-slate-100 rounded-lg">Copy new view-only invitation</button>
          <p className="px-3 text-xs text-amber-700">Keep this owner's browser link private. New invitations revoke previous links of that role.</p>
        </>:<button onClick={()=>void copy(makeLink(token))} className="text-left px-3 py-2 hover:bg-slate-100 rounded-lg">Copy my {role==='editor'?'editing':'view-only'} link</button>}
      </div>}
    </div>
    {error&&<div role="status" className="fixed top-20 right-4 max-w-sm bg-slate-900 text-white text-xs p-3 shadow-lg rounded-xl pointer-events-auto flex gap-3 items-start"><span>{error}</span><button aria-label="Dismiss message" onClick={()=>setError(null)}>✕</button></div>}
  </header>;
}
