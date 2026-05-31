// Phase 7/7c — Memorial bonds.
//
// When a bonded character dies, the survivor's bond toward them persists,
// flagged memorial. The bond keeps its original type (love stays love); the
// memorial flag marks it as grief. How that grief decays or intensifies — and
// how it shows up in behaviour — is a function of the SURVIVOR's psychology
// (7a) and surfaces in their emotion trajectory (7b).
//
// All logic here is deterministic: no randomness, no LLM. Same agent state +
// psychology → same grief evolution.
//
//   Avoidant + high conscientiousness → grief decays fast, channels to purpose
//   Anxious  + high neuroticism       → grief stays high or intensifies (spiral)
//   Secure                            → moderate decay, grieves and recovers
//   High vengefulness + known cause   → spawns/strengthens enmity toward cause

// ── Initial grief at the moment of loss ─────────────────────────────────
// A strong love/kinship bond produces deep grief; a weak acquaintance, little.
function initialGrief(bond) {
  const typeWeight = {
    love:       1.0,
    kinship:    0.9,
    friendship: 0.7,
    rivalry:    0.4,   // grief is complicated for rivals, but real
    enmity:     0.25,  // even an enemy's death unsettles
    weak:       0.3,
  }[bond.type] || 0.4
  const intensity = Number.isFinite(bond.intensity) ? bond.intensity : 0.3
  // Grief scales with how much the relationship mattered.
  return Math.min(1, Math.max(0.1, 0.5 * typeWeight + 0.5 * intensity))
}

// ── On-death conversion ─────────────────────────────────────────────────
// Scan every surviving agent's bonds toward `deceasedId`. Flag each memorial,
// record memorialSince + preMemorialType, seed grief. If the survivor is
// vengeful and the death has a known cause agent, spawn/strengthen enmity
// toward the cause.
//
// Returns the number of survivors who now carry a memorial bond (for logging).
export function convertBondsOnDeath({ agents, agentById, deceasedId, deceasedName, round, causeAgentId = null }) {
  let converted = 0
  for (const survivor of agents) {
    if (!survivor.alive) continue
    if (survivor.id === deceasedId) continue
    const bond = survivor.bonds?.[deceasedId]
    if (!bond) continue
    if (bond.memorial) continue   // already memorial (idempotent)

    bond.preMemorialType = bond.type
    bond.memorial        = true
    bond.memorialSince   = round
    bond.grief           = initialGrief(bond)
    bond.history = bond.history || []
    bond.history.push({ round, eventType: 'memorial', from: bond.type, to: bond.type })
    if (bond.history.length > 30) bond.history.shift()
    converted += 1

    // Vengeance: a vengeful survivor who knows who caused the death forms or
    // hardens an enmity bond toward the cause.
    const VENG = Number(survivor.psychology?.markers?.vengefulness) || 0
    if (VENG > 0.4 && causeAgentId && causeAgentId !== survivor.id) {
      const cause = agentById?.[causeAgentId]
      if (cause && cause.alive) {
        const eb = survivor.bonds[causeAgentId] || {
          otherId: causeAgentId, type: 'weak', intensity: 0, trust: 0, history: [], lastUpdatedRound: round,
        }
        // Strengthen toward enmity, scaled by vengefulness.
        eb.trust     = Math.max(-1, (eb.trust ?? 0) - 0.5 * VENG)
        eb.intensity = Math.min(1, (eb.intensity ?? 0) + 0.4 * VENG)
        eb.type      = 'enmity'
        eb.vengeanceFor = deceasedId          // tag: this enmity is grief-driven
        eb.history = eb.history || []
        eb.history.push({ round, eventType: 'vengeance', from: 'memorial_of:' + deceasedId })
        if (eb.history.length > 30) eb.history.shift()
        eb.lastUpdatedRound = round
        survivor.bonds[causeAgentId] = eb
      }
    }
  }
  return converted
}

// ── Hydration-time memorial bonds ───────────────────────────────────────
// For a story that opens with a grieving survivor: when a bonded Bible
// character has status 'dead', the survivor's bond toward them starts memorial
// from round 0. Called once after census build, before the round loop.
//
// `deadAgentIds` is a Set of agent ids whose hydrated status is 'dead'.
export function seedMemorialBondsAtHydration({ agents, deadAgentIds }) {
  if (!deadAgentIds || deadAgentIds.size === 0) return 0
  let seeded = 0
  for (const survivor of agents) {
    if (!survivor.alive) continue
    for (const otherId of Object.keys(survivor.bonds || {})) {
      if (!deadAgentIds.has(otherId)) continue
      const bond = survivor.bonds[otherId]
      if (bond.memorial) continue
      bond.preMemorialType = bond.type
      bond.memorial        = true
      bond.memorialSince   = 0          // grieving from the start of the story
      bond.grief           = initialGrief(bond)
      bond.history = bond.history || []
      bond.history.push({ round: 0, eventType: 'memorial', from: bond.type, to: bond.type })
      seeded += 1
    }
  }
  return seeded
}

