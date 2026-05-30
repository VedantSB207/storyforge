// Phase 1 — pure state updaters
// Each updater takes (agent, ctx) and returns { agent, events }.
// Events are appended to the simulation log by the runner.
// No external state. No LLM calls. No randomness outside mortality.

import {
  TIME_UNIT_YEARS,
  NEEDS_KEYS,
  NEEDS_BASELINE_PER_DAY,
  NEED_CRITICAL_THRESHOLD,
  DIFFICULTY_PRESETS,
  DIFFICULTY_DEFAULT,
} from './deepSimSchema.js'
import { legacyDifficultyToNeedsMultipliers } from '../WorldRules/worldRulesSchema.js'

// Phase 6/6a-ii: needs depletion reads from worldRules.needs.*Speed first,
// then falls back to the Phase 5 difficulty preset when worldRules is absent
// (e.g. older tests or quick-scenario callers that pass only `difficulty`).
function needMultiplier(needKey, ctx) {
  const wr = ctx?.worldRules
  if (wr?.needs) {
    if (needKey === 'physiological') return wr.needs.physiologicalSpeed ?? 1.0
    if (needKey === 'safety')        return wr.needs.safetySpeed        ?? 1.0
    if (needKey === 'belonging')     return wr.needs.belongingSpeed     ?? 1.0
    if (needKey === 'esteem')        return wr.needs.esteemSpeed        ?? 1.0
    if (needKey === 'purpose')       return wr.needs.purposeSpeed       ?? 1.0
    return 1.0
  }
  const legacy = legacyDifficultyToNeedsMultipliers(ctx?.difficulty || DIFFICULTY_DEFAULT)
  return legacy[needKey] ?? 1.0
}

// ── Aging ────────────────────────────────────────────────────────────────────
// Each round advances the agent's age by the time-unit-in-years. Long-running
// short-unit simulations (e.g. 60 hour-rounds) won't move age perceptibly,
// which is the intended behaviour per the design doc.
// Phase 6/6a-ii: aging speed is now multiplied by worldRules.aging.speed
// (default 1.0). A vampiric/immortal cast can set this to 0.1 or 0 so
// year-rounds barely advance their age.
export function applyAging(agent, ctx) {
  if (!agent.alive) return { agent, events: [] }
  const agingSpeed = ctx?.worldRules?.aging?.speed ?? 1.0
  const inc = (TIME_UNIT_YEARS[ctx.timeUnit] ?? 0) * agingSpeed
  const newAge = agent.age + inc
  return {
    agent: { ...agent, age: newAge },
    events: [], // aging itself doesn't always log; long-unit sims emit on year boundaries below
  }
}

// ── Needs depletion ──────────────────────────────────────────────────────────
// Each need decays at a per-day baseline scaled by the time unit. When a need
// crosses the critical threshold for the first time in this run, emit one
// need_critical event for that need.
// Phase 6/6a-ii: multipliers now come from worldRules.needs.*Speed; falls back
// to the Phase 5 difficulty preset if worldRules is absent.
export function depleteNeeds(agent, ctx) {
  if (!agent.alive) return { agent, events: [] }
  const daysPerRound = (TIME_UNIT_YEARS[ctx.timeUnit] ?? 0) * 365
  const newNeeds = { ...agent.needs }
  const fired = { ...agent._firedNeedCritical }
  const events = []

  // Phase 5 pre-fix — needs→health damage loop. Without this the
  // difficulty preset doesn't materially affect mortality (which is age-
  // driven by default). Critical physiological or safety → health drops.
  let healthDamage = 0

  for (const k of NEEDS_KEYS) {
    const before = newNeeds[k]
    const multiplier = needMultiplier(k, ctx)
    const next = Math.max(0, before - NEEDS_BASELINE_PER_DAY[k] * daysPerRound * multiplier)
    newNeeds[k] = next
    // Critical-need health damage (per-round; scaled by daysPerRound so
    // a 1-day round inflicts a fraction of a 1-year round)
    if ((k === 'physiological' || k === 'safety') && next < NEED_CRITICAL_THRESHOLD) {
      // Severity = how far below threshold, capped at 1
      const severity = (NEED_CRITICAL_THRESHOLD - next) / NEED_CRITICAL_THRESHOLD
      // Multiplier on the damage too — gentle is kinder, harsh is harsher
      const damageScale = needMultiplier(k, ctx)
      healthDamage += severity * 0.04 * daysPerRound * damageScale
    }
    if (
      before >= NEED_CRITICAL_THRESHOLD &&
      next < NEED_CRITICAL_THRESHOLD &&
      !fired[k]
    ) {
      fired[k] = true
      events.push({
        round:      ctx.round,
        agentId:    agent.id,
        agentName:  agent.name,
        category:   'need_critical',
        content:    `${agent.name} is becoming desperate for ${k}.`,
      })
    }
  }
  const newHealth = Math.max(0, (agent.health ?? 1) - healthDamage)
  return {
    agent: { ...agent, needs: newNeeds, health: newHealth, _firedNeedCritical: fired },
    events,
  }
}

