import { useState } from "react";
import { callClaude } from "../api.js";
import { C } from "../constants.js";

export function SimPanel({ chars, lore, setSimulationCount, setLastSimulation }) {
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
      const cleanResult = raw.replace(/===CONSPIRACY_MAP===[\s\S]*?===END_MAP===/g, '').trim()
        || 'Simulation collapsed — no emergent output found.';
      setResult(cleanResult);

      // Lift to parent for Dashboard
      if (setSimulationCount) setSimulationCount(prev => prev + 1);
      if (setLastSimulation) setLastSimulation({
        date: new Date().toISOString(),
        scenario,
        result: cleanResult,
        agents, rounds,
        divergenceOn: conspire,
        residualPct: mapMatch ? (() => { try { return JSON.parse(mapMatch[1].trim()).residualPct; } catch { return null; } })() : null,
      });
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

/* ── CHAPTER DETECTOR ── */
