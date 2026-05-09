import { useState, useEffect, useRef } from "react";
import { C } from "../constants.js";
import { callClaude } from "../api.js";

const ARC_DATA = {
  rags_to_riches: [2,3,4,5,6,7,8,9],
  tragedy:        [8,7,7,6,5,4,3,2],
  man_in_hole:    [5,4,3,2,4,6,8,9],
  icarus:         [5,6,7,8,9,7,4,2],
  cinderella:     [4,6,7,5,3,5,8,10],
  oedipus:        [7,5,3,5,7,8,6,3],
};

const ARC_LABELS = {
  rags_to_riches:'Rags to Riches', tragedy:'Tragedy', man_in_hole:'Man in a Hole',
  icarus:'Icarus', cinderella:'Cinderella', oedipus:'Oedipus', discover:'Discover'
};

const ARC_NOTES = {
  rags_to_riches: "Most consistently liked across demographics",
  tragedy: "Most critically acclaimed, least commercial",
  man_in_hole: "Highest commercial revenue (Cornell, 6,147 scripts)",
  icarus: "Most downloaded arc type (Vermont, 1,700+ novels)",
  cinderella: "Most emotionally satisfying ending",
  oedipus: "Most downloaded arc type (Vermont, 1,700+ novels)",
  discover: "Auto-detects from your tension data after 3 chapters",
};

const SEGMENT_COLORS = [C.accBright, C.purple, C.gold, C.green, C.teal];
const SEGMENT_LABELS = ['Characters','World Rules','Chapters','Continuity','Simulations'];

const PULSE_TABS = { continuity:'timeline', character:'bible', pacing:'write', theme:'mindmap', gap:'simulation' };
const PULSE_COLORS = { continuity:C.accBright, character:C.purple, pacing:C.gold, theme:C.teal, gap:C.blue };

const smoothPath = (points) => {
  if (points.length < 2) return '';
  let d = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const cp1x = points[i].x + (points[i+1].x - points[i].x) / 3;
    const cp1y = points[i].y;
    const cp2x = points[i+1].x - (points[i+1].x - points[i].x) / 3;
    const cp2y = points[i+1].y;
    d += ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + points[i+1].x + ' ' + points[i+1].y;
  }
  return d;
};

const interpArc = (arcKey, count) => {
  const ref = ARC_DATA[arcKey];
  if (!ref || count < 1) return [];
  return Array.from({length: count}, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    const fi = t * 7;
    const lo = Math.floor(fi), hi = Math.min(lo + 1, 7), frac = fi - lo;
    return ref[lo] * (1 - frac) + ref[hi] * frac;
  });
};

/* ── Panel wrapper ── */
const Panel = ({children, style}) => (
  <div style={{backgroundColor:C.bgCard, border:'1px solid ' + C.border, borderRadius:8, padding:14, minHeight:180, ...style}}>
    {children}
  </div>
);

const PanelTitle = ({children}) => (
  <div style={{fontSize:11, color:C.muted, fontFamily:'system-ui', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10}}>{children}</div>
);

