// Phase 3 — SimulationRunner
// Drives the round loop. Pure JS up through Phase 2; Phase 3 adds an
// async propagation step that may make capped LLM calls.
//
// Round phases (Phase 3):
//   1. Aging
//   2. Needs depletion
//   3. Mortality check
//   ── deterministic events fired ──
//   4. Witness computation + Knowledge updates (firsthand)
//   5. Gossip cascade with distortion (trait or LLM, capped)
//
// All RNG calls go through the seeded `rng` parameter. Same seed → same run.

import {
  applyAging,
  depleteNeeds,
  mortalityCheck,
  maybeLogAgingMilestone,
} from './stateUpdaters.js'
import { initialisePositions } from './positionGraph.js'
import { tagExceptionalPerception } from './witnessRules.js'
import { createTrace, traceStats } from './butterflyTrace.js'
import { propagateRound, resetKidCounter } from './propagation.js'
import {
  MAX_LLM_DISTORTION_CALLS_PER_ROUND,
  MAX_LLM_DISTORTION_CALLS_PER_SIM,
} from './deepSimSchema.js'

// Mulberry32 — small, fast, seeded PRNG. Same seed → same sequence.
export function makeSeededRng(seed) {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Async generator so the UI can stream snapshots.
export async function* runSimulationRounds({
  initialAgents,
  roundCount,
  timeUnit,
  rng = Math.random,
  yieldEvery = 1,
  // ── Phase 3 additions ──
  lore = [],
  chars = [],
  seed = null,
  maxLLMPerRound = MAX_LLM_DISTORTION_CALLS_PER_ROUND,
  maxLLMPerSim   = MAX_LLM_DISTORTION_CALLS_PER_SIM,
}) {
  // Use seeded rng for deterministic behaviour if seed provided
  const effectiveRng = seed != null ? makeSeededRng(seed) : rng
  let agents = initialAgents.map(a => ({ ...a, knownFacts: [] }))

  // Init positions and exceptional perception flags ONCE
  const positionState = initialisePositions(agents, lore, chars, effectiveRng)
  tagExceptionalPerception(agents)

  // Build agent index for O(1) lookup during propagation
  const agentById = Object.create(null)
  for (const a of agents) agentById[a.id] = a

  // Butterfly trace + LLM call counter
  resetKidCounter()
  const butterflyTrace = createTrace()
  let llmCallsTotal    = 0
  const llmUsageAll    = []

  let allEvents = []

  for (let round = 1; round <= roundCount; round++) {
    const ctx = { round, timeUnit }
    const roundEvents = []
    const next = []

    // ── Deterministic state evolution ────────────────────────────────────
    for (const a of agents) {
      const before = a
      const aged    = applyAging(before, ctx)
      const need    = depleteNeeds(aged.agent, ctx)
      const death   = mortalityCheck(need.agent, ctx, effectiveRng)
      const milestone = maybeLogAgingMilestone(before, death.agent, ctx)
      next.push(death.agent)
      roundEvents.push(...aged.events, ...need.events, ...death.events, ...milestone)
    }

    agents = next
    // Re-index after mutation (we overwrote the agent objects above with copies)
    for (const a of agents) agentById[a.id] = a

    // ── Information propagation (Phase 3) ────────────────────────────────
    const propResult = await propagateRound({
      roundEvents,
      agents,
      round,
      positionState,
      butterflyTrace,
      rng: effectiveRng,
      llmCallsTotalSoFar: llmCallsTotal,
      maxLLMPerRound,
      maxLLMPerSim,
      agentById,
    })
    llmCallsTotal = propResult.llmCallsTotal
    if (propResult.llmUsage?.length) llmUsageAll.push(...propResult.llmUsage)

    allEvents = allEvents.concat(roundEvents)

    if (round % yieldEvery === 0 || round === roundCount) {
      yield {
        round,
        roundCount,
        roundEvents,
        events: allEvents,
        agents,
        positionState,
        butterflyTrace,
        llmCallsTotal,
        llmCallsThisRound: propResult.llmCallsThisRound,
        progress: round / roundCount,
      }
    }
  }

  // Final yield carries the trace stats so callers can persist them
  yield {
    round: roundCount,
    roundCount,
    roundEvents: [],
    events: allEvents,
    agents,
    positionState,
    butterflyTrace,
    butterflyStats: traceStats(butterflyTrace),
    llmCallsTotal,
    llmUsageAll,
    progress: 1,
    final: true,
  }
}

// Build a final summary block from the last snapshot
export function buildSummary(snapshot) {
  const total = snapshot.agents.length
  const alive = snapshot.agents.filter(a => a.alive).length
  const dead  = total - alive

  const livingAgents = snapshot.agents.filter(a => a.alive)
  const needsKeys    = ['physiological', 'safety', 'belonging', 'esteem', 'purpose']
  const avgNeeds     = {}
  for (const k of needsKeys) {
    avgNeeds[k] = livingAgents.length === 0
      ? 0
      : livingAgents.reduce((s, a) => s + a.needs[k], 0) / livingAgents.length
  }

  const avgAge = snapshot.agents.length === 0
    ? 0
    : snapshot.agents.reduce((s, a) => s + a.age, 0) / snapshot.agents.length

  const counts = snapshot.events.reduce((m, e) => {
    m[e.category] = (m[e.category] || 0) + 1
    return m
  }, {})

  return { total, alive, dead, avgNeeds, avgAge, counts }
}
