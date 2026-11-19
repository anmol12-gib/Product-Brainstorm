import { useStore } from '../store/useStore';
export default function CollaborationLayer(){
  const others=useStore(s=>s.others);
  const offsetX=useStore(s=>s.viewport.x);
  const offsetY=useStore(s=>s.viewport.y);
  const zoom=useStore(s=>s.viewport.zoom);
  return <div className="absolute inset-0 pointer-events-none z-[900] overflow-hidden">
    {others.map(user=><div key={user.id} className="absolute transition-transform duration-75" style={{transform:`translate(${user.x*zoom+offsetX}px, ${user.y*zoom+offsetY}px)`}}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill={user.color} stroke="white" strokeWidth="1.5"/></svg>
      <div className="ml-3 px-2 py-0.5 rounded shadow-lg text-[10px] font-bold text-white whitespace-nowrap" style={{backgroundColor:user.color}}>User_{user.id.slice(0,4)}</div>
    </div>)}
  </div>;
}