// ── Per-round memorial update ───────────────────────────────────────────
// Evolves each memorial bond's grief (and intensity) by the survivor's
// psychology, applies trigger-event intensification, and returns the agent's
// aggregate grief level (the max across all their memorial bonds) so the
// runner can feed it into computeEmotionalState.
//
// Deterministic: pure function of agent state + psychology + world.
export function updateMemorialBonds({ agent, round, world }) {
  if (!agent.alive) return 0
  const bonds = agent.bonds || {}
  const p   = agent.psychology || {}
  const bf  = p.bigFive || {}
  const C   = Number.isFinite(bf.conscientiousness) ? bf.conscientiousness : 0.5
  const N   = Number.isFinite(bf.neuroticism)       ? bf.neuroticism       : 0.5
  const attachment = p.attachment || 'secure'

  // Base decay per attachment style.
  const baseDecay = (
    attachment === 'avoidant' ? 0.14 :
    attachment === 'secure'   ? 0.09 :
    attachment === 'anxious'  ? 0.03 :
    /* fearful */               0.02
  )
  // Conscientiousness speeds letting-go (channels grief into purpose);
  // neuroticism slows it (rumination). Net decay can approach 0 for an
  // anxious, low-C, high-N survivor — they don't let go.
  let decayPerRound = baseDecay
                    * (1 + 0.6 * (C - 0.5) * 2)   // C=1 → ×1.6 ; C=0 → ×0.4
                    * (1 - 0.6 * (N - 0.5) * 2)   // N=1 → ×0.4 ; N=0 → ×1.6
  decayPerRound = Math.max(0, decayPerRound)

  let maxGrief = 0
  for (const otherId of Object.keys(bonds)) {
    const bond = bonds[otherId]
    if (!bond.memorial) continue
    let grief = Number.isFinite(bond.grief) ? bond.grief : 0
    const roundsSince = round - (bond.memorialSince ?? round)

    // Early-grief spiral: anxious / fearful + high neuroticism intensify in the
    // first few rounds instead of decaying — the loss "sinks in" and worsens.
    const spiralProne = (attachment === 'anxious' || attachment === 'fearful') && N > 0.6
    if (spiralProne && roundsSince <= 4) {
      grief = Math.min(1, grief + 0.06)
    } else {
      grief = Math.max(0, grief - decayPerRound)
    }

    // Trigger event: the agent who caused this loss is in the same region this
    // round (a fresh reminder). Re-intensify. We detect it via a vengeance
    // enmity bond tagged for this deceased.
    for (const vid of Object.keys(bonds)) {
      const vb = bonds[vid]
      if (vb.vengeanceFor === otherId) {
        const cause = world?.agentById?.[vid]
        if (cause && cause.alive && cause.region === agent.region) {
          grief = Math.min(1, grief + 0.08)   // confronting the cause reopens the wound
          break
        }
      }
    }

    bond.grief = +grief.toFixed(4)

    // Memorial bond intensity follows grief loosely: avoidant lets the bond
    // fade; anxious holds it. We nudge intensity toward grief at a slow rate so
    // BondNetwork shows the relationship thinning (avoidant) or persisting
    // (anxious) over the run.
    if (Number.isFinite(bond.intensity)) {
      const target = Math.max(grief, 0.05)
      bond.intensity = +(bond.intensity + (target - bond.intensity) * 0.25).toFixed(4)
    }

    if (bond.grief > maxGrief) maxGrief = bond.grief
  }
  return maxGrief
}

// ── Helpers ──────────────────────────────────────────────────────────────
// Aggregate grief for an agent without mutating (used by UI / dialogue / prompts).
export function aggregateGrief(agent) {
  let max = 0
  for (const b of Object.values(agent?.bonds || {})) {
    if (b.memorial && Number.isFinite(b.grief) && b.grief > max) max = b.grief
  }
  return max
}

// Does this agent carry any active memorial bond? (grief above a floor)
export function hasActiveMemorial(agent, floor = 0.05) {
  return Object.values(agent?.bonds || {}).some(b => b.memorial && (b.grief ?? 0) > floor)
}

// List an agent's memorial bonds, most-grieved first (for prompts / threads).
export function memorialBondsOf(agent, agentById = null) {
  const out = []
  for (const [otherId, b] of Object.entries(agent?.bonds || {})) {
    if (!b.memorial) continue
    out.push({
      otherId,
      otherName: agentById?.[otherId]?.name || otherId,
      type: b.type,
      preMemorialType: b.preMemorialType,
      memorialSince: b.memorialSince,
      grief: b.grief ?? 0,
      intensity: b.intensity ?? 0,
    })
  }
  out.sort((a, b) => b.grief - a.grief)
  return out
}
