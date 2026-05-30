// Phase 4a — Bonds layer
// Bonds form between agents from interactions; they decay if inactive.
// Bonds live in agent.bonds[otherId] = { type, intensity, trust, history }.
//
// Phase 3 propagation already reads transmitter.relationships — we now
// populate it. Bonds are NOT propagated through Knowledge: an agent always
// knows their own bonds, even if the other party feels nothing back
// (asymmetric: A loves B, B feels nothing — both states valid).
//
// Phase 4b: thresholds lowered for friendship/love/kinship promotion so
// actual relationship arcs surface in 30-round runs instead of staying
// uniformly "weak." Also: repeated cooperation between the same pair
// (3+ in the last 10 rounds) gets a stronger intensity bump (+0.10 vs
// +0.05). Implemented as a "recent-coop" check in updateBondFromEvent.

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
//
// Phase 5 pre-fix — bidirectional promotion:
//   The original implementation was one-directional: once a bond hit
//   `rivalry` or `enmity`, sustained cooperation couldn't bring it back.
//   This produced bonds with intensity 1.0 / trust 1.0 still typed
//   'rivalry' after 27 cooperate events because of one early conflict.
//
//   Now: after each delta, check a windowed slice of recent history.
//   - rivalry → friendship if last 10 entries are 70%+ cooperative AND trust > 0.3
//   - enmity  → rivalry    if last 10 entries show no betrayals AND 50%+ cooperative AND trust > 0
//   - enmity  → friendship if last 15 entries show no betrayals AND 70%+ cooperative AND trust > 0.4
//   - The forward promotion paths (weak → friendship, friendship → love/kinship)
//     are unchanged.
function maybePromoteType(bond, agent, other, currentRound) {
  const recent  = bond.history.slice(-6)
  const recent10 = bond.history.slice(-10)
  const recent15 = bond.history.slice(-15)
  const cooperateCount = recent.filter(h => h.eventType === 'cooperate').length
  const conflictCount  = recent.filter(h => h.eventType === 'conflict').length
  const betrayed       = recent.some(h => h.eventType === 'betrayal')

  const prevType = bond.type
  const setType = (next) => {
    if (next === bond.type) return
    bond.history.push({ round: currentRound, eventType: 'promotion', from: prevType, to: next })
    bond.type = next
  }

  // ── Forward promotion paths ──
  // Betrayal overrides everything (one-shot promotion to enmity)
  if (betrayed) { setType('enmity'); return }

  // Enmity from sustained conflict
  if (conflictCount >= 3) { setType('enmity'); return }
  if (bond.trust < -0.6 && bond.intensity > 0.4) { setType('enmity'); return }

  // ── Bidirectional re-promotion paths (Phase 5 pre-fix) ──
  // Enmity → friendship after sustained healing (no betrayals in 15 rounds)
  if (bond.type === 'enmity' && recent15.length >= 6) {
    const betrayalsRecent15  = recent15.filter(h => h.eventType === 'betrayal').length
    const cooperateRecent15  = recent15.filter(h => h.eventType === 'cooperate' || h.eventType === 'co_witness').length
    const cooperateRatio15   = cooperateRecent15 / recent15.length
    if (betrayalsRecent15 === 0 && cooperateRatio15 >= 0.7 && bond.trust > 0.4) {
      setType('friendship'); return
    }
  }
  // Enmity → rivalry (partial healing)
  if (bond.type === 'enmity' && recent10.length >= 5) {
    const betrayalsRecent10 = recent10.filter(h => h.eventType === 'betrayal').length
    const cooperateRecent10 = recent10.filter(h => h.eventType === 'cooperate' || h.eventType === 'co_witness').length
    const cooperateRatio10  = cooperateRecent10 / recent10.length
    if (betrayalsRecent10 === 0 && cooperateRatio10 >= 0.5 && bond.trust > 0) {
      setType('rivalry'); return
    }
  }
  // Rivalry → friendship after sustained cooperation
  if (bond.type === 'rivalry' && recent10.length >= 5) {
    const cooperateRecent10 = recent10.filter(h => h.eventType === 'cooperate' || h.eventType === 'co_witness').length
    const cooperateRatio10  = cooperateRecent10 / recent10.length
    if (cooperateRatio10 >= 0.7 && bond.trust > 0.3) {
      setType('friendship'); return
    }
  }

  // Rivalry from intermittent conflict + moderate intensity
  if (conflictCount >= 1 && bond.intensity > 0.3 && bond.trust < 0.2) {
    setType('rivalry'); return
  }

  // Phase 4b thresholds lowered so friendships actually form in 30 rounds.
  // Promote weak → friendship after sustained cooperation
  if (bond.type === 'weak' && bond.intensity > 0.2 && cooperateCount >= 2) {
    setType('friendship'); return
  }
  // Friendship → love or kinship at moderate-high intensity
  if (bond.type === 'friendship' && bond.intensity > 0.4 && bond.trust > 0.3) {
    const sharedGenre = (agent?.genreTag || '').split(':')[0] === (other?.genreTag || '').split(':')[0]
    setType(sharedGenre ? 'kinship' : 'love')
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
    // Phase 4b: count recent cooperations between this pair. If 3+ in the
    // last 10 rounds, this is a sustained partnership — boost the bump.
    const recentCoopA = aBond.history.filter(h =>
      h.eventType === 'cooperate' && (round - h.round) <= 10
    ).length
    const bump = recentCoopA >= 3 ? 0.10 : 0.05
    applyDelta(aBond,  +bump, +bump, 'cooperate', round)
    applyDelta(bBond,  +bump, +bump, 'cooperate', round)
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
