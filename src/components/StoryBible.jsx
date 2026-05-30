import { useState } from "react";
import { C, genId } from "../constants.js";
import { CharacterQuestionnaire } from "./Psychology/CharacterQuestionnaire.jsx";
import { PsychologyReview } from "./Psychology/PsychologyReview.jsx";
import { inferCharacterPsychology } from "./Psychology/psychologyInference.js";
import { enneagramHeadline } from "./Psychology/enneagramMapper.js";

export function StoryBible({ chars, setChars, lore, setLore, storySnapshot = '', setStorySnapshot = () => {}, worldRules = null }) {
  const [addCh, setAddCh] = useState(false);
  const [addLr, setAddLr] = useState(false);
  const [nc, setNc] = useState({name:'',species:'',role:'',traits:'',stakes:'',secrets:'',contradictions:''});
  const [nl, setNl] = useState({cat:'Lore',rule:''});
  const [exp, setExp] = useState(null);
  const [localSnapshot, setLocalSnapshot] = useState(storySnapshot);

  // Phase 7/7a — Psychology editor modal state
  // psychState: null | { charId, step: 'choose' | 'questionnaire' | 'review' | 'inferring' | 'error', profile?, error? }
  const [psychState, setPsychState] = useState(null);

  // Smart default: questionnaire if profile text is thin, inference if it's substantial.
  const profileTextLen = (c) =>
    (c?.traits?.length || 0) + (c?.stakes?.length || 0) + (c?.secrets?.length || 0)
    + (c?.contradictions?.length || 0) + (c?.description?.length || 0);

  const openPsychology = (char) => {
    setPsychState({ charId: char.id, step: 'choose' });
  };

  const closePsychology = () => setPsychState(null);

  const runInference = async (char) => {
    setPsychState(p => ({ ...p, step: 'inferring' }));
    try {
      const rulesText = (worldRules?.customNarrativeRules || '').slice(0, 4000);
      const res = await inferCharacterPsychology({ char, worldRulesText: rulesText });
      if (!res.ok) {
        setPsychState(p => ({ ...p, step: 'error', error: res.error }));
        return;
      }
      setPsychState(p => ({ ...p, step: 'review', profile: res.profile }));
    } catch (err) {
      setPsychState(p => ({ ...p, step: 'error', error: err.message || String(err) }));
    }
  };

  const saveProfile = (char, profile) => {
    setChars(prev => prev.map(c => c.id === char.id ? { ...c, psychology: profile } : c));
    closePsychology();
  };

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
      {/* Phase 6/6a-i — Story State */}
      <div style={{marginBottom:'28px'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:'8px'}}>
          <h2 style={{margin:0,fontSize:'16px'}}>Story State</h2>
          <span style={{fontSize:'10px',color:C.muted,fontFamily:'system-ui',fontStyle:'italic'}}>The moment Deep Simulation projects forward from</span>
        </div>
        <textarea
          value={localSnapshot}
          onChange={e => setLocalSnapshot(e.target.value)}
          onBlur={() => { if (localSnapshot !== storySnapshot) setStorySnapshot(localSnapshot); }}
          placeholder="Describe where your story is right now. Example: 'Jojo and his companions have just learned Garm has disappeared. They're gathered in the central city deciding whether to chase the trail or wait. The Witch's spies are already moving.'"
          style={{width:'100%',minHeight:'90px',padding:'10px 12px',backgroundColor:C.bg,border:`1px solid ${C.borderMid}`,borderRadius:'5px',color:C.parch,fontSize:'13px',outline:'none',fontFamily:'Georgia,serif',resize:'vertical',boxSizing:'border-box',lineHeight:'1.6'}}/>
      </div>

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
                <div style={{marginTop:'12px',borderTop:`1px solid ${C.border}`,paddingTop:'12px'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                    {[['Traits',c.traits,C.mutedLight],['What they stand to lose',c.stakes,C.gold],['Secrets',c.secrets,C.accBright],['Contradictions',c.contradictions,C.purpleLight]].map(([l,v,col])=>v?(
                      <div key={l}><div style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'3px'}}>{l}</div><div style={{fontSize:'12px',color:col,fontStyle:'italic',lineHeight:'1.5'}}>{v}</div></div>
                    ):null)}
                  </div>
                  {/* Phase 7/7a — Psychology block */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:'10px',display:'flex',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'9px',color:C.muted,fontFamily:'system-ui',textTransform:'uppercase',letterSpacing:'0.1em'}}>Psychology</span>
                    {c.psychology?.enneagram?.type ? (
                      <span style={{fontSize:'11px',color:C.purpleLight,fontFamily:'system-ui'}}>
                        {enneagramHeadline(c.psychology)}
                        {' · '}
                        <span style={{color:C.muted,fontStyle:'italic'}}>{c.psychology.source}</span>
                      </span>
                    ) : (
                      <span style={{fontSize:'11px',color:C.muted,fontStyle:'italic',fontFamily:'system-ui'}}>not set</span>
                    )}
                    <span style={{flex:1}}/>
                    <button onClick={()=>openPsychology(c)} style={{padding:'4px 10px',fontSize:'10px',fontFamily:'system-ui',backgroundColor:c.psychology?.enneagram?.type?'transparent':C.purple+'22',color:c.psychology?.enneagram?.type?C.muted:C.purpleLight,border:`1px solid ${c.psychology?.enneagram?.type?C.border:C.purple+'66'}`,borderRadius:'3px',cursor:'pointer'}}>
                      {c.psychology?.enneagram?.type ? 'Edit psychology' : '+ Set psychology'}
                    </button>
                  </div>
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

      {/* Phase 7/7a — Psychology modal */}
      {psychState && (() => {
        const char = chars.find(c => c.id === psychState.charId);
        if (!char) return null;
        return (
          <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.6)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'40px 20px',overflowY:'auto',zIndex:50}}
               onClick={(e)=>{ if (e.target === e.currentTarget) closePsychology(); }}>
            <div style={{backgroundColor:C.bg,border:`1px solid ${C.border}`,borderRadius:'8px',maxWidth:'820px',width:'100%',padding:'20px'}}>
              {psychState.step === 'choose' && (
                <div style={{padding:'10px 16px'}}>
                  <div style={{fontSize:'14px',color:C.purpleLight,fontFamily:'Georgia,serif',marginBottom:'10px'}}>
                    Psychology for <strong>{char.name}</strong>
                  </div>
                  <div style={{fontSize:'12px',color:C.mutedLight,fontFamily:'system-ui',lineHeight:'1.6',marginBottom:'18px'}}>
                    A psychological profile shapes how this character decides in every scenario.
                    {profileTextLen(char) > 60
                      ? ' Their profile text is rich — AI inference is recommended.'
                      : ' Their profile text is sparse — the questionnaire is recommended.'}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                    <button onClick={()=>setPsychState(p=>({...p,step:'questionnaire'}))}
                      style={{padding:'14px 18px',backgroundColor:profileTextLen(char)>60?C.bgCard:C.purple,color:profileTextLen(char)>60?C.parch:'#fff',border:`1px solid ${profileTextLen(char)>60?C.border:C.purple}`,borderRadius:'5px',fontSize:'13px',fontFamily:'system-ui',textAlign:'left',cursor:'pointer'}}>
                      <div style={{fontWeight:600,marginBottom:'4px'}}>Answer a few questions</div>
                      <div style={{fontSize:'10px',color:profileTextLen(char)>60?C.muted:'#ffffffbb'}}>~10 questions. No LLM. $0.</div>
                    </button>
                    <button onClick={()=>runInference(char)}
                      style={{padding:'14px 18px',backgroundColor:profileTextLen(char)>60?C.purple:C.bgCard,color:profileTextLen(char)>60?'#fff':C.parch,border:`1px solid ${profileTextLen(char)>60?C.purple:C.border}`,borderRadius:'5px',fontSize:'13px',fontFamily:'system-ui',textAlign:'left',cursor:'pointer'}}>
                      <div style={{fontWeight:600,marginBottom:'4px'}}>Let AI infer from the profile</div>
                      <div style={{fontSize:'10px',color:profileTextLen(char)>60?'#ffffffbb':C.muted}}>One Sonnet call. ~$0.01–0.02.</div>
                    </button>
                  </div>
                  <div style={{marginTop:'14px',textAlign:'right'}}>
                    <button onClick={closePsychology} style={{padding:'6px 12px',backgroundColor:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:'4px',fontSize:'11px',fontFamily:'system-ui',cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              )}

              {psychState.step === 'inferring' && (
                <div style={{padding:'40px',textAlign:'center'}}>
                  <div style={{fontSize:'13px',color:C.purpleLight,fontFamily:'Georgia,serif',marginBottom:'12px'}}>Reading {char.name}'s profile…</div>
                  <div style={{display:'inline-block',width:24,height:24,border:`2px solid ${C.purple}33`,borderTopColor:C.purpleLight,borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {psychState.step === 'questionnaire' && (
                <CharacterQuestionnaire
                  characterName={char.name}
                  onComplete={(profile) => setPsychState(p=>({...p,step:'review',profile}))}
                  onCancel={closePsychology}
                />
              )}

              {psychState.step === 'review' && (
                <PsychologyReview
                  character={char}
                  profile={psychState.profile}
                  onSave={(profile) => saveProfile(char, profile)}
                  onCancel={closePsychology}
                />
              )}

              {psychState.step === 'error' && (
                <div style={{padding:'24px'}}>
                  <div style={{fontSize:'12px',color:C.accBright,fontFamily:'system-ui',marginBottom:'10px'}}>Inference failed: {psychState.error}</div>
                  <button onClick={()=>setPsychState(p=>({...p,step:'choose'}))} style={{padding:'6px 12px',backgroundColor:C.purple+'22',color:C.purpleLight,border:`1px solid ${C.purple}55`,borderRadius:'4px',fontSize:'11px',fontFamily:'system-ui',cursor:'pointer'}}>Try again</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── SIMULATION ── */
