// Phase 4b/4 — Scenario mode
// Runs N variants of the Progressive engine from the same starting moment,
// each with a deterministic seed derived from a base. Aggregates per-variant
// results + cross-variant comparison data for narrative synthesis.

import { buildCensus } from './CensusManager.js'
import { runSimulationRounds, buildSummary, makeSeededRng } from './SimulationRunner.js'

export const MAX_SCENARIO_VARIANTS = 5
export const DEFAULT_SCENARIO_VARIANTS = 3

// Derive a unique seed per variant from the base seed + index.
// FNV-1a hash so derivation is stable across runs.
function variantSeed(baseSeed, idx) {
  let h = 0x811c9dc5
  const s = `${baseSeed}::variant::${idx}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

// Run a single variant. Returns {
//   variantIndex, seed, summary, agents, events, butterflyStats,
//   tierCounters, dialogues, llmUsageAll
// }.
// Phase 6/6a-ii: variants accept worldRules + hydration + storySnapshot so
// scenarios honour the same configuration as a single progressive run.
// Phase 6/6c: isCancelled() lets the caller halt the scenario between rounds.
async function runVariant({ variantIndex, baseSeed, chars, lore, taxonomy, castSize, roundCount, timeUnit, censusMultiplier, difficulty, onProgress, worldRules = null, hydration = null, storySnapshot = null, seededKnowledgeByAgentId = null, isCancelled = () => false, generateInsights = false }) {
  const seed = variantSeed(baseSeed, variantIndex)
  const built = buildCensus({
    chars, taxonomy, castSize, censusMultiplier,
    rng: makeSeededRng(seed),
    hydration, seededKnowledgeByAgentId, worldRules,
  })

  let lastSnap = null
  const gen = runSimulationRounds({
    initialAgents: built.activeCast,
    roundCount, timeUnit,
    lore, chars, seed,
    difficulty,
    hydration, storySnapshot, seededKnowledgeByAgentId, worldRules,
    // Phase 6/6d — per-variant insights
    generateInsights, taxonomy,
  })
  for await (const snap of gen) {
    if (isCancelled()) break
    lastSnap = snap
    // Phase 6/6c — emit the snapshot so the parent can render the same
    // live progress UI as a progressive run (agents, events, tier counters).
    if (onProgress) onProgress({
      variantIndex, round: snap.round, roundCount,
      snap,
      censusStats: built.stats,
    })
  }
  const summary = buildSummary(lastSnap)

  return {
    variantIndex,
    seed,
    summary,
    censusStats:    built.stats,
    agents:         lastSnap.agents,
    events:         lastSnap.events,
    butterflyStats: lastSnap.butterflyStats,
    butterflyTrace: lastSnap.butterflyTrace || null,   // Phase 6/6b: kept in-memory; caller decides whether to persist
    tierCounters:   lastSnap.tierCounters,
    llmUsageAll:    lastSnap.llmUsageAll,
    dialogues:      lastSnap.dialogues || [],
    insights:       lastSnap.insights || null,        // Phase 6/6d
  }
}

// Run N variants. Mode 'parallel' fires all at once (memory permitting);
// 'sequential' runs them one at a time. Caller decides based on available
// memory and cast size.
export async function runScenario({
  chars, lore, taxonomy,
  castSize, roundCount, timeUnit,
  censusMultiplier = 5,
  baseSeed,
  variantCount = DEFAULT_SCENARIO_VARIANTS,
  mode = 'sequential',
  difficulty = 'standard',
  onProgress = null,
  // Phase 6/6a-ii passthrough
  worldRules = null,
  hydration = null,
  storySnapshot = null,
  seededKnowledgeByAgentId = null,
  // Phase 6/6c — caller-supplied cancel check (polled between rounds + variants)
  isCancelled = () => false,
  // Phase 6/6d — per-variant insights
  generateInsights = false,
}) {
  const N = Math.min(MAX_SCENARIO_VARIANTS, Math.max(1, variantCount))
  const variants = []

  // Phase 4b.1: per-variant try/catch so one failed variant doesn't sink
  // the whole scenario. If a variant throws (network, timeout, API error,
  // memory pressure), log it, mark it as failed, and continue with the
  // remaining variants. Caller can build a partial comparison from
  // whichever variants succeeded.
  const failures = []
  if (mode === 'parallel') {
    const runners = []
    for (let i = 0; i < N; i++) {
      runners.push(
        runVariant({
          variantIndex: i, baseSeed, chars, lore, taxonomy,
          castSize, roundCount, timeUnit, censusMultiplier, difficulty, onProgress,
          worldRules, hydration, storySnapshot, seededKnowledgeByAgentId, isCancelled, generateInsights,
        }).catch(err => {
          console.error(`[Scenario] variant ${i} failed:`, err)
          failures.push({ variantIndex: i, error: err.message || String(err) })
          return null
        })
      )
    }
    const out = await Promise.all(runners)
    for (const v of out) if (v) variants.push(v)
  } else {
    for (let i = 0; i < N; i++) {
      if (isCancelled()) break    // Phase 6/6c — bail out between variants
      try {
        const v = await runVariant({
          variantIndex: i, baseSeed, chars, lore, taxonomy,
          castSize, roundCount, timeUnit, censusMultiplier, difficulty, onProgress,
          worldRules, hydration, storySnapshot, seededKnowledgeByAgentId, isCancelled, generateInsights,
        })
        variants.push(v)
      } catch (err) {
        console.error(`[Scenario] variant ${i} failed:`, err)
        failures.push({ variantIndex: i, error: err.message || String(err) })
      }
    }
  }

  return { variants, failures, cancelled: isCancelled() }
}

// Build comparison data across variants. Pure data — no LLM call here; the
// scenarioComparison module wraps this with a Claude synthesis.
export function buildVariantComparison({ variants, chars }) {
  if (!variants?.length) return null
  const boundIds = new Set(chars.map(c => c.id).map(id => `agent_${id}`).concat(chars.map(c => `agent_${c.id}`)))
  // Use agent IDs that begin with 'agent_' (bound) across variants
  const boundSurvival = {}  // bound char name → variant survival map

  // Per bound char: which variants survived in, plus final age/health
  for (const v of variants) {
    for (const a of v.agents) {
      if (a.source !== 'bound') continue
      const key = a.name
      if (!boundSurvival[key]) boundSurvival[key] = []
      boundSurvival[key].push({
        variantIndex: v.variantIndex,
        alive:        a.alive,
        age:          a.age,
        health:       a.health,
        bondCount:    Object.keys(a.bonds || {}).length,
      })
    }
  }

  // Per major category, count divergence across variants
  const CATEGORIES = ['betrayal','death','conflict','cooperation','travel']
  const categoryCounts = {}
  for (const cat of CATEGORIES) {
    categoryCounts[cat] = variants.map(v => v.events.filter(e => e.category === cat).length)
  }

  // Key divergences: events that fired in some but not all variants — bound-
  // char deaths are most striking. We surface bound-char fates as a list.
  const fateDelta = []
  for (const [name, fates] of Object.entries(boundSurvival)) {
    const aliveCount = fates.filter(f => f.alive).length
    if (aliveCount > 0 && aliveCount < fates.length) {
      fateDelta.push({
        name,
        aliveInVariants: fates.filter(f => f.alive).map(f => f.variantIndex),
        deadInVariants:  fates.filter(f => !f.alive).map(f => f.variantIndex),
      })
    }
  }

  // Cost + simple totals
  const totalCost = variants.reduce((s, v) => {
    const t1 = (v.tierCounters?.tier1Usage || []).reduce((x, u) => x + ((u.input_tokens||0)*1 + (u.output_tokens||0)*5)/1_000_000, 0)
    const t2 = (v.tierCounters?.tier2Usage || []).reduce((x, u) => x + ((u.input_tokens||0)*3 + (u.output_tokens||0)*15)/1_000_000, 0)
    const dist = (v.llmUsageAll || []).reduce((x, u) => x + ((u.input_tokens||0)*3 + (u.output_tokens||0)*15)/1_000_000, 0)
    const dlg = (v.dialogues || []).reduce((x, d) => x + (d.generationCost || 0), 0)
    return s + t1 + t2 + dist + dlg
  }, 0)

  return {
    variantCount:   variants.length,
    boundSurvival,
    fateDelta,
    categoryCounts,
    totalSimCost:   totalCost,
    perVariantSummary: variants.map(v => ({
      variantIndex: v.variantIndex,
      seed:         v.seed,
      alive:        v.summary.alive,
      dead:         v.summary.dead,
      events:       v.events.length,
      dialogues:    v.dialogues?.length || 0,
    })),
  }
}
