import { useState, useRef, useEffect, useMemo } from 'react'
import { C, genId } from '../../constants.js'
import { TIME_UNITS, CENSUS_MULTIPLIER, DIFFICULTY_PRESETS, DIFFICULTY_DEFAULT } from './deepSimSchema.js'
import { NARRATIVE_SCALE_PRESETS, NARRATIVE_SCALE_DEFAULT, DEFAULT_WORLD_RULES, withDefaults as withWorldRulesDefaults } from '../WorldRules/worldRulesSchema.js'
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
import { SimulationProgress } from './SimulationProgress.jsx'
import { estimateRunCost, formatEstimateRange, compareActualToEstimate } from './costEstimator.js'
// Phase 6/6a-i — hydration pipeline
import { HydrationReview } from './hydration/HydrationReview.jsx'
import { runHydration, effectiveInference } from './hydration/hydrationOrchestrator.js'
import { seedAllCharacterKnowledge } from './hydration/knowledgeSeeder.js'
import { getActiveSnapshot } from './hydration/storySnapshot.js'
import {
  saveSimResult,
  loadSimResult,
  entryToMetadata,
  entryToFullPayload,
  migrateInlineHistory,
} from './persistence.js'

const CAST_SIZES = [50, 200, 500, 1000, 2000]
const LIVE_LOG_TAIL = 80   // most recent N events shown during running screen

