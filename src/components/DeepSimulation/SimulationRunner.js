// Phase 1 — SimulationRunner
// Drives the round loop. Pure JS, no React, no LLM calls.
//
// Round phases (Phase 1 subset):
//   1. Aging
//   2. Needs depletion
//   3. Mortality check
// Phases 4-6 (decide / act / propagate / log) arrive in later phases.

import {
  applyAging,
  depleteNeeds,
  mortalityCheck,
  maybeLogAgingMilestone,
} from './stateUpdaters.js'

// async generator so the UI can yield each round, render the log, and
// honour pause / cancel without blocking the renderer
export async function* runSimulationRounds({
  initialAgents,
  roundCount,
  timeUnit,
  rng = Math.random,
  yieldEvery = 1,
}) {
  let agents = initialAgents.map(a => ({ ...a }))
  let allEvents = []

  for (let round = 1; round <= roundCount; round++) {
    const ctx = { round, timeUnit }
    const roundEvents = []
    const next = []

    for (const a of agents) {
      const before = a
      // 1. Age
      const aged = applyAging(before, ctx)
      // 2. Needs deplete
      const need = depleteNeeds(aged.agent, ctx)
      // 3. Mortality check
      const death = mortalityCheck(need.agent, ctx, rng)
      // Aging milestone (year boundary crossed)
      const milestone = maybeLogAgingMilestone(before, death.agent, ctx)

      next.push(death.agent)
      roundEvents.push(...aged.events, ...need.events, ...death.events, ...milestone)
    }

    agents = next
    allEvents = allEvents.concat(roundEvents)

    if (round % yieldEvery === 0 || round === roundCount) {
      // yield a snapshot the UI can render. Caller can `await Promise.resolve()`
      // before the next iteration to let React paint.
      yield {
        round,
        roundCount,
        roundEvents,
        events: allEvents,
        agents,
        progress: round / roundCount,
      }
    }
  }
}

// Build a final summary block from the last snapshot
export function buildSummary(snapshot) {
  const total = snapshot.agents.length
  const alive = snapshot.agents.filter(a => a.alive).length
  const dead  = total - alive

  // Average needs across living agents only (dead agents skew the picture)
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