// ── Mortality ────────────────────────────────────────────────────────────────
// mortalityRisk is recomputed each round from age vs lifeExpectancy and health.
// We model risk as a smoothly rising probability from age 0 to 1.5 * life-
// Expectancy, with poor health amplifying it. The probability is then scaled
// to the round duration so a 1-hour round is much safer than a 1-year round.
// Phase 6/6a-ii: when worldRules.aging.matters is false, the age component is
// suppressed entirely; only poor health contributes (and even then, just
// converts a sub-1.0 health into a per-round risk floor).
export function computeMortalityRisk(agent, ctx = null) {
  const agingMatters = ctx?.worldRules?.aging?.matters ?? true
  let ageComponent = 0
  if (agingMatters) {
    const ratio = agent.age / Math.max(agent.lifeExpectancy, 1)
    // Cubic ramp: ~0 in youth, ~1 around 1.5x life expectancy
    ageComponent = Math.min(1, Math.max(0, ratio ** 3 / 3.375)) // 1.5^3 = 3.375
  }
  // Health damage still produces mortality even when aging doesn't matter —
  // characters who run out of food/safety can still die.
  const healthMultiplier = 1 + (1 - agent.health) // poor health up to 2x risk
  // When aging doesn't matter and health is full, risk is 0.
  // When aging doesn't matter and health drops, a small floor scales with damage.
  if (!agingMatters) {
    const damageFloor = Math.max(0, 1 - agent.health) * 0.05  // up to 5% annual risk at zero health
    return Math.min(1, damageFloor * healthMultiplier)
  }
  return Math.min(1, ageComponent * healthMultiplier)
}

// Sample a death event using the per-year mortality risk scaled to this round.
export function mortalityCheck(agent, ctx, rng = Math.random) {
  if (!agent.alive) return { agent, events: [] }
  const annualRisk = computeMortalityRisk(agent, ctx)
  const roundFraction = TIME_UNIT_YEARS[ctx.timeUnit] ?? 0
  // Convert annual probability to per-round via 1 - (1 - p)^fraction
  const perRoundRisk = 1 - Math.pow(1 - annualRisk, roundFraction)
  const updatedAgent = { ...agent, mortalityRisk: perRoundRisk }

  if (rng() < perRoundRisk) {
    // Tag the death cause so the results screen + tests can distinguish
    // aging deaths from health-driven deaths.
    const agingMatters = ctx?.worldRules?.aging?.matters ?? true
    const ratio = agent.age / Math.max(agent.lifeExpectancy, 1)
    const cause = (agingMatters && ratio > 0.6) ? 'aging' : 'health'
    return {
      agent: { ...updatedAgent, alive: false },
      events: [{
        round:      ctx.round,
        agentId:    agent.id,
        agentName:  agent.name,
        category:   'death',
        cause,
        content:    `${agent.name} died at age ${agent.age.toFixed(1)}${cause === 'health' ? ' (failing health)' : ''}.`,
      }],
    }
  }
  return { agent: updatedAgent, events: [] }
}

// ── Aging milestone log ──────────────────────────────────────────────────────
// For long-unit simulations we want occasional "aging" events so the log isn't
// silent. Emits one aging event when an agent crosses a whole-year boundary,
// up to a max of one per round per agent.
export function maybeLogAgingMilestone(agentBefore, agentAfter, ctx) {
  if (!agentAfter.alive) return []
  const beforeYear = Math.floor(agentBefore.age)
  const afterYear  = Math.floor(agentAfter.age)
  if (afterYear > beforeYear) {
    return [{
      round:     ctx.round,
      agentId:   agentAfter.id,
      agentName: agentAfter.name,
      category:  'aging',
      content:   `${agentAfter.name} is now ${afterYear}.`,
    }]
  }
  return []
}
