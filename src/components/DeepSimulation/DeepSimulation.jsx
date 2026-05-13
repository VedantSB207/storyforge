import { useState, useRef, useEffect, useMemo } from 'react'
import { C, genId } from '../../constants.js'
import { TIME_UNITS, CENSUS_MULTIPLIER, DIFFICULTY_PRESETS, DIFFICULTY_DEFAULT } from './deepSimSchema.js'
import { runSimulationRounds, buildSummary, makeSeededRng } from './SimulationRunner.js'
import { EventLog } from './EventLog.jsx'
import { TaxonomyReview } from './TaxonomyReview.jsx'
import { generateTaxonomy, fingerprintContent, estimateCostUSD } from './worldTaxonomy.js'
import { buildCensus } from './CensusManager.js'
import { generateNarrativeSummary, estimateNarrativeCostUSD } from './narrativeSummary.js'
import { runScenario, buildVariantComparison } from './scenarioRunner.js'
import { generateScenarioComparison } from './scenarioComparison.js'
import { CharacterThreads } from './CharacterThreads.jsx'
import { MapView } from './MapView.jsx'
import { BondNetwork } from './BondNetwork.jsx'
import { ButterflyTraceView } from './ButterflyTraceView.jsx'
import {
  saveSimResult,
  loadSimResult,
  entryToMetadata,
  entryToFullPayload,
  migrateInlineHistory,
} from './persistence.js'

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
  const [difficulty, setDifficulty]   = useState(DIFFICULTY_DEFAULT)   // Phase 5 pre-fix
  const [variantCount, setVariantCount] = useState(3)   // Phase 4b/4 — scenario only

  // Scenario state (Phase 4b/4)
  const [scenarioRecord, setScenarioRecord] = useState(null)
  const [scenarioProgress, setScenarioProgress] = useState(null)

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

  // Phase 3.5 — viewing a past run loaded from disk
  const [viewLoading, setViewLoading]     = useState(false)
  const [viewError, setViewError]         = useState('')
  // Migration runs once per mount when we detect inline-format entries
  const [migrationRan, setMigrationRan]   = useState(false)

  useEffect(() => { pauseRef.current = paused }, [paused])

  // Phase 3.5 — silently migrate any inline (pre-3.5) history entries to
  // per-sim files on first mount. Idempotent; bails out if there's nothing
  // to migrate or if Electron API is unavailable.
  useEffect(() => {
    if (migrationRan) return
    if (!project?.id) return
    const hasInline = (deepSimulationHistory || []).some(
      e => Array.isArray(e?.agents) && e.agents.length > 0
    )
    if (!hasInline) { setMigrationRan(true); return }
    let cancelled = false
    ;(async () => {
      const { history: migrated, migratedCount, errors } = await migrateInlineHistory(project.id, deepSimulationHistory)
      if (cancelled) return
      if (migratedCount > 0) {
        console.log(`[DeepSim] migrated ${migratedCount} inline history entr${migratedCount === 1 ? 'y' : 'ies'} to per-sim files`)
        setDeepSimulationHistory(migrated)
      }
      if (errors.length > 0) {
        console.warn('[DeepSim] migration partial:', errors)
      }
      setMigrationRan(true)
    })()
    return () => { cancelled = true }
    // Only run once per project mount; deps intentionally minimal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

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

    // Phase 4a.1: compute seed BEFORE buildCensus so the census uses a
    // seeded RNG. Without this, the cast composition (which procedural
    // NPCs are sampled, region assignments, initial needs) is non-
    // deterministic even when the round-loop seed is fixed.
    const seed = hashSeed(`${project?.id || 'noproj'}|${castSize}|${roundCount}|${timeUnit}|${Date.now()}`)

    // Build census + active cast from taxonomy (deterministic given seed)
    const built = buildCensus({
      chars,
      taxonomy,
      castSize,
      censusMultiplier: CENSUS_MULTIPLIER,
      rng: makeSeededRng(seed),
    })
    setAgentsLive(built.activeCast)
    setCensusStats(built.stats)

    // Performance: yield less frequently as cast grows so React doesn't choke
    const yieldEvery = built.activeCast.length >= 1000 ? 5
                     : built.activeCast.length >= 500  ? 3
                     : 1

    let lastSnap = null
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
        // Phase 5 pre-fix
        difficulty,
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
          dialogues:     lastSnap.dialogues,
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

    // Build the run entry. Phase 3.5: split into full (file on disk) +
    // metadata stub (lives in project's deepSimulationHistory[]).
    const simId = genId()
    const fullEntry = {
      id:         simId,
      timestamp:  new Date().toISOString(),
      mode:       'progressive',
      castSize,
      roundCount,
      timeUnit,
      seed,
      taxonomy,
      censusStats: built.stats,
      agents:     lastSnap.agents,
      events:     lastSnap.events,
      butterflyStats: lastSnap.butterflyStats,
      llmCallsTotal: lastSnap.llmCallsTotal,
      tierCounters:  lastSnap.tierCounters,
      dialogues:     lastSnap.dialogues || [],   // Phase 4b/3
      narrative:  narrativeOut,
      summary:    `${summary.alive}/${summary.total} alive, ${summary.dead} died over ${roundCount} ${timeUnit}-round${roundCount === 1 ? '' : 's'}. ${built.stats.boundCount} bound + ${built.stats.activeCastCount - built.stats.boundCount} procedural in cast (${built.stats.censusCount} census).`,
    }

    // Write the heavy full result to its own file (Phase 3.5 main change)
    if (project?.id) {
      const writeRes = await saveSimResult(project.id, simId, entryToFullPayload(fullEntry))
      if (!writeRes?.ok) {
        console.warn('[DeepSim] save-deep-sim-result failed:', writeRes)
        // Fall through anyway — at least the in-memory state shows the run
      } else {
        console.log(`[DeepSim] wrote ${(writeRes.size / 1024 / 1024).toFixed(2)} MB to deep-sims/${simId}.json`)
      }
    }

    // Push only the lightweight stub to project history
    const metadata = entryToMetadata(fullEntry)
    if (setDeepSimulationHistory) {
      setDeepSimulationHistory(prev => [metadata, ...(prev || [])])
    }

    setStep('results')
  }

  const cancelRun = () => {
    cancelRef.current = true
    pauseRef.current  = false
    setPaused(false)
  }

  // ── Phase 4b/4: Scenario mode ─────────────────────────────────────────────
  // Run N variants of the same starting world, each with a deterministic
  // seed derived from a base seed + index. Generate comparison narrative.
  // Each variant's full result is saved to its own per-sim file (Phase 3.5
  // path); the Scenario record stores variant IDs + comparison.
  const startScenarioRun = async () => {
    if (!taxonomy || boundCount === 0) return
    setStep('scenario_running')
    setScenarioProgress({ phase: 'starting', variantIndex: 0, round: 0 })
    setScenarioRecord(null)

    const baseSeed = hashSeed(`${project?.id || 'noproj'}|${castSize}|${roundCount}|${timeUnit}|scenario|${Date.now()}`)
    const wallStart = Date.now()

    try {
      const { variants, failures } = await runScenario({
        chars, lore, taxonomy,
        castSize, roundCount, timeUnit,
        censusMultiplier: CENSUS_MULTIPLIER,
        baseSeed,
        variantCount,
        mode: 'sequential',
        difficulty,
        onProgress: ({ variantIndex, round, roundCount: rc }) =>
          setScenarioProgress({ phase: 'simulating', variantIndex, round, roundCount: rc }),
      })
      if (variants.length === 0) {
        // All variants failed — surface error and bail. Phase 4b.1.
        const errs = (failures || []).map(f => `v${f.variantIndex+1}: ${f.error}`).join('; ')
        setScenarioProgress({ phase: 'error', error: `All variants failed. ${errs}` })
        setStep('setup')
        return
      }

      // Generate per-variant narratives in parallel
      setScenarioProgress({ phase: 'narrating', variantIndex: 0, round: 0 })
      const narratives = await Promise.all(variants.map(v =>
        generateNarrativeSummary({
          simulationResult: {
            summary:        v.summary,
            events:         v.events,
            agents:         v.agents,
            butterflyStats: v.butterflyStats,
            dialogues:      v.dialogues,
          },
          project, taxonomy, chars,
          censusStats: v.censusStats,
          roundCount, timeUnit,
        }).catch(() => null)
      ))
      for (let i = 0; i < variants.length; i++) variants[i].narrative = narratives[i]

      // Comparison
      setScenarioProgress({ phase: 'comparing' })
      const comparisonData = buildVariantComparison({ variants, chars })
      const comparison = await generateScenarioComparison({ variants, comparisonData, project, taxonomy })

      // Persist each variant + the scenario wrapper
      const scenarioId = 'scn_' + genId()
      const variantSimIds = []
      if (project?.id && window.electronAPI?.saveDeepSimResult) {
        for (const v of variants) {
          const simId = 'var_' + scenarioId + '_' + v.variantIndex
          variantSimIds.push(simId)
          const full = {
            id: simId, timestamp: new Date().toISOString(),
            mode: 'scenario_variant',
            castSize, roundCount, timeUnit,
            seed: v.seed,
            scenarioId, variantIndex: v.variantIndex,
            taxonomy, censusStats: v.censusStats,
            agents: v.agents, events: v.events,
            butterflyStats: v.butterflyStats,
            tierCounters: v.tierCounters,
            dialogues: v.dialogues,
            narrative: v.narrative,
            summary: `${v.summary.alive}/${v.summary.total} alive, ${v.summary.dead} died.`,
          }
          await window.electronAPI.saveDeepSimResult(project.id, simId, full)
        }
      }

      const totalCost = (comparisonData.totalSimCost || 0) +
        ((narratives.filter(Boolean)).reduce((s, n) => s + estimateNarrativeCostUSD(n.usage) || 0, 0) || 0) +
        (comparison.cost || 0)
      const totalWallTime = (Date.now() - wallStart) / 1000

      const record = {
        scenarioId,
        timestamp: new Date().toISOString(),
        mode: 'scenario',
        baseConfig: { castSize, roundCount, timeUnit, variantCount, baseSeed },
        variantCount,
        variantSimIds,
        successfulVariantCount: variants.length,
        failures: failures || [],
        comparisonData,
        comparison,
        totalCost,
        totalWallTime,
        summary: `${variants.length}/${variantCount} variants × ${castSize} cast × ${roundCount} ${timeUnit}-rounds. ${comparisonData.fateDelta?.length || 0} bound chars had divergent fates${(failures||[]).length > 0 ? ` · ${failures.length} variant(s) failed` : ''}.`,
      }

      // Persist scenario record
      if (project?.id && window.electronAPI?.saveScenarioResult) {
        await window.electronAPI.saveScenarioResult(project.id, scenarioId, record)
      }

      // Push lightweight stub to project history
      const stub = {
        simId: scenarioId,
        timestamp: record.timestamp,
        mode: 'scenario',
        castSize, roundCount, timeUnit,
        seed: baseSeed,
        summary: record.summary,
        narrativeHeadline: comparison.themes?.[0] || (variantSimIds.length + ' variants compared'),
        alive: null, dead: null,
        totalEvents: null,
        totalCost,
        scenarioVariantCount: variantCount,
      }
      if (setDeepSimulationHistory) {
        setDeepSimulationHistory(prev => [stub, ...(prev || [])])
      }

      setScenarioRecord({ ...record, variants })
      setStep('scenario_results')
    } catch (err) {
      console.error('[Scenario] failed:', err)
      setScenarioProgress({ phase: 'error', error: err.message || String(err) })
      setStep('setup')
    }
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
    setViewError('')
    setScenarioRecord(null)
    setScenarioProgress(null)
  }

  // Phase 3.5 — load a past simulation's full result from disk and render
  // it on the results screen. Hydrates the same state vars a fresh run would.
  const viewPastRun = async (stub) => {
    if (!project?.id) return
    setViewError('')
    setViewLoading(true)
    try {
      const res = await loadSimResult(project.id, stub.simId || stub.id)
      if (!res?.ok) throw new Error(res?.error || 'load failed')
      const full = res.fullResult
      // Hydrate state as if the run just completed
      const summary = {
        total:    (full.agents || []).length,
        alive:    (full.agents || []).filter(a => a.alive).length,
        dead:     (full.agents || []).filter(a => !a.alive).length,
        avgAge:   (full.agents || []).reduce((s, a) => s + a.age, 0) / Math.max((full.agents || []).length, 1),
        avgNeeds: ['physiological','safety','belonging','esteem','purpose'].reduce((acc, k) => {
          const living = (full.agents || []).filter(a => a.alive)
          acc[k] = living.length === 0 ? 0 : living.reduce((s, a) => s + (a.needs?.[k] ?? 0), 0) / living.length
          return acc
        }, {}),
        counts:   (full.events || []).reduce((m, e) => { m[e.category] = (m[e.category] || 0) + 1; return m }, {}),
      }
      fullEventsRef.current = full.events || []
      setFinalSnapshot({
        agents:        full.agents || [],
        events:        full.events || [],
        summary,
        dialogues:     full.dialogues || [],         // Phase 4b/3
        butterflyTrace: full.butterflyTrace || null, // Phase 5 (often null — trace not persisted)
        butterflyStats: full.butterflyStats || null,
      })
      setCensusStats(full.censusStats || null)
      setNarrative(full.narrative || null)
      setNarrativeError('')
      setRoundCount(full.roundCount || 30)
      setTimeUnit(full.timeUnit || 'year')
      setStep('results')
    } catch (err) {
      console.error('[DeepSim] viewPastRun failed:', err)
      setViewError(err.message || String(err))
    } finally {
      setViewLoading(false)
    }
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
            <ModeButton active={mode === 'scenario'}    onClick={() => setMode('scenario')}    label="Scenario"    sub="N parallel variants from the same starting moment, with comparison." />
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

        {/* Difficulty preset — Phase 5 pre-fix */}
        <Section label="Difficulty">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.keys(DIFFICULTY_PRESETS).map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: difficulty === d ? C.gold + '33' : C.bgCard,
                  color: difficulty === d ? C.gold : C.muted,
                  border: `1px solid ${difficulty === d ? C.gold + '66' : C.border}`,
                  borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', textTransform: 'capitalize',
                }}>{d}</button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: 1.5 }}>
            {difficulty === 'gentle'   && 'Gentle — slow-burn drama, most characters survive. Needs deplete slower.'}
            {difficulty === 'standard' && 'Standard — balanced pressure. Phase 4 baseline calibration.'}
            {difficulty === 'harsh'    && 'Harsh — apocalyptic, most characters perish. Needs deplete faster.'}
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

        {mode === 'scenario' && (
          <Section label={`Variant Count — ${variantCount}`}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setVariantCount(n)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: variantCount === n ? C.purple : C.bgCard,
                    color: variantCount === n ? '#fff' : C.muted,
                    border: `1px solid ${variantCount === n ? C.purple : C.border}`,
                    borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui',
                  }}>{n}</button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>
              {variantCount} parallel chronicles of the same starting world. Each variant runs sequentially; total wall time ≈ {variantCount}× Progressive.
            </div>
          </Section>
        )}

        <button
          onClick={mode === 'scenario' ? startScenarioRun : startRun}
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
              : mode === 'scenario'
                ? `Run ${variantCount}-variant Scenario →`
                : 'Run Simulation →'}
        </button>

        {(deepSimulationHistory || []).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Past Runs</div>
            {viewError && (
              <div style={{ marginBottom: 8, padding: '6px 10px', fontSize: 11, color: C.accBright, backgroundColor: C.accBright + '12', border: `1px solid ${C.accBright}44`, borderRadius: 5, fontFamily: 'system-ui' }}>
                Could not load past run: {viewError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {deepSimulationHistory.slice(0, 5).map(h => {
                const id = h.simId || h.id
                return (
                  <div key={id} style={{ padding: '8px 12px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11, fontFamily: 'system-ui', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {h.narrativeHeadline && (
                        <div style={{ color: C.parch, fontFamily: 'Georgia, serif', fontStyle: 'italic', marginBottom: 3 }}>&ldquo;{h.narrativeHeadline}&rdquo;</div>
                      )}
                      <div style={{ color: C.parch }}>{h.summary}</div>
                      <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                        {new Date(h.timestamp).toLocaleString()} · {h.castSize} cast · {h.roundCount} {h.timeUnit}-rounds
                        {h.totalCost != null && ` · $${h.totalCost.toFixed(4)}`}
                      </div>
                    </div>
                    <button
                      onClick={() => viewPastRun(h)}
                      disabled={viewLoading}
                      style={{ padding: '5px 10px', backgroundColor: C.purple + '22', color: C.purpleLight, border: `1px solid ${C.purple}44`, borderRadius: 4, fontSize: 10, cursor: viewLoading ? 'wait' : 'pointer', fontFamily: 'system-ui', flexShrink: 0 }}
                    >
                      {viewLoading ? 'Loading…' : 'View'}
                    </button>
                  </div>
                )
              })}
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
  // SCENARIO RUNNING (Phase 4b/4)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'scenario_running') {
    const p = scenarioProgress || {}
    return (
      <div style={{ padding: 48, maxWidth: 620, margin: '0 auto', textAlign: 'center', fontFamily: 'Georgia,serif' }}>
        <div style={{ fontSize: 16, color: C.purpleLight, marginBottom: 6 }}>Scenario Running</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginBottom: 24 }}>
          {p.phase === 'simulating' ? `Variant ${(p.variantIndex ?? 0) + 1} of ${variantCount} — round ${p.round || 0} of ${p.roundCount || roundCount}`
            : p.phase === 'narrating' ? 'Generating per-variant chronicles…'
            : p.phase === 'comparing' ? 'Synthesising cross-variant comparison…'
            : p.phase === 'starting'  ? 'Initialising variants…'
            : p.phase === 'error'     ? `Failed: ${p.error}`
            : 'Working…'}
        </div>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: `2px solid ${C.purple}33`, borderTopColor: C.purpleLight, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO RESULTS (Phase 4b/4)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'scenario_results' && scenarioRecord) {
    return <ScenarioResultsScreen record={scenarioRecord} onNewSimulation={newSimulation}/>
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESULTS (Phase 2.5 layout: Story → Notable → Final State → Event Log)
  // ─────────────────────────────────────────────────────────────────────────
  const summary = finalSnapshot?.summary
  // Phase 5: assemble a full simulationResult object for the tabbed result
  // screen and its child visualizations.
  const simulationResult = {
    agents:        finalSnapshot?.agents || [],
    events:        fullEventsRef.current,
    dialogues:     finalSnapshot?.dialogues || [],
    butterflyTrace: finalSnapshot?.butterflyTrace || null,
    butterflyStats: finalSnapshot?.butterflyStats || null,
    summary,
    roundCount,
    timeUnit,
    censusStats,
    narrative,
  }
  return <ResultsScreen
    project={project}
    simulationResult={simulationResult}
    narrative={narrative}
    narrativeError={narrativeError}
    onNewSimulation={newSimulation}
  />
}

// ─── Results screen (extracted; allows internal state for collapsibles) ────
// ─── Phase 5: tabbed Results screen ───────────────────────────────────────
const RESULT_TABS = [
  { id: 'chronicle',  label: 'Chronicle'  },
  { id: 'characters', label: 'Characters' },
  { id: 'world',      label: 'World'      },
  { id: 'bonds',      label: 'Bonds'      },
  { id: 'causation',  label: 'Causation'  },
]

function ResultsScreen({ project, simulationResult, narrative, narrativeError, onNewSimulation }) {
  const [tab, setTab] = useState('chronicle')
  const summary       = simulationResult?.summary
  const dialogues     = simulationResult?.dialogues || []
  const fullEvents    = simulationResult?.events    || []
  const censusStats   = simulationResult?.censusStats
  const roundCount    = simulationResult?.roundCount
  const timeUnit      = simulationResult?.timeUnit

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Simulation Complete</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            {censusStats ? `${censusStats.activeCastCount} cast (${censusStats.boundCount} bound + ${censusStats.activeCastCount - censusStats.boundCount} procedural) · census ${censusStats.censusCount}` : 'agents'} · {roundCount} {timeUnit}-rounds · progressive mode
          </div>
        </div>
        <button onClick={onNewSimulation} style={btnSecondary}>New Simulation</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {RESULT_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabStyle(tab === t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'chronicle' && (
        <ChronicleTab
          summary={summary} narrative={narrative} narrativeError={narrativeError}
          fullEvents={fullEvents} dialogues={dialogues}
          censusStats={censusStats}
        />
      )}
      {tab === 'characters' && <CharacterThreads simulationResult={simulationResult} />}
      {tab === 'world'      && <MapView simulationResult={simulationResult} />}
      {tab === 'bonds'      && <BondNetwork simulationResult={simulationResult} />}
      {tab === 'causation'  && <ButterflyTraceView simulationResult={simulationResult} />}
    </div>
  )
}

function ChronicleTab({ summary, narrative, narrativeError, fullEvents, dialogues, censusStats }) {
  const [showStats, setShowStats] = useState(false)
  const [showLog, setShowLog]     = useState(false)
  const narrativeCost = estimateNarrativeCostUSD(narrative?.usage)

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
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

      {/* DIALOGUE SCENES — Phase 4b/3, expanded by default */}
      {dialogues.length > 0 && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}33`, borderRadius: 6, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>
            Dialogue Scenes ({dialogues.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {dialogues.map((d) => (
              <div key={d.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${C.purple}55` }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Round {d.round} · {d.eventCategory} · {d.participants.map(p => p.name).join(' & ')}
                </div>
                <div style={{ fontSize: 13, fontFamily: 'Georgia, serif', color: C.parch, lineHeight: 1.7 }}>
                  {d.lines.map((line, idx) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <span style={{ color: C.purpleLight, fontWeight: 600 }}>{line.speaker}:</span>{' '}
                      <span style={{ fontStyle: 'italic' }}>&ldquo;{line.line}&rdquo;</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
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

// ─── Phase 4b/4: Scenario Results — comparison + per-variant tabs ──────────
function ScenarioResultsScreen({ record, onNewSimulation }) {
  const [activeTab, setActiveTab] = useState(-1)   // -1 = Comparison view
  const variants = record.variants || []
  const comparison = record.comparison || {}

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Scenario Complete — {record.variantCount} variants</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            {record.baseConfig.castSize} cast · {record.baseConfig.roundCount} {record.baseConfig.timeUnit}-rounds · ${record.totalCost.toFixed(4)} total · {(record.totalWallTime/60).toFixed(1)} min wall
          </div>
        </div>
        <button onClick={onNewSimulation} style={btnSecondary}>New Simulation</button>
      </div>

      {(record.failures || []).length > 0 && (
        <div style={{ padding: '8px 12px', marginBottom: 12, backgroundColor: C.accBright + '12', border: `1px solid ${C.accBright}44`, borderRadius: 5, fontSize: 11, color: C.accBright, fontFamily: 'system-ui' }}>
          {record.failures.length} variant{record.failures.length === 1 ? '' : 's'} failed during this scenario: {record.failures.map(f => `v${f.variantIndex+1} (${f.error.slice(0,50)})`).join(', ')}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => setActiveTab(-1)} style={tabStyle(activeTab === -1)}>Comparison</button>
        {variants.map((v, i) => (
          <button key={i} onClick={() => setActiveTab(i)} style={tabStyle(activeTab === i)}>
            Variant {(v.variantIndex ?? i) + 1}
          </button>
        ))}
      </div>

      {activeTab === -1 ? (
        <ScenarioComparisonPanel record={record} />
      ) : (
        <VariantPanel variant={variants[activeTab]} fullEvents={variants[activeTab]?.events || []} />
      )}
    </div>
  )
}

function tabStyle(active) {
  return {
    padding: '8px 14px',
    backgroundColor: active ? C.bgCard : 'transparent',
    color: active ? C.purpleLight : C.muted,
    border: 'none',
    borderBottom: active ? `2px solid ${C.purple}` : '2px solid transparent',
    borderRadius: '4px 4px 0 0',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'system-ui',
    marginBottom: -1,
  }
}

function ScenarioComparisonPanel({ record }) {
  const c = record.comparison || {}
  const data = record.comparisonData || {}
  return (
    <div>
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}55`, borderRadius: 8, padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: C.purple, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 10 }}>Cross-Variant Comparison</div>
        <div style={{ fontSize: 14, color: C.parch, fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
          {(c.comparison || '').split(/\n\n+/).map((p, i) => <p key={i} style={{ margin: i === 0 ? '0 0 12px' : '12px 0' }}>{p}</p>)}
        </div>
        {c.themes?.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Themes</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {c.themes.map((t, i) => <li key={i} style={{ fontSize: 12, color: C.mutedLight, fontFamily: 'Georgia, serif', fontStyle: 'italic', marginBottom: 3 }}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>

      {data.fateDelta?.length > 0 && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.gold}33`, borderRadius: 6, padding: '14px 18px' }}>
          <div style={{ fontSize: 10, color: C.gold, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>Divergent Fates</div>
          {data.fateDelta.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: C.parch, fontFamily: 'system-ui', marginBottom: 4 }}>
              <strong>{f.name}</strong>: alive in variants {f.aliveInVariants.map(n => n + 1).join(', ')}; died in variants {f.deadInVariants.map(n => n + 1).join(', ')}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function VariantPanel({ variant, fullEvents }) {
  const summary = variant?.summary
  const n = variant?.narrative
  return (
    <div>
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}55`, borderRadius: 8, padding: '20px 24px', marginBottom: 14, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ fontSize: 10, color: C.purple, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 10 }}>Variant {(variant?.variantIndex ?? 0) + 1} · {summary?.alive}/{summary?.total} alive</div>
        {n?.headline && (
          <div style={{ fontSize: 16, color: C.parch, fontStyle: 'italic', fontFamily: 'Georgia, serif', marginBottom: 14, lineHeight: 1.4 }}>
            &ldquo;{n.headline}&rdquo;
          </div>
        )}
        {n?.narrative && (
          <div style={{ fontSize: 14, color: C.parch, fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
            {n.narrative.split(/\n\n+/).map((p, i) => <p key={i} style={{ margin: i === 0 ? '0 0 12px' : '12px 0' }}>{p}</p>)}
          </div>
        )}
      </div>
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