/* ── STORY ARC GRAPH ── */
function ArcGraph({ chapters, selectedArc, setSelectedArc, setTab }) {
  const svgW = 460, svgH = 180, pT = 20, pR = 20, pB = 30, pL = 30;
  const gW = svgW - pL - pR, gH = svgH - pT - pB;
  const actual = (chapters || []).filter(c => c.tension > 0);
  const toY = (t) => gH - ((t - 1) / 9 * gH) + pT;
  const toX = (i, len) => len <= 1 ? pL + gW / 2 : pL + (i / (len - 1)) * gW;

  const actualPts = actual.map((c, i) => ({ x: toX(i, actual.length), y: toY(c.tension), tension: c.tension, title: c.title }));
  const arcTargets = selectedArc !== 'discover' ? interpArc(selectedArc, actual.length) : [];
  const targetPts = arcTargets.map((t, i) => ({ x: toX(i, actual.length), y: toY(t) }));

  let score = null;
  if (actual.length >= 2 && selectedArc !== 'discover' && arcTargets.length > 0) {
    const diff = actualPts.reduce((s, p, i) => s + Math.abs(p.tension - arcTargets[i]), 0) / actual.length;
    score = Math.max(0, Math.min(100, Math.round(100 - (diff / 10 * 100))));
  }

  // Auto-detect
  const [detected, setDetected] = useState(null);
  useEffect(() => {
    if (selectedArc !== 'discover' || actual.length < 3) { setDetected(null); return; }
    let best = null, bestScore = -1;
    for (const key of Object.keys(ARC_DATA)) {
      const targets = interpArc(key, actual.length);
      const diff = actual.reduce((s, c, i) => s + Math.abs(c.tension - targets[i]), 0) / actual.length;
      const sc = Math.max(0, Math.min(100, Math.round(100 - (diff / 10 * 100))));
      if (sc > bestScore) { bestScore = sc; best = key; }
    }
    if (bestScore > 55) setDetected({ key: best, score: bestScore });
    else setDetected(null);
  }, [selectedArc, chapters]);

  return (
    <div>
      <PanelTitle>Story Arc</PanelTitle>
      <svg width="100%" viewBox={'0 0 ' + svgW + ' ' + svgH} style={{display:'block'}}>
        {/* Neutral line */}
        <line x1={pL} y1={toY(5)} x2={pL+gW} y2={toY(5)} stroke={C.border} strokeDasharray="3 3"/>
        <text x={pL-8} y={toY(5)+3} fontSize={8} fill={C.muted} textAnchor="end">5</text>

        {/* Target arc ghost */}
        {targetPts.length >= 2 && (
          <path d={smoothPath(targetPts)} stroke={C.purple + '55'} strokeDasharray="6 4" strokeWidth={2} fill="none"/>
        )}

        {/* Actual arc */}
        {actualPts.length >= 2 && (
          <path d={smoothPath(actualPts)} stroke={C.gold} strokeWidth={2.5} fill="none"/>
        )}
        {actualPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill={C.gold}>
            <title>{p.title + ': tension ' + p.tension}</title>
          </circle>
        ))}

        {/* Empty state */}
        {actual.length === 0 && (
          <text x={svgW/2} y={svgH/2} textAnchor="middle" fontSize={11} fill={C.muted} fontFamily="system-ui">
            Add chapters with tension values in Timeline
          </text>
        )}
      </svg>

      {/* Match score */}
      {score !== null && (
        <div style={{fontSize:11, fontFamily:'system-ui', color: score > 70 ? C.green : score > 40 ? C.gold : C.accBright, marginTop:4}}>
          Arc Match: {score}%
        </div>
      )}

      {/* Auto-detection banner */}
      {detected && (
        <div style={{marginTop:6, padding:'6px 10px', backgroundColor:C.purple+'15', border:'1px solid '+C.purple+'33', borderRadius:6, fontSize:11, fontFamily:'system-ui', color:C.purpleLight, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <span>Your story shapes like <b>{ARC_LABELS[detected.key]}</b> ({detected.score}% match)</span>
          <button onClick={()=>setSelectedArc(detected.key)} style={{padding:'2px 8px',backgroundColor:C.purple,color:'#fff',border:'none',borderRadius:3,fontSize:10,cursor:'pointer',fontFamily:'system-ui'}}>Set as target</button>
          <button onClick={()=>setDetected(null)} style={{padding:'2px 8px',backgroundColor:'transparent',color:C.muted,border:'1px solid '+C.border,borderRadius:3,fontSize:10,cursor:'pointer',fontFamily:'system-ui'}}>Keep discovering</button>
        </div>
      )}

      {/* Arc selector */}
      <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap', alignItems:'flex-end'}}>
        {Object.keys(ARC_DATA).map(key => {
          const pts = ARC_DATA[key];
          const sel = selectedArc === key;
          return (
            <div key={key} onClick={()=>setSelectedArc(key)} style={{cursor:'pointer', textAlign:'center'}}>
              <svg width={68} height={32} viewBox="0 0 68 32" style={{display:'block', border: sel ? '1px solid '+C.purpleLight : '1px solid '+C.border, borderRadius:4, backgroundColor: sel ? C.purple+'15' : 'transparent'}}>
                <polyline
                  points={pts.map((v,i) => (4+i*60/7)+','+(28-(v-1)/9*24)).join(' ')}
                  stroke={sel ? C.purpleLight : C.mutedLight}
                  strokeWidth={1.5} fill="none"
                />
              </svg>
              <div style={{fontSize:8, color: sel ? C.purpleLight : C.muted, fontFamily:'system-ui', marginTop:2}}>{ARC_LABELS[key]}</div>
            </div>
          );
        })}
        <div onClick={()=>setSelectedArc('discover')} style={{cursor:'pointer', textAlign:'center', padding:'8px 6px', border: selectedArc==='discover' ? '1px solid '+C.purpleLight : '1px solid '+C.border, borderRadius:4, backgroundColor: selectedArc==='discover' ? C.purple+'15' : 'transparent'}}>
          <div style={{fontSize:10, color: selectedArc==='discover' ? C.purpleLight : C.muted, fontFamily:'system-ui'}}>Discover</div>
        </div>
      </div>

      {/* Popularity note */}
      <div style={{fontSize:10, color:C.muted, fontFamily:'system-ui', fontStyle:'italic', marginTop:6}}>
        {ARC_NOTES[selectedArc] || ''}
      </div>

      {/* Flat-arc warning when all tension values are identical */}
      {actual.length >= 2 && (() => {
        const allSame = actual.every(c => c.tension === actual[0].tension);
        if (!allSame) return null;
        return (
          <div style={{marginTop:8, padding:'6px 10px', backgroundColor:C.gold+'12', border:'1px solid '+C.gold+'33', borderRadius:5, fontSize:11, fontFamily:'system-ui', color:C.gold, lineHeight:'1.5'}}>
            All chapters have the same tension level ({actual[0].tension}). <button onClick={()=>setTab('timeline')} style={{color:C.purpleLight, background:'none', border:'none', cursor:'pointer', fontFamily:'system-ui', fontSize:11, padding:0, textDecoration:'underline'}}>Go to Timeline &rarr;</button> adjust each chapter&apos;s tension (1&ndash;10) to see your real story arc.
          </div>
        );
      })()}
    </div>
  );
}

