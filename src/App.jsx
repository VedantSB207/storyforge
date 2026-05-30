import { useState, useEffect } from "react";
import { C, genId } from "./constants.js";
import { isElectron } from "./api.js";
import { ProjectHub } from "./components/ProjectHub.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { MindMap } from "./components/MindMap.jsx";
import { StoryBible } from "./components/StoryBible.jsx";
import { SimPanel } from "./components/SimPanel.jsx";
import { WritingPanel } from "./components/WritingPanel.jsx";
import { RelationshipWeb } from "./components/RelationshipWeb.jsx";
import { Timeline } from "./components/Timeline.jsx";
import { Capture } from "./components/Capture.jsx";
import { LibraryPanel } from "./components/LibraryPanel.jsx";
import { ImportAnalyse } from "./components/ImportAnalyse.jsx";
import { AIAssistant } from "./components/AIAssistant.jsx";
import { DeepSimulation } from "./components/DeepSimulation/DeepSimulation.jsx";
import { WorldRulesPanel } from "./components/WorldRules/WorldRulesPanel.jsx";
import { DEFAULT_WORLD_RULES, withDefaults as withWorldRulesDefaults } from "./components/WorldRules/worldRulesSchema.js";

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
  const [tab, setTab] = useState('dashboard');
  const [chars, setChars] = useState([]);
  const [lore, setLore] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [projMenu, setProjMenu] = useState(false);
  const [projConfirmDelete, setProjConfirmDelete] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [projectList, setProjectList] = useState(null);
  const [importedEdges, setImportedEdges] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [manuscript, setManuscript] = useState({ chapters: [{ id: genId(), title: 'Chapter 1', text: '' }] });

  // ── Dashboard state (lifted from child components)
  const [relNodes, setRelNodes] = useState([]);
  const [relEdges, setRelEdges] = useState([]);
  const [contFlags, setContFlags] = useState([]);
  const [timelineChapters, setTimelineChapters] = useState([]);
  const [simulationCount, setSimulationCount] = useState(0);
  const [lastSimulation, setLastSimulation] = useState(null);
  const [selectedArc, setSelectedArc] = useState('discover');
  const [deepSimulationHistory, setDeepSimulationHistory] = useState([]);
  // Phase 6/6a-i: project-level story snapshot + cached hydration data
  const [storySnapshot, setStorySnapshot] = useState('');
  const [hydrationData, setHydrationData] = useState(null);
  // Phase 6/6a-ii: project-level world rules (aging, lifespan, narrative)
  const [worldRules, setWorldRules] = useState(() => withWorldRulesDefaults(null));

  // ── Tab switch handler (persists lastTab)
  const switchTab = (tabId) => {
    setTab(tabId);
  };

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

  // ── Auto-save whenever state changes
  useEffect(() => {
    if (!isElectron() || !project) return;
    window.electronAPI.saveProject(project.id, {
      ...project, chars, lore, relationships, manuscript,
      lastTab: tab,
      selectedArc, simulationCount, lastSimulation,
      timelineChapters, contFlags,
      deepSimulationHistory,
      storySnapshot, hydrationData,
      worldRules,
    });
  }, [project, chars, lore, relationships, manuscript, tab, selectedArc, simulationCount, lastSimulation, timelineChapters, contFlags, deepSimulationHistory, storySnapshot, hydrationData, worldRules]);

  // ── Open project: load its saved data
  const openProject = async (p) => {
    let data = null;
    if (isElectron()) {
      data = await window.electronAPI.loadProject(p.id);
      if (data) {
        setChars(data.chars || []);
        setLore(data.lore || []);
        setRelationships(data.relationships || []);
        setManuscript(data.manuscript || { chapters: [{ id: genId(), title: 'Chapter 1', text: '' }] });
        setSelectedArc(data.selectedArc || 'discover');
        setSimulationCount(data.simulationCount || 0);
        setLastSimulation(data.lastSimulation || null);
        setTimelineChapters(data.timelineChapters || []);
        setContFlags(data.contFlags || []);
        setDeepSimulationHistory(data.deepSimulationHistory || []);
        // Phase 6/6a-i: hydrate the snapshot + cached hydration data
        setStorySnapshot(data.storySnapshot || '');
        setHydrationData(data.hydrationData || null);
        // Phase 6/6a-ii: load world rules with default fallback for old projects
        setWorldRules(withWorldRulesDefaults(data.worldRules || null));
      }
    }
    setProject(p);
    // Route: new project → dashboard, returning → last tab
    const hasVisited = data?.hasVisitedDashboard;
    if (!hasVisited) {
      setTab('dashboard');
      // Mark as visited for next time
      if (isElectron()) {
        window.electronAPI.saveProject(p.id, { ...p, ...(data||{}), hasVisitedDashboard: true });
      }
    } else {
      setTab(data?.lastTab || 'write');
    }
  };

  if (isElectron() && needsKey) {
    return <ApiKeySetup onSave={async () => {
      const index = await window.electronAPI.listProjects();
      setProjectList(Object.values(index));
      setNeedsKey(false);
    }}/>;
  }

  const NAV = [
    {id:'dashboard',  label:'Dashboard'},
    {id:'write',      label:'Write'},
    {id:'mindmap',    label:'Mindmap'},
    {id:'simulation', label:'\u2726 Quick Scenario', hi:true},
    {id:'deepsim',    label:'\u2726 Deep Simulation', hi:true},
    {id:'bible',      label:'Story Bible'},
    {id:'worldrules', label:'World Rules'},
    {id:'relweb',     label:'Relationship Web'},
    {id:'timeline',   label:'Timeline'},
    {id:'import',     label:'Import & Analyse'},
    {id:'library',    label:'Library'},
    {id:'capture',    label:'Quick Capture'},
  ];

  const deleteCurrentProject = async () => {
    if (!project) return;
    if (isElectron()) await window.electronAPI.deleteProject(project.id);
    setProjectList(prev => (prev||[]).filter(x => x.id !== project.id));
    setProject(null); setProjMenu(false); setProjConfirmDelete(false);
  };

  if (!project) return <ProjectHub onOpen={openProject} projectList={projectList} setProjectList={setProjectList}/>;

  return (
    <div style={{height:'100vh',backgroundColor:C.bg,color:C.parch,fontFamily:'Georgia,serif',display:'flex',flexDirection:'column',position:'relative'}}>
      {/* Header */}
      <div style={{backgroundColor:C.bgDeep,borderBottom:`1px solid ${C.border}`,padding:'0 16px',display:'flex',alignItems:'center',justifyContent:'space-between',height:'44px',flexShrink:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
          <button onClick={()=>setProject(null)} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:'16px',padding:'4px',fontFamily:'system-ui',lineHeight:1}}>&#8249;</button>
          <div style={{width:'1px',height:'16px',backgroundColor:C.border}}/>
          <span style={{fontSize:'14px',fontStyle:'italic',whiteSpace:'nowrap'}}>{project.title||'Untitled'}</span>
          {project.genre&&<span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',whiteSpace:'nowrap'}}>&mdash; {project.genre}</span>}
          {chars.length>0&&<span style={{fontSize:'10px',color:C.purple+'99',fontFamily:'system-ui',backgroundColor:C.purple+'18',padding:'2px 8px',borderRadius:'8px',whiteSpace:'nowrap'}}>{chars.length} agents seeded</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0',fontFamily:'system-ui',overflowX:'auto'}}>
          {NAV.map(t=>(
            <button key={t.id} onClick={()=>switchTab(t.id)} style={{padding:'0 11px',height:'44px',fontSize:'11px',background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${t.hi?C.purpleLight:C.acc}`:'2px solid transparent',color:tab===t.id?(t.hi?C.purpleLight:C.parch):t.hi?C.purple:C.muted,cursor:'pointer',letterSpacing:'0.02em',marginBottom:'-1px',whiteSpace:'nowrap',fontWeight:t.hi?500:400}}>{t.label}</button>
          ))}
          {/* AI toggle in header */}
          <button onClick={()=>setAiOpen(o=>!o)}
            style={{marginLeft:'8px',padding:'0 14px',height:'44px',fontSize:'11px',background:'none',border:'none',borderBottom:aiOpen?`2px solid ${C.purpleLight}`:'2px solid transparent',color:aiOpen?C.purpleLight:C.purple,cursor:'pointer',fontFamily:'system-ui',letterSpacing:'0.02em',marginBottom:'-1px',whiteSpace:'nowrap',fontWeight:500,display:'flex',alignItems:'center',gap:'5px'}}>
            <span style={{fontSize:'12px'}}>&#10022;</span> AI
          </button>
          {/* Project menu */}
          <div style={{position:'relative',marginLeft:'4px'}}>
            <button onClick={()=>setProjMenu(o=>!o)}
              style={{padding:'0 8px',height:'44px',fontSize:'16px',background:'none',border:'none',color:C.muted,cursor:'pointer',fontFamily:'system-ui',letterSpacing:'0.3em',marginBottom:'-1px'}}>
              ···
            </button>
            {projMenu && (
              <div style={{position:'absolute',top:'42px',right:0,width:'180px',backgroundColor:C.bgCard,border:`1px solid ${C.border}`,borderRadius:'6px',overflow:'hidden',zIndex:999,boxShadow:'0 8px 24px #000a'}}
                onMouseLeave={()=>{setProjMenu(false);setProjConfirmDelete(false);}}>
                <div style={{padding:'6px 0'}}>
                  <button onClick={()=>{setProjMenu(false);const t=prompt('Rename project:',project.title);if(t&&t.trim()){setProject(p=>({...p,title:t.trim()}));}}}
                    style={{display:'block',width:'100%',padding:'8px 14px',backgroundColor:'transparent',border:'none',color:C.parch,fontSize:'12px',fontFamily:'system-ui',cursor:'pointer',textAlign:'left'}}
                    onMouseEnter={e=>e.currentTarget.style.backgroundColor=C.bgElevated} onMouseLeave={e=>e.currentTarget.style.backgroundColor='transparent'}>
                    Rename Project
                  </button>
                  <button onClick={()=>{setProjMenu(false);const s=prompt('Status (planning/active/complete):',project.status);if(s)setProject(p=>({...p,status:s.trim()}));}}
                    style={{display:'block',width:'100%',padding:'8px 14px',backgroundColor:'transparent',border:'none',color:C.parch,fontSize:'12px',fontFamily:'system-ui',cursor:'pointer',textAlign:'left'}}
                    onMouseEnter={e=>e.currentTarget.style.backgroundColor=C.bgElevated} onMouseLeave={e=>e.currentTarget.style.backgroundColor='transparent'}>
                    Change Status
                  </button>
                  <div style={{height:'1px',backgroundColor:C.border,margin:'4px 0'}}/>
                  {projConfirmDelete ? (
                    <div style={{padding:'8px 14px'}}>
                      <div style={{fontSize:'11px',color:'#e74c3c',fontFamily:'system-ui',marginBottom:'8px'}}>Delete &ldquo;{project.title}&rdquo;? Cannot undo.</div>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button onClick={deleteCurrentProject} style={{padding:'4px 10px',backgroundColor:'#c0392b',color:'#fff',border:'none',borderRadius:'3px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>Yes, Delete</button>
                        <button onClick={()=>setProjConfirmDelete(false)} style={{padding:'4px 10px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'3px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={()=>setProjConfirmDelete(true)}
                      style={{display:'block',width:'100%',padding:'8px 14px',backgroundColor:'transparent',border:'none',color:'#e74c3c',fontSize:'12px',fontFamily:'system-ui',cursor:'pointer',textAlign:'left'}}
                      onMouseEnter={e=>e.currentTarget.style.backgroundColor='#1a080833'} onMouseLeave={e=>e.currentTarget.style.backgroundColor='transparent'}>
                      Delete Project
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content — shrinks when AI panel is open */}
      <div style={{flex:1,overflow:'auto',display:'flex',flexDirection:'column',transition:'margin-right 0.25s ease',marginRight:aiOpen?'360px':'0'}}>
        {tab==='dashboard' && <Dashboard project={project} chars={chars} lore={lore} chapters={timelineChapters} contFlags={contFlags} relNodes={relNodes} relEdges={relEdges} simulationCount={simulationCount} lastSimulation={lastSimulation} selectedArc={selectedArc} setSelectedArc={setSelectedArc} setTab={switchTab} setAiOpen={setAiOpen}/>}
        {tab==='write'     && <WritingPanel project={project} chars={chars} lore={lore} manuscript={manuscript} setManuscript={setManuscript}/>}
        {tab==='mindmap'   && <MindMap projectTitle={project.title} chars={chars} importedEdges={importedEdges}/>}
        {tab==='simulation'&& <SimPanel chars={chars} lore={lore} setSimulationCount={setSimulationCount} setLastSimulation={setLastSimulation}/>}
        {tab==='deepsim'   && <DeepSimulation project={project} chars={chars} lore={lore} timelineChapters={timelineChapters} relationships={relationships} deepSimulationHistory={deepSimulationHistory} setDeepSimulationHistory={setDeepSimulationHistory} setTab={switchTab} storySnapshot={storySnapshot} hydrationData={hydrationData} setHydrationData={setHydrationData} worldRules={worldRules}/>}
        {tab==='bible'     && <StoryBible chars={chars} setChars={setChars} lore={lore} setLore={setLore} storySnapshot={storySnapshot} setStorySnapshot={setStorySnapshot} worldRules={worldRules}/>}
        {tab==='worldrules'&& <WorldRulesPanel worldRules={worldRules} setWorldRules={setWorldRules} chars={chars}/>}
        {tab==='relweb'    && <RelationshipWeb chars={chars} relationships={relationships} setRelationships={setRelationships} setRelNodes={setRelNodes} setRelEdges={setRelEdges}/>}
        {tab==='timeline'  && <Timeline project={project} timelineChapters={timelineChapters} setTimelineChapters={setTimelineChapters} contFlags={contFlags} setContFlags={setContFlags}/>}
        {tab==='import'    && <ImportAnalyse chars={chars} setChars={setChars} lore={lore} setLore={setLore} project={project} setImportedEdges={setImportedEdges} setTab={switchTab} setManuscript={setManuscript}/>}
        {tab==='library'   && <LibraryPanel project={project} chars={chars} lore={lore} manuscript={manuscript} setManuscript={setManuscript}/>}
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
