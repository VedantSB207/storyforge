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

// ── Phase 7/7b — Emotional state per round ──────────────────────────────────
//
// Deterministic, no LLM. Inputs:
//   agent       — the agent at end-of-round (after needs depletion, actions,
//                 mortality, and bond updates have run for this round)
//   ctx         — { round, timeUnit, worldRules, ... }
//   roundEvents — events emitted this round (death, betrayal, conflict,
//                 cooperation, need_critical, etc.). The function scans for
//                 the ones touching this agent.
//   prevState   — last round's emotional state for this agent (optional).
//                 Used to lightly carry-over: emotions decay toward baseline
//                 over a few rounds, but spikes happen instantly.
//
// Output: { stress, contentment, grief, dominantEmotion }
//   stress, contentment, grief ∈ [0, 1]
//   dominantEmotion is a label from the existing schema:
//     'calm' | 'joyful' | 'anxious' | 'angry' | 'grieving' | 'fearful' | 'vengeful'
//
// Design intent:
//   • Stress is driven by low survival needs + recent dramatic events targeting
//     the agent or close to them. Neuroticism amplifies the swing magnitude.
//   • Contentment is the high-needs satisfaction picture, with agreeableness
//     and low-neuroticism characters resting higher on it.
//   • Grief is reserved for 7c — it stays at 0 here unless prevState.grief was
//     set, in which case we let it decay slightly. 7c populates it on death.
//   • Dominant emotion is derived from the numbers + psychology so the same
//     stress level can read as 'anxious' (anxious-attachment, high N) vs
//     'angry' (low agreeableness, high callousness).
// Phase 7c Step 0 — chronic-stress soft ceiling. Ordinary, sustained
// need/health deprivation can never push stress above this; the band above
// is reserved for ACUTE emotional events (death of a bonded character,
// betrayal, fresh grief). This gives grief headroom that's visible above the
// chronic baseline, and stops the one-way ratchet to 1.0 seen in 7b.
const CHRONIC_STRESS_CEILING = 0.65

