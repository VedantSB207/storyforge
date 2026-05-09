// Phase 3 — propagation
// Orchestrates witness computation, distortion, and Knowledge propagation
// for one round of events.
//
// Per round, after deterministic events fire:
//   1. Origin event is recorded in the butterfly trace
//   2. Witnesses are computed; each gets a firsthand Knowledge entry
//   3. Each Knowledge holder may gossip to bonded + adjacent agents
//      (distortion + new Knowledge entry + trace edge per hop)
//   4. Hop limit and confidence floor terminate the cascade
//
// Output: { distortionCallsThisRound, distortionLLMUsage[] }
// Mutates: agents (their .knownFacts arrays), butterflyTrace

import { computeWitnesses } from './witnessRules.js'
import { adjacentAgents }   from './positionGraph.js'
import {
  distortEventTraitBased,
  distortEventLLM,
  shouldUseLLM,
} from './distortion.js'
import {
  recordOriginEvent,
  recordKnowledge,
  recordPropagationEdge,
} from './butterflyTrace.js'
import {
  PROPAGATION_HOP_LIMIT,
  CONFIDENCE_FLOOR,
  CONFIDENCE_DECAY_PER_HOP,
  MAX_GOSSIP_RECEIVERS_PER_HOP,
  GOSSIP_PROB_BONDED,
  GOSSIP_PROB_SAME_REGION,
  GOSSIP_PROB_ADJACENT,
  PROPAGATABLE_CATEGORIES,
  BONDED_GOSSIP_INTENSITY_THRESHOLD,
  BONDED_GOSSIP_DECAY,
} from './deepSimSchema.js'

// Allocate a stable id for a Knowledge entry.
let _kidCounter = 0
const newKid = () => `kn_${(++_kidCounter).toString(36)}`
export function resetKidCounter() { _kidCounter = 0 }

// Add a Knowledge entry to an agent IF they don't already have one for
// this origin. Returns the entry if added, null otherwise.
function addKnowledgeIfNew(agent, originEventId, entry) {
  agent.knownFacts = agent.knownFacts || []
  // Dedup by origin: keep highest-confidence variant
  const existingIdx = agent.knownFacts.findIndex(k => k.originEventId === originEventId)
  if (existingIdx >= 0) {
    if (entry.confidence > agent.knownFacts[existingIdx].confidence) {
      agent.knownFacts[existingIdx] = entry
      return entry
    }
    return null
  }
  agent.knownFacts.push(entry)
  return entry
}

// Pick gossip targets from the candidate set with their per-target probabilities.
// Returns chosen targets up to a cap, deterministic via the rng.
function chooseGossipTargets(transmitter, candidates, agents, positionState, rng) {
  // Build (agent, prob) pairs
  const pool = []
  // Bonded agents (relationships layer) — Phase 3 schema usually empty,
  // but the hook is here for Phase 4
  const bonds = transmitter.relationships || {}
  for (const a of candidates) {
    const bond = bonds[a.id]
    if (bond) {
      const p = GOSSIP_PROB_BONDED * (bond.intensity || 0.5) * (bond.trust || 0.5)
      pool.push({ agent: a, prob: p })
      continue
    }
    // Region-based fallback
    const sameRegion = a.region === transmitter.region
    pool.push({ agent: a, prob: sameRegion ? GOSSIP_PROB_SAME_REGION : GOSSIP_PROB_ADJACENT })
  }
  // Roll independently for each candidate, cap at MAX
  const chosen = []
  for (const p of pool) {
    if (rng() < p.prob) {
      chosen.push(p.agent)
      if (chosen.length >= MAX_GOSSIP_RECEIVERS_PER_HOP) break
    }
  }
  return chosen
}

