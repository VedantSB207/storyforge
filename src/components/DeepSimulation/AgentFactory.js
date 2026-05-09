// Phase 1 — AgentFactory
// Reads Story Bible characters and produces bound agents matching the
// schema in deepSimSchema.js / Section 2 of the design doc.
//
// Bible field type reality (codebase truth, not doc):
//   char.traits  — comma-separated string typed by writer
//   char.secrets — multi-line free text
// Both get normalised into string[] here so the schema's typing holds.

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

export function createAgentFromBibleCharacter(char) {
  return {
    // Layer 1 — Identity
    id:        `agent_${char.id}`,
    name:      char.name || 'Unnamed',
    source:    'bound',
    bibleId:   char.id,
    genreTag:  'unknown',         // populated in Phase 2
    isUnique:  false,             // editable in Phase 2

    // Layer 2 — Body and time
    age:            30,           // writer can adjust later
    lifeExpectancy: 80,
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

    // Layer 5 — Bonds (empty Phase 1)
    relationships: {},
    factions:      [],

    // Layer 6 — Knowledge (empty Phase 1)
    knownFacts:      [],
    secrets:         splitSecrets(char.secrets),
    memoryDecayRate: 0.1,

    // Layer 7 — Position (placeholder Phase 1)
    location: {
      region: 'unknown',
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

    // Phase 1 lifecycle helper
    alive: true,

    // Internal flag set: lets us avoid re-firing the same need_critical event
    // every round once a need is already below threshold
    _firedNeedCritical: {},
  }
}

export function createAgentsFromBible(chars = []) {
  return (chars || []).map(createAgentFromBibleCharacter)
}
