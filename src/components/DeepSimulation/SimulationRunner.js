// Phase 4a — SimulationRunner with decisions, actions, bonds
//
// Round phases (Phase 4a):
//   1. Aging
//   2. Needs depletion
//   3. Decide actions  (Phase 4a — Tier 0 / 1 / 2 routing)
//   4. Resolve actions (Phase 4a — apply effects, generate events)
//   5. Mortality check
//   6. Compute witnesses for ALL events including action events
//   7. Propagate information (with bond-aware confidence)
//   8. Update bonds from action events
//   9. Decay bonds for inactive relationships
//
// All RNG goes through the seeded `rng` parameter for end-to-end determinism.

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
import { decideRoundBatched } from './decisionLogic.js'
import { resolveAction } from './actions.js'
import { applyCoWitnessBonus, updateBondFromEvent, decayBonds } from './bondsLayer.js'
import { selectDialogueCandidates, generateDialogues } from './dialogue.js'
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

export async function* runSimulationRounds({
  initialAgents,
  roundCount,
  timeUnit,
  rng = Math.random,
  yieldEvery = 1,
  lore = [],
  chars = [],
  seed = null,
  // Phase 3 LLM distortion caps
  maxLLMPerRound = MAX_LLM_DISTORTION_CALLS_PER_ROUND,
  maxLLMPerSim   = MAX_LLM_DISTORTION_CALLS_PER_SIM,
  // Test-only: disable all LLM (Tier 1 + Tier 2 decisions + Phase 3 distortion).
  // With same seed, two runs will be byte-identical when this is on.
  disableLLM = false,
  // Phase 5 pre-fix: difficulty preset for needs depletion pacing.
  difficulty = 'standard',
}) {
  const effectiveRng = seed != null ? makeSeededRng(seed) : rng
  let agents = initialAgents.map(a => ({
    ...a,
    knownFacts:    [],
    bonds:         {},
    actionHistory: [],
  }))

  // Init positions, exceptional perception (Phase 4b: Tier 1 via Haiku
  // doesn't need a warmup — no init step).
  const positionState = initialisePositions(agents, lore, chars, effectiveRng)
  tagExceptionalPerception(agents)

  // Build agent index for O(1) lookup
  const agentById = Object.create(null)
  for (const a of agents) agentById[a.id] = a

  // Butterfly trace + counters
  resetKidCounter()
  const butterflyTrace = createTrace()
  let llmDistortionCallsTotal = 0
  const llmDistortionUsageAll = []

  // Tier counters. When disableLLM is set we pre-saturate the caps so every
  // decision routes to Tier 0 deterministic (used for determinism testing).
  const tierCounters = {
    tier0Total: 0,
    tier1Total: disableLLM ? 999999 : 0,
    tier2Total: disableLLM ? 999999 : 0,
    tier1ThisRound: 0,
    tier1Usage: [],
    tier2Usage: [],
    tier2Errors: [],
  }
  const actionCounts = Object.create(null)

  let allEvents = []

  for (let round = 1; round <= roundCount; round++) {
    const ctx = { round, timeUnit, difficulty }
    const roundEvents = []

    tierCounters.tier1ThisRound = 0   // reset per-round Ollama cap

    // ── 1-2. Deterministic aging + needs depletion ──────────────────────
    const next = []
    const deterministicEventsByAgent = new Map()
    for (const a of agents) {
      const before = a
      const aged    = applyAging(before, ctx)
      const need    = depleteNeeds(aged.agent, ctx)
      const milestone = maybeLogAgingMilestone(before, need.agent, ctx)
      const evs = [...aged.events, ...need.events, ...milestone]
      next.push(need.agent)
      if (evs.length) deterministicEventsByAgent.set(need.agent.id, evs)
    }
    agents = next
    for (const a of agents) agentById[a.id] = a

    // World object passed to action / decision logic
    const world = { round, agents, agentById, positionState }

    // ── 3-4. Decide + resolve actions for living agents (Phase 4b: batched) ──
    const actionEvents = []
    // Batched per-round routing — Tier 0 sync, Tier 1 batched via Haiku
    // parallel, Tier 2 parallel via Sonnet
    const decisions = await decideRoundBatched({
      agents,
      world,
      rng: effectiveRng,
      callCounters: tierCounters,
    })
    for (const agent of agents) {
      if (!agent.alive) continue
      const decision = decisions[agent.id]
      if (!decision) continue
      // tier0Total / tier1Total / tier2Total are already incremented inside
      // decideRoundBatched by way of the callCounters argument — except for
      // tier0 which doesn't pass through the LLM path; tally it here.
      if (decision.tier === 'tier0') tierCounters.tier0Total++
      actionCounts[decision.action] = (actionCounts[decision.action] || 0) + 1

      const result = resolveAction(agent, decision.action, world, effectiveRng)
      if (result?.events?.length) {
        for (const e of result.events) {
          e.agentGenreTag = agent.genreTag
          actionEvents.push(e)
        }
      }
      if (result?.bondUpdates) {
        agent._pendingBondUpdates = (agent._pendingBondUpdates || []).concat(result.bondUpdates)
      }
    }

    // ── 5. Mortality check ─────────────────────────────────────────────
    const deathEvents = []
    for (const agent of agents) {
      const m = mortalityCheck(agent, ctx, effectiveRng)
      Object.assign(agent, m.agent)
      if (m.events?.length) deathEvents.push(...m.events)
    }

    // Combine all this round's events: deterministic + actions + deaths
    for (const evs of deterministicEventsByAgent.values()) roundEvents.push(...evs)
    roundEvents.push(...actionEvents, ...deathEvents)

    // ── 6-7. Witnesses + propagation (Phase 3) ─────────────────────────
    const propResult = await propagateRound({
      roundEvents,
      agents,
      round,
      positionState,
      butterflyTrace,
      rng: effectiveRng,
      llmCallsTotalSoFar: llmDistortionCallsTotal,
      // Force trait-only distortion when LLM disabled
      maxLLMPerRound: disableLLM ? 0 : maxLLMPerRound,
      maxLLMPerSim:   disableLLM ? 0 : maxLLMPerSim,
      agentById,
    })
    llmDistortionCallsTotal = propResult.llmCallsTotal
    if (propResult.llmUsage?.length) llmDistortionUsageAll.push(...propResult.llmUsage)

    // ── 8. Update bonds from action events ──────────────────────────────
    for (const ev of actionEvents) {
      const a = agentById[ev.agentId]
      if (!a) continue
      updateBondFromEvent(a, ev, world)
    }
    // Co-witness bonus: pairs that witnessed the same event together.
    // Use the witnessesByEvent index returned by propagateRound — O(1) lookup
    // per event instead of an O(K) scan over the cumulative Knowledge store.
    if (propResult.witnessesByEvent) {
      for (const witnesses of propResult.witnessesByEvent.values()) {
        const ws = witnesses.slice(0, 12)
        for (let i = 0; i < ws.length; i++) {
          for (let j = i + 1; j < ws.length; j++) {
            applyCoWitnessBonus(ws[i], ws[j], round)
          }
        }
      }
    }

    // ── 9. Bond decay ───────────────────────────────────────────────────
    if (round % 2 === 0) {   // every other round to save cycles
      for (const a of agents) decayBonds(a, round)
    }

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
        llmCallsTotal: llmDistortionCallsTotal,
        llmCallsThisRound: propResult.llmCallsThisRound,
        tierCounters: { ...tierCounters },
        actionCounts: { ...actionCounts },
        progress: round / roundCount,
      }
    }
  }

  // ── Phase 4b/3: Dialogue generation after rounds complete ──────────────
  // Select up to MAX_DIALOGUES_PER_SIM moments deserving dialogue, generate
  // each in parallel via Sonnet. Disabled when disableLLM is set.
  let dialogues = []
  if (!disableLLM) {
    const candidates = selectDialogueCandidates(allEvents, agentById, 0)
    if (candidates.length > 0) {
      dialogues = await generateDialogues({ candidates, agentById })
    }
  }

  // Final yield with full diagnostics
  yield {
    round: roundCount,
    roundCount,
    roundEvents: [],
    events: allEvents,
    agents,
    positionState,
    butterflyTrace,
    butterflyStats: traceStats(butterflyTrace),
    llmCallsTotal: llmDistortionCallsTotal,
    llmUsageAll: llmDistortionUsageAll,
    tierCounters: { ...tierCounters },
    actionCounts: { ...actionCounts },
    dialogues,
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
