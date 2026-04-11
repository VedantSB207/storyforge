import { useState, useRef, useEffect } from "react";
import { callClaude, isElectron } from "./api.js";

const C = {
  bg: '#09090c', bgCard: '#111116', bgDeep: '#0d0d11', bgElevated: '#161620',
  border: '#1c1c24', borderMid: '#2a2a36', borderAcc: '#3a1212',
  acc: '#8b1f1f', accBright: '#c0392b',
  gold: '#c9a857', purple: '#7b5fc4', purpleLight: '#a685e8',
  parch: '#ddd5bb', muted: '#5a5450', mutedLight: '#8a8278',
  green: '#2d8a4e', teal: '#1a8a7a', blue: '#3a6fa0', tagBg: '#161620',
  node: { character:'#c0392b', event:'#c9a857', location:'#2d8a4e', artifact:'#7b5fc4', theme:'#1a8a7a', chapter:'#3a6fa0', note:'#5a5450' }
};

const genId = () => Math.random().toString(36).slice(2,8);

/* ── PROJECT HUB ── */
function ProjectHub({ onOpen, projectList, setProjectList }) {
  const [projects, setProjects] = useState(projectList || []);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');

  useEffect(() => { if (projectList) setProjects(projectList); }, [projectList]);

  const create = async () => {
    if (!title.trim()) return;
    const p = { id: genId(), title: title.trim(), genre: genre.trim(), status: 'planning', lastEdited: 'Just now', chars: [], lore: [] };
    if (isElectron()) {
      await window.electronAPI.saveProject(p.id, p);
      if (setProjectList) setProjectList(prev => [...(prev||[]), p]);
    }
    setProjects(prev => [...prev, p]);
    setCreating(false); setTitle(''); setGenre('');
    onOpen(p);
  };

  const sc = { active:[C.accBright, C.acc+'22'], planning:[C.gold,'#2a1e0422'], complete:[C.green,'#0e1e1422'] };

  return (
    <div style={{minHeight:'100vh',backgroundColor:C.bg,color:C.parch,fontFamily:'Georgia,serif',display:'flex',flexDirection:'column'}}>
      <div style={{backgroundColor:C.bgDeep,borderBottom:`1px solid ${C.border}`,padding:'14px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{width:'32px',height:'32px',backgroundColor:C.purple,borderRadius:'6px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',color:'#fff'}}>✦</div>
          <div>
            <div style={{fontSize:'16px',fontWeight:'bold',letterSpacing:'0.06em'}}>StoryForge</div>
            <div style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',letterSpacing:'0.16em',textTransform:'uppercase'}}>narrative intelligence engine</div>
          </div>
        </div>
        <button onClick={()=>setCreating(true)} style={{padding:'8px 18px',backgroundColor:C.purple,color:'#fff',border:'none',borderRadius:'5px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>+ New Project</button>
      </div>

      <div style={{flex:1,padding:'40px 28px',maxWidth:'820px',margin:'0 auto',width:'100%',boxSizing:'border-box'}}>
        <h1 style={{fontSize:'22px',margin:'0 0 8px 0'}}>Your Projects</h1>
        <p style={{margin:'0 0 28px 0',fontSize:'13px',color:C.muted,fontFamily:'system-ui',fontStyle:'italic',lineHeight:'1.6'}}>Each project is an isolated world. Characters, world rules, and simulations live independently per project.</p>

        {creating && (
          <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.purple}66`,borderRadius:'8px',padding:'20px',marginBottom:'20px'}}>
            <div style={{fontSize:'11px',color:C.purpleLight,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'14px'}}>New Project</div>
            <div style={{display:'flex',gap:'10px',marginBottom:'10px'}}>
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Working title..." autoFocus onKeyDown={e=>e.key==='Enter'&&create()}
                style={{flex:2,padding:'8px 12px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'14px',outline:'none',fontFamily:'Georgia,serif'}}/>
              <input value={genre} onChange={e=>setGenre(e.target.value)} placeholder="Genre (optional)..."
                style={{flex:1,padding:'8px 12px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'13px',outline:'none',fontFamily:'system-ui'}}/>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={create} style={{padding:'7px 18px',backgroundColor:C.purple,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Create Project</button>
              <button onClick={()=>setCreating(false)} style={{padding:'7px 14px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:'12px'}}>
          {projects.map(p => {
            const [col, bg] = sc[p.status]||[C.muted,C.tagBg];
            return (
              <div key={p.id} onClick={()=>onOpen(p)}
                style={{backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderRadius:'8px',padding:'18px',cursor:'pointer',position:'relative',overflow:'hidden'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple+'66'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',backgroundColor:col,opacity:0.6}}/>
                <div style={{fontSize:'16px',fontWeight:'bold',marginBottom:'4px'}}>{p.title||<span style={{color:C.muted,fontStyle:'italic'}}>Untitled</span>}</div>
                <div style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',marginBottom:'14px'}}>{p.genre||'No genre set'}</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'10px',padding:'3px 9px',borderRadius:'10px',backgroundColor:bg,color:col,fontFamily:'system-ui',border:`1px solid ${col}33`}}>{p.status}</span>
                  <span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui'}}>{p.lastEdited}</span>
                </div>
              </div>
            );
          })}
          <div onClick={()=>setCreating(true)}
            style={{backgroundColor:'transparent',border:`1px dashed ${C.borderMid}`,borderRadius:'8px',padding:'18px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontSize:'13px',fontFamily:'system-ui'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple+'66'}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.borderMid}>
            + New Project
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── MINDMAP ── */
function MindMap({ projectTitle }) {
  const svgRef = useRef(null);
  const [nodes, setNodes] = useState([{ id:'root', x:400, y:280, label:projectTitle||'Story', type:'note' }]);
  const [edges, setEdges] = useState([]);
  const [dragging, setDragging] = useState(null);
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
          {edges.map(e=>{
            const f=nodes.find(n=>n.id===e.from),t=nodes.find(n=>n.id===e.to);
            if(!f||!t) return null;
            return <path key={e.id} d={`M${f.x} ${f.y}Q${(f.x+t.x)/2} ${(f.y+t.y)/2-24} ${t.x} ${t.y}`} fill="none" stroke={C.borderMid} strokeWidth="1.5" opacity="0.6"/>;
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
function StoryBible({ chars, setChars, lore, setLore }) {
  const [addCh, setAddCh] = useState(false);
  const [addLr, setAddLr] = useState(false);
  const [nc, setNc] = useState({name:'',species:'',role:'',traits:'',stakes:'',secrets:'',contradictions:''});
  const [nl, setNl] = useState({cat:'Lore',rule:''});
  const [exp, setExp] = useState(null);

  const F = ({label,k,placeholder,multi,obj,set}) => (
    <div style={{marginBottom:'10px'}}>
      <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'3px'}}>{label}</div>
      {multi
        ?<textarea value={obj[k]} onChange={e=>set(p=>({...p,[k]:e.target.value}))} placeholder={placeholder}
            style={{width:'100%',minHeight:'55px',padding:'7px 10px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',resize:'vertical',boxSizing:'border-box',lineHeight:'1.5'}}/>
        :<input value={obj[k]} onChange={e=>set(p=>({...p,[k]:e.target.value}))} placeholder={placeholder}
            style={{width:'100%',padding:'7px 10px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',boxSizing:'border-box'}}/>}
    </div>
  );

  const loreCols = {Magic:C.purple,Lore:C.blue,World:C.green,Character:C.gold,Restriction:C.acc,History:C.teal};

  return (
    <div style={{padding:'20px',maxWidth:'720px',margin:'0 auto'}}>
      <div style={{marginBottom:'28px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
          <h2 style={{margin:0,fontSize:'16px'}}>Characters</h2>
          <button onClick={()=>setAddCh(true)} style={{padding:'5px 14px',backgroundColor:C.acc+'33',color:C.accBright,border:`1px solid ${C.acc}55`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>+ Add Character</button>
        </div>

        {addCh&&(
          <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.acc}55`,borderRadius:'7px',padding:'16px',marginBottom:'12px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 12px'}}>
              <F label="Name" k="name" placeholder="Character name" obj={nc} set={setNc}/>
              <F label="Species / Type" k="species" placeholder="Human, vampire..." obj={nc} set={setNc}/>
              <F label="Role" k="role" placeholder="Protagonist, mentor..." obj={nc} set={setNc}/>
            </div>
            <F label="Traits (comma-separated)" k="traits" placeholder="Loyal, sardonic, volatile..." obj={nc} set={setNc}/>
            <F label="What do they stand to LOSE? (LeVar Burton's stake test)" k="stakes" placeholder="The real thing at risk for this character..." multi obj={nc} set={setNc}/>
            <F label="Secrets — what only they know" k="secrets" placeholder="What hasn't come out yet..." multi obj={nc} set={setNc}/>
            <F label="Contradictions (Judy Blume: how would they defy your assumptions?)" k="contradictions" placeholder="The ways this character would surprise even you..." multi obj={nc} set={setNc}/>
            <div style={{display:'flex',gap:'8px',marginTop:'4px'}}>
              <button onClick={()=>{if(!nc.name.trim())return;setChars(p=>[...p,{...nc,id:genId()}]);setNc({name:'',species:'',role:'',traits:'',stakes:'',secrets:'',contradictions:''});setAddCh(false);}} style={{padding:'7px 18px',backgroundColor:C.acc,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Save Character</button>
              <button onClick={()=>setAddCh(false)} style={{padding:'7px 14px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
            </div>
          </div>
        )}

        {chars.length===0&&!addCh&&(
          <div style={{backgroundColor:C.bgCard,border:`1px dashed ${C.borderMid}`,borderRadius:'7px',padding:'24px',textAlign:'center'}}>
            <div style={{fontSize:'12px',color:C.muted+'99',fontFamily:'system-ui',fontStyle:'italic',lineHeight:'1.6'}}>No characters yet.<br/>Every character you add becomes an autonomous agent in the Simulation.<br/>Their secrets and contradictions define how they behave when the engine runs.</div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
          {chars.map(c=>(
            <div key={c.id} onClick={()=>setExp(exp===c.id?null:c.id)} style={{backgroundColor:C.bgCard,border:`1px solid ${exp===c.id?C.acc+'66':C.border}`,borderRadius:'6px',padding:'12px 14px',cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <span style={{fontSize:'14px',fontWeight:'bold'}}>{c.name}</span>
                  <span style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',marginLeft:'8px'}}>{c.species} · {c.role}</span>
                </div>
                <span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui'}}>{exp===c.id?'▲':'▼'}</span>
              </div>
              {exp===c.id&&(
                <div style={{marginTop:'12px',borderTop:`1px solid ${C.border}`,paddingTop:'12px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  {[['Traits',c.traits,C.mutedLight],['What they stand to lose',c.stakes,C.gold],['Secrets',c.secrets,C.accBright],['Contradictions',c.contradictions,C.purpleLight]].map(([l,v,col])=>v?(
                    <div key={l}><div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>{l}</div><div style={{fontSize:'12px',color:col,fontStyle:'italic',lineHeight:'1.5'}}>{v}</div></div>
                  ):null)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
          <h2 style={{margin:0,fontSize:'16px'}}>World Rules & Lore</h2>
          <button onClick={()=>setAddLr(true)} style={{padding:'5px 14px',backgroundColor:C.purple+'33',color:C.purpleLight,border:`1px solid ${C.purple}55`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>+ Add Rule</button>
        </div>
        {addLr&&(
          <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.purple}55`,borderRadius:'7px',padding:'14px',marginBottom:'10px'}}>
            <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'10px'}}>
              {['Lore','Magic','World','Character','Restriction','History'].map(cat=>(
                <button key={cat} onClick={()=>setNl(p=>({...p,cat}))} style={{padding:'4px 10px',backgroundColor:nl.cat===cat?(loreCols[cat]||C.muted)+'33':'transparent',color:nl.cat===cat?(loreCols[cat]||C.muted):C.muted,border:`1px solid ${nl.cat===cat?(loreCols[cat]||C.muted)+'66':C.border}`,borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>{cat}</button>
              ))}
            </div>
            <textarea value={nl.rule} onChange={e=>setNl(p=>({...p,rule:e.target.value}))} placeholder="Define this rule clearly. Inconsistency here breaks the Simulation's agent logic."
              style={{width:'100%',minHeight:'60px',padding:'8px 10px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',resize:'vertical',boxSizing:'border-box',marginBottom:'10px'}}/>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{if(!nl.rule.trim())return;setLore(p=>[...p,{...nl,id:genId()}]);setNl({cat:'Lore',rule:''});setAddLr(false);}} style={{padding:'6px 16px',backgroundColor:C.purple,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Save Rule</button>
              <button onClick={()=>setAddLr(false)} style={{padding:'6px 12px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
            </div>
          </div>
        )}
        {lore.length===0&&!addLr&&(
          <div style={{backgroundColor:C.bgCard,border:`1px dashed ${C.borderMid}`,borderRadius:'7px',padding:'20px',textAlign:'center'}}>
            <div style={{fontSize:'12px',color:C.muted+'99',fontFamily:'system-ui',fontStyle:'italic'}}>World rules become simulation constraints.<br/>The more specific, the more realistic the emergent agent behaviour.</div>
          </div>
        )}
        <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
          {lore.map(r=>(
            <div key={r.id} style={{backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderLeft:`3px solid ${loreCols[r.cat]||C.muted}`,borderRadius:'0 5px 5px 0',padding:'10px 14px',display:'flex',gap:'10px',alignItems:'flex-start'}}>
              <span style={{fontSize:'9px',padding:'2px 7px',borderRadius:'3px',backgroundColor:(loreCols[r.cat]||C.muted)+'22',color:loreCols[r.cat]||C.muted,fontFamily:'system-ui',whiteSpace:'nowrap',marginTop:'1px'}}>{r.cat}</span>
              <div style={{fontSize:'12px',color:C.mutedLight,fontStyle:'italic',lineHeight:'1.6'}}>{r.rule}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── SIMULATION ── */
function SimPanel({ chars, lore }) {
  const [step, setStep]           = useState('setup');
  const [extraSeed, setExtraSeed] = useState('');
  const [scenario, setScenario]   = useState('');
  const [agents, setAgents]       = useState(200);
  const [rounds, setRounds]       = useState(20);
  const [asymm, setAsymm]         = useState(true);
  const [progress, setProgress]   = useState(0);
  const [log, setLog]             = useState([]);
  const [result, setResult]       = useState('');

  // ── Conspiracy Engine state
  const [conspire, setConspire]         = useState(false);
  const [cGapMode, setCGapMode]         = useState('auto');       // 'auto' | 'writer'
  const [cGaps, setCGaps]               = useState('');           // writer-defined gaps
  const [cIntensity, setCIntensity]     = useState(3);            // 1–5
  const [cCorrMode, setCCorrMode]       = useState('auto');       // 'auto' | 'timed' | 'manual'
  const [cCorrRound, setCCorrRound]     = useState(15);           // round number for 'timed'
  const [conspiracyMap, setConspiracyMap] = useState(null);

  // Intensity labels
  const INTENSITY = ['Off','Whispers','Rumours','Theories','Full Conspiracy','Mass Delusion'];
  const INTENSITY_COL = ['','#5a7a5a','#a0a040','#c9a857','#c06030','#c0392b'];

  // Build seed strings
  const agentSeed = chars.length > 0
    ? chars.map(c => [
        `CHARACTER: ${c.name}`,
        c.species        ? `Species/Type: ${c.species}` : '',
        c.role           ? `Role: ${c.role}` : '',
        c.traits         ? `Traits: ${c.traits}` : '',
        c.stakes         ? `What they stand to lose: ${c.stakes}` : '',
        c.secrets        ? `Secrets: ${c.secrets}` : '',
        c.contradictions ? `Contradictions: ${c.contradictions}` : '',
      ].filter(Boolean).join('\n')).join('\n\n')
    : '';

  const loreSeed = lore.length > 0
    ? 'WORLD RULES:\n' + lore.map(r => `[${r.cat}] ${r.rule}`).join('\n')
    : '';

  const fullSeed = [agentSeed, loreSeed, extraSeed.trim()].filter(Boolean).join('\n\n');

  // Conspiracy context string injected into prompt
  const conspiracyContext = () => {
    if (!conspire) return '';
    const gapStr = cGapMode === 'writer' && cGaps.trim()
      ? `\nWriter-defined information gaps (facts deliberately hidden from most agents):\n${cGaps}`
      : '\nInformation gaps: auto-detect from seed material — find what is ambiguous, unexplained, or historically contested.';
    const corrStr = cCorrMode === 'auto'
      ? 'Correction timing: simulation decides organically when/if truth emerges.'
      : cCorrMode === 'timed'
        ? `Correction injection: truth becomes available at round ${cCorrRound} of ${rounds}.`
        : 'Correction timing: truth is deliberately withheld for the entire simulation — writer will inject manually.';
    return `\n\nCONSPIRACY ENGINE ACTIVE — Intensity ${cIntensity}/5 (${INTENSITY[cIntensity]}):
${gapStr}
${corrStr}
Agent susceptibility distribution at intensity ${cIntensity}: ${Math.round(cIntensity*15)}% high-susceptibility, ${Math.round(50-cIntensity*5)}% medium, rest skeptical.
Backfire Effect enabled: correction attempts on high-susceptibility agents may strengthen rather than dissolve belief.
Exploitation agents will emerge: some agents detect the conspiracy and weaponise it for personal/political gain regardless of whether they believe it.`;
  };

  const buildLog = () => [
    'Parsing seed material — extracting entities and relationships...',
    'Building GraphRAG knowledge graph in Zep...',
    `Generating ${agents} agent personas with independent memory profiles...`,
    asymm ? 'Applying information asymmetry — tiered knowledge propagation enabled...' : 'Full-broadcast information model enabled...',
    ...conspire ? [
      `Conspiracy Engine initialising — intensity ${cIntensity}/5 (${INTENSITY[cIntensity]})...`,
      cGapMode === 'writer' ? 'Loading writer-defined information gaps into agent memory partitions...' : 'Auto-detecting information vacuums from seed material...',
      'Seeding susceptibility profiles across agent population...',
      'Enabling Backfire Effect — correction resistance coefficients assigned...',
    ] : [],
    'Injecting world rules as hard simulation constraints...',
    'Spawning parallel simulation — Platform A (Twitter-model)...',
    'Spawning parallel simulation — Platform B (Reddit-model)...',
    'Time-step engine running — tracking memory updates per agent...',
    ...conspire ? [
      'Tracking speculation formation in low-information agent clusters...',
      'Monitoring theory mutation across social propagation chains...',
      cCorrMode === 'timed' ? `Round ${cCorrRound}: truth injection event firing...` : 'Monitoring organic correction dynamics...',
      'Measuring Backfire Effect instances — logging correction rebounds...',
      'Identifying exploitation agents — mapping gain-from-uncertainty behaviour...',
    ] : [],
    'Coalition detection — identifying emergent group formations...',
    'Flagging unexpected agent behaviour deviations...',
    conspire ? 'Conspiracy Map agent compiling mutation chains and residual belief metrics...' : 'ReportAgent synthesising emergent narrative analysis...',
    'Simulation complete. Emergent discoveries ready.',
  ];

  const run = async () => {
    if (!scenario.trim()) return;
    const logLines = buildLog();
    setStep('running'); setLog([]); setProgress(0); setResult(''); setConspiracyMap(null);
    for (let i = 0; i < logLines.length; i++) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 350));
      setLog(p => [...p, logLines[i]]);
      setProgress(Math.round((i + 1) / logLines.length * 100));
    }
    const conspCtx = conspiracyContext();
    const conspInstructions = conspire ? `

**Conspiracy Map** — REQUIRED when conspiracy engine is active. After your 5 narrative sections, output a JSON block EXACTLY as follows (no other text inside the block):
===CONSPIRACY_MAP===
{"vacuumTrigger":"what information gap triggered speculation","birthCluster":"which agent group first speculated and why","originalTheory":"the first theory that formed","mutations":[{"stage":1,"theory":"first mutation","driver":"what caused this mutation — fear/outrage/social pressure/whisper chain"},{"stage":2,"theory":"second mutation","driver":"..."},{"stage":3,"theory":"dominant theory at peak spread","driver":"..."}],"exploiters":[{"agent":"who","method":"how they weaponised it","gain":"what they gained"}],"correctors":[{"agent":"who tried to correct","approach":"their method","outcome":"backfire/partial success/ignored/successful"}],"backfireInstances":["specific moment where correction strengthened belief"],"dominantTheoryEnd":"what the majority of agents believed at simulation end","residualPct":23,"correctionAt":"round X or not injected","narrativeImplication":"one sentence — what this conspiracy dynamic means for the story's themes or plot"}
===END_MAP===` : '';
    try {
      const d = await callClaude({
          model: "claude-sonnet-4-20250514",
          max_tokens: conspire ? 1400 : 1000,
          system: `You are the ReportAgent of StoryForge's MiroFish-based narrative simulation. A swarm of ${agents} AI agents — each with independent personality, memory, and behaviour logic — just completed ${rounds} rounds of social simulation.
${asymm ? 'Information asymmetry was active: different agent tiers learned about events at different times.' : ''}
${chars.length > 0 ? `The simulation used ${chars.length} named character agents seeded from the writer's Story Bible.` : ''}
${conspCtx}

You must synthesise what EMERGED — not what was planned. Find what the writer didn't expect.

Respond with these 5 sections (use exact bold headers):
**What the agents did** — emergent social behaviour across agent groups (2-3 sentences)
**Unexpected alliances** — which character-types gravitated together and why, against expectation
**The plot path you didn't see** — one specific story development that emerged (concrete, specific)
**The character who surprised the simulation** — who behaved least like expected, and what it reveals
**The transformation moment** — Rushdie's test: what does this story transform the reader into understanding?

Under 400 words for these 5 sections. Dark, honest, specific.${conspInstructions}`,
          messages: [{ role: "user", content: `Story seed / agent profiles / world rules:\n${fullSeed || '(No seed material)'}\n\nScenario:\n${scenario}` }]
        });
      const raw = d.content?.[0]?.text || '';

      // Split conspiracy map from narrative
      const mapMatch = raw.match(/===CONSPIRACY_MAP===\s*([\s\S]*?)\s*===END_MAP===/);
      if (mapMatch) {
        try {
          const parsed = JSON.parse(mapMatch[1].trim());
          setConspiracyMap(parsed);
        } catch { /* malformed JSON — skip map */ }
      }
      setResult(raw.replace(/===CONSPIRACY_MAP===[\s\S]*?===END_MAP===/g, '').trim()
        || 'Simulation collapsed — no emergent output found.');
    } catch { setResult('Simulation engine error. Check your scenario and retry.'); }
    setStep('result');
  };

  // ── Checkbox component
  const Check = ({ val, set, label, sub, borderCol }) => (
    <div onClick={() => set(!val)} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', backgroundColor: C.bgCard, border: `1px solid ${val ? (borderCol||C.gold)+'55' : C.border}`, borderRadius: '6px', cursor: 'pointer' }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '3px', backgroundColor: val ? (borderCol||C.gold) : 'transparent', border: `1.5px solid ${val ? (borderCol||C.gold) : C.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
        {val && <span style={{ fontSize: '11px', color: C.bg, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
      </div>
      <div>
        <div style={{ fontSize: '12px', color: C.parch, marginBottom: sub ? '3px' : 0 }}>{label}</div>
        {sub && <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', lineHeight: '1.5' }}>{sub}</div>}
      </div>
    </div>
  );

  // ── Setup screen
  if (step === 'setup') return (
    <div style={{ padding: '24px', maxWidth: '660px', margin: '0 auto' }}>
      <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.purple}55`, borderRadius: '8px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: C.purpleLight, fontWeight: 'bold', marginBottom: '8px' }}>✦ The Simulation — what this actually does</div>
        <div style={{ fontSize: '12px', color: C.mutedLight, lineHeight: '1.8', fontFamily: 'system-ui' }}>
          Based on MiroFish — an open-source swarm intelligence engine. Your characters become {agents} autonomous agents with independent memory, personality, and behavioural logic. They interact across {rounds} simulated time-steps. The output is not what you planned — it's what <em style={{ color: C.parch }}>emerges</em> from thousands of micro-interactions.<br /><br />
          This is not an AI writing assistant. It's a <strong style={{ color: C.purpleLight }}>narrative physics engine</strong>. Writers use it to find the story they didn't know they were writing.
        </div>
      </div>

      {/* Agent seeds */}
      {chars.length > 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}44`, borderRadius: '7px', padding: '12px 14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Agent Seeds — from Story Bible</div>
            <span style={{ fontSize: '10px', color: C.purple, fontFamily: 'system-ui', backgroundColor: C.purple + '22', padding: '2px 8px', borderRadius: '8px' }}>{chars.length} characters loaded</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {chars.map(c => (
              <div key={c.id} style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.acc}44`, borderRadius: '4px', padding: '5px 10px' }}>
                <div style={{ fontSize: '11px', color: C.parch, fontWeight: 'bold' }}>{c.name}</div>
                <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui' }}>{c.role || c.species || 'character'}</div>
                {c.secrets && <div style={{ fontSize: '9px', color: C.accBright + '99', fontFamily: 'system-ui', marginTop: '2px' }}>has secrets ✦</div>}
              </div>
            ))}
          </div>
          {lore.length > 0 && <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginTop: '8px', borderTop: `1px solid ${C.border}`, paddingTop: '7px' }}>{lore.length} world rule{lore.length !== 1 ? 's' : ''} injected as simulation constraints</div>}
        </div>
      ) : (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.borderMid}`, borderRadius: '7px', padding: '12px 14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>No characters in Story Bible yet — simulation will run with generic agent archetypes.</div>
        </div>
      )}

      {/* Extra seed */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>Additional Seed Material <span style={{ textTransform: 'none', fontWeight: 'normal', letterSpacing: 'normal', color: C.muted + '88' }}>(optional)</span></div>
        <textarea value={extraSeed} onChange={e => setExtraSeed(e.target.value)} placeholder="Paste chapter summaries, plot notes, or any extra context..."
          style={{ width: '100%', minHeight: '80px', padding: '12px', backgroundColor: C.bgCard, border: `1px solid ${C.borderMid}`, borderRadius: '5px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }} />
      </div>

      {/* Scenario */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>Scenario / "What If" Question *</div>
        <textarea value={scenario} onChange={e => setScenario(e.target.value)} placeholder="e.g. 'What if the antagonist already had the artifact before the protagonist arrived?'"
          style={{ width: '100%', minHeight: '80px', padding: '12px', backgroundColor: C.bgCard, border: `1px solid ${scenario.trim() ? C.purple + '55' : C.borderMid}`, borderRadius: '5px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }} />
      </div>

      {/* Agent count + rounds */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        {[[agents, setAgents, 'Agent Count', 50, 800, 50, 'fast', 'deep'], [rounds, setRounds, 'Simulation Rounds', 10, 50, 5, '10', '50']].map(([val, setter, label, min, max, st, lo, hi]) => (
          <div key={label} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '7px' }}>{label}</div>
            <input type="range" min={min} max={max} step={st} value={val} onChange={e => setter(+e.target.value)} style={{ width: '100%', marginBottom: '4px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.mutedLight, fontFamily: 'system-ui' }}>
              <span>{lo}</span><span style={{ color: C.purpleLight, fontWeight: 500 }}>{val}{label.includes('Count') ? ' agents' : ' rounds'}</span><span>{hi}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Info Asymmetry toggle */}
      <div style={{ marginBottom: '10px' }}>
        <Check val={asymm} set={setAsymm} borderCol={C.gold}
          label="Information Asymmetry"
          sub="Different agent tiers learn about events at different times — Tier 1 (inner circle) within 1 hour, Tier 2 (connected) within 24 hours, Tier 3 (public) within 72 hours." />
      </div>

      {/* ── Conspiracy Engine ── */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ marginBottom: '8px' }}>
          <Check val={conspire} set={setConspire} borderCol={C.accBright}
            label="Conspiracy Engine"
            sub="Models how information gaps breed speculation — theories form, mutate, get exploited, resist correction. Generates a Conspiracy Map alongside the main simulation report." />
        </div>

        {conspire && (
          <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.acc}44`, borderRadius: '6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Intensity */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Conspiracy Intensity</div>
                <span style={{ fontSize: '11px', fontWeight: 500, color: INTENSITY_COL[cIntensity], fontFamily: 'system-ui' }}>{cIntensity} — {INTENSITY[cIntensity]}</span>
              </div>
              <input type="range" min="1" max="5" step="1" value={cIntensity} onChange={e => setCIntensity(+e.target.value)} style={{ width: '100%', marginBottom: '6px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: C.muted, fontFamily: 'system-ui' }}>
                {INTENSITY.slice(1).map((l, i) => <span key={i} style={{ color: i + 1 === cIntensity ? INTENSITY_COL[cIntensity] : C.muted }}>{l}</span>)}
              </div>
            </div>

            {/* Gap control */}
            <div>
              <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Information Gap Control</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {[['auto', 'Auto-detect', 'Engine finds gaps in seed material'], ['writer', 'I define the gaps', 'You specify what is deliberately unknown']].map(([id, lbl, desc]) => (
                  <button key={id} onClick={() => setCGapMode(id)} style={{ flex: 1, padding: '8px 10px', backgroundColor: cGapMode === id ? C.acc + '33' : 'transparent', color: cGapMode === id ? C.accBright : C.muted, border: `1px solid ${cGapMode === id ? C.acc + '66' : C.border}`, borderRadius: '5px', cursor: 'pointer', fontFamily: 'system-ui', textAlign: 'left' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '2px' }}>{lbl}</div>
                    <div style={{ fontSize: '9px', opacity: 0.7 }}>{desc}</div>
                  </button>
                ))}
              </div>
              {cGapMode === 'writer' && (
                <textarea value={cGaps} onChange={e => setCGaps(e.target.value)}
                  placeholder={"Define what most agents don't know:\ne.g. 'The true cause of the Blood Court's fall is unknown to 90% of agents — only The Witch knows.'\ne.g. 'The Crown's current location is known only to Tier 1 agents.'"}
                  style={{ width: '100%', minHeight: '80px', padding: '10px', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '4px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.6' }} />
              )}
            </div>

            {/* Correction mode */}
            <div>
              <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Truth Correction Mode</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[
                  ['auto',   'Simulation decides',     'Truth emerges organically — if and when agents discover it'],
                  ['timed',  'I set the round',        `Truth becomes available at round ${cCorrRound} — watch how it spreads vs. the conspiracy`],
                  ['manual', 'I inject manually',      'Truth is withheld for the full simulation — you control the reveal outside the engine'],
                ].map(([id, lbl, desc]) => (
                  <div key={id} onClick={() => setCCorrMode(id)} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 10px', backgroundColor: cCorrMode === id ? C.teal + '18' : 'transparent', border: `1px solid ${cCorrMode === id ? C.teal + '55' : C.border}`, borderRadius: '5px', cursor: 'pointer' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `2px solid ${cCorrMode === id ? C.teal : C.borderMid}`, backgroundColor: cCorrMode === id ? C.teal : 'transparent', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '11px', color: cCorrMode === id ? C.parch : C.mutedLight, fontFamily: 'system-ui', marginBottom: '1px' }}>{lbl}</div>
                      <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', lineHeight: '1.4' }}>{desc}</div>
                    </div>
                  </div>
                ))}
                {cCorrMode === 'timed' && (
                  <div style={{ padding: '8px 10px', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '5px', marginTop: '2px' }}>
                    <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginBottom: '6px' }}>Inject truth at round:</div>
                    <input type="range" min="1" max={rounds} step="1" value={Math.min(cCorrRound, rounds)} onChange={e => setCCorrRound(+e.target.value)} style={{ width: '100%', marginBottom: '4px' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.mutedLight, fontFamily: 'system-ui' }}>
                      <span>Round 1 (early)</span>
                      <span style={{ color: C.teal, fontWeight: 500 }}>Round {Math.min(cCorrRound, rounds)}</span>
                      <span>Round {rounds} (late)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      <button onClick={run} disabled={!scenario.trim()} style={{ width: '100%', padding: '13px', backgroundColor: scenario.trim() ? C.purple : C.bgCard, color: scenario.trim() ? '#fff' : C.muted, border: `1px solid ${scenario.trim() ? C.purple : C.border}`, borderRadius: '6px', fontSize: '14px', cursor: scenario.trim() ? 'pointer' : 'not-allowed', fontFamily: 'system-ui', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
        Launch Simulation →
      </button>
    </div>
  );

  // ── Running screen
  if (step === 'running') return (
    <div style={{ padding: '48px 24px', maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '15px', color: C.purpleLight, marginBottom: '5px' }}>Simulation Running</div>
      <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', marginBottom: '28px' }}>
        {agents} agents · {rounds} rounds · {asymm ? 'asymmetry ON' : 'asymmetry OFF'}{conspire ? ` · conspiracy ${INTENSITY[cIntensity]}` : ''}
      </div>
      <div style={{ height: '3px', backgroundColor: C.border, borderRadius: '2px', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', backgroundColor: C.purple, transition: 'width 0.4s ease', borderRadius: '2px' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
        {log.map((m, i) => (
          <div key={i} style={{ fontSize: '11px', color: i === log.length - 1 ? C.purpleLight : C.muted + '77', fontFamily: 'system-ui', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: i === log.length - 1 ? C.accBright : C.purple, fontSize: '8px', flexShrink: 0 }}>{i === log.length - 1 ? '▶' : '✓'}</span>
            {m}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Result screen
  const CM = conspiracyMap;
  return (
    <div style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '15px', color: C.purpleLight, fontWeight: 500 }}>Simulation Complete</div>
          <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginTop: '2px' }}>
            {agents} agents · {rounds} rounds · {asymm ? 'asymmetric' : 'symmetric'} info{CM ? ` · conspiracy map generated` : ''}
          </div>
        </div>
        <button onClick={() => { setStep('setup'); setResult(''); setLog([]); setProgress(0); setConspiracyMap(null); }}
          style={{ padding: '6px 14px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>New Simulation</button>
      </div>

      {/* Narrative report */}
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}55`, borderRadius: '7px', padding: '18px 20px', marginBottom: '14px' }}>
        <div style={{ fontSize: '9px', color: C.purple, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '14px' }}>ReportAgent — Emergent Narrative Analysis</div>
        <div style={{ fontSize: '13px', color: C.parch, lineHeight: '2', fontFamily: 'Georgia,serif' }}>
          {result.split('\n').map((line, i) => {
            const bold = line.match(/^\*\*(.*?)\*\*/);
            if (bold) return <div key={i} style={{ color: C.purpleLight, fontWeight: 'bold', marginTop: '14px', marginBottom: '4px', fontSize: '12px', fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{bold[1]}</div>;
            return line.trim() ? <p key={i} style={{ margin: '0 0 8px 0' }}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p> : null;
          })}
        </div>
      </div>

      {/* ── Conspiracy Map ── */}
      {CM && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.accBright}44`, borderRadius: '7px', padding: '18px 20px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', color: C.accBright, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Conspiracy Map</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {CM.correctionAt && CM.correctionAt !== 'not injected' && (
                <span style={{ fontSize: '9px', color: C.teal, fontFamily: 'system-ui', backgroundColor: C.teal + '22', padding: '2px 8px', borderRadius: '8px' }}>truth injected {CM.correctionAt}</span>
              )}
              {CM.residualPct !== undefined && (
                <span style={{ fontSize: '9px', color: C.accBright, fontFamily: 'system-ui', backgroundColor: C.acc + '22', padding: '2px 8px', borderRadius: '8px' }}>{CM.residualPct}% residual believers</span>
              )}
            </div>
          </div>

          {/* Vacuum + Birth */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{ backgroundColor: C.bgElevated, borderRadius: '5px', padding: '10px 12px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Information Vacuum</div>
              <div style={{ fontSize: '12px', color: C.parch, lineHeight: '1.5', fontStyle: 'italic' }}>{CM.vacuumTrigger}</div>
            </div>
            <div style={{ backgroundColor: C.bgElevated, borderRadius: '5px', padding: '10px 12px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Birth Cluster</div>
              <div style={{ fontSize: '12px', color: C.parch, lineHeight: '1.5', fontStyle: 'italic' }}>{CM.birthCluster}</div>
            </div>
          </div>

          {/* Mutation chain */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Theory Mutation Chain</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {/* Original */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: C.teal + '33', border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: C.teal, fontFamily: 'system-ui', fontWeight: 'bold' }}>0</div>
                  <div style={{ width: '2px', flex: 1, backgroundColor: C.border, minHeight: '20px' }} />
                </div>
                <div style={{ flex: 1, paddingBottom: '12px' }}>
                  <div style={{ fontSize: '9px', color: C.teal, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>Original Theory</div>
                  <div style={{ fontSize: '12px', color: C.parch, fontStyle: 'italic', lineHeight: '1.5' }}>{CM.originalTheory}</div>
                </div>
              </div>
              {/* Mutations */}
              {(CM.mutations || []).map((m, i) => {
                const isLast = i === CM.mutations.length - 1;
                const col = i === 0 ? C.gold : i === 1 ? '#c06030' : C.accBright;
                return (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: col + '33', border: `2px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: col, fontFamily: 'system-ui', fontWeight: 'bold' }}>{m.stage}</div>
                      {!isLast && <div style={{ width: '2px', flex: 1, backgroundColor: C.border, minHeight: '20px' }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: isLast ? '0' : '12px' }}>
                      <div style={{ fontSize: '9px', color: col, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{m.driver}</div>
                      <div style={{ fontSize: '12px', color: C.parch, fontStyle: 'italic', lineHeight: '1.5' }}>{m.theory}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exploiters + Correctors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '9px', color: C.accBright, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Exploiters</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(CM.exploiters || []).length === 0
                  ? <div style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui' }}>None detected</div>
                  : (CM.exploiters || []).map((e, i) => (
                    <div key={i} style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.acc}33`, borderRadius: '4px', padding: '7px 10px' }}>
                      <div style={{ fontSize: '11px', color: C.accBright, fontWeight: 'bold', marginBottom: '2px' }}>{e.agent}</div>
                      <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginBottom: '2px' }}>{e.method}</div>
                      <div style={{ fontSize: '10px', color: C.gold, fontFamily: 'system-ui', fontStyle: 'italic' }}>Gained: {e.gain}</div>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '9px', color: C.teal, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Correctors & Backfire</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(CM.correctors || []).length === 0
                  ? <div style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui' }}>None attempted</div>
                  : (CM.correctors || []).map((c, i) => {
                    const outcomeCol = c.outcome?.includes('backfire') ? C.accBright : c.outcome?.includes('success') ? C.green : C.gold;
                    return (
                      <div key={i} style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.teal}33`, borderRadius: '4px', padding: '7px 10px' }}>
                        <div style={{ fontSize: '11px', color: C.teal, fontWeight: 'bold', marginBottom: '2px' }}>{c.agent}</div>
                        <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginBottom: '2px' }}>{c.approach}</div>
                        <div style={{ fontSize: '10px', color: outcomeCol, fontFamily: 'system-ui', fontStyle: 'italic' }}>{c.outcome}</div>
                      </div>
                    );
                  })}
                {(CM.backfireInstances || []).length > 0 && (
                  <div style={{ backgroundColor: C.acc + '18', border: `1px solid ${C.acc}33`, borderRadius: '4px', padding: '7px 10px' }}>
                    <div style={{ fontSize: '9px', color: C.accBright, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Backfire recorded</div>
                    {CM.backfireInstances.map((b, i) => (
                      <div key={i} style={{ fontSize: '10px', color: C.parch, fontStyle: 'italic', lineHeight: '1.4', marginBottom: '2px' }}>{b}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Final state */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Dominant Theory at Simulation End</div>
              <div style={{ fontSize: '12px', color: C.accBright, fontStyle: 'italic', lineHeight: '1.5' }}>{CM.dominantTheoryEnd}</div>
            </div>
            {CM.residualPct !== undefined && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Residual Believers</div>
                  <span style={{ fontSize: '11px', color: C.accBright, fontFamily: 'system-ui', fontWeight: 500 }}>{CM.residualPct}%</span>
                </div>
                <div style={{ height: '4px', backgroundColor: C.border, borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${CM.residualPct}%`, height: '100%', backgroundColor: C.accBright, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', marginTop: '3px' }}>percentage of agents who never updated their belief even after truth became available</div>
              </div>
            )}
            {CM.narrativeImplication && (
              <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.gold}33`, borderRadius: '4px', padding: '9px 12px' }}>
                <div style={{ fontSize: '9px', color: C.gold, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Narrative Implication</div>
                <div style={{ fontSize: '12px', color: C.gold, fontStyle: 'italic', lineHeight: '1.5' }}>{CM.narrativeImplication}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '10px 14px', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '5px' }}>
        <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Scenario</div>
        <div style={{ fontSize: '12px', color: C.mutedLight, fontStyle: 'italic' }}>{scenario}</div>
      </div>
    </div>
  );
}

/* ── RELATIONSHIP WEB ── */
function RelationshipWeb({ chars }) {
  const svgRef = useRef(null);
  const W = 820, H = 520;

  // Auto-position characters in a circle
  const initNodes = (characters) => characters.map((c, i) => {
    const angle = (i / characters.length) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(180, 60 + characters.length * 22);
    return { id: c.id, label: c.name, role: c.role, species: c.species, x: W/2 + Math.cos(angle)*r, y: H/2 + Math.sin(angle)*r };
  });

  const [nodes, setNodes] = useState(() => initNodes(chars));
  const [edges, setEdges] = useState([]);
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

  // Sync new characters added to the Bible
  useEffect(() => {
    setNodes(prev => {
      const existing = new Set(prev.map(n => n.id));
      const newOnes = chars.filter(c => !existing.has(c.id));
      if (newOnes.length === 0) return prev;
      const allCount = prev.length + newOnes.length;
      return [
        ...prev,
        ...newOnes.map((c, i) => {
          const idx = prev.length + i;
          const angle = (idx / allCount) * Math.PI * 2 - Math.PI / 2;
          const r = Math.min(180, 60 + allCount * 22);
          return { id: c.id, label: c.name, role: c.role, species: c.species, x: W/2 + Math.cos(angle)*r, y: H/2 + Math.sin(angle)*r };
        })
      ];
    });
  }, [chars]);

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
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
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
            {/* Edges */}
            {edges.map(e => {
              const f = nodes.find(n=>n.id===e.from), t = nodes.find(n=>n.id===e.to);
              if (!f||!t) return null;
              const col = relColor(e.type);
              const mx=(f.x+t.x)/2, my=(f.y+t.y)/2;
              const isHover = hoverEdge===e.id;
              return (
                <g key={e.id} onMouseEnter={()=>setHoverEdge(e.id)} onMouseLeave={()=>setHoverEdge(null)}
                  style={{cursor:'pointer'}} onClick={()=>isHover&&deleteEdge(e.id)}>
                  {/* Thick invisible hit target */}
                  <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth="12"/>
                  {/* Visible line */}
                  <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                    stroke={col} strokeWidth={isHover?2.5:1.5} opacity={isHover?1:0.55}
                    markerEnd={`url(#arr-${e.type})`} strokeDasharray={e.type==='unknown'?'5,4':'none'}/>
                  {/* Label */}
                  <rect x={mx-32} y={my-9} width="64" height="16" rx="3" fill={C.bgDeep} opacity="0.88"/>
                  <text x={mx} y={my+4} textAnchor="middle" fontSize="9" fill={isHover?col:C.mutedLight} fontFamily="system-ui">
                    {isHover?'click to remove':e.label}
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
function Timeline() {
  const [chs, setChs] = useState([]);
  const [flags, setFlags] = useState([]);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({title:'',pov:'',summary:'',tension:5,status:'planned'});
  const [flagInput, setFlagInput] = useState('');
  const [flagCh, setFlagCh] = useState('');
  const [addFlag, setAddFlag] = useState(false);
  const sc = {complete:C.green,current:C.accBright,planned:C.muted};

  return (
    <div style={{padding:'20px',maxWidth:'720px',margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
        <h2 style={{margin:0,fontSize:'16px'}}>Timeline</h2>
        <button onClick={()=>setAdding(true)} style={{padding:'5px 14px',backgroundColor:C.teal+'33',color:C.teal,border:`1px solid ${C.teal}55`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>+ Add Chapter</button>
      </div>

      {adding&&(
        <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.teal}55`,borderRadius:'7px',padding:'14px',marginBottom:'12px'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:'0 10px',marginBottom:'8px'}}>
            {[['Title','title','Chapter title...'],['POV','pov','Character name...']].map(([l,k,p])=>(
              <div key={k}>
                <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>{l}</div>
                <input value={nc[k]} onChange={e=>setNc(p2=>({...p2,[k]:e.target.value}))} placeholder={p}
                  style={{width:'100%',padding:'6px 9px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',boxSizing:'border-box'}}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>Status</div>
              <select value={nc.status} onChange={e=>setNc(p=>({...p,status:e.target.value}))} style={{width:'100%',padding:'6px 9px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'system-ui',boxSizing:'border-box'}}>
                <option value="planned">Planned</option><option value="current">In Progress</option><option value="complete">Complete</option>
              </select>
            </div>
          </div>
          <div style={{marginBottom:'8px'}}>
            <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>Summary</div>
            <textarea value={nc.summary} onChange={e=>setNc(p=>({...p,summary:e.target.value}))} placeholder="What happens..."
              style={{width:'100%',minHeight:'50px',padding:'7px 9px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',resize:'vertical',boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:'10px'}}>
            <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>Tension: {nc.tension}/10</div>
            <input type="range" min="1" max="10" step="1" value={nc.tension} onChange={e=>setNc(p=>({...p,tension:+e.target.value}))} style={{width:'100%'}}/>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={()=>{if(!nc.title.trim())return;setChs(p=>[...p,{...nc,id:genId(),num:p.length+1}]);setNc({title:'',pov:'',summary:'',tension:5,status:'planned'});setAdding(false);}} style={{padding:'6px 16px',backgroundColor:C.teal,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Save Chapter</button>
            <button onClick={()=>setAdding(false)} style={{padding:'6px 12px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
          </div>
        </div>
      )}

      {chs.length===0&&!adding&&<div style={{backgroundColor:C.bgCard,border:`1px dashed ${C.borderMid}`,borderRadius:'7px',padding:'24px',textAlign:'center',marginBottom:'20px'}}><div style={{fontSize:'12px',color:C.muted+'88',fontFamily:'system-ui',fontStyle:'italic'}}>No chapters yet. Add your story structure here.<br/>Tension levels visualise your narrative arc.</div></div>}

      {chs.length>0&&(
        <div style={{backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderRadius:'6px',padding:'14px',marginBottom:'14px'}}>
          <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'8px'}}>Tension Arc</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:'4px',height:'56px'}}>
            {chs.map(c=><div key={c.id} title={`Ch.${c.num}: ${c.title}`} style={{flex:1,height:`${c.tension*5}px`,backgroundColor:sc[c.status]||C.muted,borderRadius:'2px 2px 0 0',opacity:0.85}}/>)}
          </div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'24px'}}>
        {chs.map(c=>(
          <div key={c.id} style={{backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderLeft:`3px solid ${sc[c.status]||C.muted}`,borderRadius:'0 5px 5px 0',padding:'10px 14px',display:'flex',gap:'12px',alignItems:'center'}}>
            <div style={{fontSize:'18px',fontWeight:'bold',color:'#2a2025',minWidth:'22px',textAlign:'right',fontFamily:'system-ui'}}>{c.num}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:'13px'}}>{c.title}</div>
              {c.summary&&<div style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',marginTop:'2px',lineHeight:'1.4'}}>{c.summary}</div>}
            </div>
            <div style={{display:'flex',gap:'5px',flexShrink:0}}>
              {c.pov&&<span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',backgroundColor:C.tagBg,padding:'2px 6px',borderRadius:'3px'}}>POV: {c.pov}</span>}
              <span style={{fontSize:'10px',padding:'2px 8px',borderRadius:'10px',backgroundColor:(sc[c.status]||C.muted)+'22',color:sc[c.status]||C.muted,fontFamily:'system-ui'}}>{c.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
          <h3 style={{margin:0,fontSize:'14px'}}>Continuity Flags</h3>
          <button onClick={()=>setAddFlag(true)} style={{padding:'4px 12px',backgroundColor:C.gold+'22',color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>+ Flag</button>
        </div>
        {addFlag&&(
          <div style={{backgroundColor:C.bgElevated,border:`1px solid ${C.gold}55`,borderRadius:'6px',padding:'10px 12px',marginBottom:'8px',display:'flex',gap:'8px'}}>
            <input value={flagInput} onChange={e=>setFlagInput(e.target.value)} placeholder="Continuity issue or unresolved thread..."
              style={{flex:3,padding:'6px 9px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif'}}/>
            <input value={flagCh} onChange={e=>setFlagCh(e.target.value)} placeholder="Ch. ref..."
              style={{flex:1,padding:'6px 9px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'4px',color:C.parch,fontSize:'11px',outline:'none',fontFamily:'system-ui'}}/>
            <button onClick={()=>{if(flagInput.trim()){setFlags(p=>[...p,{id:genId(),text:flagInput,ch:flagCh}]);setFlagInput('');setFlagCh('');setAddFlag(false);}}} style={{padding:'6px 12px',backgroundColor:C.gold,color:C.bg,border:'none',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>Add</button>
          </div>
        )}
        {flags.length===0&&!addFlag&&<div style={{fontSize:'11px',color:C.muted+'77',fontStyle:'italic',fontFamily:'system-ui'}}>No flags yet. Track continuity issues and unresolved plot threads here.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
          {flags.map(f=>(
            <div key={f.id} style={{display:'flex',gap:'10px',padding:'8px 10px',backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`,borderRadius:'0 4px 4px 0'}}>
              <div style={{flex:1,fontSize:'11px',color:C.mutedLight,fontStyle:'italic',lineHeight:'1.5'}}>{f.text}</div>
              {f.ch&&<span style={{fontSize:'9px',color:C.gold,fontFamily:'system-ui',backgroundColor:'#2a1e04',padding:'2px 6px',borderRadius:'3px',whiteSpace:'nowrap',alignSelf:'flex-start'}}>{f.ch}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── QUICK CAPTURE ── */
function Capture() {
  const [notes, setNotes] = useState([]);
  const [input, setInput] = useState('');
  const [tag, setTag] = useState('idea');
  const TAGS = [
    {id:'idea',label:'Idea',color:C.purple},
    {id:'ugly',label:'Ugly Detail ★',color:C.gold},
    {id:'avoid',label:"What I'm Avoiding",color:C.accBright},
    {id:'voice',label:'Voice Moment',color:C.teal},
    {id:'cut',label:'Cut — Keep?',color:C.muted},
  ];
  const save = () => {
    if(!input.trim())return;
    setNotes(p=>[{id:genId(),text:input.trim(),tag,time:'Just now'},...p]);
    setInput('');
  };
  const td = (id) => TAGS.find(t=>t.id===id)||TAGS[0];

  return (
    <div style={{padding:'20px',maxWidth:'620px',margin:'0 auto'}}>
      <div style={{fontSize:'12px',color:C.muted,fontFamily:'system-ui',fontStyle:'italic',marginBottom:'18px',lineHeight:'1.6',borderLeft:`2px solid ${C.gold}55`,paddingLeft:'12px'}}>
        Sedaris: "The detail you're tempted to leave out is usually the one that makes the piece work." · Tan: "What are you most afraid to put on the page? Write that." · This is your fast-capture drawer — no judgment, no structure, just catch it before it disappears.
      </div>

      <div style={{backgroundColor:C.bgCard,border:`1px solid ${C.borderMid}`,borderRadius:'7px',padding:'14px',marginBottom:'16px'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginBottom:'10px'}}>
          {TAGS.map(t=>(
            <button key={t.id} onClick={()=>setTag(t.id)} style={{padding:'4px 10px',backgroundColor:tag===t.id?t.color+'33':'transparent',color:tag===t.id?t.color:C.muted,border:`1px solid ${tag===t.id?t.color+'66':C.border}`,borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>{t.label}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Catch it before it vanishes..."
            onKeyDown={e=>{if(e.key==='Enter'&&e.metaKey)save();}}
            style={{flex:1,minHeight:'56px',padding:'8px 10px',backgroundColor:C.bg,border:`1px solid ${C.border}`,borderRadius:'4px',color:C.parch,fontSize:'13px',outline:'none',fontFamily:'Georgia,serif',resize:'none',lineHeight:'1.5'}}/>
          <button onClick={save} style={{padding:'8px 16px',backgroundColor:C.purple,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui',alignSelf:'flex-end'}}>Save</button>
        </div>
        <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',marginTop:'4px'}}>⌘+Enter to save</div>
      </div>

      {notes.length===0&&<div style={{fontSize:'12px',color:C.muted+'77',fontStyle:'italic',fontFamily:'system-ui'}}>Nothing captured yet.</div>}
      <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
        {notes.map(n=>{
          const t=td(n.tag);
          return (
            <div key={n.id} style={{backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderLeft:`3px solid ${t.color}`,borderRadius:'0 5px 5px 0',padding:'10px 14px',display:'flex',gap:'10px',alignItems:'flex-start'}}>
              <span style={{fontSize:'9px',padding:'2px 7px',borderRadius:'3px',backgroundColor:t.color+'22',color:t.color,fontFamily:'system-ui',whiteSpace:'nowrap',marginTop:'1px',flexShrink:0}}>{t.label}</span>
              <div style={{flex:1,fontSize:'13px',color:C.mutedLight,fontStyle:'italic',lineHeight:'1.6'}}>{n.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── IMPORT & ANALYSE ── */
function ImportAnalyse() {
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [chatText, setChatText] = useState('');
  const [inputMode, setInputMode] = useState('paste'); // paste | file
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState('');
  const [blueprint, setBlueprint] = useState(null);
  const [activeSection, setActiveSection] = useState('characters');
  const [dragOver, setDragOver] = useState(false);

  const [fileErrors, setFileErrors] = useState([]);

  // In Electron: native file dialog reads directly from disk (Node/mammoth/pdf-parse)
  // In browser: classic FileReader + browser mammoth fallback
  const openElectronFiles = async () => {
    const results = await window.electronAPI.readFiles();
    const ok = results.filter(r => !r.error);
    const errs = results.filter(r => r.error).map(r => `${r.name}: ${r.error}`);
    if (errs.length) setFileErrors(prev => [...prev, ...errs]);
    setFiles(prev => [...prev, ...ok]);
  };

  const readFileBrowser = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'txt' || ext === 'md') {
        return await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res({ name: file.name, content: e.target.result, size: file.size, type: ext });
          r.onerror = rej;
          r.readAsText(file);
        });
      }
      if (ext === 'docx') {
        // Dynamic import mammoth only in browser mode
        const mammoth = (await import('mammoth')).default;
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return { name: file.name, content: result.value, size: file.size, type: 'docx' };
      }
      return null;
    } catch (err) {
      setFileErrors(prev => [...prev, `${file.name}: ${err.message}`]);
      return null;
    }
  };

  const ACCEPTED = ['.txt', '.md', '.docx', '.pdf'];
  const isAccepted = (f) => ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext));

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    if (isElectron()) { openElectronFiles(); return; }
    const dropped = Array.from(e.dataTransfer.files).filter(isAccepted);
    const read = (await Promise.all(dropped.map(readFileBrowser))).filter(Boolean);
    setFiles(prev => [...prev, ...read]);
  };

  const handleFileInput = async (e) => {
    if (isElectron()) { openElectronFiles(); return; }
    const picked = Array.from(e.target.files).filter(isAccepted);
    const read = (await Promise.all(picked.map(readFileBrowser))).filter(Boolean);
    setFiles(prev => [...prev, ...read]);
  };

  const getContent = () => {
    if (inputMode === 'file') return files.map(f => `=== FILE: ${f.name} ===\n${f.content}`).join('\n\n');
    return chatText;
  };

  const STEPS = [
    'Reading content and detecting conversation structure...',
    'Identifying all characters — named, implied, and referenced...',
    'Extracting world rules, magic systems, and lore constraints...',
    'Mapping established plot events and timeline...',
    'Detecting unexplored paths and "explore later" threads...',
    'Pulling backstory fragments — explicit and implied...',
    'Identifying foreshadowing and planted seeds...',
    'Extracting unresolved threads and open questions...',
    'Mapping character relationships and dynamics...',
    'Detecting the writer\'s fears — what\'s being circled but not written...',
    'Synthesising full story blueprint...',
  ];

  const analyse = async () => {
    const content = getContent();
    if (!content.trim()) return;
    setAnalysing(true); setBlueprint(null);
    for (let i = 0; i < STEPS.length; i++) {
      setProgress(STEPS[i]);
      await new Promise(r => setTimeout(r, 500 + Math.random() * 350));
    }
    try {
      const data = await callClaude({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: `You are a master story analyst and narrative architect. You have been given raw content from a writer — this may be a manuscript draft, writing notes, an AI chat transcript where the writer was developing their story, or a mix of all three.

Your job is to extract a complete story blueprint from this raw material. Writers lose track of what was established, what was promised to the reader, what paths were discussed but abandoned, what backstory exists, and what the story is actually about beneath the surface.

Respond ONLY with a valid JSON object. No preamble, no markdown fences. The JSON must have exactly these keys:

{
  "storyCore": "1-2 sentences: what this story is fundamentally about — not the plot, the human truth underneath",
  "characters": [
    {
      "name": "character name",
      "role": "their function in the story",
      "established": "what is definitively known about them from this content",
      "secrets": "what seems hidden or implied but not stated",
      "arc": "what transformation or journey seems to be set up for them",
      "contradictions": "tensions within this character that the writer may not have fully noticed"
    }
  ],
  "worldRules": ["each established rule, constraint, or lore fact as a plain string"],
  "plotEvents": [
    { "event": "what happened", "chapter": "reference if known", "significance": "why this matters" }
  ],
  "unexploredPaths": [
    {
      "path": "the unexplored thread or direction",
      "source": "where it was mentioned or implied",
      "potential": "why this is worth pursuing — what it could unlock in the story"
    }
  ],
  "backstory": ["each backstory fragment as a plain string — explicit or strongly implied"],
  "foreshadowing": [
    { "plant": "what was planted", "possiblePayoff": "what it might be building toward" }
  ],
  "unresolvedThreads": [
    { "thread": "the unresolved element", "urgency": "high/medium/low", "note": "what needs to be decided" }
  ],
  "relationships": [
    { "between": "Character A & Character B", "dynamic": "the nature of their relationship", "tension": "the underlying tension or complication" }
  ],
  "writersFear": "Amy Tan's diagnostic: what is the writer consistently circling but not directly writing? What seems to be the thing they are most afraid to put on the page?",
  "nextSteps": ["3-5 concrete, specific story decisions the writer should make next, in order of priority"]
}

Extract only what is genuinely present or strongly implied in the content. Do not invent. If a field has nothing to extract, use an empty array or a note saying "not found in material".`,
          messages: [{ role: "user", content: `Analyse this story content:\n\n${content.slice(0, 8000)}` }]
        });
      const text = data.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      setBlueprint(JSON.parse(clean));
    } catch (e) {
      setBlueprint({ error: 'Analysis failed. Try reducing the content length or check your input.' });
    }
    setAnalysing(false); setProgress('');
  };

  const SECTIONS = [
    { id: 'characters', label: 'Characters', count: blueprint?.characters?.length },
    { id: 'unexplored', label: 'Unexplored Paths', count: blueprint?.unexploredPaths?.length },
    { id: 'threads', label: 'Unresolved Threads', count: blueprint?.unresolvedThreads?.length },
    { id: 'world', label: 'World Rules', count: blueprint?.worldRules?.length },
    { id: 'foreshadowing', label: 'Foreshadowing', count: blueprint?.foreshadowing?.length },
    { id: 'backstory', label: 'Backstory', count: blueprint?.backstory?.length },
    { id: 'relationships', label: 'Relationships', count: blueprint?.relationships?.length },
    { id: 'nextsteps', label: 'Next Steps', count: blueprint?.nextSteps?.length },
  ];

  const Tag = ({ text, color }) => (
    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: color + '22', color, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>{text}</span>
  );

  if (blueprint && !blueprint.error) return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '200px', flexShrink: 0, backgroundColor: C.bgDeep, borderRight: `1px solid ${C.border}`, padding: '16px 0', overflow: 'auto' }}>
        {blueprint.storyCore && (
          <div style={{ padding: '0 14px 14px', borderBottom: `1px solid ${C.border}`, marginBottom: '8px' }}>
            <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>Story Core</div>
            <div style={{ fontSize: '11px', color: C.gold, fontStyle: 'italic', lineHeight: '1.5' }}>{blueprint.storyCore}</div>
          </div>
        )}
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderLeft: `2px solid ${activeSection === s.id ? C.purpleLight : 'transparent'}`, backgroundColor: activeSection === s.id ? C.purple + '18' : 'transparent', color: activeSection === s.id ? C.purpleLight : C.muted, fontSize: '12px', cursor: 'pointer', fontFamily: 'system-ui', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {s.label}
            {s.count > 0 && <span style={{ fontSize: '10px', backgroundColor: activeSection === s.id ? C.purple + '44' : C.tagBg, color: activeSection === s.id ? C.purpleLight : C.muted, padding: '1px 6px', borderRadius: '8px' }}>{s.count}</span>}
          </button>
        ))}
        <div style={{ padding: '14px 14px 0', borderTop: `1px solid ${C.border}`, marginTop: '8px' }}>
          <button onClick={() => { setBlueprint(null); setChatText(''); setFiles([]); }}
            style={{ width: '100%', padding: '7px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>New Analysis</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {activeSection === 'characters' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Characters Identified</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(blueprint.characters || []).map((c, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', color: C.parch }}>{c.name}</span>
                    <Tag text={c.role} color={C.acc} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[['Established', c.established, C.mutedLight], ['Arc Set Up', c.arc, C.teal], ['Secrets / Implied', c.secrets, C.accBright], ['Contradictions', c.contradictions, C.purpleLight]].map(([l, v, col]) => v && v !== 'not found in material' ? (
                      <div key={l}>
                        <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>{l}</div>
                        <div style={{ fontSize: '12px', color: col, fontStyle: 'italic', lineHeight: '1.5' }}>{v}</div>
                      </div>
                    ) : null)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'unexplored' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Unexplored Paths</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>Threads discussed, implied, or promised that were never written — your hidden story reserves.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(blueprint.unexploredPaths || []).map((p, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.gold}33`, borderLeft: `3px solid ${C.gold}`, borderRadius: '0 6px 6px 0', padding: '12px 16px' }}>
                  <div style={{ fontSize: '13px', color: C.parch, marginBottom: '6px', fontWeight: 'bold' }}>{p.path}</div>
                  <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', marginBottom: '6px' }}>Found in: <span style={{ color: C.mutedLight, fontStyle: 'italic' }}>{p.source}</span></div>
                  <div style={{ fontSize: '12px', color: C.gold, fontStyle: 'italic', lineHeight: '1.5' }}>{p.potential}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'threads' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Unresolved Threads</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(blueprint.unresolvedThreads || []).map((t, i) => {
                const uc = { high: C.accBright, medium: C.gold, low: C.muted }[t.urgency] || C.muted;
                return (
                  <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <Tag text={t.urgency || 'medium'} color={uc} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: C.parch, marginBottom: '4px' }}>{t.thread}</div>
                      {t.note && <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>{t.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeSection === 'world' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>World Rules Extracted</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {(blueprint.worldRules || []).map((r, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: '0 5px 5px 0', padding: '10px 14px', fontSize: '12px', color: C.mutedLight, fontStyle: 'italic', lineHeight: '1.5' }}>{r}</div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'foreshadowing' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Foreshadowing & Planted Seeds</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>Things planted in the story that are building toward something — don't forget to pay these off.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {(blueprint.foreshadowing || []).map((f, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Planted</div>
                  <div style={{ fontSize: '13px', color: C.parch, marginBottom: '8px' }}>{f.plant}</div>
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Possible Payoff</div>
                  <div style={{ fontSize: '12px', color: C.teal, fontStyle: 'italic' }}>{f.possiblePayoff}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'backstory' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Backstory Fragments</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {(blueprint.backstory || []).map((b, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: '0 5px 5px 0', padding: '10px 14px', fontSize: '12px', color: C.mutedLight, fontStyle: 'italic', lineHeight: '1.5' }}>{b}</div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'relationships' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Character Relationships</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {(blueprint.relationships || []).map((r, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '14px', color: C.parch, marginBottom: '5px', fontWeight: 'bold' }}>{r.between}</div>
                  <div style={{ fontSize: '12px', color: C.mutedLight, marginBottom: '5px', fontStyle: 'italic' }}>{r.dynamic}</div>
                  {r.tension && <div style={{ fontSize: '11px', color: C.accBright, fontFamily: 'system-ui' }}>Tension: {r.tension}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'nextsteps' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Next Steps</h2>
            {blueprint.writersFear && (
              <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.acc}44`, borderRadius: '6px', padding: '12px 16px', marginBottom: '18px' }}>
                <div style={{ fontSize: '9px', color: C.acc, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>Amy Tan's Diagnostic — What You're Avoiding</div>
                <div style={{ fontSize: '12px', color: C.accBright, fontStyle: 'italic', lineHeight: '1.6' }}>{blueprint.writersFear}</div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(blueprint.nextSteps || []).map((s, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 16px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: C.purple + '55', fontFamily: 'system-ui', minWidth: '24px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ fontSize: '13px', color: C.parch, lineHeight: '1.6', paddingTop: '2px' }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Import & Analyse</h2>
        <p style={{ margin: 0, fontSize: '12px', color: C.muted, fontFamily: 'system-ui', lineHeight: '1.7', fontStyle: 'italic' }}>
          Paste a chat transcript where you were developing this story, upload your manuscript or notes, and the engine will extract a full story blueprint — characters, unexplored paths, backstory, foreshadowing, unresolved threads, and what you're unconsciously avoiding writing.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '18px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '4px', width: 'fit-content' }}>
        {[['paste', 'Paste Chat / Text'], ['file', 'Upload Files']].map(([id, label]) => (
          <button key={id} onClick={() => setInputMode(id)}
            style={{ padding: '6px 18px', backgroundColor: inputMode === id ? C.bgElevated : 'transparent', color: inputMode === id ? C.parch : C.muted, border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontFamily: 'system-ui', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {inputMode === 'paste' && (
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>Chat Transcript or Story Notes</div>
          <div style={{ fontSize: '10px', color: C.muted + '88', fontFamily: 'system-ui', marginBottom: '8px', fontStyle: 'italic' }}>
            Paste your AI chat transcript, writing session notes, brainstorming documents, or any raw story material. Export a Claude chat as text from the chat menu, or copy-paste directly.
          </div>
          <textarea value={chatText} onChange={e => setChatText(e.target.value)}
            placeholder={"Paste chat transcript here...\n\nThis can be:\n• A Claude / ChatGPT conversation where you developed your story\n• Raw writing notes or a brainstorm document\n• Draft chapters or scene outlines\n• World-building notes\n\nThe messier and more raw, the better — that's where the real story lives."}
            style={{ width: '100%', minHeight: '220px', padding: '14px', backgroundColor: C.bgCard, border: `1px solid ${C.borderMid}`, borderRadius: '6px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.7' }} />
          {chatText.length > 0 && (
            <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginTop: '5px', textAlign: 'right' }}>{chatText.length.toLocaleString()} characters · ~{Math.round(chatText.length / 4).toLocaleString()} tokens</div>
          )}
        </div>
      )}

      {inputMode === 'file' && (
        <div style={{ marginBottom: '18px' }}>
          <div
            onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            style={{ border: `1.5px dashed ${dragOver ? C.purpleLight : C.borderMid}`, borderRadius: '8px', padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: dragOver ? C.purple + '11' : 'transparent', transition: 'all 0.2s', marginBottom: '12px' }}>
            <div style={{ fontSize: '26px', marginBottom: '10px', color: C.muted }}>↑</div>
            <div style={{ fontSize: '13px', color: C.mutedLight, marginBottom: '8px' }}>Drop files here or click to browse</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {[
                ['.txt',  C.teal],
                ['.md',   C.blue],
                ['.docx', C.purple],
                ['.pdf',  C.accBright],
              ].map(([ext, col]) => (
                <span key={ext} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: col + '22', color: col, fontFamily: 'system-ui', border: `1px solid ${col}44` }}>{ext}</span>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" multiple onChange={handleFileInput} style={{ display: 'none' }} />
          </div>
          {fileErrors.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              {fileErrors.map((err, i) => (
                <div key={i} style={{ fontSize: '11px', color: C.accBright, fontFamily: 'system-ui', padding: '5px 10px', backgroundColor: C.acc + '18', borderRadius: '4px', marginBottom: '4px' }}>⚠ {err}</div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {files.map((f, i) => {
                const typeCol = { txt: C.teal, md: C.blue, docx: C.purple, pdf: C.accBright }[f.type] || C.muted;
                return (
                  <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '5px', padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '3px', backgroundColor: typeCol + '22', color: typeCol, fontFamily: 'system-ui', flexShrink: 0, border: `1px solid ${typeCol}44` }}>.{f.type}</span>
                      <span style={{ fontSize: '12px', color: C.parch, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
                      {f.pages && <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{f.pages}pp</span>}
                      <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{(f.size / 1000).toFixed(1)}KB</span>
                      <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{(f.content.length / 1000).toFixed(1)}K chars</span>
                      <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px', padding: '2px' }}>✕</button>
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textAlign: 'right', marginTop: '2px' }}>
                {files.reduce((s, f) => s + f.content.length, 0).toLocaleString()} total characters extracted
              </div>
            </div>
          )}
        </div>
      )}

      {analysing ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}44`, borderRadius: '7px', padding: '20px 24px' }}>
          <div style={{ fontSize: '12px', color: C.purpleLight, marginBottom: '12px', fontFamily: 'system-ui' }}>Analysing...</div>
          <div style={{ height: '2px', backgroundColor: C.border, borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ width: '60%', height: '100%', backgroundColor: C.purple, animation: 'pulse 1.5s ease-in-out infinite', borderRadius: '2px' }} />
          </div>
          <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>{progress}</div>
        </div>
      ) : (
        <button onClick={analyse} disabled={!getContent().trim()}
          style={{ width: '100%', padding: '13px', backgroundColor: getContent().trim() ? C.purple : C.bgCard, color: getContent().trim() ? '#fff' : C.muted, border: `1px solid ${getContent().trim() ? C.purple : C.border}`, borderRadius: '6px', fontSize: '14px', cursor: getContent().trim() ? 'pointer' : 'not-allowed', fontFamily: 'system-ui', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
          Extract Story Blueprint →
        </button>
      )}

      {blueprint?.error && (
        <div style={{ marginTop: '12px', padding: '12px', backgroundColor: C.bgCard, border: `1px solid ${C.acc}55`, borderRadius: '5px', fontSize: '12px', color: C.accBright, fontFamily: 'system-ui' }}>{blueprint.error}</div>
      )}
    </div>
  );
}

/* ── AI ASSISTANT PANEL ── */
function AIAssistant({ open, onClose, project, chars, lore, currentTab }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('general');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const MODES = [
    { id: 'general',     label: 'Assistant',    color: C.purpleLight, desc: 'General story help' },
    { id: 'continuity',  label: 'Continuity',   color: C.gold,        desc: 'Check for plot holes & contradictions' },
    { id: 'character',   label: 'Characters',   color: C.accBright,   desc: 'Develop & analyse characters' },
    { id: 'plot',        label: 'Plot',         color: C.teal,        desc: 'Next beats, structure, pacing' },
    { id: 'voice',       label: 'Voice',        color: C.green,       desc: 'Tone, style & prose feedback' },
    { id: 'production',  label: 'Production',   color: C.blue,        desc: 'Adaptation, comic, film, show' },
  ];

  const QUICK = {
    general:    ["What's the most interesting unexplored thread in my story?", "Give me 3 story directions I haven't considered", "What is this story actually about beneath the surface?"],
    continuity: ["Check for contradictions in my world rules", "Which character arcs are unresolved?", "What did I promise the reader that I haven't paid off yet?"],
    character:  ["Which character is the most underdeveloped?", "How would my characters react if they all met at once?", "What secret would create the most narrative tension?"],
    plot:       ["What should happen in the next chapter?", "Where is the midpoint crisis of this story?", "How do I raise the stakes without changing the genre?"],
    voice:      ["What tone am I writing in and is it consistent?", "What's the Sedaris 'ugly detail' I'm avoiding in this story?", "Where does my prose lose momentum?"],
    production: ["How would this story work as a comic series?", "What's the pitch for a short film version?", "Which scenes would be most visually striking on screen?"],
  };

  const buildContext = () => {
    const parts = [`PROJECT: "${project?.title || 'Untitled'}"${project?.genre ? ` (${project.genre})` : ''}`];
    if (chars.length > 0) {
      parts.push('\nCHARACTERS:\n' + chars.map(c =>
        [`• ${c.name}${c.species ? ` (${c.species})` : ''}${c.role ? ` — ${c.role}` : ''}`,
         c.traits        ? `  Traits: ${c.traits}` : '',
         c.stakes        ? `  Stakes: ${c.stakes}` : '',
         c.secrets       ? `  Secrets: ${c.secrets}` : '',
         c.contradictions? `  Contradictions: ${c.contradictions}` : '',
        ].filter(Boolean).join('\n')
      ).join('\n\n'));
    }
    if (lore.length > 0) {
      parts.push('\nWORLD RULES:\n' + lore.map(r => `[${r.cat}] ${r.rule}`).join('\n'));
    }
    parts.push(`\nWriter is currently on the "${currentTab}" tab.`);
    return parts.join('\n');
  };

  const SYSTEM = {
    general: `You are the StoryForge AI — a master narrative assistant embedded inside a writer's production tool. You have full access to the writer's project data below. You are a creative collaborator, not a yes-machine. Be direct, specific, and intellectually honest. Push back when the writer is taking the easy path. Draw on craft principles from Amy Tan, Salman Rushdie, David Sedaris, Judy Blume, and Margaret Atwood where relevant — but never lecture. Keep responses focused and under 250 words unless the writer explicitly asks for more.`,
    continuity: `You are a continuity editor embedded in StoryForge. Your job is to find contradictions, broken promises, unresolved threads, and logical inconsistencies in the writer's story. Be precise — cite specific details. Don't soften findings. A story that contradicts itself loses the reader permanently. Under 200 words per response.`,
    character: `You are a character analyst and development coach embedded in StoryForge. You know each character's traits, secrets, contradictions, and stakes. Your job is to find underdevelopment, inconsistencies in how characters are written, and opportunities for deeper characterisation. Judy Blume's test: how would this character defy your expectations? LeVar Burton's test: what does this character stand to lose? Use these frameworks actively. Under 200 words.`,
    plot: `You are a story architect embedded in StoryForge. You understand plot structure, pacing, tension, and narrative momentum. Your job is to help the writer make the next right story decision — not the safe one, the right one. Be concrete: name specific scenes, specific beats, specific reversals. Under 200 words.`,
    voice: `You are a prose and voice editor embedded in StoryForge. You understand tone, style, rhythm, and the difference between writing that pulls readers forward and writing that loses them. Sedaris's ugly detail test applies here: what is the writer protecting themselves from saying? Under 200 words.`,
    production: `You are a production consultant embedded in StoryForge — thinking about how this story moves from manuscript to comic, short film, TV series, or feature film. You think about visual storytelling, adaptation decisions, what translates to screen and what doesn't, and what makes a compelling pitch. Under 250 words.`,
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);
    try {
      const ctx = buildContext();
      const data = await callClaude({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: `${SYSTEM[mode] || SYSTEM.general}\n\nPROJECT CONTEXT:\n${ctx}`,
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        });
      const reply = data.content?.[0]?.text || 'No response.';
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setLoading(false);
  };

  const activeMode = MODES.find(m => m.id === mode);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: open ? '360px' : '0',
      backgroundColor: C.bgDeep, borderLeft: `1px solid ${open ? C.border : 'transparent'}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s ease', overflow: 'hidden', zIndex: 100,
      boxShadow: open ? '-4px 0 24px #00000055' : 'none',
    }}>
      {open && <>
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '22px', height: '22px', backgroundColor: C.purple, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff' }}>✦</div>
            <span style={{ fontSize: '13px', color: C.parch, fontFamily: 'system-ui', fontWeight: 500 }}>Story AI</span>
            <span style={{ fontSize: '10px', color: activeMode.color, fontFamily: 'system-ui', backgroundColor: activeMode.color + '22', padding: '1px 7px', borderRadius: '8px' }}>{activeMode.label}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '10px', fontFamily: 'system-ui', padding: '2px 6px' }}>clear</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px' }}>×</button>
          </div>
        </div>

        {/* Mode pills */}
        <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} title={m.desc}
              style={{ padding: '3px 9px', backgroundColor: mode === m.id ? m.color + '33' : 'transparent', color: mode === m.id ? m.color : C.muted, border: `1px solid ${mode === m.id ? m.color + '66' : C.border}`, borderRadius: '10px', fontSize: '10px', cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Empty state with quick actions */}
          {messages.length === 0 && (
            <div>
              <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', marginBottom: '14px', lineHeight: '1.6' }}>
                {chars.length > 0
                  ? `I know your ${chars.length} character${chars.length > 1 ? 's' : ''}, ${lore.length} world rule${lore.length !== 1 ? 's' : ''}, and your current project. Ask me anything.`
                  : 'Add characters and world rules to the Story Bible to unlock context-aware advice.'}
              </div>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Quick questions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(QUICK[mode] || QUICK.general).map((q, i) => (
                  <button key={i} onClick={() => send(q)}
                    style={{ padding: '8px 10px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '5px', color: C.mutedLight, fontSize: '11px', cursor: 'pointer', fontFamily: 'Georgia,serif', fontStyle: 'italic', textAlign: 'left', lineHeight: '1.4' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: m.role === 'assistant' ? '2px' : 0, paddingRight: m.role === 'user' ? '2px' : 0 }}>
                {m.role === 'user' ? 'You' : 'Story AI'}
              </div>
              <div style={{
                maxWidth: '92%', padding: '10px 12px', borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                backgroundColor: m.role === 'user' ? C.purple + '33' : C.bgCard,
                border: `1px solid ${m.role === 'user' ? C.purple + '55' : C.border}`,
                fontSize: '12px', color: C.parch, lineHeight: '1.75', fontFamily: 'Georgia,serif',
              }}>
                {m.content.split('\n').map((line, j) => {
                  const bold = line.match(/^\*\*(.*?)\*\*(.*)$/);
                  if (bold) return <div key={j} style={{ fontWeight: 'bold', color: activeMode.color, marginBottom: '3px', fontFamily: 'system-ui', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bold[1]}{bold[2]}</div>;
                  return line.trim() ? <p key={j} style={{ margin: '0 0 6px 0' }}>{line}</p> : null;
                })}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '2px' }}>Story AI</div>
              <div style={{ padding: '10px 14px', borderRadius: '10px 10px 10px 2px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: C.purple, opacity: 0.7,
                    animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Ask about ${activeMode.desc.toLowerCase()}...`}
              rows={2}
              style={{ flex: 1, padding: '8px 10px', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '6px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'none', lineHeight: '1.5' }} />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              style={{ width: '36px', height: '36px', backgroundColor: input.trim() && !loading ? C.purple : C.tagBg, color: input.trim() && !loading ? '#fff' : C.muted, border: 'none', borderRadius: '6px', fontSize: '14px', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↑</button>
          </div>
          <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', marginTop: '5px' }}>Enter to send · Shift+Enter for new line</div>
        </div>

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-5px); }
          }
        `}</style>
      </>}
    </div>
  );
}

/* ── API KEY SETUP SCREEN ── */
function ApiKeySetup({ onSave }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!key.trim().startsWith('sk-ant-')) { setErr('Key must start with sk-ant-'); return; }
    setSaving(true);
    await window.electronAPI.setApiKey(key.trim());
    setSaving(false);
    onSave();
  };
  return (
    <div style={{height:'100vh',backgroundColor:C.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif'}}>
      <div style={{width:'420px',backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'32px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'24px'}}>
          <div style={{width:'32px',height:'32px',backgroundColor:C.purple,borderRadius:'6px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'16px'}}>✦</div>
          <div>
            <div style={{fontSize:'16px',fontWeight:'bold',color:C.parch}}>StoryForge</div>
            <div style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.14em'}}>one-time setup</div>
          </div>
        </div>
        <div style={{fontSize:'13px',color:C.mutedLight,lineHeight:'1.7',marginBottom:'20px',fontFamily:'system-ui'}}>
          Your Anthropic API key powers all AI features — the simulation engine, story analysis, and the AI assistant. It's stored locally on your Mac and never leaves your device.
        </div>
        <div style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'6px'}}>Anthropic API Key</div>
        <input value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-api03-..."
          onKeyDown={e=>e.key==='Enter'&&save()}
          style={{width:'100%',padding:'10px 12px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'5px',color:C.parch,fontSize:'13px',outline:'none',fontFamily:'system-ui',boxSizing:'border-box',marginBottom:'8px'}}/>
        {err&&<div style={{fontSize:'11px',color:C.accBright,fontFamily:'system-ui',marginBottom:'8px'}}>{err}</div>}
        <div style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',marginBottom:'16px'}}>
          Get your key at <span style={{color:C.purpleLight}}>console.anthropic.com</span> → API Keys
        </div>
        <button onClick={save} disabled={saving||!key.trim()}
          style={{width:'100%',padding:'11px',backgroundColor:key.trim()?C.purple:C.bgElevated,color:key.trim()?'#fff':C.muted,border:'none',borderRadius:'5px',fontSize:'13px',cursor:key.trim()?'pointer':'not-allowed',fontFamily:'system-ui'}}>
          {saving?'Saving...':'Save & Continue →'}
        </button>
      </div>
    </div>
  );
}

/* ── MAIN ── */
export default function StoryForge() {
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('mindmap');
  const [chars, setChars] = useState([]);
  const [lore, setLore] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [projectList, setProjectList] = useState(null); // null = not loaded yet

  // ── Electron startup: check API key + load projects
  useEffect(() => {
    if (!isElectron()) return;
    (async () => {
      const key = await window.electronAPI.getApiKey();
      if (!key) { setNeedsKey(true); return; }
      const index = await window.electronAPI.listProjects();
      setProjectList(Object.values(index));
    })();
  }, []);

  // ── Auto-save chars + lore whenever they change
  useEffect(() => {
    if (!isElectron() || !project) return;
    window.electronAPI.saveProject(project.id, { ...project, chars, lore });
  }, [chars, lore]);

  // ── Open project: load its saved data
  const openProject = async (p) => {
    if (isElectron()) {
      const data = await window.electronAPI.loadProject(p.id);
      if (data) {
        setChars(data.chars || []);
        setLore(data.lore || []);
      }
    }
    setProject(p);
    setTab('mindmap');
  };

  if (isElectron() && needsKey) {
    return <ApiKeySetup onSave={async () => {
      const index = await window.electronAPI.listProjects();
      setProjectList(Object.values(index));
      setNeedsKey(false);
    }}/>;
  }

  const NAV = [
    {id:'mindmap',    label:'Mindmap'},
    {id:'simulation', label:'✦ Simulation', hi:true},
    {id:'bible',      label:'Story Bible'},
    {id:'relweb',     label:'Relationship Web'},
    {id:'timeline',   label:'Timeline'},
    {id:'import',     label:'Import & Analyse'},
    {id:'capture',    label:'Quick Capture'},
  ];

  if (!project) return <ProjectHub onOpen={openProject} projectList={projectList} setProjectList={setProjectList}/>;

  return (
    <div style={{height:'100vh',backgroundColor:C.bg,color:C.parch,fontFamily:'Georgia,serif',display:'flex',flexDirection:'column',position:'relative'}}>
      {/* Header */}
      <div style={{backgroundColor:C.bgDeep,borderBottom:`1px solid ${C.border}`,padding:'0 16px',display:'flex',alignItems:'center',justifyContent:'space-between',height:'44px',flexShrink:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
          <button onClick={()=>setProject(null)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:'16px',padding:'4px',fontFamily:'system-ui',lineHeight:1}}>‹</button>
          <div style={{width:'1px',height:'16px',backgroundColor:C.border}}/>
          <span style={{fontSize:'14px',fontStyle:'italic',whiteSpace:'nowrap'}}>{project.title||'Untitled'}</span>
          {project.genre&&<span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',whiteSpace:'nowrap'}}>— {project.genre}</span>}
          {chars.length>0&&<span style={{fontSize:'10px',color:C.purple+'99',fontFamily:'system-ui',backgroundColor:C.purple+'18',padding:'2px 8px',borderRadius:'8px',whiteSpace:'nowrap'}}>{chars.length} agents seeded</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0',fontFamily:'system-ui',overflowX:'auto'}}>
          {NAV.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'0 11px',height:'44px',fontSize:'11px',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${t.hi?C.purpleLight:C.acc}`:'2px solid transparent',color:tab===t.id?(t.hi?C.purpleLight:C.parch):t.hi?C.purple:C.muted,cursor:'pointer',letterSpacing:'0.02em',marginBottom:'-1px',whiteSpace:'nowrap',fontWeight:t.hi?500:400}}>{t.label}</button>
          ))}
          {/* AI toggle in header */}
          <button onClick={()=>setAiOpen(o=>!o)}
            style={{marginLeft:'8px',padding:'0 14px',height:'44px',fontSize:'11px',background:'none',border:'none',borderBottom:aiOpen?`2px solid ${C.purpleLight}`:'2px solid transparent',color:aiOpen?C.purpleLight:C.purple,cursor:'pointer',fontFamily:'system-ui',letterSpacing:'0.02em',marginBottom:'-1px',whiteSpace:'nowrap',fontWeight:500,display:'flex',alignItems:'center',gap:'5px'}}>
            <span style={{fontSize:'12px'}}>✦</span> AI
          </button>
        </div>
      </div>

      {/* Main content — shrinks when AI panel is open */}
      <div style={{flex:1,overflow:'auto',display:'flex',flexDirection:'column',transition:'margin-right 0.25s ease',marginRight:aiOpen?'360px':'0'}}>
        {tab==='mindmap'   && <MindMap projectTitle={project.title}/>}
        {tab==='simulation'&& <SimPanel chars={chars} lore={lore}/>}
        {tab==='bible'     && <StoryBible chars={chars} setChars={setChars} lore={lore} setLore={setLore}/>}
        {tab==='relweb'    && <RelationshipWeb chars={chars}/>}
        {tab==='timeline'  && <Timeline/>}
        {tab==='import'    && <ImportAnalyse/>}
        {tab==='capture'   && <Capture/>}
      </div>

      {/* AI Assistant panel */}
      <AIAssistant
        open={aiOpen} onClose={()=>setAiOpen(false)}
        project={project} chars={chars} lore={lore} currentTab={tab}
      />
    </div>
  );
}