/* ── NARRATIVE HEALTH DIAL ── */
function HealthDial({ chars, lore, chapters, contFlags, simulationCount }) {
  const r = 55, cx = 75, cy = 75, circ = 2 * Math.PI * r;
  const segLen = circ / 5, gap = 4, eff = segLen - gap;

  const charComplete = chars.length === 0 ? 0 : Math.round(
    chars.filter(c => c.name && c.traits && c.secrets && c.stakes && c.contradictions).length / chars.length * 100
  );
  const worldRules = Math.round(Math.min(lore.length / 10, 1) * 100);
  const chapDone = Math.round(
    (chapters || []).filter(c => c.status === 'complete' || c.status === 'current').length / Math.max((chapters||[]).length, 1) * 100
  );
  const continuity = contFlags.length === 0 ? 100 : Math.round(
    contFlags.filter(f => f.resolved).length / contFlags.length * 100
  );
  const sims = Math.round(Math.min(simulationCount / 3, 1) * 100);
  const values = [charComplete, worldRules, chapDone, continuity, sims];
  const overall = Math.round(values.reduce((a,b)=>a+b,0) / 5);

  return (
    <div>
      <PanelTitle>Story Health</PanelTitle>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
        <svg width={150} height={150} viewBox="0 0 150 150">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={12}/>
          {values.map((v, i) => {
            const fill = (v / 100) * eff;
            const offset = -(i * segLen);
            return (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={SEGMENT_COLORS[i]} strokeWidth={12} strokeLinecap="butt"
                strokeDasharray={fill + ' ' + (circ - fill)}
                strokeDashoffset={offset}
                transform={'rotate(' + (i * 72 - 90) + ' ' + cx + ' ' + cy + ')'}
              />
            );
          })}
          <text x={cx} y={cy+2} textAnchor="middle" fontSize={20} fontWeight="bold" fill={C.parch} fontFamily="Georgia,serif">{overall}%</text>
          <text x={cx} y={cy+16} textAnchor="middle" fontSize={10} fill={C.muted} fontFamily="system-ui">Story Health</text>
        </svg>
        <div style={{marginTop:8, width:'100%'}}>
          {SEGMENT_LABELS.map((label, i) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
              <div style={{width:8, height:8, borderRadius:'50%', backgroundColor:SEGMENT_COLORS[i], flexShrink:0}}/>
              <span style={{fontSize:10, color:C.mutedLight, fontFamily:'system-ui', flex:1}}>{label}</span>
              <span style={{fontSize:10, color:C.parch, fontFamily:'system-ui'}}>{values[i]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── CHARACTER UNIVERSE MINI-MAP ── */
function CharUniverse({ relNodes, relEdges, setTab }) {
  if (!relNodes || relNodes.length === 0) {
    return (
      <div>
        <PanelTitle>Character Universe</PanelTitle>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:120}}>
          <svg width={80} height={80} viewBox="0 0 80 80">
            <circle cx={40} cy={40} r={30} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="4 4"/>
          </svg>
          <div style={{fontSize:11, color:C.muted, fontFamily:'system-ui', textAlign:'center', marginTop:8}}>Add relationships to see your character universe</div>
          <button onClick={()=>setTab('relweb')} style={{marginTop:6, fontSize:10, color:C.purpleLight, background:'none', border:'none', cursor:'pointer', fontFamily:'system-ui'}}>Go to Relationship Web</button>
        </div>
      </div>
    );
  }

  const xs = relNodes.map(n => n.x), ys = relNodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pw = 200, ph = 140;
  const sx = (pw - 40) / Math.max(maxX - minX, 1);
  const sy = (ph - 40) / Math.max(maxY - minY, 1);
  const scale = Math.min(sx, sy, 2);

  const relColors = {ally:C.green, rival:C.accBright, mentor:C.purpleLight, lover:C.gold, family:C.teal, neutral:C.muted};

  return (
    <div onClick={()=>setTab('relweb')} style={{cursor:'pointer'}}>
      <PanelTitle>Character Universe</PanelTitle>
      <svg width="100%" viewBox={'0 0 ' + pw + ' ' + ph}>
        {(relEdges||[]).map((e, i) => {
          const from = relNodes.find(n => n.id === e.from);
          const to = relNodes.find(n => n.id === e.to);
          if (!from || !to) return null;
          return <line key={i}
            x1={(from.x-minX)*scale+20} y1={(from.y-minY)*scale+20}
            x2={(to.x-minX)*scale+20} y2={(to.y-minY)*scale+20}
            stroke={relColors[e.type]||C.muted} strokeWidth={1} opacity={0.5}/>;
        })}
        {relNodes.map((n, i) => {
          const nx = (n.x-minX)*scale+20, ny = (n.y-minY)*scale+20;
          return (
            <g key={i}>
              <circle cx={nx} cy={ny} r={8} fill={C.node[n.type]||C.accBright}/>
              <text x={nx} y={ny+18} textAnchor="middle" fontSize={8} fill={C.mutedLight}>{(n.label||'').slice(0,8)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── ACTIVE THREADS ── */
function ActiveThreads({ contFlags, setTab }) {
  if (!contFlags || contFlags.length === 0) {
    return (
      <div>
        <PanelTitle>Active Threads</PanelTitle>
        <div style={{fontSize:11, color:C.muted, fontStyle:'italic', fontFamily:'system-ui'}}>No continuity flags yet. Add them in <button onClick={()=>setTab('timeline')} style={{color:C.purpleLight, background:'none', border:'none', cursor:'pointer', fontFamily:'system-ui', fontSize:11, padding:0, textDecoration:'underline'}}>Timeline</button>.</div>
      </div>
    );
  }
  const unresolved = contFlags.filter(f => !f.resolved);
  const resolved = contFlags.filter(f => f.resolved);
  const shown = [...unresolved, ...resolved].slice(0, 8);
  return (
    <div>
      <PanelTitle>Active Threads</PanelTitle>
      <div style={{fontSize:10, color:C.muted, fontFamily:'system-ui', marginBottom:6}}>
        {unresolved.length} open{resolved.length > 0 ? ' · ' + resolved.length + ' resolved' : ''}
      </div>
      {shown.map((f, i) => (
        <div key={f.id || i} style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, paddingLeft:8, borderLeft:'3px solid ' + (f.resolved ? C.green : C.gold)}}>
          <span style={{fontSize:12, color:f.resolved ? C.muted : C.mutedLight, fontFamily:'system-ui', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:f.resolved ? 'line-through' : 'none'}}>{f.text || f.label || 'Flag ' + (i+1)}</span>
          {f.resolved && <span style={{fontSize:8, color:C.green, fontFamily:'system-ui', flexShrink:0, textTransform:'uppercase', letterSpacing:'0.05em'}}>resolved</span>}
          {f.chapter && <span style={{fontSize:9, backgroundColor:(f.resolved ? C.green : C.gold)+'22', color:f.resolved ? C.green : C.gold, padding:'1px 6px', borderRadius:8, fontFamily:'system-ui', flexShrink:0}}>Ch {f.chapter}</span>}
        </div>
      ))}
      {contFlags.length > 8 && (
        <button onClick={()=>setTab('timeline')} style={{fontSize:10, color:C.purpleLight, background:'none', border:'none', cursor:'pointer', fontFamily:'system-ui', marginTop:4}}>
          View all {contFlags.length} threads
        </button>
      )}
    </div>
  );
}

/* ── SIMULATION INSIGHTS ── */
function SimInsights({ lastSimulation, setTab }) {
  const [showReport, setShowReport] = useState(false);

  if (!lastSimulation) {
    return (
      <div>
        <PanelTitle>Simulation Insights</PanelTitle>
        <div style={{fontSize:11, color:C.muted, fontFamily:'system-ui', marginBottom:8}}>No simulations run yet.</div>
        <button onClick={()=>setTab('simulation')} style={{padding:'6px 12px', backgroundColor:C.purple, color:'#fff', border:'none', borderRadius:4, fontSize:11, cursor:'pointer', fontFamily:'system-ui'}}>
          Launch Simulation
        </button>
      </div>
    );
  }

  const dateStr = lastSimulation.date ? new Date(lastSimulation.date).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '';
  const findingMatch = lastSimulation.result ? lastSimulation.result.match(/\*\*The plot path[^*]*\*\*\s*([\s\S]*?)(?=\*\*|$)/i) : null;
  const finding = findingMatch ? findingMatch[1].trim().slice(0, 120) : '';

  return (
    <div>
      <PanelTitle>Simulation Insights</PanelTitle>
      {dateStr && <div style={{fontSize:9, color:C.muted, fontFamily:'system-ui', marginBottom:4}}>{dateStr}</div>}
      {lastSimulation.scenario && <div style={{fontSize:11, fontStyle:'italic', color:C.mutedLight, fontFamily:'system-ui', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{lastSimulation.scenario.slice(0,80)}</div>}

      {lastSimulation.divergenceOn && lastSimulation.residualPct != null && (
        <div style={{marginBottom:6}}>
          <span style={{fontSize:10, color:C.accBright, fontFamily:'system-ui'}}>Residual believers: {lastSimulation.residualPct}%</span>
          <div style={{width:'100%', height:3, backgroundColor:C.border, borderRadius:2, marginTop:3}}>
            <div style={{width:lastSimulation.residualPct+'%', height:'100%', backgroundColor:C.accBright, borderRadius:2}}/>
          </div>
        </div>
      )}

      {finding && <div style={{fontSize:11, fontStyle:'italic', color:C.mutedLight, fontFamily:'Georgia,serif', lineHeight:'1.5', marginBottom:8}}>{finding}...</div>}

      <div style={{display:'flex', gap:6}}>
        <button onClick={()=>setTab('simulation')} style={{padding:'4px 10px', backgroundColor:C.purple+'33', color:C.purpleLight, border:'1px solid '+C.purple+'44', borderRadius:3, fontSize:10, cursor:'pointer', fontFamily:'system-ui'}}>Run Again</button>
        <button onClick={()=>setShowReport(true)} style={{padding:'4px 10px', backgroundColor:'transparent', color:C.muted, border:'1px solid '+C.border, borderRadius:3, fontSize:10, cursor:'pointer', fontFamily:'system-ui'}}>Full Report</button>
      </div>

      {showReport && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'#000c', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setShowReport(false)}>
          <div style={{width:'600px', maxHeight:'80vh', overflow:'auto', backgroundColor:C.bgCard, border:'1px solid '+C.border, borderRadius:8, padding:20}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
              <span style={{fontSize:14, color:C.parch, fontFamily:'Georgia,serif'}}>Simulation Report</span>
              <button onClick={()=>setShowReport(false)} style={{background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:16}}>x</button>
            </div>
            <div style={{fontSize:12, color:C.mutedLight, fontFamily:'system-ui', lineHeight:'1.7', whiteSpace:'pre-wrap'}}>{lastSimulation.result}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── AI PULSE ── */
function AIPulse({ project, chars, lore, chapters, setTab, setAiOpen }) {
  const [pulseData, setPulseData] = useState(null);
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseError, setPulseError] = useState(false);

  const generatePulse = async () => {
    setPulseLoading(true); setPulseError(false);
    const ctx = [
      project?.title && 'Title: ' + project.title,
      project?.genre && 'Genre: ' + project.genre,
      chars.length > 0 && 'Characters: ' + chars.map(c=>c.name).join(', '),
      lore.length > 0 && 'World rules: ' + lore.length + ' defined',
      (chapters||[]).length > 0 && 'Chapters: ' + (chapters||[]).length + (chapters[chapters.length-1]?.tension ? ', latest tension: ' + chapters[chapters.length-1].tension : ''),
    ].filter(Boolean).join('\n');

    if (!ctx) {
      setPulseData([
        {type:'character', observation:'Add characters to get personalised insights', action:'Open Bible'},
        {type:'pacing', observation:'Add chapters with tension levels to see arc analysis', action:'Open Timeline'},
        {type:'theme', observation:'Run a simulation to discover emergent story patterns', action:'Simulate'},
      ]);
      setPulseLoading(false);
      return;
    }

    try {
      const data = await callClaude({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'You are a story analyst. Return ONLY a JSON array, no other text.',
        messages: [{
          role: 'user',
          content: 'Project data:\n' + ctx + '\n\nGenerate exactly 3 story observations.\nEach must be specific to this project, under 15 words, actionable.\nTypes: continuity, character, pacing, theme, gap.\nReturn ONLY this JSON array:\n[{"type":"...","observation":"...","action":"2-4 words"}]'
        }]
      });
      const text = data.content?.[0]?.text || '[]';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setPulseData(Array.isArray(parsed) ? parsed.slice(0,3) : []);
    } catch {
      setPulseError(true);
    }
    setPulseLoading(false);
  };

  useEffect(() => { generatePulse(); }, []);

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <PanelTitle>AI Pulse</PanelTitle>
        <button onClick={generatePulse} style={{fontSize:10, color:C.muted, background:'none', border:'none', cursor:'pointer', fontFamily:'system-ui'}}>Refresh</button>
      </div>

      {pulseLoading && (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {[0,1,2].map(i => (
            <div key={i} style={{height:40, backgroundColor:C.bgElevated, borderRadius:6, opacity:0.4, animation:'pulse 1.5s ease infinite'}}/>
          ))}
          <div style={{fontSize:10, color:C.muted, fontFamily:'system-ui', textAlign:'center'}}>Analysing your story...</div>
        </div>
      )}

      {pulseError && <div style={{fontSize:11, color:C.muted, fontFamily:'system-ui'}}>Analysis unavailable</div>}

      {pulseData && !pulseLoading && (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {pulseData.map((item, i) => (
            <div key={i} style={{backgroundColor:C.bgElevated, borderRadius:6, padding:'8px 10px'}}>
              <span style={{fontSize:9, backgroundColor:(PULSE_COLORS[item.type]||C.muted)+'33', color:PULSE_COLORS[item.type]||C.muted, padding:'1px 6px', borderRadius:8, fontFamily:'system-ui', textTransform:'uppercase'}}>{item.type}</span>
              <div style={{fontSize:12, fontFamily:'Georgia,serif', fontStyle:'italic', color:C.parch, marginTop:4, lineHeight:'1.4'}}>{item.observation}</div>
              <div style={{display:'flex', gap:6, marginTop:6}}>
                <button onClick={()=>setTab(PULSE_TABS[item.type]||'mindmap')} style={{padding:'2px 8px', backgroundColor:C.purple+'33', color:C.purpleLight, border:'none', borderRadius:3, fontSize:9, cursor:'pointer', fontFamily:'system-ui'}}>{item.action}</button>
                <button onClick={()=>setAiOpen(true)} style={{padding:'2px 8px', backgroundColor:'transparent', color:C.muted, border:'1px solid '+C.border, borderRadius:3, fontSize:9, cursor:'pointer', fontFamily:'system-ui'}}>Discuss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── MAIN DASHBOARD ── */
export function Dashboard({ project, chars, lore, chapters, contFlags, relNodes, relEdges, simulationCount, lastSimulation, selectedArc, setSelectedArc, setTab, setAiOpen }) {
  const btnStyle = {padding:'5px 12px', backgroundColor:C.purple+'22', color:C.purpleLight, border:'1px solid '+C.purple+'44', borderRadius:4, fontSize:10, cursor:'pointer', fontFamily:'system-ui'};

  return (
    <div style={{backgroundColor:C.bg, padding:16, overflow:'auto', height:'100%', fontFamily:'Georgia,serif'}}>
      {/* Header strip */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <div style={{display:'flex', alignItems:'baseline', gap:10}}>
          <span style={{fontSize:22, fontStyle:'italic', color:C.parch}}>{project?.title || 'Untitled'}</span>
          {project?.genre && <span style={{fontSize:10, color:C.muted, fontFamily:'system-ui', backgroundColor:C.bgElevated, padding:'2px 8px', borderRadius:8}}>{project.genre}</span>}
          {project?.status && <span style={{fontSize:10, color:C.green, fontFamily:'system-ui', backgroundColor:C.green+'18', padding:'2px 8px', borderRadius:8}}>{project.status}</span>}
        </div>
        <div style={{display:'flex', gap:6}}>
          <button onClick={()=>setTab('write')} style={btnStyle}>Write</button>
          <button onClick={()=>setTab('simulation')} style={btnStyle}>Simulate</button>
          <button onClick={()=>setTab('import')} style={btnStyle}>Analyse</button>
        </div>
      </div>

      {/* Row 1 */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:12}}>
        <Panel style={{gridColumn:'span 2'}}>
          <ArcGraph chapters={chapters} selectedArc={selectedArc} setSelectedArc={setSelectedArc} setTab={setTab}/>
        </Panel>
        <Panel>
          <HealthDial chars={chars} lore={lore} chapters={chapters} contFlags={contFlags} simulationCount={simulationCount}/>
        </Panel>
        <Panel>
          <CharUniverse relNodes={relNodes} relEdges={relEdges} setTab={setTab}/>
        </Panel>
      </div>

      {/* Row 2 */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
        <Panel>
          <ActiveThreads contFlags={contFlags} setTab={setTab}/>
        </Panel>
        <Panel>
          <SimInsights lastSimulation={lastSimulation} setTab={setTab}/>
        </Panel>
        <Panel>
          <AIPulse project={project} chars={chars} lore={lore} chapters={chapters} setTab={setTab} setAiOpen={setAiOpen}/>
        </Panel>
      </div>
    </div>
  );
}
