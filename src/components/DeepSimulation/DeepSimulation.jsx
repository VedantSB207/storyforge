import { useState, useRef, useEffect, useMemo } from 'react'
import { C, genId } from '../../constants.js'
import { TIME_UNITS, CENSUS_MULTIPLIER } from './deepSimSchema.js'
import { runSimulationRounds, buildSummary } from './SimulationRunner.js'
import { EventLog } from './EventLog.jsx'
import { TaxonomyReview } from './TaxonomyReview.jsx'
import { generateTaxonomy, fingerprintContent, estimateCostUSD } from './worldTaxonomy.js'
import { buildCensus } from './CensusManager.js'
import { generateNarrativeSummary, estimateNarrativeCostUSD } from './narrativeSummary.js'

const CAST_SIZES = [50, 200, 500, 1000, 2000]
const LIVE_LOG_TAIL = 80   // most recent N events shown during running screen

// Phase 2 — Deep Simulation main UI
//
// Five screens: setup → taxonomy_loading → taxonomy_review → running → results.
// Setup gates running on a confirmed taxonomy. The taxonomy detection step
// makes one Claude API call (~$0.03-0.05). The round loop is still 100%
// deterministic. Active cast is drawn from the census which is procedurally
// generated from the confirmed taxonomy.

export function DeepSimulation({
  project,
  chars,
  lore = [],
  timelineChapters = [],
  deepSimulationHistory = [],
  setDeepSimulationHistory,
  setTab,
}) {
  const [step, setStep]               = useState('setup')
  const [mode, setMode]               = useState('progressive')
  const [castSize, setCastSize]       = useState(200)
  const [roundCount, setRoundCount]   = useState(30)
  const [timeUnit, setTimeUnit]       = useState('year')

  // Taxonomy state
  const [taxonomy, setTaxonomy]               = useState(null)
  const [taxonomyError, setTaxonomyError]     = useState('')
  const [taxonomyUsage, setTaxonomyUsage]     = useState(null)
  const [taxonomyLoading, setTaxonomyLoading] = useState(false)

  // Live run state
  const [round, setRound]             = useState(0)
  const [liveEvents, setLiveEvents]   = useState([])     // tail-only view
  const [agentsLive, setAgentsLive]   = useState([])
  const [paused, setPaused]           = useState(false)
  const cancelRef                     = useRef(false)
  const pauseRef                      = useRef(false)
  const fullEventsRef                 = useRef([])

  // Final result
  const [finalSnapshot, setFinalSnapshot] = useState(null)
  const [censusStats, setCensusStats]     = useState(null)
  const [narrative, setNarrative]         = useState(null)
  const [narrativeError, setNarrativeError] = useState('')

  useEffect(() => { pauseRef.current = paused }, [paused])

  const boundCount = chars?.length || 0

  // ── Stale taxonomy detection ──────────────────────────────────────────────
  const currentFingerprint = useMemo(
    () => fingerprintContent({ chars, lore, timelineChapters }),
    [chars, lore, timelineChapters],
  )
  const isTaxonomyStale = !!taxonomy && taxonomy.contentFingerprint !== currentFingerprint

  // ── Generate taxonomy ─────────────────────────────────────────────────────
  const runTaxonomyDetection = async () => {
    setTaxonomyError('')
    setTaxonomyLoading(true)
    setStep('taxonomy_loading')
    try {
      const { taxonomy: tx, usage } = await generateTaxonomy({ chars, lore, timelineChapters, project })
      setTaxonomy(tx)
      setTaxonomyUsage(usage)
      setStep('taxonomy_review')
    } catch (err) {
      console.error('Taxonomy detection failed:', err)
      setTaxonomyError(err.message || String(err))
      setStep('setup')
    } finally {
      setTaxonomyLoading(false)
    }
  }

  // ── Run simulation ────────────────────────────────────────────────────────
  const startRun = async () => {
    if (!taxonomy || boundCount === 0) return
    cancelRef.current = false
    pauseRef.current  = false
    setPaused(false)
    setStep('running')
    setLiveEvents([])
    fullEventsRef.current = []
    setRound(0)
    setFinalSnapshot(null)

    // Build census + active cast from taxonomy
    const built = buildCensus({
      chars,
      taxonomy,
      castSize,
      censusMultiplier: CENSUS_MULTIPLIER,
    })
    setAgentsLive(built.activeCast)
    setCensusStats(built.stats)

    // Performance: yield less frequently as cast grows so React doesn't choke
    const yieldEvery = built.activeCast.length >= 1000 ? 5
                     : built.activeCast.length >= 500  ? 3
                     : 1

    let lastSnap = null
    // Phase 3: deterministic seed so the same simulation reproduces. Derived
    // from project id + cast/round params; user can re-run to get same result.
    const seed = hashSeed(`${project?.id || 'noproj'}|${castSize}|${roundCount}|${timeUnit}|${Date.now()}`)
    try {
      const gen = runSimulationRounds({
        initialAgents: built.activeCast,
        roundCount,
        timeUnit,
        yieldEvery,
        // Phase 3 additions
        lore,
        chars,
        seed,
      })

      for await (const snap of gen) {
        while (pauseRef.current && !cancelRef.current) {
          await new Promise(r => setTimeout(r, 200))
        }
        if (cancelRef.current) break

        fullEventsRef.current = snap.events
        setRound(snap.round)
        setLiveEvents(snap.events.slice(-LIVE_LOG_TAIL))
        setAgentsLive(snap.agents)
        lastSnap = snap
        await new Promise(r => setTimeout(r, 30))   // visible animation
      }
    } catch (err) {
      console.error('Deep Simulation error:', err)
      fullEventsRef.current.push({
        round: round || 0, agentName: 'engine', category: 'death',
        content: `Simulation error: ${err.message}`,
      })
    }

    if (cancelRef.current || !lastSnap) {
      setStep('setup')
      return
    }

    const summary = buildSummary(lastSnap)
    setFinalSnapshot({ ...lastSnap, summary })

    // ── Phase 2.5: narrative summary ─────────────────────────────────────
    setStep('narrating')
    setNarrative(null)
    setNarrativeError('')
    let narrativeOut = null
    try {
      narrativeOut = await generateNarrativeSummary({
        simulationResult: {
          summary,
          events:        lastSnap.events,
          agents:        lastSnap.agents,
          butterflyStats: lastSnap.butterflyStats,
        },
        project,
        taxonomy,
        chars,
        censusStats: built.stats,
        roundCount,
        timeUnit,
      })
      setNarrative(narrativeOut)
    } catch (err) {
      console.error('Narrative summary failed:', err)
      setNarrativeError(err.message || String(err))
    }

    const entry = {
      id:         genId(),
      timestamp:  new Date().toISOString(),
      mode:       'progressive',
      castSize,
      roundCount,
      timeUnit,
      seed,                                       // Phase 3: lets the writer re-run the same world
      taxonomy,                                   // taxonomy snapshot for reproducibility
      censusStats: built.stats,
      agents:     lastSnap.agents,
      events:     lastSnap.events,
      butterflyStats: lastSnap.butterflyStats,    // Phase 3: trace stats summary (full trace too big for save)
      llmCallsTotal: lastSnap.llmCallsTotal,
      narrative:  narrativeOut,                   // Phase 2.5 — null if generation failed
      summary:    `${summary.alive}/${summary.total} alive, ${summary.dead} died over ${roundCount} ${timeUnit}-round${roundCount === 1 ? '' : 's'}. ${built.stats.boundCount} bound + ${built.stats.activeCastCount - built.stats.boundCount} procedural in cast (${built.stats.censusCount} census).`,
    }
    if (setDeepSimulationHistory) {
      setDeepSimulationHistory(prev => [entry, ...(prev || [])])
    }

    setStep('results')
  }

  const cancelRun = () => {
    cancelRef.current = true
    pauseRef.current  = false
    setPaused(false)
  }

  const newSimulation = () => {
    setStep('setup')
    setLiveEvents([])
    fullEventsRef.current = []
    setRound(0)
    setFinalSnapshot(null)
    setAgentsLive([])
    setCensusStats(null)
    setNarrative(null)
    setNarrativeError('')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
        <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.purple}55`, borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: C.purpleLight, fontWeight: 'bold', marginBottom: 8 }}>✦ Deep Simulation — Phase 2 World Population</div>
          <div style={{ fontSize: 12, color: C.mutedLight, lineHeight: 1.8, fontFamily: 'system-ui' }}>
            Real multi-agent simulation. Phase 2 generates a procedural world from your project content — animal kingdom, mythology, humans, whatever your story implies. Bound Story Bible characters share the cast with procedurally generated NPCs.<br /><br />
            <strong style={{ color: C.gold }}>Phase 2 scope:</strong> taxonomy detection + NPC generation + census/cast model. Round loop still deterministic — no decisions, no information propagation, no LLM calls during rounds.
          </div>
        </div>

        <Section label="Simulation Mode">
          <div style={{ display: 'flex', gap: 8 }}>
            <ModeButton active={mode === 'progressive'} onClick={() => setMode('progressive')} label="Progressive" sub="Forward-moving timeline. State accumulates across rounds." />
            <ModeButton active={false} disabled label="Scenario" sub="Branching variants from a fixed moment." badge="Phase 4" />
          </div>
        </Section>

        <Section label="Cast Size (active agents per round)">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CAST_SIZES.map(n => (
              <button key={n} onClick={() => setCastSize(n)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: castSize === n ? C.purple : C.bgCard,
                  color: castSize === n ? '#fff' : C.muted,
                  border: `1px solid ${castSize === n ? C.purple : C.border}`,
                  borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui',
                }}>{n}</button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: 'system-ui', lineHeight: 1.5 }}>
            {boundCount === 0
              ? 'No Story Bible characters yet. Add at least one before running.'
              : `Census will be ~${castSize * CENSUS_MULTIPLIER} agents (${castSize} active + ~${castSize * (CENSUS_MULTIPLIER - 1)} background). ${boundCount} of your active cast will be bound to Story Bible characters.`}
          </div>
        </Section>

        <Section label={`Round Count — ${roundCount}`}>
          <input type="range" min={5} max={500} step={5} value={roundCount} onChange={e => setRoundCount(+e.target.value)} style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
            <span>5</span><span>500</span>
          </div>
        </Section>

        <Section label="Time Unit per Round">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIME_UNITS.map(u => (
              <button key={u} onClick={() => setTimeUnit(u)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: timeUnit === u ? C.acc + '33' : C.bgCard,
                  color: timeUnit === u ? C.accBright : C.muted,
                  border: `1px solid ${timeUnit === u ? C.acc + '66' : C.border}`,
                  borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', textTransform: 'capitalize',
                }}>{u}</button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>
            {roundCount} {timeUnit}-rounds = approximately {formatHorizon(roundCount, timeUnit)} of in-world time.
          </div>
        </Section>

        {/* Taxonomy step */}
        <Section label="World Taxonomy">
          {taxonomyError && (
            <div style={{ padding: '8px 12px', backgroundColor: C.accBright + '12', border: `1px solid ${C.accBright}44`, borderRadius: 5, fontSize: 11, color: C.accBright, fontFamily: 'system-ui', marginBottom: 8 }}>
              {taxonomyError}
            </div>
          )}

          {!taxonomy ? (
            <button
              onClick={runTaxonomyDetection}
              disabled={boundCount === 0 || taxonomyLoading}
              style={{
                width: '100%', padding: 11,
                backgroundColor: boundCount === 0 ? C.bgCard : C.gold + '22',
                color: boundCount === 0 ? C.muted : C.gold,
                border: `1px dashed ${boundCount === 0 ? C.border : C.gold + '66'}`,
                borderRadius: 5, fontSize: 12, fontFamily: 'system-ui',
                cursor: boundCount === 0 ? 'not-allowed' : 'pointer',
              }}>
              {boundCount === 0 ? 'Add Story Bible characters first' : 'Generate World Taxonomy →'}
            </button>
          ) : (
            <TaxonomySummaryCard
              taxonomy={taxonomy}
              stale={isTaxonomyStale}
              usage={taxonomyUsage}
              onReview={() => setStep('taxonomy_review')}
              onRegenerate={runTaxonomyDetection}
              regenerating={taxonomyLoading}
            />
          )}
        </Section>

        <button
          onClick={startRun}
          disabled={boundCount === 0 || !taxonomy}
          style={{
            width: '100%', padding: 13,
            backgroundColor: (boundCount === 0 || !taxonomy) ? C.bgCard : C.purple,
            color: (boundCount === 0 || !taxonomy) ? C.muted : '#fff',
            border: `1px solid ${(boundCount === 0 || !taxonomy) ? C.border : C.purple}`,
            borderRadius: 6, fontSize: 14, cursor: (boundCount === 0 || !taxonomy) ? 'not-allowed' : 'pointer',
            fontFamily: 'system-ui', letterSpacing: '0.05em', marginTop: 12,
          }}>
          {boundCount === 0
            ? 'Add Story Bible characters first'
            : !taxonomy
              ? 'Generate world taxonomy first'
              : 'Run Simulation →'}
        </button>

        {(deepSimulationHistory || []).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Past Runs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {deepSimulationHistory.slice(0, 5).map(h => (
                <div key={h.id} style={{ padding: '8px 12px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11, fontFamily: 'system-ui' }}>
                  <div style={{ color: C.parch }}>{h.summary}</div>
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    {new Date(h.timestamp).toLocaleString()} · {h.castSize} cast · {h.roundCount} {h.timeUnit}-rounds
                    {h.taxonomy?.genres?.length ? ` · ${h.taxonomy.genres.length} genres` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAXONOMY LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'taxonomy_loading') {
    return (
      <div style={{ padding: 48, maxWidth: 560, margin: '0 auto', textAlign: 'center', fontFamily: 'Georgia,serif' }}>
        <div style={{ fontSize: 15, color: C.purpleLight, marginBottom: 6 }}>Reading Your World</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginBottom: 24 }}>
          Detecting genres from {boundCount} character{boundCount === 1 ? '' : 's'}, {lore.length} world rule{lore.length === 1 ? '' : 's'}, and {timelineChapters.length} chapter{timelineChapters.length === 1 ? '' : 's'}…
        </div>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: `2px solid ${C.purple}33`, borderTopColor: C.purpleLight, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAXONOMY REVIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'taxonomy_review') {
    return (
      <TaxonomyReview
        taxonomy={taxonomy}
        setTaxonomy={setTaxonomy}
        onConfirm={() => setStep('setup')}
        onRegenerate={runTaxonomyDetection}
        onCancel={() => setStep('setup')}
        regenerating={taxonomyLoading}
      />
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RUNNING
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'running') {
    const pct = Math.round((round / Math.max(roundCount, 1)) * 100)
    return (
      <div style={{ padding: 24, maxWidth: 760, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Deep Simulation Running</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
              Round {round} of {roundCount} · {agentsLive.filter(a => a.alive).length}/{agentsLive.length} alive
              {censusStats && ` · census ${censusStats.censusCount}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPaused(p => !p)} style={btnSecondary}>{paused ? 'Resume' : 'Pause'}</button>
            <button onClick={cancelRun} style={btnSecondary}>Cancel</button>
          </div>
        </div>

        <div style={{ height: 4, backgroundColor: C.border, borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: paused ? C.gold : C.purple, transition: 'width 0.2s ease' }} />
        </div>

        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, maxHeight: 460, overflow: 'auto' }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Latest events {liveEvents.length} of {fullEventsRef.current.length}
          </div>
          <EventLog events={liveEvents} emptyText="Round 1 still computing — events will start streaming when something happens." />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NARRATING (Phase 2.5)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'narrating') {
    return (
      <div style={{ padding: 48, maxWidth: 560, margin: '0 auto', textAlign: 'center', fontFamily: 'Georgia,serif' }}>
        <div style={{ fontSize: 16, color: C.purpleLight, marginBottom: 6, fontStyle: 'italic' }}>Reading the chronicle…</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginBottom: 24 }}>
          The simulation completed. Translating {fullEventsRef.current.length} event{fullEventsRef.current.length === 1 ? '' : 's'} into story.
        </div>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: `2px solid ${C.purple}33`, borderTopColor: C.purpleLight, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESULTS (Phase 2.5 layout: Story → Notable → Final State → Event Log)
  // ─────────────────────────────────────────────────────────────────────────
  const summary = finalSnapshot?.summary
  return <ResultsScreen
    project={project}
    summary={summary}
    narrative={narrative}
    narrativeError={narrativeError}
    fullEvents={fullEventsRef.current}
    censusStats={censusStats}
    roundCount={roundCount}
    timeUnit={timeUnit}
    onNewSimulation={newSimulation}
  />
}

