import { useState, useEffect } from "react";
import { C, genId } from "../constants.js";
import { isElectron } from "../api.js";
import { detectAndSplitChapters } from "./detectChapters.js";

export function Timeline({ project, timelineChapters, setTimelineChapters, contFlags, setContFlags }) {
  const [chs, setChs] = useState(timelineChapters || []);
  const [flags, setFlags] = useState(contFlags || []);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({title:'',pov:'',summary:'',tension:5,status:'planned'});
  const [flagInput, setFlagInput] = useState('');
  const [flagCh, setFlagCh] = useState('');
  const [addFlag, setAddFlag] = useState(false);
  const sc = {complete:C.green,current:C.accBright,planned:C.muted};

  // Import state
  const [importPrompt, setImportPrompt] = useState(null); // { chapters, filename }
  const [importMsg, setImportMsg] = useState(null);
  const [libPicker, setLibPicker] = useState(false);
  const [libFiles, setLibFiles] = useState([]);
  const [libLoading, setLibLoading] = useState(false);

  // Sync from parent on mount / when parent data changes
  useEffect(() => { if (timelineChapters) setChs(timelineChapters); }, [timelineChapters]);
  useEffect(() => { if (contFlags) setFlags(contFlags); }, [contFlags]);

  // Sync back to parent
  useEffect(() => { if (setTimelineChapters) setTimelineChapters(chs); }, [chs]);
  useEffect(() => { if (setContFlags) setContFlags(flags); }, [flags]);

  // Clear import message after 5 seconds
  useEffect(() => {
    if (!importMsg) return;
    const t = setTimeout(() => setImportMsg(null), 5000);
    return () => clearTimeout(t);
  }, [importMsg]);

  // Convert detectAndSplitChapters output to Timeline chapters
  const convertDetected = (detected, startNum) => {
    return detected.map((ch, i) => ({
      id: genId(),
      num: startNum + i,
      title: ch.title || 'Chapter ' + (startNum + i),
      summary: ch.content ? ch.content.slice(0, 200) + (ch.content.length > 200 ? '...' : '') : '',
      pov: '',
      tension: 5,
      status: 'complete',
      wordCount: ch.wordCount || 0,
      source: ch.source || 'import',
    }));
  };

  const applyImport = (newChs, mode) => {
    if (mode === 'replace') {
      setChs(newChs.map((c, i) => ({ ...c, num: i + 1 })));
    } else {
      setChs(prev => {
        const combined = [...prev, ...newChs.map((c, i) => ({ ...c, num: prev.length + i + 1 }))];
        return combined;
      });
    }
    setImportPrompt(null);
    setImportMsg(newChs.length + ' chapters imported from ' + (importPrompt?.filename || 'file') + '. Tension levels set to default 5 \u2014 adjust them to enable the Story Arc graph on the Dashboard.');
  };

  // Import from file picker
  const importFromFile = async () => {
    if (!isElectron()) return;
    const files = await window.electronAPI.readFiles();
    if (!files || files.length === 0) return;
    const file = files[0]; // use first file
    if (!file.content) { setImportMsg('Could not read file: ' + (file.error || 'empty content')); return; }
    const detected = detectAndSplitChapters(file.content, file.name);
    if (detected.length === 0) { setImportMsg('No chapters detected in ' + file.name); return; }
    const newChs = convertDetected(detected, chs.length + 1);
    if (chs.length > 0) {
      setImportPrompt({ chapters: newChs, filename: file.name, count: detected.length });
    } else {
      setChs(newChs);
      setImportMsg(newChs.length + ' chapters imported from ' + file.name + '. Tension levels set to default 5 \u2014 adjust them to enable the Story Arc graph on the Dashboard.');
    }
  };

  // Pull from Library
  const openLibPicker = async () => {
    if (!isElectron() || !project?.id) return;
    setLibLoading(true);
    setLibPicker(true);
    const files = await window.electronAPI.libraryListFiles(project.id);
    setLibFiles(files || []);
    setLibLoading(false);
  };

  const pullFromLibrary = async (file) => {
    setLibPicker(false);
    if (!file.filename) return;
    const libDir = await window.electronAPI.getDataPath();
    const filePath = libDir + '/projects/' + project.id + '/library/' + file.filename;
    const result = await window.electronAPI.libraryReadFile(filePath);
    if (result.error) { setImportMsg('Error reading ' + file.filename + ': ' + result.error); return; }
    if (!result.content) { setImportMsg('No content found in ' + file.filename); return; }
    const detected = detectAndSplitChapters(result.content, file.filename || file.originalName);
    if (detected.length === 0) { setImportMsg('No chapters detected in ' + file.filename); return; }
    const newChs = convertDetected(detected, chs.length + 1);
    if (chs.length > 0) {
      setImportPrompt({ chapters: newChs, filename: file.originalName || file.filename, count: detected.length });
    } else {
      setChs(newChs);
      setImportMsg(newChs.length + ' chapters imported from ' + (file.originalName || file.filename) + '. Tension levels set to default 5 \u2014 adjust them to enable the Story Arc graph on the Dashboard.');
    }
  };

  return (
    <div style={{padding:'20px',maxWidth:'720px',margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:6}}>
        <h2 style={{margin:0,fontSize:'16px'}}>Timeline</h2>
        <div style={{display:'flex',gap:6}}>
          <button onClick={importFromFile} style={{padding:'5px 12px',backgroundColor:C.purple+'22',color:C.purpleLight,border:'1px solid ' + C.purple + '44',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>Import from File</button>
          <button onClick={openLibPicker} style={{padding:'5px 12px',backgroundColor:C.gold+'22',color:C.gold,border:'1px solid ' + C.gold + '44',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>Pull from Library</button>
          <button onClick={()=>setAdding(true)} style={{padding:'5px 14px',backgroundColor:C.teal+'33',color:C.teal,border:'1px solid ' + C.teal + '55',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>+ Add Chapter</button>
        </div>
      </div>

      {/* Import message */}
      {importMsg && (
        <div style={{backgroundColor:C.teal+'18',border:'1px solid ' + C.teal + '44',borderRadius:6,padding:'10px 14px',marginBottom:12,fontSize:11,color:C.teal,fontFamily:'system-ui',lineHeight:'1.5'}}>
          {importMsg}
        </div>
      )}

      {/* Import prompt: add vs replace */}
      {importPrompt && (
        <div style={{backgroundColor:C.bgElevated,border:'1px solid ' + C.purple + '55',borderRadius:7,padding:14,marginBottom:12}}>
          <div style={{fontSize:12,color:C.parch,fontFamily:'system-ui',marginBottom:8}}>
            Found {importPrompt.count} chapters in <b>{importPrompt.filename}</b>. Add to existing {chs.length} chapters or replace?
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>applyImport(importPrompt.chapters,'add')} style={{padding:'6px 14px',backgroundColor:C.teal,color:'#fff',border:'none',borderRadius:4,fontSize:11,cursor:'pointer',fontFamily:'system-ui'}}>Add to existing</button>
            <button onClick={()=>applyImport(importPrompt.chapters,'replace')} style={{padding:'6px 14px',backgroundColor:C.accBright,color:'#fff',border:'none',borderRadius:4,fontSize:11,cursor:'pointer',fontFamily:'system-ui'}}>Replace all</button>
            <button onClick={()=>setImportPrompt(null)} style={{padding:'6px 12px',backgroundColor:'transparent',color:C.muted,border:'1px solid ' + C.border,borderRadius:4,fontSize:11,cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Library file picker dropdown */}
      {libPicker && (
        <div style={{backgroundColor:C.bgElevated,border:'1px solid ' + C.gold + '55',borderRadius:7,padding:14,marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>Select a Library File</div>
          {libLoading && <div style={{fontSize:11,color:C.muted,fontFamily:'system-ui'}}>Loading...</div>}
          {!libLoading && libFiles.length === 0 && (
            <div style={{fontSize:11,color:C.gold,fontFamily:'system-ui',fontStyle:'italic'}}>No files in Library yet. Upload files via the Library tab first.</div>
          )}
          {!libLoading && libFiles.length > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:160,overflowY:'auto'}}>
              {libFiles.map((f, i) => (
                <button key={i} onClick={()=>pullFromLibrary(f)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',backgroundColor:C.bgCard,border:'1px solid ' + C.border,borderRadius:4,cursor:'pointer',textAlign:'left',width:'100%'}}
                  onMouseEnter={e=>e.currentTarget.style.backgroundColor=C.bgElevated}
                  onMouseLeave={e=>e.currentTarget.style.backgroundColor=C.bgCard}>
                  <span style={{fontSize:12,color:C.parch,fontFamily:'system-ui',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.originalName || f.filename}</span>
                  <span style={{fontSize:9,color:C.muted,fontFamily:'system-ui'}}>{f.type || ''}</span>
                  <span style={{fontSize:9,color:C.muted,fontFamily:'system-ui'}}>{f.size ? Math.round(f.size/1024) + 'KB' : ''}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>setLibPicker(false)} style={{marginTop:8,padding:'4px 10px',backgroundColor:'transparent',color:C.muted,border:'1px solid ' + C.border,borderRadius:3,fontSize:10,cursor:'pointer',fontFamily:'system-ui'}}>Close</button>
        </div>
      )}

      {adding&&(
        <div style={{backgroundColor:C.bgElevated,border:'1px solid ' + C.teal + '55',borderRadius:'7px',padding:'14px',marginBottom:'12px'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:'0 10px',marginBottom:'8px'}}>
            {[['Title','title','Chapter title...'],['POV','pov','Character name...']].map(([l,k,p])=>(
              <div key={k}>
                <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>{l}</div>
                <input value={nc[k]} onChange={e=>setNc(p2=>({...p2,[k]:e.target.value}))} placeholder={p}
                  style={{width:'100%',padding:'6px 9px',backgroundColor:C.bg,border:'1px solid ' + C.borderMid,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',boxSizing:'border-box'}}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>Status</div>
              <select value={nc.status} onChange={e=>setNc(p=>({...p,status:e.target.value}))} style={{width:'100%',padding:'6px 9px',backgroundColor:C.bg,border:'1px solid ' + C.borderMid,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'system-ui',boxSizing:'border-box'}}>
                <option value="planned">Planned</option><option value="current">In Progress</option><option value="complete">Complete</option>
              </select>
            </div>
          </div>
          <div style={{marginBottom:'8px'}}>
            <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>Summary</div>
            <textarea value={nc.summary} onChange={e=>setNc(p=>({...p,summary:e.target.value}))} placeholder="What happens..."
              style={{width:'100%',minHeight:'50px',padding:'7px 9px',backgroundColor:C.bg,border:'1px solid ' + C.borderMid,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif',resize:'vertical',boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:'10px'}}>
            <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>Tension: {nc.tension}/10</div>
            <input type="range" min="1" max="10" step="1" value={nc.tension} onChange={e=>setNc(p=>({...p,tension:+e.target.value}))} style={{width:'100%'}}/>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={()=>{if(!nc.title.trim())return;setChs(p=>[...p,{...nc,id:genId(),num:p.length+1}]);setNc({title:'',pov:'',summary:'',tension:5,status:'planned'});setAdding(false);}} style={{padding:'6px 16px',backgroundColor:C.teal,color:'#fff',border:'none',borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Save Chapter</button>
            <button onClick={()=>setAdding(false)} style={{padding:'6px 12px',backgroundColor:'transparent',color:C.muted,border:'1px solid ' + C.border,borderRadius:'4px',fontSize:'12px',cursor:'pointer',fontFamily:'system-ui'}}>Cancel</button>
          </div>
        </div>
      )}

      {chs.length===0&&!adding&&!importPrompt&&<div style={{backgroundColor:C.bgCard,border:'1px dashed ' + C.borderMid,borderRadius:'7px',padding:'24px',textAlign:'center',marginBottom:'20px'}}><div style={{fontSize:'12px',color:C.muted+'88',fontFamily:'system-ui',fontStyle:'italic'}}>No chapters yet. Add your story structure here, import from a file, or pull from your Library.<br/>Tension levels visualise your narrative arc.</div></div>}

      {chs.length>0&&(
        <div style={{backgroundColor:C.bgCard,border:'1px solid ' + C.border,borderRadius:'6px',padding:'14px',marginBottom:'14px'}}>
          <div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'8px'}}>Tension Arc</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:'4px',height:'56px'}}>
            {chs.map(c=><div key={c.id} title={'Ch.' + c.num + ': ' + c.title} style={{flex:1,height:c.tension*5+'px',backgroundColor:sc[c.status]||C.muted,borderRadius:'2px 2px 0 0',opacity:0.85}}/>)}
          </div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'24px'}}>
        {chs.map(c=>(
          <div key={c.id} style={{backgroundColor:C.bgCard,border:'1px solid ' + C.border,borderLeft:'3px solid ' + (sc[c.status]||C.muted),borderRadius:'0 5px 5px 0',padding:'10px 14px',display:'flex',gap:'12px',alignItems:'center'}}>
            <div style={{fontSize:'18px',fontWeight:'bold',color:'#2a2025',minWidth:'22px',textAlign:'right',fontFamily:'system-ui'}}>{c.num}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:'13px'}}>{c.title}{c.wordCount ? <span style={{fontSize:10,color:C.muted,fontFamily:'system-ui',marginLeft:6}}>{c.wordCount.toLocaleString()} words</span> : ''}</div>
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
          <button onClick={()=>setAddFlag(true)} style={{padding:'4px 12px',backgroundColor:C.gold+'22',color:C.gold,border:'1px solid ' + C.gold + '44',borderRadius:'4px',fontSize:'10px',cursor:'pointer',fontFamily:'system-ui'}}>+ Flag</button>
        </div>
        {addFlag&&(
          <div style={{backgroundColor:C.bgElevated,border:'1px solid ' + C.gold + '55',borderRadius:'6px',padding:'10px 12px',marginBottom:'8px',display:'flex',gap:'8px'}}>
            <input value={flagInput} onChange={e=>setFlagInput(e.target.value)} placeholder="Continuity issue or unresolved thread..."
              style={{flex:3,padding:'6px 9px',backgroundColor:C.bg,border:'1px solid ' + C.borderMid,borderRadius:'4px',color:C.parch,fontSize:'12px',outline:'none',fontFamily:'Georgia,serif'}}/>
            <input value={flagCh} onChange={e=>setFlagCh(e.target.value)} placeholder="Ch. ref..."
              style={{flex:1,padding:'6px 9px',backgroundColor:C.bg,border:'1px solid ' + C.borderMid,borderRadius:'4px',color:C.parch,fontSize:'11px',outline:'none',fontFamily:'system-ui'}}/>
            <button onClick={()=>{if(flagInput.trim()){setFlags(p=>[...p,{id:genId(),text:flagInput,chapter:flagCh}]);setFlagInput('');setFlagCh('');setAddFlag(false);}}} style={{padding:'6px 12px',backgroundColor:C.gold,color:C.bg,border:'none',borderRadius:'4px',fontSize:'11px',cursor:'pointer',fontFamily:'system-ui'}}>Add</button>
          </div>
        )}
        {flags.length===0&&!addFlag&&<div style={{fontSize:'11px',color:C.muted+'77',fontStyle:'italic',fontFamily:'system-ui'}}>No flags yet. Track continuity issues and unresolved plot threads here.</div>}
        <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
          {flags.map(f=>(
            <div key={f.id} style={{display:'flex',gap:'10px',padding:'8px 10px',backgroundColor:C.bgCard,border:'1px solid ' + C.border,borderLeft:'3px solid ' + (f.resolved ? C.green : C.gold),borderRadius:'0 4px 4px 0',opacity:f.resolved?0.7:1}}>
              <div style={{flex:1,fontSize:'11px',color:C.mutedLight,fontStyle:'italic',lineHeight:'1.5',textDecoration:f.resolved?'line-through':'none'}}>{f.text}</div>
              {f.chapter&&<span style={{fontSize:'9px',color:f.resolved?C.green:C.gold,fontFamily:'system-ui',backgroundColor:f.resolved?C.green+'22':'#2a1e04',padding:'2px 6px',borderRadius:'3px',whiteSpace:'nowrap',alignSelf:'flex-start'}}>{f.chapter}</span>}
              <button onClick={()=>setFlags(p=>p.map(x=>x.id===f.id?{...x,resolved:!x.resolved}:x))} style={{fontSize:'9px',color:f.resolved?C.green:C.muted,background:'none',border:'1px solid '+(f.resolved?C.green+'44':C.border),borderRadius:'3px',padding:'2px 8px',cursor:'pointer',fontFamily:'system-ui',whiteSpace:'nowrap',alignSelf:'flex-start'}}>{f.resolved?'Resolved':'Resolve'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
