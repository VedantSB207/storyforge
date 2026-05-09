// Phase 4a — Action vocabulary
// Each action is a small declarative object with:
//   - name (uppercase id)
//   - eventCategory (matches the propagation schema)
//   - preconditions(agent, world) → boolean
//   - resolve(agent, target, world, rng) → { success, effects, events, bondUpdates }
//
// Actions take effect immediately in the round they're decided. The events
// they produce flow into Phase 3 propagation in the same round.

import { CONFIDENCE_DECAY_PER_HOP } from './deepSimSchema.js'

// ── Helpers ────────────────────────────────────────────────────────────────

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n))
const adjustNeed = (agent, key, delta) => { agent.needs[key] = clamp(agent.needs[key] + delta) }
const between = (rng, lo, hi) => lo + (hi - lo) * rng()

// Pick a candidate target satisfying a predicate. Returns null if none.
function pickTarget(agent, world, predicate, rng) {
  const candidates = []
  for (const o of world.agents) {
    if (o === agent) continue
    if (!o.alive) continue
    if (predicate(o, agent)) candidates.push(o)
    if (candidates.length >= 50) break   // cap candidate scan for perf
  }
  if (candidates.length === 0) return null
  return candidates[Math.floor(rng() * candidates.length)]
}

const inSameRegion = (a, b) => a.region === b.region
const adjacentTo = (a, b, world) => {
  if (a.region === b.region) return false
  const adj = world.positionState.adjacency[a.region] || []
  return adj.includes(b.region)
}

// ── Action vocabulary ──────────────────────────────────────────────────────