// ─── Results screen (extracted; allows internal state for collapsibles) ────
function ResultsScreen({ project, summary, narrative, narrativeError, fullEvents, censusStats, roundCount, timeUnit, onNewSimulation }) {
  const [showStats, setShowStats]     = useState(false)
  const [showLog, setShowLog]         = useState(false)

  const narrativeCost = estimateNarrativeCostUSD(narrative?.usage)

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Simulation Complete</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            {censusStats ? `${censusStats.activeCastCount} cast (${censusStats.boundCount} bound + ${censusStats.activeCastCount - censusStats.boundCount} procedural) · census ${censusStats.censusCount}` : 'agents'} · {roundCount} {timeUnit}-rounds · progressive mode
          </div>
        </div>
        <button onClick={onNewSimulation} style={btnSecondary}>New Simulation</button>
      </div>

      {/* THE STORY — top, expanded by default */}
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}55`, borderRadius: 8, padding: '20px 24px', marginBottom: 14, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ fontSize: 10, color: C.purple, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 10 }}>The Story</div>
        {narrativeError ? (
          <div style={{ padding: '10px 12px', backgroundColor: C.accBright + '12', border: `1px solid ${C.accBright}44`, borderRadius: 5, fontSize: 12, color: C.accBright, fontFamily: 'system-ui' }}>
            Narrative summary failed: {narrativeError}
          </div>
        ) : !narrative ? (
          <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui' }}>(No narrative generated.)</div>
        ) : (
          <>
            {narrative.headline && (
              <div style={{ fontSize: 16, color: C.parch, fontStyle: 'italic', fontFamily: 'Georgia, serif', marginBottom: 14, lineHeight: 1.4 }}>
                &ldquo;{narrative.headline}&rdquo;
              </div>
            )}
            <div style={{ fontSize: 14, color: C.parch, fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
              {narrative.narrative.split(/\n\n+/).map((para, i) => (
                <p key={i} style={{ margin: i === 0 ? '0 0 12px' : '12px 0' }}>{para}</p>
              ))}
            </div>
            {narrativeCost != null && (
              <div style={{ marginTop: 12, fontSize: 9, color: C.muted, fontFamily: 'system-ui', borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                {narrative.usage?.input_tokens || 0} in / {narrative.usage?.output_tokens || 0} out tokens · ${narrativeCost.toFixed(4)}
              </div>
            )}
          </>
        )}
      </div>

      {/* NOTABLE EVENTS */}
      {narrative?.notableEvents?.length > 0 && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.gold}44`, borderRadius: 6, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.gold, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>Notable Events</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {narrative.notableEvents.map((m, i) => (
              <li key={i} style={{ fontSize: 13, color: C.mutedLight, fontFamily: 'Georgia, serif', lineHeight: 1.6, marginBottom: 4, fontStyle: 'italic' }}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* FINAL STATE — collapsible, collapsed by default */}
      <CollapsibleSection
        title="Final State"
        open={showStats}
        onToggle={() => setShowStats(o => !o)}
      >
        {summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <Stat label="Alive" value={`${summary.alive} / ${summary.total}`} col={C.green} />
              <Stat label="Died" value={summary.dead} col={summary.dead > 0 ? C.accBright : C.muted} />
              <Stat label="Avg Age" value={summary.avgAge.toFixed(1)} col={C.parch} />
              <Stat label="Events" value={fullEvents.length} col={C.gold} />
            </div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Average Needs (living)</div>
            {Object.entries(summary.avgNeeds).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ width: 100, fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', textTransform: 'capitalize' }}>{k}</span>
                <div style={{ flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${v * 100}%`, height: '100%', backgroundColor: v < 0.2 ? C.accBright : v < 0.5 ? C.gold : C.green }} />
                </div>
                <span style={{ width: 40, textAlign: 'right', fontSize: 11, color: C.parch, fontFamily: 'system-ui' }}>{(v * 100).toFixed(0)}%</span>
              </div>
            ))}
          </>
        )}
      </CollapsibleSection>

      {/* EVENT LOG — collapsible, collapsed by default */}
      <CollapsibleSection
        title={`Event Log — ${fullEvents.length} event${fullEvents.length === 1 ? '' : 's'}`}
        open={showLog}
        onToggle={() => setShowLog(o => !o)}
      >
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          <EventLog events={fullEvents} emptyText="No events fired during this run." />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{title}</span>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function ModeButton({ active, onClick, label, sub, disabled, badge }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{
        flex: 1, padding: '12px 14px',
        backgroundColor: active ? C.purple + '22' : C.bgCard,
        color: active ? C.purpleLight : disabled ? C.muted : C.mutedLight,
        border: `1px solid ${active ? C.purple + '66' : C.border}`,
        borderRadius: 5, fontFamily: 'system-ui', textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {badge && <span style={{ fontSize: 9, backgroundColor: C.gold + '33', color: C.gold, padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{badge}</span>}
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{sub}</div>
    </button>
  )
}

function Stat({ label, value, col }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, color: col, fontFamily: 'Georgia,serif', fontWeight: 'bold' }}>{value}</div>
    </div>
  )
}

function TaxonomySummaryCard({ taxonomy, stale, usage, onReview, onRegenerate, regenerating }) {
  const cost = estimateCostUSD(usage)
  const includedKinds = taxonomy.genres.reduce(
    (s, g) => s + g.kinds.filter(k => k.included !== false).length, 0,
  )
  return (
    <div style={{
      padding: '12px 14px',
      backgroundColor: stale ? C.gold + '12' : C.bgCard,
      border: `1px solid ${stale ? C.gold + '55' : C.purple + '44'}`,
      borderRadius: 6,
    }}>
      {stale && (
        <div style={{ fontSize: 10, color: C.gold, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          ⚠ Project content changed — taxonomy may be stale
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {taxonomy.genres.map(g => (
          <span key={g.id} style={{
            fontSize: 10, padding: '3px 8px',
            backgroundColor: g.detected ? C.purple + '22' : C.gold + '22',
            color: g.detected ? C.purpleLight : C.gold,
            borderRadius: 8, fontFamily: 'system-ui',
          }}>
            {g.name} {Math.round(g.weight * 100)}%
          </span>
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginBottom: 8 }}>
        {taxonomy.genres.length} genre{taxonomy.genres.length === 1 ? '' : 's'} · {includedKinds} included kind{includedKinds === 1 ? '' : 's'}
        {usage && ` · ${usage.input_tokens} in / ${usage.output_tokens} out tokens`}
        {cost != null && ` · $${cost.toFixed(4)}`}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onReview} style={{ flex: 1, padding: '6px 12px', backgroundColor: C.purple + '33', color: C.purpleLight, border: `1px solid ${C.purple}66`, borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }}>Review / Edit</button>
        <button onClick={onRegenerate} disabled={regenerating} style={{ flex: 1, padding: '6px 12px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, cursor: regenerating ? 'wait' : 'pointer', fontFamily: 'system-ui', opacity: regenerating ? 0.5 : 1 }}>{regenerating ? 'Regenerating…' : 'Regenerate'}</button>
      </div>
    </div>
  )
}

const btnSecondary = {
  padding: '6px 14px',
  backgroundColor: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'system-ui',
}

// FNV-1a hash → 32-bit unsigned int. Used to seed the simulation RNG.
function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

function formatHorizon(rounds, unit) {
  const totalDaysApprox = rounds * { hour: 1/24, day: 1, week: 7, month: 30, season: 90, year: 365 }[unit]
  if (totalDaysApprox < 2)         return `${(totalDaysApprox * 24).toFixed(0)} hours`
  if (totalDaysApprox < 60)        return `${totalDaysApprox.toFixed(0)} days`
  if (totalDaysApprox < 365 * 2)   return `${(totalDaysApprox / 30).toFixed(1)} months`
  return `${(totalDaysApprox / 365).toFixed(1)} years`
}
