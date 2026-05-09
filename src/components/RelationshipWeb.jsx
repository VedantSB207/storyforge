import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { C, genId } from "../constants.js";

export function RelationshipWeb({ chars, relationships = [], setRelationships, setRelNodes, setRelEdges }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });

  // Track actual container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0 && (Math.abs(width - dims.w) > 30 || Math.abs(height - dims.h) > 30)) {
        setDims({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Position all chars in a circle using actual dimensions
  const positionNodes = (characters, w, h) => characters.map((c, i) => {
    const angle = (i / characters.length) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(w, h) * 0.35;
    return { id: c.id, label: c.name, role: c.role, species: c.species, x: w/2 + Math.cos(angle)*r, y: h/2 + Math.sin(angle)*r };
  });

  const [nodes, setNodes] = useState(() => positionNodes(chars, 900, 600));
  const [edges, setEdges] = useState(relationships || []);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({x:0,y:0});
  const [pan, setPan] = useState({x:0,y:0});
  const [panDrag, setPanDrag] = useState(false);
  const [panStart, setPanStart] = useState({x:0,y:0});
  const [selected, setSelected] = useState(null);
  const [connectFrom, setConnectFrom] = useState(null);
  const [edgeModal, setEdgeModal] = useState(null); // {from, to}
  const [relLabel, setRelLabel] = useState('');
  const [relType, setRelType] = useState('ally');
  const [hoverEdge, setHoverEdge] = useState(null);

  // Reposition ALL nodes when container resizes — use useLayoutEffect to avoid flash
  useLayoutEffect(() => {
    setNodes(prev => {
      if (prev.length === 0) return prev;
      const r = Math.min(dims.w, dims.h) * 0.36;
      return prev.map((n, i) => ({
        ...n,
        x: dims.w/2 + Math.cos((i / prev.length) * Math.PI * 2 - Math.PI/2) * r,
        y: dims.h/2 + Math.sin((i / prev.length) * Math.PI * 2 - Math.PI/2) * r,
      }));
    });
  }, [dims]);

  // Sync new characters added to the Bible
  useLayoutEffect(() => {
    setNodes(prev => {
      const existing = new Set(prev.map(n => n.id));
      const newOnes = chars.filter(c => !existing.has(c.id));
      if (newOnes.length === 0) return prev;
      const all = [...prev, ...newOnes.map(c => ({ id: c.id, label: c.name, role: c.role, species: c.species, x: 0, y: 0 }))];
      const r = Math.min(dims.w, dims.h) * 0.36;
      return all.map((n, i) => ({
        ...n,
        x: dims.w/2 + Math.cos((i / all.length) * Math.PI * 2 - Math.PI/2) * r,
        y: dims.h/2 + Math.sin((i / all.length) * Math.PI * 2 - Math.PI/2) * r,
      }));
    });
  }, [chars, dims]);

  // Sync edges back to parent for persistence
  useEffect(() => {
    if (setRelationships) setRelationships(edges);
    if (setRelEdges) setRelEdges(edges);
  }, [edges]);

  // Sync nodes up to parent for Dashboard
  useEffect(() => {
    if (setRelNodes) setRelNodes(nodes);
  }, [nodes]);

  const REL_TYPES = [
    {id:'ally',    label:'Ally',         color:C.green},
    {id:'rival',   label:'Rival',        color:C.accBright},
    {id:'love',    label:'Love / Bond',  color:C.gold},
    {id:'mentor',  label:'Mentor',       color:C.purpleLight},
    {id:'enemy',   label:'Enemy',        color:'#c0392b'},
    {id:'unknown', label:'Unknown / Suspicious', color:C.teal},
    {id:'debt',    label:'Debt / Owing', color:C.mutedLight},
  ];
  const relColor = (type) => REL_TYPES.find(r=>r.id===type)?.color || C.muted;

  const svgCoord = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y };
  };

  const onSvgDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'svg') {
      if (connectFrom) { setConnectFrom(null); return; }
      setSelected(null);
      setPanDrag(true); setPanStart({x:e.clientX-pan.x, y:e.clientY-pan.y});
    }
  };
  const onSvgMove = (e) => {
    if (panDrag && !dragging) setPan({x:e.clientX-panStart.x, y:e.clientY-panStart.y});
    if (dragging) {
      const c = svgCoord(e);
      setNodes(p => p.map(n => n.id===dragging ? {...n, x:c.x-dragOffset.x, y:c.y-dragOffset.y} : n));
    }
  };
  const onSvgUp = () => { setDragging(null); setPanDrag(false); };

  const onNodeDown = (e, id) => {
    e.stopPropagation();
    if (connectFrom) {
      if (connectFrom !== id) setEdgeModal({from:connectFrom, to:id});
      setConnectFrom(null); return;
    }
    setSelected(id);
    const n = nodes.find(x=>x.id===id);
    const c = svgCoord(e);
    setDragging(id); setDragOffset({x:c.x-n.x, y:c.y-n.y});
  };

  const saveEdge = () => {
    if (!edgeModal || !relLabel.trim()) return;
    const exists = edges.find(e=>(e.from===edgeModal.from&&e.to===edgeModal.to)||(e.from===edgeModal.to&&e.to===edgeModal.from));
    if (!exists) setEdges(p=>[...p, {id:genId(), from:edgeModal.from, to:edgeModal.to, label:relLabel.trim(), type:relType}]);
    setEdgeModal(null); setRelLabel(''); setRelType('ally');
  };

  const deleteEdge = (id) => setEdges(p=>p.filter(e=>e.id!==id));
  const selectedChar = chars.find(c=>c.id===selected);
  const selectedEdges = edges.filter(e=>e.from===selected||e.to===selected);

  return (
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',backgroundColor:C.bg}}>
      {/* Toolbar */}
      <div style={{display:'flex',gap:'8px',padding:'9px 14px',backgroundColor:C.bgDeep,borderBottom:`1px solid ${C.border}`,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
        <span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em'}}>Relationship Web</span>
        <div style={{width:'1px',height:'14px',backgroundColor:C.border}}/>
        {nodes.length < 2
          ? <span style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',fontStyle:'italic'}}>Add at least 2 characters in Story Bible to begin</span>
          : <>
              <button onClick={()=>setConnectFrom(connectFrom?null:selected||'__pick')}
                style={{padding:'4px 12px',backgroundColor:connectFrom?C.gold+'22':'transparent',color:connectFrom?C.gold:C.muted,border:`1px solid ${connectFrom?C.gold+'55':C.border}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>
                {connectFrom?'→ Click second character':'Add Relationship'}
              </button>
              {selected && selectedEdges.length>0 && (
                <span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui'}}>{selectedEdges.length} relationship{selectedEdges.length!==1?'s':''} for {selectedChar?.name}</span>
              )}
            </>
        }
        <div style={{marginLeft:'auto',display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
          {REL_TYPES.map(t=>(
            <span key={t.id} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'9px',color:C.muted,fontFamily:'system-ui'}}>
              <span style={{width:'18px',height:'2px',backgroundColor:t.color,display:'inline-block',borderRadius:'1px'}}/>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* SVG */}
      <div ref={containerRef} style={{flex:1,position:'relative',overflow:'hidden'}}>
        <svg ref={svgRef} width="100%" height="100%"
          style={{cursor:panDrag?'grabbing':connectFrom?'crosshair':'grab',userSelect:'none',display:'block'}}
          onMouseDown={onSvgDown} onMouseMove={onSvgMove} onMouseUp={onSvgUp}>
          <defs>
            <pattern id="rwgrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0L0 0 0 32" fill="none" stroke={C.borderMid} strokeWidth="0.3" opacity="0.4"/>
            </pattern>
            {REL_TYPES.map(t=>(
              <marker key={t.id} id={`arr-${t.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={t.color} opacity="0.7"/>
              </marker>
            ))}
          </defs>
          <rect width="100%" height="100%" fill="url(#rwgrid)"/>
          <g transform={`translate(${pan.x},${pan.y})`}>
            {/* EDGES — simple lines, guaranteed visible */}
            {edges.map(edge => {
              const f = nodes.find(n => n.id === edge.from);
              const t = nodes.find(n => n.id === edge.to);
              if (!f || !t) return null;
              const col = relColor(edge.type);
              const isHover = hoverEdge === edge.id;
              return (
                <g key={edge.id}>
                  {/* Thick invisible hit target for hover */}
                  <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                    stroke="transparent" strokeWidth="14" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverEdge(edge.id)}
                    onMouseLeave={() => setHoverEdge(null)}
                    onClick={() => isHover && deleteEdge(edge.id)} />
                  {/* Visible line */}
                  <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                    stroke={col} strokeWidth={isHover ? 3.5 : 2.5} opacity={isHover ? 1 : 0.75}
                    strokeLinecap="round"
                    strokeDasharray={edge.type === 'unknown' ? '5,4' : 'none'} />
                  {/* Label at midpoint */}
                  <text x={(f.x + t.x) / 2} y={(f.y + t.y) / 2 - 6}
                    textAnchor="middle" fontSize="9" fill={isHover ? col : C.mutedLight}
                    fontFamily="system-ui" opacity="0.85">
                    {isHover ? 'click to remove' : edge.label}
                  </text>
                </g>
              );
            })}
            {/* Nodes */}
            {nodes.map(n => {
              const isSel = selected===n.id;
              const isFrom = connectFrom===n.id;
              const charData = chars.find(c=>c.id===n.id);
              const nodeColor = charData ? C.accBright : C.muted;
              const initials = n.label.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
              return (
                <g key={n.id} onMouseDown={e=>onNodeDown(e,n.id)} style={{cursor:connectFrom?'crosshair':dragging===n.id?'grabbing':'grab'}}>
                  {(isSel||isFrom)&&<circle cx={n.x} cy={n.y} r="36" fill={nodeColor+'15'} stroke={nodeColor} strokeWidth="1" opacity="0.7"/>}
                  <circle cx={n.x} cy={n.y} r="26" fill={C.bgDeep} stroke={nodeColor} strokeWidth={isSel?2:1.5}/>
                  <text x={n.x} y={n.y+1} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill={nodeColor} fontFamily="Georgia,serif" fontWeight="bold">{initials}</text>
                  {/* Name below */}
                  <text x={n.x} y={n.y+38} textAnchor="middle" fontSize="10" fill={isSel?C.parch:C.mutedLight} fontFamily="Georgia,serif">{n.label}</text>
                  {n.role&&<text x={n.x} y={n.y+50} textAnchor="middle" fontSize="8" fill={C.muted} fontFamily="system-ui">{n.role}</text>}
                  {charData?.secrets&&<circle cx={n.x+20} cy={n.y-20} r="5" fill={C.acc} stroke={C.bg} strokeWidth="1.5" title="Has secrets"/>}
                </g>
              );
            })}
          </g>
          {/* Empty state message */}
          {edges.length===0 && nodes.length > 0 && (
            <text x="50%" y="98%" textAnchor="middle" fontSize="11" fill={C.muted} fontFamily="system-ui" opacity="0.6">
              Click &apos;Add Relationship&apos; then click two characters to connect them
            </text>
          )}
        </svg>

        {/* Selected character panel */}
        {selected && selectedChar && (
          <div style={{position:'absolute',top:'12px',right:'12px',width:'220px',backgroundColor:C.bgElevated,border:`1px solid ${C.acc}55`,borderRadius:'7px',padding:'14px',pointerEvents:'none'}}>
            <div style={{fontSize:'13px',fontWeight:'bold',color:C.parch,marginBottom:'3px'}}>{selectedChar.name}</div>
            <div style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',marginBottom:'10px'}}>{selectedChar.species} · {selectedChar.role}</div>
            {selectedEdges.length>0&&(
              <>
                <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'6px'}}>Relationships</div>
                {selectedEdges.map(e=>{
                  const otherId = e.from===selected?e.to:e.from;
                  const other = nodes.find(n=>n.id===otherId);
                  return (
                    <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'5px'}}>
                      <span style={{fontSize:'11px',color:C.parch}}>{other?.label||'?'}</span>
                      <span style={{fontSize:'9px',padding:'1px 6px',borderRadius:'3px',backgroundColor:relColor(e.type)+'22',color:relColor(e.type),fontFamily:'system-ui'}}>{e.label}</span>
                    </div>
                  );
                })}
              </>
            )}
            {selectedChar.secrets&&<div style={{marginTop:'8px',borderTop:`1px solid ${C.border}`,paddingTop:'7px',fontSize:'10px',color:C.accBright,fontStyle:'italic',lineHeight:'1.4'}}>Has secrets ✦</div>}
          </div>
        )}

        {nodes.length===0&&(
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{textAlign:'center',color:C.muted,fontFamily:'system-ui'}}>
              <div style={{fontSize:'32px',marginBottom:'12px',opacity:0.3}}>◎</div>
              <div style={{fontSize:'13px',marginBottom:'5px'}}>No characters yet</div>
              <div style={{fontSize:'11px',fontStyle:'italic'}}>Add characters in Story Bible — they appear here automatically</div>
            </div>
          </div>
        )}
      </div>

      {/* Add relationship modal */}
      {edgeModal&&(()=>{
        const f=nodes.find(n=>n.id===edgeModal.from), t=nodes.find(n=>n.id===edgeModal.to);
        return (
          <div style={{position:'absolute',inset:0,backgroundColor:'#00000088',display:'flex',alignItems:'center',justifyContent:'center',zIndex:30}}>
            <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.borderMid}`,borderRadius:'8px',padding:'20px',width:'320px'}}>
              <div style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'12px'}}>Define Relationship</div>
              <div style={{fontSize:'13px',color:C.parch,marginBottom:'14px',textAlign:'center'}}>
                <span style={{color:C.accBright}}>{f?.label}</span>
                <span style={{color:C.muted,margin:'0 8px',fontFamily:'system-ui'}}>↔</span>
                <span style={{color:C.accBright}}>{t?.label}</span>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'12px'}}>
                {REL_TYPES.map(r=>(
                  <button key={r.id} onClick={()=>{setRelType(r.id);if(!relLabel.trim())setRelLabel(r.label);}}
                    style={{padding:'4px 9px',backgroundColor:relType===r.id?r.color+'33':'transparent',color:relType===r.id?r.color:C.muted,border:`1px solid ${relType===r.id?r.color+'66':C.border}`,borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>{r.label}</button>
                ))}
              </div>
              <input value={relLabel} onChange={e=>setRelLabel(e.target.value)} placeholder="Describe this relationship..."
                onKeyDown={e=>e.key==='Enter'&&saveEdge()} autoFocus
                style={{width:'100%',padding:'8px 10px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'13px',outline:'none',fontFamily:'Georgia,serif',boxSizing:'border-box',marginBottom:'12px'}}/>
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={saveEdge} style={{flex:1,padding:'8px',backgroundColor:relColor(relType),color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Add Relationship</button>
                <button onClick={()=>setEdgeModal(null)} style={{padding:'8px 14px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── TIMELINE ── */