export const ACTIONS = Object.freeze({
  EAT: {
    name: 'EAT',
    eventCategory: 'eat',
    preconditions: (agent) => agent.needs.physiological < 0.5,
    resolve: (agent) => {
      adjustNeed(agent, 'physiological', 0.30)
      return {
        success: true,
        events: [mk('eat', agent, `${agent.name} ate.`)],
      }
    },
  },

  REST: {
    name: 'REST',
    eventCategory: 'rest',
    preconditions: (agent) => agent.stress > 0.7 || agent.needs.physiological < 0.4,
    resolve: (agent) => {
      adjustNeed(agent, 'physiological', 0.15)
      agent.stress = clamp((agent.stress ?? 0) - 0.20)
      return {
        success: true,
        events: [mk('rest', agent, `${agent.name} rested.`)],
      }
    },
  },

  TRAVEL: {
    name: 'TRAVEL',
    eventCategory: 'travel',
    preconditions: (agent, world) => {
      if (agent.needs.safety < 0.4) return true
      // Travel toward someone they have a bond with in another region
      for (const id of Object.keys(agent.bonds || {})) {
        const o = world.agentById?.[id]
        if (o && o.alive && o.region !== agent.region) return true
      }
      return false
    },
    resolve: (agent, _target, world, rng) => {
      const adj = world.positionState.adjacency[agent.region] || []
      if (adj.length === 0) return { success: false, events: [] }
      // Prefer destination region containing a bonded agent
      let dest = null
      for (const id of Object.keys(agent.bonds || {})) {
        const o = world.agentById?.[id]
        if (o && o.alive && adj.includes(o.region)) { dest = o.region; break }
      }
      if (!dest) dest = adj[Math.floor(rng() * adj.length)]
      const oldRegion = agent.region
      agent.region = dest
      if (agent.location) agent.location.region = dest
      adjustNeed(agent, 'safety', 0.10)
      return {
        success: true,
        events: [mk('travel', agent, `${agent.name} travelled from ${oldRegion} to ${dest}.`, { oldRegion, dest })],
      }
    },
  },

  SEEK_BOND: {
    name: 'SEEK_BOND',
    eventCategory: 'cooperation',     // mild positive event for propagation
    preconditions: (agent, world) =>
      agent.needs.belonging < 0.55 &&
      world.agents.some(o => o !== agent && o.alive && inSameRegion(o, agent)),
    resolve: (agent, _t, world, rng) => {
      const target = pickTarget(agent, world,
        (o, self) => inSameRegion(self, o) && (!self.bonds || !self.bonds[o.id]),
        rng,
      )
      if (!target) return { success: false, events: [] }
      adjustNeed(agent, 'belonging', 0.10)
      return {
        success: true,
        target,
        bondUpdates: [{ kind: 'co-witness', a: agent, b: target }],
        events: [mk('cooperation', agent, `${agent.name} sought connection with ${target.name}.`, { targetId: target.id, targetName: target.name })],
      }
    },
  },

  COOPERATE: {
    name: 'COOPERATE',
    eventCategory: 'cooperation',
    preconditions: (agent, world) => {
      const bonds = agent.bonds || {}
      for (const id of Object.keys(bonds)) {
        const b = bonds[id]
        if (b.intensity > 0.30) {
          const o = world.agentById?.[id]
          if (o && o.alive && inSameRegion(o, agent)) return true
        }
      }
      return false
    },
    resolve: (agent, _t, world, rng) => {
      const bonds = agent.bonds || {}
      const candidates = Object.keys(bonds)
        .filter(id => {
          const o = world.agentById?.[id]
          return o && o.alive && inSameRegion(o, agent) && bonds[id].intensity > 0.30
        })
      if (candidates.length === 0) return { success: false, events: [] }
      const targetId = candidates[Math.floor(rng() * candidates.length)]
      const target = world.agentById[targetId]
      adjustNeed(agent, 'belonging', 0.15)
      adjustNeed(agent, 'esteem', 0.05)
      adjustNeed(target, 'belonging', 0.10)
      return {
        success: true,
        target,
        bondUpdates: [{ kind: 'cooperate', a: agent, b: target }],
        events: [mk('cooperation', agent, `${agent.name} cooperated with ${target.name}.`, { targetId: target.id, targetName: target.name })],
      }
    },
  },

  CONFLICT: {
    name: 'CONFLICT',
    eventCategory: 'conflict',
    preconditions: (agent, world) => {
      // Enmity bond available?
      const bonds = agent.bonds || {}
      for (const id of Object.keys(bonds)) {
        const b = bonds[id]
        if (b.type === 'enmity' || b.trust < -0.4) {
          const o = world.agentById?.[id]
          if (o && o.alive && inSameRegion(o, agent)) return true
        }
      }
      // Resource pressure + same-region rival
      if (agent.needs.physiological < 0.25 || agent.needs.safety < 0.25) {
        const rival = world.agents.some(o =>
          o !== agent && o.alive && inSameRegion(o, agent) && o.needs.physiological < 0.4
        )
        if (rival) return true
      }
      return false
    },
    resolve: (agent, _t, world, rng) => {
      // Pick the most adversarial target available
      const bonds = agent.bonds || {}
      let target = null
      for (const id of Object.keys(bonds)) {
        const b = bonds[id]
        if (b.type === 'enmity' || b.trust < -0.4) {
          const o = world.agentById?.[id]
          if (o && o.alive && inSameRegion(o, agent)) { target = o; break }
        }
      }
      if (!target) {
        target = pickTarget(agent, world,
          (o, self) => inSameRegion(self, o) && o.needs.physiological < 0.4,
          rng,
        )
      }
      if (!target) return { success: false, events: [] }
      // Resolve combat: stronger health + lower stress wins
      const aPow = (agent.health ?? 1) - (agent.stress ?? 0) + between(rng, 0, 0.3)
      const bPow = (target.health ?? 1) - (target.stress ?? 0) + between(rng, 0, 0.3)
      const winner = aPow >= bPow ? agent : target
      const loser  = winner === agent ? target : agent
      // Damage
      loser.health = clamp((loser.health ?? 1) - between(rng, 0.20, 0.45))
      winner.health = clamp((winner.health ?? 1) - between(rng, 0.05, 0.15))
      winner.stress = clamp((winner.stress ?? 0) + 0.10)
      loser.stress  = clamp((loser.stress  ?? 0) + 0.30)
      adjustNeed(winner, 'esteem', 0.10)
      // If loser already mortally wounded, mark dead (death event will fire next phase too)
      const events = [
        mk('conflict', agent, `${agent.name} fought ${target.name}; ${winner.name} prevailed.`,
           { targetId: target.id, targetName: target.name, winnerId: winner.id, loserId: loser.id }),
      ]
      return {
        success: true,
        target,
        bondUpdates: [{ kind: 'conflict', winner, loser }],
        events,
      }
    },
  },

  BETRAY: {
    name: 'BETRAY',
    eventCategory: 'betrayal',
    preconditions: (agent, world) => {
      const bonds = agent.bonds || {}
      for (const id of Object.keys(bonds)) {
        const b = bonds[id]
        // Need a bond with positive trust to betray, plus a self-interested
        // streak (low values overlap = high-paranoia trait OR low purpose need)
        if (b.intensity > 0.40 && b.trust > 0.20) {
          const trustyEnough = b.trust > 0.40
          const incentive = (agent.needs.esteem < 0.4) || (agent.needs.physiological < 0.3)
          if (trustyEnough && incentive) {
            const o = world.agentById?.[id]
            if (o && o.alive && inSameRegion(o, agent)) return true
          }
        }
      }
      return false
    },
    resolve: (agent, _t, world, rng) => {
      const bonds = agent.bonds || {}
      let target = null
      for (const id of Object.keys(bonds)) {
        const b = bonds[id]
        if (b.intensity > 0.40 && b.trust > 0.40) {
          const o = world.agentById?.[id]
          if (o && o.alive && inSameRegion(o, agent)) { target = o; break }
        }
      }
      if (!target) return { success: false, events: [] }
      // Betrayer gains; victim loses
      adjustNeed(agent, 'esteem', 0.20)
      adjustNeed(agent, 'physiological', 0.15)
      adjustNeed(target, 'safety', -0.20)
      target.stress = clamp((target.stress ?? 0) + 0.40)
      target.health = clamp((target.health ?? 1) - between(rng, 0.10, 0.25))
      return {
        success: true,
        target,
        bondUpdates: [{ kind: 'betrayal', betrayer: agent, victim: target }],
        events: [mk('betrayal', agent, `${agent.name} betrayed ${target.name}.`, { targetId: target.id, targetName: target.name })],
      }
    },
  },

  FLEE: {
    name: 'FLEE',
    eventCategory: 'travel',
    preconditions: (agent) => (agent.stress ?? 0) > 0.8 || agent.needs.safety < 0.2,
    resolve: (agent, _t, world, rng) => {
      const adj = world.positionState.adjacency[agent.region] || []
      if (adj.length === 0) return { success: false, events: [] }
      const dest = adj[Math.floor(rng() * adj.length)]
      const oldRegion = agent.region
      agent.region = dest
      if (agent.location) agent.location.region = dest
      agent.stress = clamp((agent.stress ?? 0) - 0.30)
      adjustNeed(agent, 'safety', 0.20)
      return {
        success: true,
        events: [mk('travel', agent, `${agent.name} fled from ${oldRegion} to ${dest}.`, { oldRegion, dest, fled: true })],
      }
    },
  },

  OBSERVE: {
    name: 'OBSERVE',
    eventCategory: 'observe',
    preconditions: () => true,    // always available; lowest priority by default
    resolve: (agent) => ({
      success: true,
      events: [mk('observe', agent, `${agent.name} watched the world.`)],
    }),
  },

  COMMUNICATE: {
    name: 'COMMUNICATE',
    eventCategory: 'cooperation',
    preconditions: (agent, world) => {
      const bonds = agent.bonds || {}
      for (const id of Object.keys(bonds)) {
        const o = world.agentById?.[id]
        if (o && o.alive && inSameRegion(o, agent)) return true
      }
      return false
    },
    resolve: (agent, _t, world, rng) => {
      const bonds = agent.bonds || {}
      const candidates = Object.keys(bonds).filter(id => {
        const o = world.agentById?.[id]
        return o && o.alive && inSameRegion(o, agent)
      })
      if (candidates.length === 0) return { success: false, events: [] }
      const targetId = candidates[Math.floor(rng() * candidates.length)]
      const target = world.agentById[targetId]
      adjustNeed(agent, 'belonging', 0.05)
      // Share one knowledge entry — the most recent firsthand
      const sharedKnowledge = (agent.knownFacts || [])
        .filter(k => k.source === 'firsthand')
        .slice(-1)[0]
      const events = [mk('cooperation', agent, `${agent.name} spoke with ${target.name}.`,
                         { targetId: target.id, targetName: target.name, sharedKnowledgeId: sharedKnowledge?.id })]
      return {
        success: true,
        target,
        sharedKnowledge,
        bondUpdates: [{ kind: 'co-witness', a: agent, b: target }],
        events,
      }
    },
  },
})

