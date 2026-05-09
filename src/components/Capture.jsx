import { useState } from "react";
import { C, genId } from "../constants.js";

export function Capture() {
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

/* ── LIBRARY PANEL ── */
