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
  computeEmotionalState,    // Phase 7/7b — per-round emotion
} from './stateUpdaters.js'
import { initialisePositions } from './positionGraph.js'
import { tagExceptionalPerception } from './witnessRules.js'
import { createTrace, traceStats } from './butterflyTrace.js'
import { propagateRound, resetKidCounter } from './propagation.js'
import { decideRoundBatched } from './decisionLogic.js'
import { resolveAction } from './actions.js'
import { applyCoWitnessBonus, updateBondFromEvent, decayBonds } from './bondsLayer.js'
import { selectDialogueCandidates, generateDialogues } from './dialogue.js'
import { convertBondsOnDeath, seedMemorialBondsAtHydration, updateMemorialBonds } from './memorialBonds.js'
import {
  MAX_LLM_DISTORTION_CALLS_PER_ROUND,
  MAX_LLM_DISTORTION_CALLS_PER_SIM,
} from './deepSimSchema.js'
// Phase 6/6d — Insight panels
import { detectBlindSpots } from './insights/blindSpotDetector.js'
import { findPromotionCandidates } from './insights/promotionCandidates.js'
import { computeEmotionalWeather } from './insights/emotionalWeather.js'
import { detectThemes } from './insights/themeDetection.js'

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
  // Phase 6/6a-ii: superseded by worldRules.needs.*Speed; kept as a legacy
  // fallback for callers that haven't migrated yet (e.g. older tests).
  difficulty = 'standard',
  // Phase 6/6a-i: hydration data (inferences + bonds), story snapshot,
  // and pre-seeded Knowledge entries. Runner threads them through to the
  // prompts and into agent state at the same point it would have started
  // from defaults.
  hydration = null,
  storySnapshot = null,
  seededKnowledgeByAgentId = null,
  // Phase 6/6a-ii: world rules — aging behaviour, needs multipliers,
  // lifespan overrides, custom narrative rules. When null, falls back to
  // legacy difficulty.
  worldRules = null,
  // Phase 6/6d — insight panels: when true, after the round loop + dialogues
  // the four insight modules run in parallel. Costs ~$0.06 per sim. Default
  // off; the UI's "Generate insight panels" toggle drives this.
  generateInsights = false,
  // Optional taxonomy for blind-spot heuristics (unrepresented genres).
  taxonomy = null,
}) {
  const effectiveRng = seed != null ? makeSeededRng(seed) : rng
  let agents = initialAgents.map(a => {
    const agentId = a.id
    // Phase 6/6a-i: hydration preserves bonds + knownFacts from the seed.
    // Without hydration, fall back to Phase 4a behaviour (empty bonds/knowledge).
    const seedBonds = (hydration?.bondsByAgentId?.[agentId]) || {}
    const seedKnowledge = (seededKnowledgeByAgentId?.[agentId]) || []
    // For bound agents that came in pre-hydrated (status flags + bonds + knowledge
    // are on the agent already), DO NOT clobber them on copy.
    if (a.source === 'bound' && (a.bonds && Object.keys(a.bonds).length > 0 || (a.knownFacts || []).length > 0)) {
      return { ...a, actionHistory: [] }
    }
    return {
      ...a,
      knownFacts:    [...seedKnowledge],
      bonds:         { ...seedBonds },
      actionHistory: [],
    }
  })

  // Init positions, exceptional perception (Phase 4b: Tier 1 via Haiku
  // doesn't need a warmup — no init step).
  const positionState = initialisePositions(agents, lore, chars, effectiveRng)
  tagExceptionalPerception(agents)

  // Build agent index for O(1) lookup
  const agentById = Object.create(null)
  for (const a of agents) agentById[a.id] = a

  // Phase 7/7c — hydration-time memorial bonds. A bonded Bible character whose
  // hydrated status is 'dead' is excluded from the active cast, but survivors'
  // seeded bonds still point at its agent id. Flag those bonds memorial from
  // round 0 so a story that opens on a grieving survivor starts grieving.
  if (hydration) {
    const eff = hydration.effective || hydration.inferences || {}
    const deadAgentIds = new Set(
      Object.entries(eff)
        .filter(([, inf]) => (inf?.status || '').toLowerCase() === 'dead')
        .map(([agentId]) => agentId)
    )
    if (deadAgentIds.size > 0) {
      seedMemorialBondsAtHydration({ agents, deadAgentIds })
    }
  }

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

  // Phase 7/7b — emotion snapshots.
  //   bound:   per-round, per-agent map of {stress,contentment,grief,dominantEmotion}
  //            (only for source==='bound' agents — small count, always kept)
  //   npc:     per-round aggregate across procedural agents (cheap, always kept)
  //   prev:    last round's bound emotions, used by computeEmotionalState for
  //            carry-over decay so swings aren't instantaneous each round
  const emotionSnapshots = []
  const prevEmotionByAgent = Object.create(null)

  for (let round = 1; round <= roundCount; round++) {
    // Phase 6/6a-ii: worldRules ride along in ctx so updaters can read aging
    // behaviour + per-need multipliers + custom narrative rules without
    // threading them through every function signature.
    const ctx = { round, timeUnit, difficulty, worldRules }
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
    // Phase 7/7a — worldRules ride on `world` so decisionLogic can read the
    // psychologicalInfluence dial without an extra parameter through every callsite.
    const world = { round, agents, agentById, positionState, worldRules }

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

    // Phase 7/7c — attribute a "harmed by" cause from this round's conflicts
    // so a death that follows combat can be traced to a killer (vengeance).
    for (const ev of actionEvents) {
      if (ev.category === 'conflict' && ev.loserId && ev.winnerId && ev.loserId !== ev.winnerId) {
        const loser = agentById[ev.loserId]
        if (loser) { loser._lastHarmedBy = ev.winnerId; loser._lastHarmedRound = round }
      }
    }

    // ── 5. Mortality check ─────────────────────────────────────────────
    const deathEvents = []
    const deathsThisRound = []
    for (const agent of agents) {
      const wasAlive = agent.alive
      const m = mortalityCheck(agent, ctx, effectiveRng)
      Object.assign(agent, m.agent)
      if (m.events?.length) {
        deathEvents.push(...m.events)
        // Phase 7/7c — record the death + its likely cause for memorial conversion.
        if (wasAlive && !agent.alive) {
          // A recent attacker (within 3 rounds) is the cause; else null (health/age).
          const causeAgentId = (agent._lastHarmedBy && (round - (agent._lastHarmedRound ?? -99)) <= 3)
            ? agent._lastHarmedBy : null
          deathsThisRound.push({ deceasedId: agent.id, deceasedName: agent.name, causeAgentId })
        }
      }
    }

    // Phase 7/7c — convert survivors' bonds toward each newly-dead agent into
    // memorial bonds (deterministic; psychology drives later evolution).
    for (const d of deathsThisRound) {
      convertBondsOnDeath({
        agents, agentById,
        deceasedId: d.deceasedId, deceasedName: d.deceasedName,
        round, causeAgentId: d.causeAgentId,
      })
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

    // ── 9.5 Phase 7/7c — evolve memorial bonds (grief decay/intensify) ──
    // Returns each agent's aggregate grief so emotion can spike above the
    // chronic stress plateau. Deterministic; driven by survivor psychology.
    const griefByAgent = Object.create(null)
    for (const a of agents) {
      if (!a.alive) continue
      griefByAgent[a.id] = updateMemorialBonds({ agent: a, round, world })
    }

    // ── 10. Phase 7/7b — emotion snapshots ──────────────────────────────
    // Build a small index of this round's events by agentId / targetId so
    // computeEmotionalState can scan only events touching the agent.
    const boundSnap = {}
    let npcSumStress = 0, npcSumContent = 0, npcSumGrief = 0
    let npcCount = 0
    const npcEmotionCounts = Object.create(null)
    for (const a of agents) {
      if (!a.alive) continue   // dead agents don't get a per-round emotion
      // roundEvents passed in full (cheap — usually small enough that filter
      // inside computeEmotionalState is fine; we don't pre-index because the
      // function's scan is O(events) per agent and roundEvents stays modest).
      const prev = prevEmotionByAgent[a.id] || null
      // Phase 7/7c — feed memorial grief so a fresh loss spikes into the
      // reserved acute band above the chronic plateau.
      const emo = computeEmotionalState(a, ctx, roundEvents, prev, griefByAgent[a.id] ?? null)
      // Mirror to the agent so downstream code (and the Phase 4 emotion field)
      // sees the same dominantEmotion label.
      a.stress     = emo.stress
      a.emotion    = emo.dominantEmotion
      prevEmotionByAgent[a.id] = emo
      if (a.source === 'bound') {
        boundSnap[a.id] = { ...emo, name: a.name }
      } else {
        npcSumStress  += emo.stress
        npcSumContent += emo.contentment
        npcSumGrief   += emo.grief
        npcCount      += 1
        npcEmotionCounts[emo.dominantEmotion] = (npcEmotionCounts[emo.dominantEmotion] || 0) + 1
      }
    }
    emotionSnapshots.push({
      round,
      bound: boundSnap,
      npc: npcCount === 0 ? null : {
        meanStress:      +(npcSumStress / npcCount).toFixed(3),
        meanContentment: +(npcSumContent / npcCount).toFixed(3),
        meanGrief:       +(npcSumGrief / npcCount).toFixed(3),
        dominantEmotionCounts: npcEmotionCounts,
        count: npcCount,
      },
    })

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
        emotionSnapshots,           // Phase 7/7b — full history so far
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
      dialogues = await generateDialogues({
        candidates, agentById, storySnapshot,
        customNarrativeRules: worldRules?.customNarrativeRules || null,
      })
    }
  }

  // ── Phase 6/6d: Insight panels ─────────────────────────────────────────
  // Four analytical panels run in parallel: blindSpots, promotionCandidates,
  // emotionalWeather (no LLM), themes. Gated by the generateInsights flag.
  // disableLLM forces all four to skip the Sonnet calls but emotionalWeather
  // (pure aggregation) still runs.
  let insights = null
  if (generateInsights) {
    const [blindSpotsRes, promoRes, themesRes] = await Promise.all([
      disableLLM
        ? Promise.resolve({ findings: [], observations: [], usage: null, cost: 0 })
        : detectBlindSpots({ events: allEvents, agents, roundCount, timeUnit, censusStats: null, taxonomy }).catch(e => ({ error: e.message || String(e), findings: [], observations: [], usage: null, cost: 0 })),
      disableLLM
        ? Promise.resolve({ shortlist: [], candidates: [], usage: null, cost: 0 })
        : findPromotionCandidates({ events: allEvents, agents, roundCount }).catch(e => ({ error: e.message || String(e), shortlist: [], candidates: [], usage: null, cost: 0 })),
      disableLLM
        ? Promise.resolve({ themes: [], usage: null, cost: 0 })
        : detectThemes({ events: allEvents, agents, dialogues, roundCount, timeUnit }).catch(e => ({ error: e.message || String(e), themes: [], usage: null, cost: 0 })),
    ])
    // Phase 7/7b — pass the real snapshots so the chart reads measured data
    const weather = computeEmotionalWeather({ events: allEvents, agents, roundCount, emotionSnapshots })
    const totalInsightCost = (blindSpotsRes.cost || 0) + (promoRes.cost || 0) + (themesRes.cost || 0)
    insights = {
      blindSpots:          blindSpotsRes,
      promotionCandidates: promoRes,
      emotionalWeather:    weather,
      themes:              themesRes,
      totalCost:           totalInsightCost,
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
    insights,           // Phase 6/6d
    emotionSnapshots,   // Phase 7/7b — full per-round emotion history
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