// ── Public API ─────────────────────────────────────────────────────────────

// Build an event object for a resolved action. round is filled in by caller.
function mk(category, agent, content, extras = {}) {
  return {
    agentId:   agent.id,
    agentName: agent.name,
    category,
    content,
    ...extras,
  }
}

// Returns the subset of action names whose preconditions pass.
export function availableActions(agent, world) {
  return Object.keys(ACTIONS).filter(name => {
    try { return ACTIONS[name].preconditions(agent, world) } catch { return false }
  })
}

// Apply an action. Returns { success, target, events (with round stamped),
// bondUpdates, sharedKnowledge }.
export function resolveAction(agent, actionName, world, rng) {
  const action = ACTIONS[actionName]
  if (!action) return { success: false, events: [] }
  const result = action.resolve(agent, null, world, rng)
  // Stamp round on each event
  if (result.events?.length) {
    for (const e of result.events) e.round = world.round
  }
  // Track action history (for narrative; capped per-agent)
  if (!agent.actionHistory) agent.actionHistory = []
  agent.actionHistory.push({ round: world.round, action: actionName, success: !!result.success })
  if (agent.actionHistory.length > 60) agent.actionHistory.shift()
  return result
}

export const ACTION_NAMES = Object.freeze(Object.keys(ACTIONS))

// Confidence multiplier for a bonded gossip transmission. Used by propagation.
export function bondedGossipMultiplier(bondIntensity) {
  if (bondIntensity > 0.5) return 0.85
  return CONFIDENCE_DECAY_PER_HOP
}
