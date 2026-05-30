// Phase 3 — witnessRules
// For a given event, who sees it directly?
//
// Rules:
//   - Origin agent always witnesses their own event
//   - Same-region agents witness with WITNESS_PROB_SAME_REGION
//   - Adjacent-region agents witness with WITNESS_PROB_ADJACENT
//   - Distant agents witness with 0 unless they have exceptional perception
//   - Exceptional perception (scrying / telepathic / clairvoyant / etc.)
//     witnesses with WITNESS_PROB_EXCEPTIONAL from any distance
//
// All probability rolls go through a seeded RNG so re-runs are reproducible.
// Caller is responsible for passing the same RNG instance across the whole
// round.

import { distance } from './positionGraph.js'

// Lower than naive intuition because at scale (1000 cast in ~6 regions),
// 1.0 same-region probability would create witness lists of 100+ which
// blows up propagation. Tuned so an average event has ~5-15 witnesses.
const WITNESS_PROB_SAME_REGION = 0.05
const WITNESS_PROB_ADJACENT    = 0.02
const WITNESS_PROB_EXCEPTIONAL = 0.50

// Hard ceiling so a high-density region can't drown the propagation graph.
const MAX_WITNESSES_PER_EVENT  = 30

const PERCEPTION_KEYWORDS = [
  'scrying', 'omniscient', 'telepathic', 'prophetic', 'clairvoyant', 'farsight',
  'remote_view', 'oracular', 'all-seeing', 'farseeing',
]

// Cache the exceptional-perception flag on each agent (computed once per sim
// from traits + perceptionAbilities). Mutates agent — call from runner init.
export function tagExceptionalPerception(agents) {
  for (const a of agents) {
    let flagged = false
    const blob = (a.traits || []).join(' ').toLowerCase()
    for (const kw of PERCEPTION_KEYWORDS) {
      if (blob.includes(kw)) { flagged = true; break }
    }
    if (!flagged && Array.isArray(a.perceptionAbilities)) {
      for (const p of a.perceptionAbilities) {
        const t = (p?.type || '').toLowerCase()
        if (PERCEPTION_KEYWORDS.includes(t)) { flagged = true; break }
      }
    }
    a._exceptionalPerception = flagged
  }
}

// Core function. Returns an array of agent objects who witness this event.
// `event.originAgentId` is used to locate the event; if absent, event.agentId.
export function computeWitnesses(event, agents, positionState, rng = Math.random) {
  const originAgent = agents.find(a => a.id === (event.originAgentId || event.agentId))
  const witnesses = []
  // Origin always witnesses
  if (originAgent) witnesses.push(originAgent)

  if (!originAgent) return witnesses

  for (const a of agents) {
    if (a === originAgent) continue
    if (!a.alive) continue
    // Phase 6/6a-i: offstage (missing/exiled) agents don't witness events
    // — they're not physically present in the action. Dormant still witness.
    if (a.isOffstage && a.status !== 'dormant') continue
    let prob
    const d = distance(originAgent, a, positionState)
    if (d === 0)        prob = WITNESS_PROB_SAME_REGION
    else if (d === 1)   prob = WITNESS_PROB_ADJACENT
    else if (a._exceptionalPerception) prob = WITNESS_PROB_EXCEPTIONAL
    else                continue
    if (rng() < prob) witnesses.push(a)
    if (witnesses.length >= MAX_WITNESSES_PER_EVENT) break
  }

  return witnesses
}

export const _internal = {
  WITNESS_PROB_SAME_REGION,
  WITNESS_PROB_ADJACENT,
  WITNESS_PROB_EXCEPTIONAL,
  MAX_WITNESSES_PER_EVENT,
  PERCEPTION_KEYWORDS,
}
