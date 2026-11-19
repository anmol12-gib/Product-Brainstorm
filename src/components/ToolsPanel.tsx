import React, { useRef, useState } from 'react';
import { 
  MousePointer2, Hand, Pencil, Square, 
  Type, StickyNote, Image as ImageIcon, 
  Circle, Triangle, Palette, ArrowUpRight, 
  Hexagon, Pentagon, Star,Diamond, Layout 
} from 'lucide-react';
import { useStore, type ShapeType } from '../store/useStore.ts';

export default function ToolsPanel() {
  const activeTool = useStore(s => s.activeTool);
  const setActiveTool = useStore(s => s.setActiveTool);
  const addObject = useStore(s => s.addObject);
  const setSelectedShapeType = useStore(s => s.setSelectedShapeType);
  const selectedColor = useStore(s => s.selectedColor);
  const setSelectedColor = useStore(s => s.setSelectedColor);
  
  const [showShapes, setShowShapes] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colors = [
    '#ec9494', '#ef4444', '#f75151', '#df0e0e', 
    '#a2bfed', '#3f86f1', '#224aeb', '#190692',
    '#d9ec96', '#e6d732', '#edca08', '#f1da06',
    '#7eef8f', '#30eb40', '#10d813', '#067c10',
    '#eea4e3', '#f353c0', '#f711ae', '#901d6f'
  ];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5_000_000) {
      alert('Choose a PNG, JPEG or WebP under 5 MB.'); return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const maxSize = 800;
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);
      bitmap.close();
      let url = '';
      for (const quality of [0.8,0.6,0.4,0.25]) {
        url = canvas.toDataURL('image/jpeg',quality);
        if (url.length < 245_000) break;
      }
      if (url.length >= 245_000) throw new Error('Image remains too large; use a smaller picture.');
      addObject({id:crypto.randomUUID(),type:'image',x:200,y:200,width:Math.max(20,canvas.width/2),height:Math.max(20,canvas.height/2),imageUrl:url,color:'transparent'});
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not process image'); }
  };

  // Helper to handle shape selection correctly
  const selectShape = (type: string) => {
    setSelectedShapeType(type as ShapeType);
    setActiveTool('shape');
    setShowShapes(false);
  };

  return (
    <div className="fixed left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 bg-white/90 backdrop-blur-xl p-3 rounded-2xl shadow-2xl border border-slate-200/50 z-[1000] max-md:top-auto max-md:bottom-16 max-md:left-2 max-md:right-2 max-md:translate-y-0 max-md:flex-row max-md:overflow-x-auto max-md:gap-1 max-md:p-1">
      
      <button title="Select" aria-label="Select" onClick={() => { setActiveTool('select'); setShowShapes(false); setShowColors(false); }} className={`p-3 rounded-xl ${activeTool === 'select' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}><MousePointer2 size={20} /></button>
      <button title="Pan" aria-label="Pan" onClick={() => { setActiveTool('pan'); setShowShapes(false); setShowColors(false); }} className={`p-3 rounded-xl ${activeTool === 'pan' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}><Hand size={20} /></button>
      
      <div className="w-full h-px bg-slate-200" />

      <button title="Draw" aria-label="Draw" onClick={() => { setActiveTool('draw'); setShowShapes(false); setShowColors(false); }} className={`p-3 rounded-xl ${activeTool === 'draw' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}><Pencil size={20} /></button>
      
      {/* SHAPES POP-OUT - EXTENDED SHAPES */}
      <div className="relative">
        <button onClick={() => { setShowShapes(!showShapes); setShowColors(false); }} className={`p-3 rounded-xl ${activeTool === 'shape' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}>
          <Square size={20} />
        </button>
        {showShapes && (
          <div className="absolute left-16 top-0 ml-2 max-md:left-0 max-md:top-auto max-md:bottom-14 max-md:ml-0 bg-white shadow-2xl border border-slate-100 rounded-2xl p-2 grid grid-cols-2 gap-1 min-w-[280px] z-[2000]">
            <button onClick={() => selectShape('rect')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Square size={14} /> Square</button>
            <button onClick={() => selectShape('circle')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Circle size={14} /> Circle</button>
            <button onClick={() => selectShape('triangle')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Triangle size={14} /> Triangle</button>
            <button onClick={() => selectShape('arrow')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><ArrowUpRight size={14} /> Arrow</button>
            <button onClick={() => selectShape('hexagon')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Hexagon size={14} /> Hexagon</button>
            <button onClick={() => selectShape('pentagon')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Pentagon size={14} /> Pentagon</button>
            <button onClick={() => selectShape('star')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Star size={14} /> Star</button>
            <button onClick={() => selectShape('diamond')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Diamond size={14} /> Diamond</button>
            <button onClick={() => selectShape('parallelogram')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Layout size={14} className="rotate-12" /> Parallelogram</button>
            <button onClick={() => selectShape('trapezium')} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-[10px] font-bold uppercase"><Layout size={14} /> Trapezium</button>
          </div>
        )}
      </div>

      <button title="Text" aria-label="Text" onClick={() => { setActiveTool('text'); setShowShapes(false); setShowColors(false); }} className={`p-3 rounded-xl ${activeTool === 'text' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}><Type size={20} /></button>
      <button title="Sticky note" aria-label="Sticky note" onClick={() => { setActiveTool('sticky'); setShowShapes(false); setShowColors(false); }} className={`p-3 rounded-xl ${activeTool === 'sticky' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}><StickyNote size={20} /></button>
      
      <button onClick={() => { fileInputRef.current?.click(); setShowShapes(false); setShowColors(false); }} className="p-3 rounded-xl hover:bg-slate-100 text-slate-600"><ImageIcon size={20} /></button>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      <div className="w-full h-px bg-slate-200" />

      {/* COLORS PANEL */}
      <div className="relative">
        <button onClick={() => { setShowColors(!showColors); setShowShapes(false); }} className="p-3 rounded-xl hover:bg-slate-100 transition-colors" style={{ color: selectedColor }}>
          <Palette size={20} />
        </button>
        {showColors && (
          <div className="absolute left-16 bottom-0 ml-2 max-md:left-0 max-md:bottom-14 max-md:ml-0 bg-white shadow-2xl border border-slate-100 rounded-2xl p-4 grid grid-cols-4 gap-3 z-[2000]">
            {colors.map(c => (
              <button 
                key={c} 
                onClick={() => { setSelectedColor(c); setShowColors(false); }}
                className={`w-7 h-7 rounded-full border border-slate-200 transition-transform hover:scale-125 ${selectedColor === c ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}