// Phase 6/6c — Sum live cost from a simulation snapshot. Aggregates the
// tier1/tier2 decision usage + LLM distortion usage + dialogue costs that
// the runner has accumulated so far in this run. Cheap, called once per yield.
function computeSnapshotCost(snap) {
  if (!snap) return 0
  let total = 0
  const tc = snap.tierCounters || {}
  // Tier 1 (Haiku 4.5): $1 in / $5 out per 1M tokens
  for (const u of (tc.tier1Usage || [])) {
    total += ((u.input_tokens || 0) * 1 + (u.output_tokens || 0) * 5) / 1_000_000
  }
  // Tier 2 (Sonnet 4): $3 in / $15 out
  for (const u of (tc.tier2Usage || [])) {
    total += ((u.input_tokens || 0) * 3 + (u.output_tokens || 0) * 15) / 1_000_000
  }
  // Distortion usage (Sonnet)
  for (const u of (snap.llmUsageAll || [])) {
    total += ((u.input_tokens || 0) * 3 + (u.output_tokens || 0) * 15) / 1_000_000
  }
  // Dialogues (Sonnet) carry their own per-scene cost
  for (const d of (snap.dialogues || [])) {
    total += d.generationCost || 0
  }
  return total
}

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
  relationships = [],
  deepSimulationHistory = [],
  setDeepSimulationHistory,
  setTab,
  storySnapshot = '',
  hydrationData = null,
  setHydrationData = () => {},
  // Phase 6/6a-ii — world rules (aging, lifespan, custom narrative rules)
  worldRules = null,
}) {
  const effectiveWorldRules = useMemo(() => withWorldRulesDefaults(worldRules), [worldRules])

  // Phase 6/6a-ii — Story-Scale Preset replaces the Phase 5 difficulty preset.
  // Each preset sets the time unit, round count, and needs pace. Switching
  // presets updates timeUnit + roundCount; the writer can still override.
  const [scaleId, setScaleId] = useState(effectiveWorldRules.narrativeScale || NARRATIVE_SCALE_DEFAULT)
  const scale = NARRATIVE_SCALE_PRESETS[scaleId] || NARRATIVE_SCALE_PRESETS[NARRATIVE_SCALE_DEFAULT]

  const [step, setStep]               = useState('setup')
  const [mode, setMode]               = useState('progressive')
  const [castSize, setCastSize]       = useState(200)
  const [roundCount, setRoundCount]   = useState(scale.rounds)
  const [timeUnit, setTimeUnit]       = useState(scale.timeUnit)
  const [difficulty, setDifficulty]   = useState(DIFFICULTY_DEFAULT)   // legacy fallback for runner
  const [variantCount, setVariantCount] = useState(3)   // Phase 4b/4 — scenario only

  // Phase 6/6a-i — hydration state + per-sim story snapshot + knowledge seeding toggle
  const [hydrationRunning, setHydrationRunning] = useState(false)
  const [hydrationError, setHydrationError]     = useState('')
  const [hydrationProgress, setHydrationProgress] = useState(null)
  const [pendingHydration, setPendingHydration]   = useState(null) // draft of hydrationData while reviewing
  const [simSnapshotMode, setSimSnapshotMode]     = useState('project')  // 'project' | 'custom'
  const [simSnapshotText, setSimSnapshotText]     = useState('')
  const [knowledgeSeedingEnabled, setKnowledgeSeedingEnabled] = useState(true)
  const [confirmDisableSeeding, setConfirmDisableSeeding]     = useState(false)
  const [hydrationCostInfo, setHydrationCostInfo] = useState(null)
  // Phase 6/6b — opt-in toggle for persisting the butterfly trace with each
  // saved simulation. Off by default (trace can reach ~50MB at 1000 cast).
  const [preserveCausation, setPreserveCausation] = useState(false)
  // Phase 6/6c — live cost tracker + tier counters surfaced in the running screen
  const [liveCostUSD, setLiveCostUSD]         = useState(0)
  const [liveTierCounters, setLiveTierCounters] = useState(null)
  const [liveDialogueCount, setLiveDialogueCount] = useState(0)
  const [runStartedAt, setRunStartedAt]       = useState(null)
  const [scenarioContext, setScenarioContext] = useState(null)   // { variantIndex, variantCount } during scenario runs
  // Estimate captured at run launch — pinned for post-run actual-vs-estimate compare
  const [pinnedEstimate, setPinnedEstimate]   = useState(null)
  const [actualRunCost, setActualRunCost]     = useState(null)

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
  // Phase 6/6c — scenario per-variant cumulative costs so the live cost
  // tracker doesn't drop when a new variant starts (each variant's
  // tierCounters reset on its own runner instance).
  const scenarioVariantCostsRef       = useRef([])

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

  // Phase 6/6c — live cost estimate, recomputed whenever inputs change
  const costEstimate = useMemo(() => estimateRunCost({
    castSize,
    roundCount,
    boundCharCount: boundCount,
    hasHydration: !!hydrationData?.inferences,
    knowledgeSeedingEnabled,
    insightPanelsEnabled: false,    // 6d wires this on
    variantCount: mode === 'scenario' ? variantCount : 1,
    mode,
  }), [castSize, roundCount, boundCount, hydrationData, knowledgeSeedingEnabled, mode, variantCount])

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
      // Phase 6/6a-ii: pass customNarrativeRules so the detector honours them
      const { taxonomy: tx, usage } = await generateTaxonomy({ chars, lore, timelineChapters, project, customNarrativeRules: effectiveWorldRules.customNarrativeRules })
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

  // ── Phase 6/6a-i: hydration helpers ────────────────────────────────────
  // Determine whether hydration is needed. We re-hydrate when:
  //   - hydrationData is null (project never hydrated)
  //   - Any bound character's profile hash has changed since last hydration
  const needsHydration = (() => {
    if (!hydrationData?.inferences) return true
    for (const c of chars) {
      const agentId = `agent_${c.id}`
      const cached = hydrationData.inferences[agentId]
      if (!cached) return true
    }
    return false
  })()

  // Phase 6/6a-ii: worldRulesText now comes from the dedicated World Rules
  // panel's customNarrativeRules field. Lore stays in its own structured
  // store on the Story Bible. Resolves Phase 6a-i Deviation 1.
  const worldRulesText = (effectiveWorldRules.customNarrativeRules || '').slice(0, 4000)

  // Run hydration pipeline. Used both for first-run and "re-run inference".
  const runHydrationPipeline = async () => {
    setHydrationRunning(true)
    setHydrationError('')
    setHydrationProgress({ stage: 'starting', name: '' })
    try {
      const result = await runHydration({
        chars, relationships, worldRulesText,
        cachedHydration: hydrationData,
        onProgress: (e) => setHydrationProgress(e),
      })
      setPendingHydration(result.hydrationData)
      setHydrationCostInfo({ cost: result.cost, callsUsed: result.callsUsed, errors: result.errors })
      setStep('hydration_review')
    } catch (err) {
      setHydrationError(err.message || String(err))
    } finally {
      setHydrationRunning(false)
    }
  }

  // Apply the reviewed hydration data → persist to project + proceed
  const confirmHydration = () => {
    if (pendingHydration) {
      setHydrationData(pendingHydration)
    }
    setStep('setup')
  }

  // ── Run simulation ────────────────────────────────────────────────────────
  const startRun = async () => {
    if (!taxonomy || boundCount === 0) return
    // Phase 6/6a-i: gate sim start on hydration. Re-run inference when
    // the project hasn't been hydrated yet (or a profile changed).
    if (needsHydration) {
      await runHydrationPipeline()
      return
    }
    cancelRef.current = false
    pauseRef.current  = false
    setPaused(false)
    setStep('running')
    setLiveEvents([])
    fullEventsRef.current = []
    setRound(0)
    setFinalSnapshot(null)
    // Phase 6/6c — reset live counters + pin estimate for post-run compare
    setLiveCostUSD(0)
    setLiveTierCounters(null)
    setLiveDialogueCount(0)
    setRunStartedAt(Date.now())
    setScenarioContext(null)
    setPinnedEstimate(costEstimate)
    setActualRunCost(null)

    // Phase 4a.1: compute seed BEFORE buildCensus so the census uses a
    // seeded RNG. Without this, the cast composition (which procedural
    // NPCs are sampled, region assignments, initial needs) is non-
    // deterministic even when the round-loop seed is fixed.
    const seed = hashSeed(`${project?.id || 'noproj'}|${castSize}|${roundCount}|${timeUnit}|${Date.now()}`)

    // Build the effective hydration view (inferences + writer edits)
    const effectiveHydration = (() => {
      if (!hydrationData?.inferences) return null
      const effective = {}
      for (const c of chars) {
        const eff = effectiveInference(hydrationData, `agent_${c.id}`)
        if (eff) effective[`agent_${c.id}`] = eff
      }
      return { ...hydrationData, effective }
    })()

    // Phase 6/6a-i: optionally seed Knowledge before census build so bound
    // agents enter the runner with their seeded knowledge in place.
    let seededKnowledgeByAgentId = null
    if (knowledgeSeedingEnabled) {
      setStep('seeding_knowledge')
      try {
        const seedRes = await seedAllCharacterKnowledge({
          chars, worldRulesText,
          onProgress: (e) => setHydrationProgress({ stage: 'seeding', ...e }),
        })
        seededKnowledgeByAgentId = seedRes.knowledgeByAgentId
        setHydrationCostInfo(prev => ({
          ...(prev || {}),
          seedingCost: seedRes.totalCost,
          seedingCallsUsed: seedRes.callsUsed,
        }))
      } catch (err) {
        console.warn('Knowledge seeding failed, continuing without seeded knowledge:', err)
      }
      setStep('running')
    }

    // Active story snapshot for this run
    const activeSnapshot = getActiveSnapshot(
      { storySnapshot },
      { simSnapshotEnabled: simSnapshotMode === 'custom', simSnapshot: simSnapshotText }
    )

    // Build census + active cast from taxonomy (deterministic given seed).
    // Bound agents get rebuilt with hydration applied before census.
    // Phase 6/6a-ii: thread worldRules into census so lifespan overrides apply.
    const built = buildCensus({
      chars,
      taxonomy,
      castSize,
      censusMultiplier: CENSUS_MULTIPLIER,
      rng: makeSeededRng(seed),
      hydration: effectiveHydration,
      seededKnowledgeByAgentId,
      worldRules: effectiveWorldRules,
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
        // Phase 6/6a-i
        hydration: effectiveHydration,
        storySnapshot: activeSnapshot,
        seededKnowledgeByAgentId,
        // Phase 6/6a-ii — world rules drive aging, needs pacing, lifespans
        worldRules: effectiveWorldRules,
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
        // Phase 6/6c — surface live tier counters + running cost
        setLiveTierCounters(snap.tierCounters)
        setLiveDialogueCount((snap.dialogues || []).length)
        setLiveCostUSD(computeSnapshotCost(snap))
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
        storySnapshot: activeSnapshot,
        // Phase 6/6a-ii — chronicler honours writer-stated world rules
        customNarrativeRules: effectiveWorldRules.customNarrativeRules,
      })
      setNarrative(narrativeOut)
    } catch (err) {
      console.error('Narrative summary failed:', err)
      setNarrativeError(err.message || String(err))
    }

    // Phase 6/6c — actual run cost: live tier+dialogue+distortion cost
    // (last value of liveCostUSD), plus narrative call, plus hydration and
    // seeding if they ran this session.
    const narrativeCostUSD = narrativeOut?.usage
      ? ((narrativeOut.usage.input_tokens || 0) * 3 + (narrativeOut.usage.output_tokens || 0) * 15) / 1_000_000
      : 0
    const baseActual = computeSnapshotCost(lastSnap)
    const actual = baseActual + narrativeCostUSD
      + (hydrationCostInfo?.cost || 0)
      + (hydrationCostInfo?.seedingCost || 0)
    setActualRunCost(actual)

    // Build the run entry. Phase 3.5: split into full (file on disk) +
    // metadata stub (lives in project's deepSimulationHistory[]).
    // Phase 6/6b: butterflyTrace only goes to disk when preserveCausation is on.
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
      butterflyTrace: preserveCausation ? lastSnap.butterflyTrace : null,
      preserveCausation, // record the choice so the past-run viewer can show appropriate empty-state
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
    cancelRef.current = false       // Phase 6/6c — reset cancel flag for new run
    setStep('scenario_running')
    setScenarioProgress({ phase: 'starting', variantIndex: 0, round: 0 })
    setScenarioRecord(null)
    // Phase 6/6c — same live-state init as a progressive run
    setLiveEvents([])
    setLiveCostUSD(0)
    setLiveTierCounters(null)
    setLiveDialogueCount(0)
    setRunStartedAt(Date.now())
    setPinnedEstimate(costEstimate)
    setActualRunCost(null)
    setScenarioContext({ variantIndex: 0, variantCount })
    scenarioVariantCostsRef.current = new Array(variantCount).fill(0)

    const baseSeed = hashSeed(`${project?.id || 'noproj'}|${castSize}|${roundCount}|${timeUnit}|scenario|${Date.now()}`)
    const wallStart = Date.now()

    try {
      const { variants, failures, cancelled } = await runScenario({
        chars, lore, taxonomy,
        castSize, roundCount, timeUnit,
        censusMultiplier: CENSUS_MULTIPLIER,
        baseSeed,
        variantCount,
        mode: 'sequential',
        difficulty,
        // Phase 6/6a-ii — scenario variants honour the same world rules
        worldRules: effectiveWorldRules,
        // Phase 6/6c — let the writer halt a scenario mid-flight
        isCancelled: () => cancelRef.current,
        onProgress: ({ variantIndex, round, roundCount: rc, snap, censusStats: cs }) => {
          setScenarioProgress({ phase: 'simulating', variantIndex, round, roundCount: rc })
          // Phase 6/6c — surface per-snapshot data to the live progress screen
          if (snap) {
            setRound(round)
            setLiveEvents(snap.events.slice(-LIVE_LOG_TAIL))
            setAgentsLive(snap.agents)
            setLiveTierCounters(snap.tierCounters)
            setLiveDialogueCount((snap.dialogues || []).length)
            // Each variant tracks its own cumulative cost in the ref;
            // liveCost = sum across all variants so the tracker never drops.
            scenarioVariantCostsRef.current[variantIndex] = computeSnapshotCost(snap)
            const total = scenarioVariantCostsRef.current.reduce((s, v) => s + (v || 0), 0)
            setLiveCostUSD(total)
            if (cs && !censusStats) setCensusStats(cs)
            setScenarioContext({ variantIndex, variantCount })
          }
        },
      })
      // Phase 6/6c — clean cancel halt (no error, no zombie state)
      if (cancelled) {
        setStep('setup')
        return
      }
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
            butterflyTrace: preserveCausation ? v.butterflyTrace : null,   // Phase 6/6b
            preserveCausation,                                              // Phase 6/6b
            tierCounters: v.tierCounters,
            dialogues: v.dialogues,
            narrative: v.narrative,
            summary: `${v.summary.alive}/${v.summary.total} alive, ${v.summary.dead} died.`,
            // Phase 6/6b: keep structured summary for past-run reload — the
            // VariantPanel needs alive/dead/avgNeeds/avgAge to render its tabs.
            summaryObject: v.summary,
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
  // Phase 6/6b — scenarios load through a different IPC path and reconstruct
  // each variant's full result for the per-variant tabs.
  const viewPastRun = async (stub) => {
    if (!project?.id) return
    setViewError('')
    setViewLoading(true)
    try {
      // Branch: scenario stubs load the scenario record + each variant file
      if (stub.mode === 'scenario' && window.electronAPI?.loadScenarioResult) {
        const scenarioId = stub.simId || stub.id
        const scenarioRes = await window.electronAPI.loadScenarioResult(project.id, scenarioId)
        if (!scenarioRes?.ok) throw new Error(scenarioRes?.error || 'scenario load failed')
        const scenarioRecord = scenarioRes.scenarioRecord || scenarioRes
        const variantIds = scenarioRecord.variantSimIds || []
        const variants = []
        for (const vid of variantIds) {
          const r = await loadSimResult(project.id, vid)
          if (!r?.ok) continue
          const f = r.fullResult
          // Reconstruct the variant shape expected by VariantPanel
          variants.push({
            variantIndex:   f.variantIndex,
            seed:           f.seed,
            summary:        f.summaryObject || (f.summary && typeof f.summary === 'object' ? f.summary : buildSummary({ agents: f.agents || [], events: f.events || [] })),
            agents:         f.agents || [],
            events:         f.events || [],
            butterflyTrace: f.butterflyTrace || null,
            butterflyStats: f.butterflyStats || null,
            tierCounters:   f.tierCounters,
            dialogues:      f.dialogues || [],
            censusStats:    f.censusStats || null,
            narrative:      f.narrative || null,
          })
        }
        setScenarioRecord({ ...scenarioRecord, variants })
        setStep('scenario_results')
        return
      }

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

        {/* Phase 6/6a-ii — Story-Scale Preset (replaces Phase 5 difficulty) */}
        <Section label="Story-Scale Preset">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.values(NARRATIVE_SCALE_PRESETS).map(p => (
              <button key={p.id} onClick={() => {
                setScaleId(p.id)
                setTimeUnit(p.timeUnit)
                setRoundCount(p.rounds)
              }}
                style={{
                  padding: '6px 14px',
                  backgroundColor: scaleId === p.id ? C.purple + '33' : C.bgCard,
                  color: scaleId === p.id ? C.purpleLight : C.muted,
                  border: `1px solid ${scaleId === p.id ? C.purple + '66' : C.border}`,
                  borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui',
                }}>{p.label}</button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: 1.5 }}>
            {scaleId === 'thriller' && 'Thriller — 30 days. High pressure, aging irrelevant. Best for tight survival or action arcs.'}
            {scaleId === 'drama'    && 'Drama — 30 weeks (~7 months). Balanced needs pressure; relationships dominate. Default for most stories.'}
            {scaleId === 'novel'    && 'Novel — 24 months. Slow burn; relationships and quiet shifts. Aging still irrelevant.'}
            {scaleId === 'saga'     && 'Saga — 20 years. Multi-generational; aging matters; characters can die of old age.'}
            {scaleId === 'epic'     && 'Epic — 100 years. Civilisational scale; lifetimes pass; aging dominates.'}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: C.gold, fontFamily: 'system-ui' }}>
            Universe behaviour (aging speed, lifespan overrides, custom rules) lives in the <strong>World Rules</strong> tab.
          </div>
        </Section>

        {/* Phase 6/6a-i — Story snapshot mode */}
        <Section label="Story snapshot">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '6px 0' }}>
              <input type="radio" name="snapshotMode" checked={simSnapshotMode === 'project'} onChange={() => setSimSnapshotMode('project')} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 12, color: simSnapshotMode === 'project' ? C.parch : C.mutedLight, fontFamily: 'system-ui' }}>Use project snapshot</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: 1.5, marginTop: 2 }}>
                  This simulation uses the story state defined in your Story Bible. All simulations from this project share the same starting moment. Best for exploring multiple possibilities from a fixed point in your story.
                </div>
                {simSnapshotMode === 'project' && storySnapshot && (
                  <div style={{ marginTop: 6, padding: '6px 10px', fontSize: 11, color: C.parch, backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: 'Georgia, serif', fontStyle: 'italic', lineHeight: 1.5 }}>
                    {storySnapshot.slice(0, 240)}{storySnapshot.length > 240 ? '…' : ''}
                  </div>
                )}
                {simSnapshotMode === 'project' && !storySnapshot && (
                  <div style={{ marginTop: 6, fontSize: 10, color: C.gold, fontFamily: 'system-ui' }}>
                    No project snapshot set yet — edit it in Story Bible &gt; Story State.
                  </div>
                )}
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '6px 0' }}>
              <input type="radio" name="snapshotMode" checked={simSnapshotMode === 'custom'} onChange={() => { setSimSnapshotMode('custom'); if (!simSnapshotText) setSimSnapshotText(storySnapshot) }} style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: simSnapshotMode === 'custom' ? C.parch : C.mutedLight, fontFamily: 'system-ui' }}>Use custom for this run</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: 1.5, marginTop: 2 }}>
                  Enter a different story state just for this simulation. Best for exploring "what if my story were at a different moment" or comparing how events unfold from different starting points.
                </div>
                {simSnapshotMode === 'custom' && (
                  <textarea
                    value={simSnapshotText}
                    onChange={e => setSimSnapshotText(e.target.value)}
                    placeholder="Describe the story state for this run…"
                    style={{ marginTop: 6, width: '100%', minHeight: 80, padding: '8px 10px', backgroundColor: C.bg, color: C.parch, border: `1px solid ${C.borderMid}`, borderRadius: 4, fontSize: 12, fontFamily: 'Georgia,serif', lineHeight: 1.5, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                )}
              </div>
            </label>
          </div>
        </Section>

        {/* Phase 6/6b — Causation data persistence toggle */}
        <Section label="Causation data (Butterfly Trace)">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '6px 0' }}>
            <input type="checkbox" checked={preserveCausation}
              onChange={e => setPreserveCausation(e.target.checked)}
              style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: 12, color: preserveCausation ? C.parch : C.mutedLight, fontFamily: 'system-ui' }}>
                Preserve causation data{' '}
                <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>
                  (saves the full butterfly trace — heavy: ~5 MB at 200 cast, ~50 MB at 1000 cast)
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: 1.5, marginTop: 2 }}>
                {preserveCausation
                  ? 'The Causation tab will be fully populated when you re-open this simulation. Trace data is written to disk with the run.'
                  : 'The Causation tab is available during the run but not when viewing this simulation later. Recommended for most projects.'}
              </div>
            </div>
          </label>
        </Section>

        {/* Phase 6/6a-i — Knowledge seeding toggle */}
        <Section label="Character knowledge">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '6px 0' }}>
            <input type="checkbox" checked={knowledgeSeedingEnabled}
              onChange={(e) => {
                if (!e.target.checked) { setConfirmDisableSeeding(true) }
                else                   { setKnowledgeSeedingEnabled(true) }
              }}
              style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: 12, color: knowledgeSeedingEnabled ? C.parch : C.mutedLight, fontFamily: 'system-ui' }}>
                Seed character knowledge from your story{' '}
                <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>(recommended, ~$0.10–0.15 per simulation)</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: 1.5, marginTop: 2 }}>
                {knowledgeSeedingEnabled
                  ? 'Each bound character starts with 5–8 facts from their profile. The simulation continues your story.'
                  : 'Characters start with no memory of your existing story. The simulation may produce scenes that contradict events you have already written.'}
              </div>
            </div>
          </label>
          {confirmDisableSeeding && (
            <div style={{ marginTop: 10, padding: '12px 14px', backgroundColor: C.bgCard, border: `1px solid ${C.gold}55`, borderRadius: 5, fontSize: 11, fontFamily: 'system-ui', color: C.parch }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Are you sure you want to disable knowledge seeding?</div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: C.green }}>With it ON:</strong> Each bound character knows what your story says they know — past events they witnessed, secrets they hold. The simulation continues your story. Costs ~$0.10–0.15 per simulation.
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: C.accBright }}>With it OFF:</strong> Characters start with no memory of your existing story. The simulation may produce scenes that contradict events you have already written. Best for "alternate universe" exploration. Saves ~$0.10–0.15 per simulation.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setKnowledgeSeedingEnabled(true); setConfirmDisableSeeding(false) }} style={{ padding: '6px 12px', backgroundColor: C.purple, color: '#fff', border: 'none', borderRadius: 3, fontSize: 11, fontFamily: 'system-ui', cursor: 'pointer' }}>Keep it on</button>
                <button onClick={() => { setKnowledgeSeedingEnabled(false); setConfirmDisableSeeding(false) }} style={{ padding: '6px 12px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11, fontFamily: 'system-ui', cursor: 'pointer' }}>Turn it off</button>
              </div>
            </div>
          )}
        </Section>

        {/* Phase 6/6a-i — Hydration status banner */}
        {hydrationData?.inferences ? (
          <div style={{ padding: '8px 12px', marginBottom: 12, backgroundColor: C.green + '10', border: `1px solid ${C.green}33`, borderRadius: 5, fontSize: 11, fontFamily: 'system-ui', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: C.green, marginRight: 6 }}>✓</span>
              <span style={{ color: C.mutedLight }}>Story hydrated — {Object.keys(hydrationData.inferences).length} characters inferred · {hydrationData.bondsSummary?.length || 0} bonds seeded</span>
            </div>
            <button onClick={runHydrationPipeline} style={{ fontSize: 10, color: C.purpleLight, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'system-ui', textDecoration: 'underline' }}>Re-review</button>
          </div>
        ) : (
          <div style={{ padding: '8px 12px', marginBottom: 12, backgroundColor: C.gold + '12', border: `1px solid ${C.gold}44`, borderRadius: 5, fontSize: 11, fontFamily: 'system-ui', color: C.gold }}>
            ⚠ This project has not been hydrated yet. Clicking Run will read each character's profile via Claude (~$0.11–0.22 one-time, cached after).
          </div>
        )}
        {hydrationError && (
          <div style={{ padding: '8px 12px', marginBottom: 12, backgroundColor: C.accBright + '12', border: `1px solid ${C.accBright}44`, borderRadius: 5, fontSize: 11, color: C.accBright, fontFamily: 'system-ui' }}>
            Hydration error: {hydrationError}
          </div>
        )}

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

        {/* Phase 6/6c — pre-launch cost estimate */}
        {boundCount > 0 && taxonomy && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: 'system-ui', textAlign: 'center' }}>
            Estimated cost:{' '}
            <span style={{ color: costEstimate.warn ? C.accBright : C.parch, fontWeight: 500 }}>
              {formatEstimateRange(costEstimate)}
            </span>
            {' · mid ~'}<span style={{ color: C.parch }}>${costEstimate.midEstimate.toFixed(2)}</span>
          </div>
        )}

        {costEstimate.warn && boundCount > 0 && taxonomy && (
          <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: C.accBright + '12', border: `1px solid ${C.accBright}55`, borderRadius: 5, fontSize: 11, color: C.accBright, fontFamily: 'system-ui', lineHeight: 1.5 }}>
            <strong>High-cost run.</strong> This configuration could cost up to ${costEstimate.highEstimate.toFixed(2)}.
            Consider reducing cast size, round count, or variant count before running.
          </div>
        )}

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
  // Phase 6/6a-i: Hydration loading & review screens
  if (hydrationRunning && step !== 'hydration_review') {
    return (
      <div style={{ padding: 48, maxWidth: 560, margin: '0 auto', textAlign: 'center', fontFamily: 'Georgia,serif' }}>
        <div style={{ fontSize: 15, color: C.purpleLight, marginBottom: 6 }}>Setting up the story…</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginBottom: 24 }}>
          {hydrationProgress?.stage === 'inference'
            ? `Reading ${hydrationProgress?.name || ''} (${hydrationProgress?.status || 'inferring'})`
            : hydrationProgress?.stage === 'mapping'
            ? 'Mapping the Relationship Web to initial bonds…'
            : 'Working…'}
        </div>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: `2px solid ${C.purple}33`, borderTopColor: C.purpleLight, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (step === 'hydration_review') {
    return (
      <HydrationReview
        hydrationData={pendingHydration}
        setHydrationData={setPendingHydration}
        chars={chars}
        bondsSummary={pendingHydration?.bondsSummary || []}
        onConfirm={confirmHydration}
        onRerun={runHydrationPipeline}
        onCancel={() => setStep('setup')}
        rerunning={hydrationRunning}
      />
    )
  }

  if (step === 'seeding_knowledge') {
    return (
      <div style={{ padding: 48, maxWidth: 560, margin: '0 auto', textAlign: 'center', fontFamily: 'Georgia,serif' }}>
        <div style={{ fontSize: 15, color: C.purpleLight, marginBottom: 6 }}>Seeding character knowledge…</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginBottom: 24 }}>
          {hydrationProgress?.stage === 'seeding' && hydrationProgress?.name
            ? `Reading what ${hydrationProgress.name} knows at story start…`
            : 'Pre-loading character knowledge from your story.'}
        </div>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: `2px solid ${C.purple}33`, borderTopColor: C.purpleLight, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

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
  // RUNNING — Phase 6/6c live progress component
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'running') {
    return (
      <SimulationProgress
        round={round}
        roundCount={roundCount}
        agentsAlive={agentsLive.filter(a => a.alive).length}
        agentsTotal={agentsLive.length}
        censusStats={censusStats}
        events={liveEvents}
        tierCounters={liveTierCounters}
        dialogueCount={liveDialogueCount}
        hydrationCallsUsed={hydrationCostInfo?.callsUsed || 0}
        paused={paused}
        onPause={() => setPaused(p => !p)}
        onCancel={cancelRun}
        startedAt={runStartedAt}
        liveCostUSD={liveCostUSD}
        estimate={pinnedEstimate}
        scenarioContext={scenarioContext}
      />
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
  // SCENARIO RUNNING (Phase 4b/4 + Phase 6/6c live experience)
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 'scenario_running') {
    const p = scenarioProgress || {}
    // While a variant is actively simulating, show the live progress UI.
    if (p.phase === 'simulating') {
      return (
        <SimulationProgress
          round={round}
          roundCount={roundCount}
          agentsAlive={agentsLive.filter(a => a.alive).length}
          agentsTotal={agentsLive.length}
          censusStats={censusStats}
          events={liveEvents}
          tierCounters={liveTierCounters}
          dialogueCount={liveDialogueCount}
          hydrationCallsUsed={hydrationCostInfo?.callsUsed || 0}
          paused={false}
          onPause={() => {}}        // pause not supported across variants — would desync seeds
          onCancel={cancelRun}
          startedAt={runStartedAt}
          liveCostUSD={liveCostUSD}
          estimate={pinnedEstimate}
          scenarioContext={scenarioContext}
        />
      )
    }
    // Other phases (starting / narrating / comparing / error) keep the spinner.
    return (
      <div style={{ padding: 48, maxWidth: 620, margin: '0 auto', textAlign: 'center', fontFamily: 'Georgia,serif' }}>
        <div style={{ fontSize: 16, color: C.purpleLight, marginBottom: 6 }}>Scenario Running</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginBottom: 24 }}>
          {p.phase === 'narrating' ? 'Generating per-variant chronicles…'
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
    actualCost={actualRunCost}
    estimate={pinnedEstimate}
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

function ResultsScreen({ project, simulationResult, narrative, narrativeError, onNewSimulation, actualCost = null, estimate = null }) {
  const [tab, setTab] = useState('chronicle')
  const summary       = simulationResult?.summary
  const dialogues     = simulationResult?.dialogues || []
  const fullEvents    = simulationResult?.events    || []
  const censusStats   = simulationResult?.censusStats
  const roundCount    = simulationResult?.roundCount
  const timeUnit      = simulationResult?.timeUnit

  // Phase 6/6c — compare actual to pre-launch estimate
  const costCompare = compareActualToEstimate(actualCost, estimate)

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Simulation Complete</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            {censusStats ? `${censusStats.activeCastCount} cast (${censusStats.boundCount} bound + ${censusStats.activeCastCount - censusStats.boundCount} procedural) · census ${censusStats.censusCount}` : 'agents'} · {roundCount} {timeUnit}-rounds · progressive mode
          </div>
          {Number.isFinite(actualCost) && estimate && (
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
              Cost: <span style={{ color: C.parch, fontWeight: 500 }}>${actualCost.toFixed(4)}</span>
              {' '}·{' '}estimated <span style={{ color: C.parch }}>{formatEstimateRange(estimate)}</span>
              {costCompare && (
                <span style={{ color: costCompare.status === 'over' ? C.accBright : costCompare.status === 'under' ? C.green : C.mutedLight, marginLeft: 6 }}>
                  ({costCompare.status === 'within' ? 'within range' : costCompare.status === 'under' ? 'under estimate' : 'over estimate'}, {costCompare.pct}% of mid)
                </span>
              )}
            </div>
          )}
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
        <VariantPanel
          variant={variants[activeTab]}
          baseConfig={record.baseConfig}
        />
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

// Phase 6/6b — each variant now renders the full ResultsScreen tab set
// (Chronicle / Characters / World / Bonds / Causation). The variant's
// in-memory data is shaped into a simulationResult, then dispatched to
// VariantResults which renders the same tabbed UI as a progressive run.
function VariantPanel({ variant, baseConfig }) {
  if (!variant) return null
  const simulationResult = {
    agents:         variant.agents || [],
    events:         variant.events || [],
    dialogues:      variant.dialogues || [],
    butterflyTrace: variant.butterflyTrace || null,
    butterflyStats: variant.butterflyStats || null,
    summary:        variant.summary,
    roundCount:     baseConfig?.roundCount,
    timeUnit:       baseConfig?.timeUnit,
    censusStats:    variant.censusStats,
    narrative:      variant.narrative,
  }
  return (
    <VariantResults
      variant={variant}
      simulationResult={simulationResult}
      narrative={variant.narrative}
    />
  )
}

// Inner result viewer for a single variant. Mirrors ResultsScreen's tab
// layout. Kept as its own component (rather than reusing ResultsScreen
// directly) so the header reads "Variant N" instead of "Simulation Complete",
// and the page width matches the scenario container.
function VariantResults({ variant, simulationResult, narrative }) {
  const [tab, setTab] = useState('chronicle')
  const summary    = simulationResult?.summary
  const dialogues  = simulationResult?.dialogues || []
  const fullEvents = simulationResult?.events    || []
  const censusStats= simulationResult?.censusStats
  const roundCount = simulationResult?.roundCount
  const timeUnit   = simulationResult?.timeUnit
  const idx = (variant?.variantIndex ?? 0) + 1

  return (
    <div>
      <div style={{ marginBottom: 12, padding: '8px 12px', backgroundColor: C.bgCard, border: `1px solid ${C.purple}33`, borderRadius: 5 }}>
        <div style={{ fontSize: 10, color: C.purple, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          Variant {idx} · {summary?.alive}/{summary?.total} alive · seed {variant.seed}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {RESULT_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabStyle(tab === t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'chronicle' && (
        <ChronicleTab
          summary={summary} narrative={narrative} narrativeError={null}
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
