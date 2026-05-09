// Phase 4a — Bonds layer
// Bonds form between agents from interactions; they decay if inactive.
// Bonds live in agent.bonds[otherId] = { type, intensity, trust, history }.
//
// Phase 3 propagation already reads transmitter.relationships — we now
// populate it. Bonds are NOT propagated through Knowledge: an agent always
// knows their own bonds, even if the other party feels nothing back
// (asymmetric: A loves B, B feels nothing — both states valid).

import { BOND_DECAY_THRESHOLD_ROUNDS } from './deepSimSchema.js'

// Bond types in roughly increasing intimacy
export const BOND_TYPES = ['weak', 'friendship', 'love', 'kinship', 'rivalry', 'enmity']

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// Initial empty bonds map for a fresh agent.
export function initBonds() { return {} }

// Look up or initialise a bond between two agents.
function ensureBond(agent, otherId, currentRound) {
  if (!agent.bonds) agent.bonds = {}
  if (!agent.bonds[otherId]) {
    agent.bonds[otherId] = {
      otherId,
      type:      'weak',
      intensity: 0,
      trust:     0,
      history:   [],
      lastUpdatedRound: currentRound,
    }
  }
  return agent.bonds[otherId]
}

// Apply a delta and clamp. Records a history entry.
function applyDelta(bond, dIntensity, dTrust, eventType, currentRound) {
  bond.intensity = clamp(bond.intensity + dIntensity, 0, 1)
  bond.trust     = clamp(bond.trust     + dTrust,    -1, 1)
  bond.history.push({ round: currentRound, eventType, dIntensity, dTrust })
  if (bond.history.length > 30) bond.history.shift()
  bond.lastUpdatedRound = currentRound
}

// Promote bond type based on intensity, trust, and history pattern.
function maybePromoteType(bond, agent, other, currentRound) {
  const recent = bond.history.slice(-6)
  const cooperateCount = recent.filter(h => h.eventType === 'cooperate').length
  const conflictCount  = recent.filter(h => h.eventType === 'conflict').length
  const betrayed       = recent.some(h => h.eventType === 'betrayal')

  // Betrayal overrides everything
  if (betrayed) { bond.type = 'enmity'; return }

  // Enmity from sustained conflict
  if (conflictCount >= 3) { bond.type = 'enmity'; return }
  if (bond.trust < -0.6 && bond.intensity > 0.4) { bond.type = 'enmity'; return }

  // Rivalry from intermittent conflict + moderate intensity
  if (conflictCount >= 1 && bond.intensity > 0.3 && bond.trust < 0.2) {
    bond.type = 'rivalry'
    return
  }

  // Promote weak → friendship after sustained cooperation
  if (bond.type === 'weak' && bond.intensity > 0.3 && cooperateCount >= 2) {
    bond.type = 'friendship'
    return
  }
  // Friendship → love or kinship at high intensity
  if (bond.type === 'friendship' && bond.intensity > 0.7 && bond.trust > 0.5) {
    // Heuristic: if both share genre prefix → kinship; else love
    const sharedGenre = (agent?.genreTag || '').split(':')[0] === (other?.genreTag || '').split(':')[0]
    bond.type = sharedGenre ? 'kinship' : 'love'
  }
}

// ── Public: update from a single (action) event ────────────────────────────
// `event` should carry { agentId, targetId, category, ... } where applicable.
// `world.agentById` is required so we can resolve target.
export function updateBondFromEvent(agent, event, world) {
  if (!event || !event.targetId) return
  const target = world.agentById?.[event.targetId]
  if (!target) return
  const cat = event.category
  const round = event.round

  // For each (a, b) pair we touch, ensure both sides have a bond record
  // (asymmetric — both can update independently).
  const aBond = ensureBond(agent, target.id, round)
  const bBond = ensureBond(target, agent.id, round)

  if (cat === 'cooperation') {
    applyDelta(aBond,  +0.05,  +0.05, 'cooperate', round)
    applyDelta(bBond,  +0.05,  +0.05, 'cooperate', round)
  } else if (cat === 'conflict') {
    const winnerId = event.winnerId, loserId = event.loserId
    if (agent.id === winnerId) {
      applyDelta(aBond, +0.05, -0.10, 'conflict', round)
      applyDelta(bBond, +0.10, -0.15, 'conflict', round)
    } else if (agent.id === loserId) {
      applyDelta(aBond, +0.10, -0.15, 'conflict', round)
      applyDelta(bBond, +0.05, -0.10, 'conflict', round)
    } else {
      applyDelta(aBond, +0.05, -0.05, 'conflict', round)
      applyDelta(bBond, +0.05, -0.05, 'conflict', round)
    }
  } else if (cat === 'betrayal') {
    // Betrayer's view: target became disposable; intensity stays high but trust collapses
    applyDelta(aBond, +0.10, -0.40, 'betrayal', round)
    applyDelta(bBond, +0.20, -0.80, 'betrayal', round)
  }
  // Pass-by — co-witness bonus is applied separately via applyCoWitnessBonus

  maybePromoteType(aBond, agent, target, round)
  maybePromoteType(bBond, target, agent, round)
}

// Apply a small mutual co-witness boost when two agents witnessed the same
// event together. Used by the runner once per round per (a,b) co-witness pair.
export function applyCoWitnessBonus(a, b, currentRound) {
  if (!a || !b || a === b) return
  const ab = ensureBond(a, b.id, currentRound)
  const ba = ensureBond(b, a.id, currentRound)
  applyDelta(ab, +0.02, +0.01, 'co_witness', currentRound)
  applyDelta(ba, +0.02, +0.01, 'co_witness', currentRound)
  maybePromoteType(ab, a, b, currentRound)
  maybePromoteType(ba, b, a, currentRound)
}

// Time decay — passive: weak bonds with no interaction in N rounds drop
// intensity by 0.01/round; non-weak bonds with no interaction also slowly
// decay but more gently.
export function decayBonds(agent, currentRound) {
  if (!agent.bonds) return
  for (const id of Object.keys(agent.bonds)) {
    const b = agent.bonds[id]
    const idle = currentRound - (b.lastUpdatedRound ?? currentRound)
    if (idle < BOND_DECAY_THRESHOLD_ROUNDS) continue
    const decayRate = b.type === 'weak' ? 0.01 : 0.005
    b.intensity = clamp(b.intensity - decayRate, 0, 1)
    // Drop bonds that decayed to near-nothing
    if (b.intensity < 0.02 && b.type === 'weak') {
      delete agent.bonds[id]
    }
  }
}

// Read helpers
export function getBondedAgents(agent, minIntensity = 0) {
  if (!agent.bonds) return []
  return Object.values(agent.bonds).filter(b => b.intensity >= minIntensity).map(b => b.otherId)
}

// Concise summary for narrative input — bound chars only (called from narrativeSummary).
export function summarizeAgentBonds(agent, world, max = 5) {
  if (!agent.bonds) return []
  const out = []
  const sorted = Object.values(agent.bonds).sort((x, y) => y.intensity - x.intensity).slice(0, max)
  for (const b of sorted) {
    const o = world.agentById?.[b.otherId]
    if (!o) continue
    out.push({
      with:      o.name,
      type:      b.type,
      intensity: b.intensity,
      trust:     b.trust,
    })
  }
  return out
}
