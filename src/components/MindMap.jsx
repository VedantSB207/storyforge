import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { C, genId } from "../constants.js";

export function MindMap({ projectTitle, chars = [], importedEdges = [] }) {
  const svgRef = useRef(null);
  const [nodes, setNodes] = useState([{ id:'root', x:400, y:280, label:projectTitle||'Story', type:'note' }]);
  const [edges, setEdges] = useState([]);
  const [dragging, setDragging] = useState(null);
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const [mmDims, setMmDims] = useState({ w: 800, h: 600 });

  // Track SVG container size
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setMmDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Add character nodes + position ALL in a circle using actual SVG dimensions
  useLayoutEffect(() => {
    if (!chars || chars.length === 0) return;
    setNodes(prev => {
      const existingLabels = new Set(prev.map(n => n.label?.toLowerCase()));
      const newCharNodes = chars.filter(c => c.name && !existingLabels.has(c.name.toLowerCase()));
      const root = prev.find(n => n.id === 'root') || prev[0];
      const existingNonRoot = prev.filter(n => n.id !== 'root');
      const allCharNodes = newCharNodes.length > 0
        ? [...existingNonRoot, ...newCharNodes.map(c => ({ id: c.id || genId(), x: 0, y: 0, label: c.name, type: 'character' }))]
        : existingNonRoot;
      if (allCharNodes.length === 0) return prev;
      const total = allCharNodes.length;
      const cx = mmDims.w / 2, cy = mmDims.h / 2;
      const radius = Math.min(mmDims.w, mmDims.h) * 0.35;
      return [
        { ...root, x: cx, y: cy },
        ...allCharNodes.map((n, i) => ({
          ...n,
          x: cx + Math.cos((i / total) * 2 * Math.PI - Math.PI / 2) * radius,
          y: cy + Math.sin((i / total) * 2 * Math.PI - Math.PI / 2) * radius,
        }))
      ];
    });
  }, [chars, mmDims]);

  // Watch importedEdges — create edges from imported relationship data
  useEffect(() => {
    if (!importedEdges || importedEdges.length === 0) return;
    const timer = setTimeout(() => {
      const currentNodes = nodesRef.current;
      const newEdges = [];
      for (const ie of importedEdges) {
        const parts = ie.between?.split(/\s*&\s*/) || [];
        if (parts.length !== 2) continue;
        const nodeA = currentNodes.find(n => n.label?.toLowerCase() === parts[0].trim().toLowerCase());
        const nodeB = currentNodes.find(n => n.label?.toLowerCase() === parts[1].trim().toLowerCase());
        if (nodeA && nodeB) {
          newEdges.push({ id: genId(), from: nodeA.id, to: nodeB.id, label: ie.dynamic || '' });
        }
      }
      if (newEdges.length > 0) {
        setEdges(prev => {
          const existingSet = new Set(prev.map(e => `${e.from}|${e.to}`));
          const filtered = newEdges.filter(e => !existingSet.has(`${e.from}|${e.to}`) && !existingSet.has(`${e.to}|${e.from}`));
          return filtered.length > 0 ? [...prev, ...filtered] : prev;
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [importedEdges]);

  // Auto-create edges: connect each character to the root node so the mindmap always has visible edges
  useEffect(() => {
    if (chars.length === 0) return;
    const timer = setTimeout(() => {
      const currentNodes = nodesRef.current;
      const root = currentNodes.find(n => n.id === 'root');
      if (!root) return;
      const charNodes = currentNodes.filter(n => n.id !== 'root' && n.type === 'character');
      if (charNodes.length === 0) return;
      setEdges(prev => {
        const existingSet = new Set(prev.map(e => `${e.from}|${e.to}`));
        const autoEdges = charNodes
          .filter(cn => !existingSet.has(`root|${cn.id}`) && !existingSet.has(`${cn.id}|root`))
          .map(cn => ({ id: genId(), from: 'root', to: cn.id, label: '' }));
        return autoEdges.length > 0 ? [...prev, ...autoEdges] : prev;
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [chars]);
  const [dragOffset, setDragOffset] = useState({x:0,y:0});
  const [pan, setPan] = useState({x:0,y:0});
  const [panDrag, setPanDrag] = useState(false);
  const [panStart, setPanStart] = useState({x:0,y:0});
  const [selected, setSelected] = useState(null);
  const [connectMode, setConnectMode] = useState(null);
  const [addModal, setAddModal] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('character');
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');

  const TYPES = Object.entries(C.node);

  const addNode = (parentId) => {
    if (!newLabel.trim()) return;
    const parent = nodes.find(n=>n.id===parentId);
    const a = Math.random()*Math.PI*2, d = 140+Math.random()*60;
    const n = { id:genId(), x:parent?parent.x+Math.cos(a)*d:380+(Math.random()-.5)*300, y:parent?parent.y+Math.sin(a)*d:280+(Math.random()-.5)*200, label:newLabel.trim(), type:newType };
    setNodes(p=>[...p,n]);
    if(parentId) setEdges(p=>[...p,{id:genId(),from:parentId,to:n.id}]);
    setAddModal(null); setNewLabel(''); setNewType('character');
  };

  const deleteNode = (id) => {
    if(id==='root') return;
    setNodes(p=>p.filter(n=>n.id!==id));
    setEdges(p=>p.filter(e=>e.from!==id&&e.to!==id));
    setSelected(null);
  };

  const connectTo = (id) => {
    if(!connectMode||connectMode===id){setConnectMode(null);return;}
    if(!edges.find(e=>(e.from===connectMode&&e.to===id)||(e.from===id&&e.to===connectMode)))
      setEdges(p=>[...p,{id:genId(),from:connectMode,to:id}]);
    setConnectMode(null);
  };

  const svgCoord = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left - pan.x, y: e.clientY - r.top - pan.y };
  };

  const onSvgDown = (e) => {
    if(e.target===svgRef.current||e.target.tagName==='svg'||e.target.tagName==='rect'||e.target.tagName==='pattern'||e.target.tagName==='path'){
      if(connectMode){setConnectMode(null);return;}
      setPanDrag(true); setPanStart({x:e.clientX-pan.x,y:e.clientY-pan.y}); setSelected(null);
    }
  };
  const onSvgMove = (e) => {
    if(panDrag&&!dragging) setPan({x:e.clientX-panStart.x,y:e.clientY-panStart.y});
    if(dragging){
      const c = svgCoord(e);
      setNodes(p=>p.map(n=>n.id===dragging?{...n,x:c.x-dragOffset.x,y:c.y-dragOffset.y}:n));
    }
  };
  const onSvgUp = () => { setDragging(null); setPanDrag(false); };

  const onNodeDown = (e,id) => {
    e.stopPropagation();
    if(connectMode){connectTo(id);return;}
    setSelected(id);
    const n = nodes.find(x=>x.id===id);
    const c = svgCoord(e);
    setDragging(id); setDragOffset({x:c.x-n.x,y:c.y-n.y});
  };

  return (
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',position:'relative',backgroundColor:C.bg}}>
      <div style={{display:'flex',gap:'8px',padding:'9px 14px',backgroundColor:C.bgDeep,borderBottom:`1px solid ${C.border}`,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
        <button onClick={()=>setAddModal('root')} style={{padding:'4px 12px',backgroundColor:C.purple+'33',color:C.purpleLight,border:`1px solid ${C.purple}55`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>+ Node</button>
        {selected && selected!=='root' && (
          <>
            <button onClick={()=>setAddModal(selected)} style={{padding:'4px 12px',backgroundColor:'transparent',color:C.mutedLight,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>+ Branch</button>
            <button onClick={()=>{const n=nodes.find(x=>x.id===selected);if(n){setEditing(n.id);setEditVal(n.label);}}} style={{padding:'4px 12px',backgroundColor:'transparent',color:C.mutedLight,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>✎ Rename</button>
            <button onClick={()=>deleteNode(selected)} style={{padding:'4px 12px',backgroundColor:'transparent',color:C.accBright+'99',border:`1px solid ${C.borderAcc}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>✕ Delete</button>
          </>
        )}
        <button onClick={()=>setConnectMode(connectMode?null:selected||'__pick')} style={{padding:'4px 12px',backgroundColor:connectMode?C.gold+'22':'transparent',color:connectMode?C.gold:C.muted,border:`1px solid ${connectMode?C.gold+'55':C.border}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>{connectMode?'→ Click target':'Connect'}</button>
        <div style={{marginLeft:'auto',display:'flex',gap:'10px',flexWrap:'wrap'}}>
          {TYPES.map(([t,c])=>(
            <span key={t} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'10px',color:C.muted,fontFamily:'system-ui'}}>
              <span style={{width:'7px',height:'7px',borderRadius:'50%',backgroundColor:c,display:'inline-block'}}/>
              {t}
            </span>
          ))}
        </div>
      </div>

      <svg ref={svgRef} style={{flex:1,cursor:panDrag?'grabbing':connectMode?'crosshair':'grab',userSelect:'none',display:'block'}}
        onMouseDown={onSvgDown} onMouseMove={onSvgMove} onMouseUp={onSvgUp}>
        <defs><pattern id="g" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0L0 0 0 28" fill="none" stroke={C.borderMid} strokeWidth="0.4" opacity="0.5"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <g transform={`translate(${pan.x},${pan.y})`}>
          {/* EDGES — simple lines, guaranteed visible */}
          {edges.map(edge => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            const mx = (fromNode.x + toNode.x) / 2;
            const my = (fromNode.y + toNode.y) / 2 - 8;
            return (
              <g key={edge.id}>
                <line
                  x1={fromNode.x} y1={fromNode.y}
                  x2={toNode.x} y2={toNode.y}
                  stroke="#a685e8" strokeWidth="2" opacity="0.6" strokeLinecap="round"
                />
                {edge.label && (
                  <text x={mx} y={my} textAnchor="middle" fontSize="8" fill={C.mutedLight} fontFamily="system-ui" opacity="0.8">
                    {edge.label.length > 16 ? edge.label.slice(0, 16) + '…' : edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map(n=>{
            const r=n.id==='root'?24:20;
            const col=C.node[n.type]||C.muted;
            const isSel=selected===n.id;
            const words=n.label.split(' ');
            const l1=words.slice(0,Math.ceil(words.length/2)).join(' ');
            const l2=words.length>1?words.slice(Math.ceil(words.length/2)).join(' '):'';
            return (
              <g key={n.id} onMouseDown={e=>onNodeDown(e,n.id)} onDoubleClick={()=>{setEditing(n.id);setEditVal(n.label);}}
                style={{cursor:connectMode?'crosshair':dragging===n.id?'grabbing':'grab'}}>
                {isSel&&<circle cx={n.x} cy={n.y} r={r+7} fill={col+'18'} stroke={col} strokeWidth="1" opacity="0.7"/>}
                <circle cx={n.x} cy={n.y} r={r} fill={n.id==='root'?C.bgElevated:col+'25'} stroke={n.id==='root'?C.purpleLight:col} strokeWidth={n.id==='root'?2:1.5}/>
                {editing===n.id?null:<>
                  <text x={n.x} y={l2?n.y-4:n.y+4} textAnchor="middle" fontSize="10" fill={n.id==='root'?C.purpleLight:col} fontFamily="Georgia,serif" fontWeight={n.id==='root'?'bold':'normal'}>{l1}</text>
                  {l2&&<text x={n.x} y={n.y+9} textAnchor="middle" fontSize="10" fill={n.id==='root'?C.purpleLight:col} fontFamily="Georgia,serif">{l2}</text>}
                </>}
                {n.id!=='root'&&<circle cx={n.x+r-4} cy={n.y-r+4} r="4" fill={col} stroke={C.bg} strokeWidth="1.5"/>}
              </g>
            );
          })}
        </g>
      </svg>

      {editing&&(()=>{
        const n=nodes.find(x=>x.id===editing); if(!n) return null;
        return <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){setNodes(p=>p.map(x=>x.id===editing?{...x,label:editVal}:x));setEditing(null);}if(e.key==='Escape')setEditing(null);}}
          onBlur={()=>{setNodes(p=>p.map(x=>x.id===editing?{...x,label:editVal}:x));setEditing(null);}}
          style={{position:'absolute',left:`${n.x+pan.x-52}px`,top:`${n.y+pan.y-13}px`,width:'104px',padding:'2px 6px',backgroundColor:C.bgElevated,border:`1px solid ${C.purpleLight}`,borderRadius:'3px',color:C.parch,fontSize:'11px',fontFamily:'Georgia,serif',outline:'none',zIndex:10}}/>;
      })()}

      {addModal&&(
        <div style={{position:'absolute',inset:0,backgroundColor:'#00000088',display:'flex',alignItems:'center',justifyContent:'center',zIndex:20}}>
          <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.borderMid}`,borderRadius:'8px',padding:'20px',width:'300px'}}>
            <div style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'12px'}}>Add Node</div>
            <input autoFocus value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="Label..." onKeyDown={e=>e.key==='Enter'&&addNode(addModal)}
              style={{width:'100%',padding:'8px 10px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'13px',outline:'none',fontFamily:'Georgia,serif',marginBottom:'10px',boxSizing:'border-box'}}/>
            <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'14px'}}>
              {TYPES.map(([t,c])=>(
                <button key={t} onClick={()=>setNewType(t)} style={{padding:'4px 9px',backgroundColor:newType===t?c+'33':'transparent',color:newType===t?c:C.muted,border:`1px solid ${newType===t?c+'66':C.border}`,borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui',textTransform:'capitalize'}}>{t}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>addNode(addModal)} style={{flex:1,padding:'8px',backgroundColor:C.purple,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Add to Map</button>
              <button onClick={()=>setAddModal(null)} style={{padding:'8px 14px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {nodes.length===1&&(
        <div style={{position:'absolute',bottom:'18px',left:'50%',transform:'translateX(-50%)',backgroundColor:C.bgElevated,border:`1px solid ${C.borderMid}`,borderRadius:'6px',padding:'9px 16px',fontSize:'11px',color:C.muted,fontFamily:'system-ui',pointerEvents:'none',whiteSpace:'nowrap'}}>
          Click "+ Node" to begin · Double-click to rename · Drag freely · "Connect" to draw relationships
        </div>
      )}
    </div>
  );
}

/* ── STORY BIBLE ── */
