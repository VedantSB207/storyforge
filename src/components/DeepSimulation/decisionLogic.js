// Phase 4a — Decision logic with three-tier routing
// Tier 0 = deterministic (free, fast)
// Tier 1 = Ollama (free at runtime, slower) — falls back to Tier 0 if unreachable
// Tier 2 = Claude (paid) — capped per simulation; reserved for bound chars in
//          plot-critical moments
//
// All RNG goes through the seeded rng so determinism holds end-to-end.

import { ACTIONS, ACTION_NAMES, availableActions } from './actions.js'
import { decideViaOllama } from './ollamaClient.js'
import { callClaude } from '../../api.js'
import {
  MAX_TIER1_PER_ROUND,
  MAX_TIER2_PER_SIM,
  TAXONOMY_MODEL as DEFAULT_MODEL,
} from './deepSimSchema.js'

// Need weights. Phase 4a.1: gentle rebalance — survival needs still
// dominate, but social/identity needs aren't completely shadowed.
const NEED_WEIGHTS = { physiological: 1.0, safety: 0.9, belonging: 0.6, esteem: 0.45, purpose: 0.4 }

// Heuristic weights per action that map to which need it most addresses
const ACTION_WEIGHTS = {
  EAT:        { physiological: 1.0, safety: 0.0, belonging: 0.0, esteem: 0.0, purpose: 0.0 },
  REST:       { physiological: 0.4, safety: 0.4, belonging: 0.0, esteem: 0.0, purpose: 0.0 },
  TRAVEL:     { physiological: 0.0, safety: 0.6, belonging: 0.3, esteem: 0.1, purpose: 0.2 },
  SEEK_BOND:  { physiological: 0.0, safety: 0.0, belonging: 1.0, esteem: 0.2, purpose: 0.1 },
  COOPERATE:  { physiological: 0.1, safety: 0.2, belonging: 0.7, esteem: 0.4, purpose: 0.3 },
  CONFLICT:   { physiological: 0.3, safety: 0.5, belonging: 0.0, esteem: 0.6, purpose: 0.0 },
  BETRAY:     { physiological: 0.4, safety: 0.0, belonging: 0.0, esteem: 0.8, purpose: 0.0 },
  FLEE:       { physiological: 0.0, safety: 1.0, belonging: 0.0, esteem: 0.0, purpose: 0.0 },
  OBSERVE:    { physiological: 0.0, safety: 0.1, belonging: 0.0, esteem: 0.0, purpose: 0.4 },
  COMMUNICATE:{ physiological: 0.0, safety: 0.1, belonging: 0.6, esteem: 0.2, purpose: 0.4 },
}

// ── Pressure vector ────────────────────────────────────────────────────────
// Returns { needKey: pressure } where pressure = (1 - need_value) * weight
export function computePressure(agent) {
  const out = {}
  for (const k of Object.keys(NEED_WEIGHTS)) {
    out[k] = (1 - (agent.needs?.[k] ?? 0.5)) * NEED_WEIGHTS[k]
  }
  return out
}

// Total pressure scalar — how desperate is this agent overall?
function totalPressure(pressure) {
  return Object.values(pressure).reduce((s, v) => s + v, 0)
}

// Top need key
function dominantNeed(pressure) {
  let best = null, bestVal = -1
  for (const [k, v] of Object.entries(pressure)) {
    if (v > bestVal) { bestVal = v; best = k }
  }
  return { key: best, value: bestVal }
}