// Phase 7c — griefLevel (0..1) is the agent's current memorial-bond grief,
// supplied by the runner once memorial bonds exist (7c). It feeds both the
// grief output and the ACUTE stress band so a fresh loss spikes visibly above
// the chronic plateau. For Step 0 (no memorial bonds yet) the runner passes
// null and grief decays from prevState as before.
export function computeEmotionalState(agent, ctx, roundEvents = [], prevState = null, griefLevel = null) {
  if (!agent) return { stress: 0, contentment: 0.5, grief: 0, dominantEmotion: 'calm' }

  const needs = agent.needs || {}
  // Safety + physiological dominate the survival/stress baseline.
  const survival     = ((needs.physiological || 0) + (needs.safety || 0)) / 2
  const socialPurpose= ((needs.belonging || 0) + (needs.esteem || 0) + (needs.purpose || 0)) / 3
  // Health enters stress via direct damage signal.
  const health       = Number.isFinite(agent.health) ? agent.health : 1

  // ── Event modifiers — scan events touching this agent this round ──────
  // acuteStress  — sharp, event-driven (reserved band above chronic ceiling)
  // relief       — recovery actions that pull stress DOWN this round
  // eventContent — positive contentment pulses
  let acuteStress = 0, eventContent = 0, relief = 0
  let sawBetrayalAgainst = false, sawConflictAgainst = false, sawCooperationFor = false
  for (const ev of roundEvents) {
    const myId = agent.id
    const involvesMe = ev.agentId === myId || ev.targetId === myId
    if (!involvesMe) continue
    switch (ev.category) {
      case 'death':
        // Witnessing/being source of a death is acute.
        acuteStress += 0.25
        break
      case 'betrayal':
        if (ev.targetId === myId) { acuteStress += 0.30; sawBetrayalAgainst = true }
        else                       { acuteStress += 0.05 }
        break
      case 'conflict':
        if (ev.targetId === myId) { acuteStress += 0.18; sawConflictAgainst = true }
        else                       { acuteStress += 0.08 }
        break
      case 'cooperation':
        eventContent += 0.18
        relief       += 0.10          // connecting with others calms
        sawCooperationFor = true
        break
      case 'need_critical':
        acuteStress += 0.06
        break
      // ── Recovery actions — pull stress down, give the curve dynamic range ──
      case 'rest':
        relief += 0.14
        break
      case 'eat':
        relief += 0.10
        eventContent += 0.04
        break
      case 'travel':
        eventContent += 0.02; relief += 0.04   // change of scene
        break
      default: break
    }
  }
  acuteStress  = Math.min(0.6, acuteStress)
  eventContent = Math.min(0.5, eventContent)
  relief       = Math.min(0.35, relief)

  // ── Psychology amplification ──────────────────────────────────────────
  const p = agent.psychology || {}
  const bf = p.bigFive || {}
  const mk = p.markers || {}
  const N  = Number.isFinite(bf.neuroticism)    ? bf.neuroticism    : 0.5
  const A  = Number.isFinite(bf.agreeableness)  ? bf.agreeableness  : 0.5
  const E  = Number.isFinite(bf.extraversion)   ? bf.extraversion   : 0.5
  const VENG = Number.isFinite(mk.vengefulness) ? mk.vengefulness   : 0
  const CALL = Number.isFinite(mk.callousness)  ? mk.callousness    : 0

  // Neuroticism amplifies acute swings (+50% at N=1) and dampens recovery
  // (high-N characters calm down more slowly).
  const swingMult  = 1 + 0.5 * (N - 0.5) * 2   // N=0.5→1.0; N=1→1.5; N=0→0.5
  const reliefMult = 1 - 0.4 * (N - 0.5) * 2   // N=0.5→1.0; N=1→0.6; N=0→1.4
  acuteStress  *= swingMult
  eventContent *= swingMult
  relief       *= reliefMult

  // ── Grief ────────────────────────────────────────────────────────────
  // 7c supplies an explicit griefLevel from memorial bonds. Step 0: decay
  // any carried-over grief from prevState.
  let grief
  if (griefLevel != null && Number.isFinite(griefLevel)) {
    grief = Math.min(1, Math.max(0, griefLevel))
  } else if (prevState && Number.isFinite(prevState.grief)) {
    grief = Math.max(0, prevState.grief * 0.92)
  } else {
    grief = 0
  }
  // Fresh/strong grief is itself an acute stressor, scaled by neuroticism.
  const griefStress = grief * 0.5 * swingMult

  // ── Stress: chronic plateau + acute band, minus recovery ──────────────
  // Chronic deprivation maps into [0, CHRONIC_STRESS_CEILING] and can never
  // exceed it. survival deprivation weighted 0.7, health deprivation 0.3.
  const survivalDeprivation = Math.max(0, Math.min(1, (0.6 - survival) / 0.6))  // survival≥0.6 → 0
  const healthDeprivation   = Math.max(0, Math.min(1, 1 - health))
  const chronic = CHRONIC_STRESS_CEILING * (0.7 * survivalDeprivation + 0.3 * healthDeprivation)
  // Ambient neurotic anxiety nudges the chronic floor up slightly.
  const neuroticBaseline = 0.06 * (N - 0.5) * 2

  // Acute events + grief reserve the band above the chronic ceiling.
  const acute = acuteStress + griefStress

  let stressTarget = chronic + neuroticBaseline + acute - relief
  // Momentum: blend with the previous round so recovery is gradual, not
  // instantaneous, and chronic stress eases down when recovery actions fire.
  if (prevState && Number.isFinite(prevState.stress)) {
    stressTarget = 0.6 * stressTarget + 0.4 * prevState.stress
  }
  const stress = Math.min(1, Math.max(0, stressTarget))

  // ── Contentment: baseline + event pulse - stress drag ────────────────
  let contentment = 0.4 * survival + 0.5 * socialPurpose + 0.1 * health
  contentment += eventContent
  // High agreeableness rests slightly higher; high callousness lower
  contentment += 0.1 * (A - 0.5) * 2
  contentment -= 0.12 * CALL
  contentment -= 0.3 * stress     // stress drags contentment down
  contentment -= 0.25 * grief     // grief drags contentment down
  if (prevState && Number.isFinite(prevState.contentment)) {
    contentment = 0.7 * contentment + 0.3 * prevState.contentment
  }
  contentment = Math.min(1, Math.max(0, contentment))

  // ── Dominant emotion derivation ──────────────────────────────────────
  //   Priority order (first match wins):
  //   1. grieving — grief > 0.4
  //   2. vengeful — recent betrayal-against AND vengefulness > 0.4
  //   3. angry    — high stress AND (low agreeableness OR callousness > 0.5)
  //   4. fearful  — high stress AND anxious/fearful attachment + low extraversion
  //   5. anxious  — high stress + high neuroticism (default high-stress label)
  //   6. joyful   — high contentment AND high extraversion
  //   7. calm     — fallback
  let dominantEmotion = 'calm'
  if (grief > 0.4) {
    dominantEmotion = 'grieving'
  } else if (sawBetrayalAgainst && VENG > 0.4) {
    dominantEmotion = 'vengeful'
  } else if (stress > 0.55 && (A < 0.4 || CALL > 0.5)) {
    dominantEmotion = 'angry'
  } else if (stress > 0.55 && (p.attachment === 'fearful' || (p.attachment === 'anxious' && E < 0.4))) {
    dominantEmotion = 'fearful'
  } else if (stress > 0.55) {
    dominantEmotion = 'anxious'
  } else if (contentment > 0.7 && E > 0.55) {
    dominantEmotion = 'joyful'
  } else {
    dominantEmotion = 'calm'
  }
  // Silence "unused but useful for future predicate" warnings
  void sawConflictAgainst; void sawCooperationFor

  return {
    stress:           +stress.toFixed(3),
    contentment:      +contentment.toFixed(3),
    grief:            +grief.toFixed(3),
    dominantEmotion,
  }
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
