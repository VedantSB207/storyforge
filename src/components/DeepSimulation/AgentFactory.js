// Phase 1 — AgentFactory
// Reads Story Bible characters and produces bound agents matching the
// schema in deepSimSchema.js / Section 2 of the design doc.
//
// Bible field type reality (codebase truth, not doc):
//   char.traits  — comma-separated string typed by writer
//   char.secrets — multi-line free text
// Both get normalised into string[] here so the schema's typing holds.

import { resolveLifespan } from '../WorldRules/lifespanResolver.js'

const splitTraits = (s) =>
  String(s || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

const splitSecrets = (s) =>
  String(s || '')
    .split(/\r?\n+/)
    .map(t => t.trim())
    .filter(Boolean)

// Phase 6/6a-i: optional hydration param applies Bible-inference results
// (age, status, location, backgroundSummary) and seeded bonds + Knowledge.
// When absent, falls back to the Phase 1 defaults exactly as before.
// Phase 6/6a-ii: worldRules controls per-character lifespan overrides + the
// global lifespan multiplier. Falls back to 80 when worldRules absent.
export function createAgentFromBibleCharacter(char, hydration = null, seededKnowledge = null, worldRules = null) {
  const agentId   = `agent_${char.id}`
  // Effective inference = inference + writer edits from Hydration Review
  const eff       = hydration?.effective?.[agentId] || hydration?.inferences?.[agentId] || null
  const seededBonds = hydration?.bondsByAgentId?.[agentId] || null
  const status    = (eff?.status || 'alive').toLowerCase()
  const isActive  = (status === 'alive' || status === 'dormant')
  const isOffstage = (status === 'missing' || status === 'exiled' || status === 'dormant')

  // Resolve life expectancy via the World Rules resolver. First match wins
  // across: lowercase character name → species → genreTag tail → kind id.
  const lifeExpectancy = resolveLifespan({
    characterName: char.name,
    species:       char.species,
    genreTag:      null,           // bound chars don't have a genreTag yet
    kindId:        null,
    baseline:      80,
    jitter:        1.0,
    worldRules,
  })

  return {
    // Layer 1 — Identity
    id:        agentId,
    name:      char.name || 'Unnamed',
    source:    'bound',
    bibleId:   char.id,
    genreTag:  'unknown',         // populated in Phase 2
    isUnique:  false,             // editable in Phase 2

    // Layer 2 — Body and time
    age:            (eff?.age?.value ?? 30),
    lifeExpectancy: lifeExpectancy,
    health:         1.0,
    conditions:    [],
    mortalityRisk:  0,
    timeHorizon:   10,

    // Layer 3 — Mind (Bible signals only; rest empty for Phase 1)
    traits: splitTraits(char.traits),
    values: [],
    fears:  [],
    cognitiveDisposition: {
      paranoiaTrust:        0,
      conservatismNovelty:  0,
      socialSolitary:       0,
    },
    perceptionAbilities: [],

    // Layer 4 — Drives (start neutral)
    needs: {
      physiological: 0.7,
      safety:        0.7,
      belonging:     0.5,
      esteem:        0.5,
      purpose:       0.5,
    },
    goals: [],
    longTermAspiration: '',

    // Layer 5 — Bonds: hydration seeds bonds from the Relationship Web.
    // SimulationRunner threads `seededBonds` here from hydrationData.
    relationships: {},
    bonds:         seededBonds ? { ...seededBonds } : {},
    factions:      [],

    // Layer 6 — Knowledge: hydration seeds initial Knowledge from the
    // character's profile + chapters (knowledgeSeeder.js, optional).
    knownFacts:      Array.isArray(seededKnowledge) ? [...seededKnowledge] : [],
    secrets:         splitSecrets(char.secrets),
    memoryDecayRate: 0.1,

    // Layer 7 — Position. Hydration sets initial region from the inference;
    // positionGraph can still override unknowns at runner init.
    region:   eff?.location || 'unknown',
    location: {
      region: eff?.location || 'unknown',
      town:   'unknown',
      place:  'unknown',
    },
    travelSpeed:        1,
    socialEmbeddedness: [],
    dailyOrbit:         [],

    // Layer 8 — Current state
    emotion:          'calm',
    stress:           0,
    trustDisposition: 0.5,

    // Phase 1 lifecycle helper. Status-aware: 'dead' agents are
    // immediately marked alive=false (also excluded from active cast by
    // the runner); 'missing'/'exiled'/'dormant' stay alive but flagged
    // offstage so decisionLogic/witnessRules can filter them.
    alive: status !== 'dead',

    // Phase 6 hydration markers used by decisionLogic + witnessRules
    status:           status,
    isOffstage:       isOffstage,
    backgroundSummary: eff?.backgroundSummary || '',

    // Internal flag set: lets us avoid re-firing the same need_critical event
    // every round once a need is already below threshold
    _firedNeedCritical: {},

    // Phase 4a — what this agent has done over the simulation (capped to
    // last 60 entries by the action resolver)
    actionHistory: [],
  }
}

export function createAgentsFromBible(chars = [], hydration = null, knowledgeByAgentId = null, worldRules = null) {
  return (chars || []).map(c => {
    const agentId = `agent_${c.id}`
    const seeded = knowledgeByAgentId?.[agentId] || null
    return createAgentFromBibleCharacter(c, hydration, seeded, worldRules)
  })
}