// ── Tier 0: deterministic scoring ──────────────────────────────────────────
// Score each available action by how much it addresses current pressure,
// plus small randomness so tied scores don't always pick the same action.
export function scoreActionsDeterministic(agent, available, world, rng) {
  const pressure = computePressure(agent)
  const scored = []
  for (const name of available) {
    const w = ACTION_WEIGHTS[name] || {}
    let score = 0
    for (const k of Object.keys(pressure)) {
      score += pressure[k] * (w[k] || 0)
    }
    // Trait-based nudges
    if (name === 'BETRAY' && (agent.cognitiveDisposition?.paranoiaTrust ?? 0) < -0.3) score += 0.3
    if (name === 'COOPERATE' && (agent.cognitiveDisposition?.paranoiaTrust ?? 0) > 0.3) score += 0.2
    if (name === 'FLEE' && (agent.fears || []).length > 0) score += 0.1
    if (name === 'OBSERVE' && (agent.values || []).includes('truth')) score += 0.15
    if (name === 'CONFLICT' && (agent.cognitiveDisposition?.socialSolitary ?? 0) < -0.3) score += 0.15

    // ── Phase 4a.1: context-aware bumps ──
    if (name === 'COMMUNICATE' && agent.needs.belonging < 0.5) {
      const hasBondedHere = Object.entries(agent.bonds || {}).some(([id]) => {
        const o = world.agentById?.[id]
        return o?.alive && o.region === agent.region
      })
      if (hasBondedHere) score += 0.32
    }
    if (name === 'SEEK_BOND' && agent.needs.belonging < 0.5) score += 0.28
    if (name === 'REST'      && (agent.stress ?? 0) > 0.5)     score += 0.30
    if (name === 'BETRAY'    && agent.needs.esteem < 0.4)      score += 0.30
    if (name === 'TRAVEL') {
      const hasKnowledgeElsewhere = (agent.knownFacts || []).some(k => {
        const o = world.agentById?.[k.sourceAgentId]
        return o?.alive && o.region && o.region !== agent.region
      })
      if (hasKnowledgeElsewhere) score += 0.18
    }
    if (name === 'OBSERVE') {
      // Random baseline; occasional win when nothing pressing
      score += rng() * 0.30
    }

    // Tiny jitter — stays tiny so a strong dominant action still wins reliably
    score += rng() * 0.05
    scored.push({ action: name, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored
}

// ── Tier classification ────────────────────────────────────────────────────
// Tier 2 if bound char AND a plot-critical signal is present.
// Tier 0 if pressure is overwhelming on a single need AND a clear action satisfies it.
// Tier 1 otherwise.
export function classifyTier(agent, available, world) {
  const pressure = computePressure(agent)
  const dom = dominantNeed(pressure)
  const isBound = agent.source === 'bound'

  // Tier 2 signals (bound char + plot-critical)
  if (isBound) {
    // Plot-critical action available?
    if (available.includes('BETRAY') || available.includes('CONFLICT')) return 'tier2'
    // Recent high-confidence Knowledge of significance?
    const recent = (agent.knownFacts || []).filter(k =>
      k.confidence > 0.8 && (world.round - k.roundLearned) <= 3
    )
    if (recent.some(k => /betrayal|died|fled/i.test(k.content))) return 'tier2'
    // Pressure conflict — multiple needs above 0.5 pressure simultaneously
    const highPressureNeeds = Object.values(pressure).filter(p => p > 0.5).length
    if (highPressureNeeds >= 2) return 'tier2'
  }

  // Tier 0 if pressure is concentrated and dominant need has an obvious action
  if (dom.value > 0.7 && totalPressure(pressure) - dom.value < 0.5) {
    // Do we have an action that strongly maps to that need?
    const w = ACTION_WEIGHTS
    const strongMatches = available.filter(a => (w[a]?.[dom.key] ?? 0) > 0.6)
    if (strongMatches.length > 0) return 'tier0'
  }

  // Otherwise Tier 1 if procedural; bound chars without plot-critical fall to Tier 1
  return 'tier1'
}

// ── Tier 1: Ollama ─────────────────────────────────────────────────────────
async function decideViaOllamaWrapper(agent, available, world, ollamaState) {
  const res = await decideViaOllama(agent, available, world, ollamaState)
  if (!res || !available.includes(res.action)) return null
  return { action: res.action, reason: res.reason || 'ollama' }
}

// ── Tier 2: Claude ─────────────────────────────────────────────────────────
const CLAUDE_DECISION_SYSTEM = `You are choosing the next action for a character in a writer's fiction simulation. You will be told who the character is, what they need, what they recently learned, and which actions are available. Pick the single most dramatically interesting and motivationally consistent action. Return ONLY a JSON object: {"action":"<NAME>","reason":"<one sentence motivation>"}. The action MUST be one of the listed available action names. No preamble.`

async function decideViaClaude(agent, available, world) {
  const recentKnowledge = (agent.knownFacts || [])
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 5)
    .map(k => `- "${k.content}" (${k.source === 'firsthand' ? 'witnessed' : `from ${k.source}, conf ${k.confidence?.toFixed(2)}`})`)
    .join('\n') || '(none)'
  const bondsSample = Object.entries(agent.bonds || {}).slice(0, 5).map(([id, b]) => {
    const o = world.agentById?.[id]
    return `- ${o?.name || id}: ${b.type}, intensity ${b.intensity?.toFixed(2)}, trust ${b.trust?.toFixed(2)}`
  }).join('\n') || '(none)'
  const userContent =
    `Character: ${agent.name} (${agent.genreTag || 'bound'})\n` +
    `Traits: ${(agent.traits || []).join(', ') || '—'}\n` +
    `Region: ${agent.region}\n` +
    `Needs (0-1, lower = more desperate): ${JSON.stringify(agent.needs)}\n` +
    `Health: ${agent.health?.toFixed(2)}, stress: ${(agent.stress ?? 0).toFixed(2)}\n` +
    `Recent knowledge:\n${recentKnowledge}\n\n` +
    `Existing bonds:\n${bondsSample}\n\n` +
    `Available actions: ${available.join(', ')}\n` +
    `Choose the next action.`

  let res
  try {
    res = await callClaude({
      model: DEFAULT_MODEL,
      max_tokens: 120,
      temperature: 0.7,
      system: CLAUDE_DECISION_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    return { error: err.message || String(err) }
  }
  if (res?.error) return { error: res.message || 'api_error' }
  const raw = res?.content?.[0]?.text || ''
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
  let parsed
  try { parsed = JSON.parse(cleaned) }
  catch { return { error: 'parse_failed', raw } }
  if (!available.includes(parsed.action)) return { error: 'invalid_action', returned: parsed.action }
  return { action: parsed.action, reason: parsed.reason || 'claude', usage: res.usage }
}

// ── Public: decideAction ───────────────────────────────────────────────────
// Returns { action, tier, reasoning, usage? }.
export async function decideAction({ agent, world, rng, ollamaState, callCounters }) {
  const available = availableActions(agent, world)
  if (available.length === 0) return { action: 'OBSERVE', tier: 'tier0', reasoning: 'no_actions_available' }

  let tier = classifyTier(agent, available, world)

  // Cap-driven downgrades
  if (tier === 'tier2' && callCounters.tier2Total >= MAX_TIER2_PER_SIM) tier = 'tier1'
  if (tier === 'tier1' && callCounters.tier1ThisRound >= MAX_TIER1_PER_ROUND) tier = 'tier0'

  // Ollama unreachable forces all Tier 1 → Tier 0
  if (tier === 'tier1' && !ollamaState?.available) tier = 'tier0'

  // Resolve
  if (tier === 'tier0') {
    const scored = scoreActionsDeterministic(agent, available, world, rng)
    return { action: scored[0].action, tier: 'tier0', reasoning: 'deterministic_top_score' }
  }

  if (tier === 'tier1') {
    callCounters.tier1ThisRound += 1
    const res = await decideViaOllamaWrapper(agent, available, world, ollamaState)
    if (res) return { action: res.action, tier: 'tier1', reasoning: res.reason }
    // fall through to deterministic
    const scored = scoreActionsDeterministic(agent, available, world, rng)
    return { action: scored[0].action, tier: 'tier0', reasoning: 'tier1_fallback' }
  }

  if (tier === 'tier2') {
    callCounters.tier2Total += 1
    const res = await decideViaClaude(agent, available, world)
    if (res?.action) {
      if (res.usage) callCounters.tier2Usage.push(res.usage)
      return { action: res.action, tier: 'tier2', reasoning: res.reason, usage: res.usage }
    }
    callCounters.tier2Errors.push(res?.error || 'unknown')
    const scored = scoreActionsDeterministic(agent, available, world, rng)
    return { action: scored[0].action, tier: 'tier0', reasoning: 'tier2_fallback' }
  }

  // Defensive default
  const scored = scoreActionsDeterministic(agent, available, world, rng)
  return { action: scored[0].action, tier: 'tier0', reasoning: 'unknown_tier' }
}

export const _internal = {
  NEED_WEIGHTS,
  ACTION_WEIGHTS,
  computePressure,
  dominantNeed,
}
