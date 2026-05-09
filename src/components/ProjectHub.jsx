import { useState, useEffect } from "react";
import { isElectron } from "../api.js";
import { C, genId } from "../constants.js";

export function ProjectHub({ onOpen, projectList, setProjectList }) {
  const [projects, setProjects] = useState(projectList || []);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // project id
  const [hoverCard, setHoverCard] = useState(null);

  useEffect(() => { if (projectList) setProjects(projectList); }, [projectList]);

  const deleteProject = async (e, p) => {
    e.stopPropagation();
    if (confirmDelete === p.id) {
      // Confirmed — actually delete
      if (isElectron()) await window.electronAPI.deleteProject(p.id);
      setProjects(prev => prev.filter(x => x.id !== p.id));
      if (setProjectList) setProjectList(prev => (prev||[]).filter(x => x.id !== p.id));
      setConfirmDelete(null);
    } else {
      setConfirmDelete(p.id);
    }
  };
  const cancelDelete = (e) => { e.stopPropagation(); setConfirmDelete(null); };

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
            const isDeleting = confirmDelete === p.id;
            const isHover = hoverCard === p.id;
            return (
              <div key={p.id} onClick={() => !isDeleting && onOpen(p)}
                onMouseEnter={() => setHoverCard(p.id)} onMouseLeave={() => { setHoverCard(null); if (isDeleting) setConfirmDelete(null); }}
                style={{
                  backgroundColor: isDeleting ? '#1a0808' : C.bgCard,
                  border: `1px solid ${isDeleting ? '#c0392b66' : C.border}`,
                  borderRadius: '8px', padding: '18px', cursor: isDeleting ? 'default' : 'pointer',
                  position: 'relative', overflow: 'hidden', transition: 'all 0.2s ease',
                }}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',backgroundColor:isDeleting?'#c0392b':col,opacity:0.6}}/>
                {/* Trash icon on hover */}
                {isHover && !isDeleting && (
                  <div onClick={e => deleteProject(e, p)}
                    style={{ position:'absolute', top:'8px', right:'8px', width:'24px', height:'24px', borderRadius:'4px',
                      backgroundColor:C.bg+'cc', display:'flex', alignItems:'center', justifyContent:'center',
                      cursor:'pointer', fontSize:'12px', color:C.muted, transition:'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color='#c0392b'} onMouseLeave={e => e.currentTarget.style.color=C.muted}>
                    🗑
                  </div>
                )}
                {isDeleting ? (
                  <div>
                    <div style={{fontSize:'13px',fontWeight:'bold',color:'#e74c3c',marginBottom:'8px'}}>Delete "{p.title}"?</div>
                    <div style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',marginBottom:'12px'}}>This cannot be undone.</div>
                    <div style={{display:'flex',gap:'8px'}}>
                      <button onClick={e => deleteProject(e, p)}
                        style={{padding:'5px 14px',backgroundColor:'#c0392b',color:'#fff',border:'none',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>
                        Yes, Delete
                      </button>
                      <button onClick={cancelDelete}
                        style={{padding:'5px 14px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:'16px',fontWeight:'bold',marginBottom:'4px'}}>{p.title||<span style={{color:C.muted,fontStyle:'italic'}}>Untitled</span>}</div>
                    <div style={{fontSize:'11px',color:C.muted,fontFamily:'system-ui',marginBottom:'14px'}}>{p.genre||'No genre set'}</div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:'10px',padding:'3px 9px',borderRadius:'10px',backgroundColor:bg,color:col,fontFamily:'system-ui',border:`1px solid ${col}33`}}>{p.status}</span>
                      <span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui'}}>{p.lastEdited}</span>
                    </div>
                  </>
                )}
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
