import { useState } from "react";
import { C, genId } from "../constants.js";

export function StoryBible({ chars, setChars, lore, setLore }) {
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