// Process one round's worth of events. Returns counters for reporting.
// `roundEvents` are the deterministic events fired this round.
export async function propagateRound({
  roundEvents,
  agents,
  round,
  positionState,
  butterflyTrace,
  rng = Math.random,
  llmCallsTotalSoFar = 0,
  maxLLMPerRound,
  maxLLMPerSim,
  agentById,
}) {
  let llmThisRound = 0
  const llmUsage = []
  let llmCallsTotal = llmCallsTotalSoFar
  // Phase 4a fix: index witness agents per event so the runner's co-witness
  // bonus loop can do O(1) lookup instead of scanning the full Knowledge
  // store. Without this, 1000-cast runs went from minutes to over an hour.
  const witnessesByEvent = new Map()

  for (const event of roundEvents) {
    // Skip events we don't propagate (aging is private)
    if (!PROPAGATABLE_CATEGORIES.includes(event.category)) {
      // Even if we don't propagate, the origin agent gets a firsthand
      // Knowledge entry of their own event. This makes their personal
      // history queryable.
      if (event.agentId) {
        const origin = agentById[event.agentId]
        if (origin) {
          const eventId = recordOriginEvent(event, butterflyTrace)
          const kid = newKid()
          const entry = {
            id:             kid,
            originEventId:  eventId,
            source:         'firsthand',
            sourceAgentId:  origin.id,
            content:        event.content,
            confidence:     1.0,
            roundLearned:   round,
            hops:           0,
          }
          addKnowledgeIfNew(origin, eventId, entry)
          recordKnowledge(entry, butterflyTrace)
        }
      }
      continue
    }

    // Origin agent (the agent the event happened to)
    const origin = event.agentId ? agentById[event.agentId] : null
    if (!origin) continue

    // Annotate event with origin hints used by distortion
    event.originAgentId      = origin.id
    event.originAgentGenreTag = origin.genreTag
    event.originBound         = origin.source === 'bound'

    // Record origin in the trace
    const eventId = recordOriginEvent(event, butterflyTrace)

    // ── Witness step ──────────────────────────────────────────────────
    const witnesses = computeWitnesses(event, agents, positionState, rng)
    const hopQueue = []   // entries ready to gossip onward
    const eventWitnessAgents = []
    for (const w of witnesses) {
      if (!w.alive && w.id !== origin.id) continue   // dead don't witness anything new
      const kid = newKid()
      const entry = {
        id:             kid,
        originEventId:  eventId,
        source:         'firsthand',
        sourceAgentId:  origin.id,
        ownerId:        w.id,
        content:        event.content,
        confidence:     1.0,
        roundLearned:   round,
        hops:           0,
      }
      const added = addKnowledgeIfNew(w, eventId, entry)
      if (!added) continue
      recordKnowledge(entry, butterflyTrace)
      recordPropagationEdge(eventId, kid, {
        transmitter: null, receiver: w.id, round, distortionMode: 'witness', confidenceLost: 0,
      }, butterflyTrace)
      hopQueue.push({ holder: w, entry, parentId: eventId })
      eventWitnessAgents.push(w)
    }
    if (eventWitnessAgents.length > 0) witnessesByEvent.set(eventId, eventWitnessAgents)

    // ── Gossip cascade ───────────────────────────────────────────────
    while (hopQueue.length) {
      const { holder, entry, parentId } = hopQueue.shift()
      const nextHop = entry.hops + 1
      if (nextHop > PROPAGATION_HOP_LIMIT) continue
      // Default decay; bonded-pair multiplier applied per-receiver below
      const baseConfidence = entry.confidence * CONFIDENCE_DECAY_PER_HOP
      if (baseConfidence < CONFIDENCE_FLOOR) continue

      // Gossip candidates: bonded + same-region + adjacent (excluding self)
      const candidates = adjacentAgents(holder, agents, positionState)
        .filter(a => a.alive && a.id !== holder.id && a.id !== origin.id)
      if (candidates.length === 0) continue

      const targets = chooseGossipTargets(holder, candidates, agents, positionState, rng)

      for (const target of targets) {
        // Phase 4a — bond-aware confidence: a high-intensity bond between
        // transmitter and receiver preserves more of the parent confidence
        // than the default decay (information passes more truly between
        // close confidants).
        const bond = holder.bonds?.[target.id]
        const decay = (bond && bond.intensity > BONDED_GOSSIP_INTENSITY_THRESHOLD)
          ? BONDED_GOSSIP_DECAY
          : CONFIDENCE_DECAY_PER_HOP
        const newConfidence = entry.confidence * decay
        if (newConfidence < CONFIDENCE_FLOOR) continue
        // Distort
        let distorted
        if (shouldUseLLM(event, holder, target, nextHop, llmThisRound, llmCallsTotal, maxLLMPerRound, maxLLMPerSim)) {
          // eslint-disable-next-line no-await-in-loop
          distorted = await distortEventLLM(event, holder, target, nextHop)
          if (distorted.mode === 'llm') {
            llmThisRound++
            llmCallsTotal++
            if (distorted.usage) llmUsage.push(distorted.usage)
          }
        } else {
          distorted = distortEventTraitBased(event, holder, target, nextHop)
        }

        const kid = newKid()
        const newEntry = {
          id:              kid,
          originEventId:   eventId,
          source:          holder.name,
          sourceAgentId:   holder.id,
          ownerId:         target.id,
          content:         distorted.content,
          confidence:      newConfidence,
          roundLearned:    round,
          hops:            nextHop,
          distortionMode:  distorted.mode,
        }
        const added = addKnowledgeIfNew(target, eventId, newEntry)
        if (!added) continue
        recordKnowledge(newEntry, butterflyTrace)
        recordPropagationEdge(parentId, kid, {
          transmitter:     holder.id,
          receiver:        target.id,
          round,
          distortionMode:  distorted.mode,
          confidenceLost:  entry.confidence - newConfidence,
        }, butterflyTrace)

        // Queue for next-hop gossip
        hopQueue.push({ holder: target, entry: newEntry, parentId: kid })
      }
    }
  }

  return { llmCallsThisRound: llmThisRound, llmCallsTotal, llmUsage, witnessesByEvent }
}
