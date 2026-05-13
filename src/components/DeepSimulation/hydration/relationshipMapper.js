// Phase 6/6a-i — Relationship Web → initial agent bonds
//
// Pure logic, no LLM call. Reads the writer's Relationship Web entries
// (existing in project state as `relationships: [{ from, to, type, ... }]`)
// and the per-character inferred relationships (from characterInference)
// and maps them to seeded `agent.bonds` entries at round 0.
//
// Each mapped bond gets a history entry { round: 0, eventType: 'hydration',
// dIntensity, dTrust, source: 'bible' } so the bond timeline shows the
// relationship arc starts pre-simulation.

// Pattern → bond defaults. Patterns are checked in declaration order;
// first match wins. Each pattern is a regex applied to the lowercase
// relationship type string.
const RELATIONSHIP_PATTERNS = [
  { re: /family|kin|parent|sibling|child|relative|brother|sister|mother|father|son|daughter/, bondType: 'kinship',    intensity: 0.7, trust:  0.7 },
  { re: /spouse|lover|romantic|partner|husband|wife|paramour|beloved/,                       bondType: 'love',       intensity: 0.8, trust:  0.7 },
  { re: /mentor|teacher|master|guide|trainer|guardian/,                                       bondType: 'friendship', intensity: 0.7, trust:  0.7 },
  { re: /student|apprentice|protege|pupil|ward/,                                              bondType: 'friendship', intensity: 0.7, trust:  0.6 },
  { re: /friend|companion|ally|comrade|teammate|sidekick|confidant/,                          bondType: 'friendship', intensity: 0.6, trust:  0.6 },
  { re: /rival|competitor|adversary/,                                                          bondType: 'rivalry',    intensity: 0.5, trust: -0.2 },
  { re: /enemy|antagonist|nemesis|foe|hostile/,                                                bondType: 'enmity',     intensity: 0.7, trust: -0.7 },
  { re: /acquaintance|known|met/,                                                              bondType: 'weak',       intensity: 0.2, trust:  0.1 },
]

// Look up bond defaults for a given relationship type string. Falls back
// to `weak` for unknown / unmatched types.
export function getDefaultBondForRelationshipType(typeString) {
  const lower = String(typeString || '').toLowerCase()
  for (const p of RELATIONSHIP_PATTERNS) {
    if (p.re.test(lower)) {
      return { bondType: p.bondType, intensity: p.intensity, trust: p.trust }
    }
  }
  return { bondType: 'weak', intensity: 0.15, trust: 0.0 }
}

// Build an agent-id-to-bonds map. Inputs:
//   - relationshipWebData: project.relationships array of edges
//     {from: charId, to: charId, type: string, ...}
//   - inferredRelationships: per-character inference results
//     { [agentId]: { keyRelationships: [{with, type, evidence}] } }
//   - chars: project.chars (used for char-id → agent-id resolution + name lookup)
//
// Output: { [agentId]: { [otherAgentId]: bondObject } }
//
// The same pair may be present both in relationshipWebData (explicit) and
// inferredRelationships (inferred). Explicit wins; inference fills gaps.
export function mapRelationshipsToBonds({ relationshipWebData = [], inferredRelationships = {}, chars = [] }) {
  const bondsByAgentId = {}
  const ensureMap = (id) => { if (!bondsByAgentId[id]) bondsByAgentId[id] = {} }

  // Resolve char-id → agent-id and char-name → char (for inference matching)
  const charById = {}
  const charByName = {}
  const agentIdOf = (charId) => `agent_${charId}`
  for (const c of chars) {
    charById[c.id] = c
    if (c.name) charByName[c.name.toLowerCase()] = c
  }

  // Helper: create or merge a bond entry on each side of a pair.
  // history: starts with single hydration-source entry; runner will append.
  const setBond = (selfAgentId, otherAgentId, otherName, type, evidence, source) => {
    if (!selfAgentId || !otherAgentId || selfAgentId === otherAgentId) return
    const { bondType, intensity, trust } = getDefaultBondForRelationshipType(type)
    ensureMap(selfAgentId)
    const existing = bondsByAgentId[selfAgentId][otherAgentId]
    if (existing && existing._source === 'bible') return   // explicit Bible wins over inference
    bondsByAgentId[selfAgentId][otherAgentId] = {
      otherId:          otherAgentId,
      otherName,
      type:             bondType,
      intensity,
      trust,
      history: [{
        round:     0,
        eventType: 'hydration',
        dIntensity: intensity,
        dTrust:    trust,
        source,
        inferredType: type,
        evidence:  evidence || null,
      }],
      lastUpdatedRound: 0,
      _source:          source,
    }
  }

  // Pass 1 — explicit Relationship Web entries (highest priority)
  for (const edge of (relationshipWebData || [])) {
    const fromChar = charById[edge.from]
    const toChar   = charById[edge.to]
    if (!fromChar || !toChar) continue
    const type = edge.type || edge.label || edge.relation || 'acquaintance'
    setBond(agentIdOf(fromChar.id), agentIdOf(toChar.id),   toChar.name,   type, edge.note, 'bible')
    setBond(agentIdOf(toChar.id),   agentIdOf(fromChar.id), fromChar.name, type, edge.note, 'bible')
  }

  // Pass 2 — per-character inferred relationships (fills gaps)
  for (const [agentId, inf] of Object.entries(inferredRelationships)) {
    const rels = inf?.keyRelationships || []
    for (const r of rels) {
      const otherChar = charByName[String(r.with || '').toLowerCase()]
      if (!otherChar) continue   // skip relationships referencing chars not in the Bible
      const otherAgentId = agentIdOf(otherChar.id)
      setBond(agentId, otherAgentId, otherChar.name, r.type || 'acquaintance', r.evidence, 'inference')
    }
  }

  return bondsByAgentId
}

// Debugging / introspection helper — flat list of all seeded bonds with
// source attribution. Used by the Hydration Review screen.
export function summarizeSeededBonds(bondsByAgentId, chars) {
  const charByAgentId = {}
  for (const c of chars) charByAgentId[`agent_${c.id}`] = c
  const out = []
  for (const [agentId, bonds] of Object.entries(bondsByAgentId)) {
    const self = charByAgentId[agentId]
    if (!self) continue
    for (const b of Object.values(bonds)) {
      out.push({
        from:     self.name,
        to:       b.otherName || b.otherId,
        type:     b.type,
        intensity: b.intensity,
        trust:    b.trust,
        source:   b._source,
        inferredType: b.history?.[0]?.inferredType,
      })
    }
  }
  return out
}
