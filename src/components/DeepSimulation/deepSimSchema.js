// Phase 1 — Deep Simulation agent state schema
// Source of truth: docs/SIMULATION_ENGINE_DESIGN.md Section 2
//
// Phase 1 only exercises Layer 1 (identity), Layer 2 (body and time),
// and Layer 4 (drives — needs only). Other layers are populated with
// neutral defaults and become live in later phases.
//
// Note on Story Bible types:
//   chars[i].traits is stored as a comma-separated string in StoryBible.jsx.
//   chars[i].secrets is stored as multi-line free text. AgentFactory
//   normalises both into string[] before placing them in agent state.

export const TIME_UNITS = ['hour', 'day', 'week', 'month', 'season', 'year']

// Fraction-of-a-year per round, used for aging and time-scaling rates.
export const TIME_UNIT_YEARS = {
  hour:   1 / (365 * 24),
  day:    1 / 365,
  week:   7 / 365,
  month:  30 / 365,
  season: 90 / 365,
  year:   1,
}

export const NEEDS_KEYS = ['physiological', 'safety', 'belonging', 'esteem', 'purpose']

// Per-day baseline depletion. Scaled by time-unit-in-days at runtime.
export const NEEDS_BASELINE_PER_DAY = {
  physiological: 0.05,
  safety:        0.02,
  belonging:     0.01,
  esteem:        0.005,
  purpose:       0.003,
}

// Threshold below which a need-critical event fires (once per crossing).
export const NEED_CRITICAL_THRESHOLD = 0.2

// Documented schema for a Phase 1 agent. Frozen for safety.
export const AGENT_SCHEMA = Object.freeze({
  // Layer 1 — Identity
  id:          'string',
  name:        'string',
  source:      "'bound' | 'procedural'",
  bibleId:     'string | null',
  genreTag:    'string',
  isUnique:    'boolean',

  // Layer 2 — Body and time
  age:            'number (years)',
  lifeExpectancy: 'number (years)',
  health:         'number (0-1)',
  conditions:     'string[]',
  mortalityRisk:  'number (0-1, recomputed each round)',
  timeHorizon:    'number (rounds ahead this agent thinks)',

  // Layer 3 — Mind (Phase 1: defaults only)
  traits:                'string[]',
  values:                'string[]',
  fears:                 'string[]',
  cognitiveDisposition:  '{ paranoiaTrust, conservatismNovelty, socialSolitary }',
  perceptionAbilities:   'object[]',

  // Layer 4 — Drives (Phase 1: needs live; goals, longTermAspiration default)
  needs:              '{ physiological, safety, belonging, esteem, purpose } 0-1',
  goals:              'object[]',
  longTermAspiration: 'string',

  // Layer 5 — Bonds (Phase 1: empty)
  relationships: 'map<agentId, edge>',
  factions:      'string[]',

  // Layer 6 — Knowledge (Phase 1: empty)
  knownFacts:      'object[]',
  secrets:         'string[]',
  memoryDecayRate: 'number (0-1)',

  // Layer 7 — Position (Phase 1: placeholder)
  location:           '{ region, town, place }',
  travelSpeed:        'number',
  socialEmbeddedness: 'string[]',
  dailyOrbit:         'string[]',

  // Layer 8 — Current state
  emotion:           "'calm'|'angry'|'grieving'|'fearful'|'joyful'|'anxious'|'vengeful'",
  stress:            'number (0-1)',
  trustDisposition:  'number (0-1)',

  // Phase 1 lifecycle helper (not in design doc — needed to stop a dead
  // agent from re-firing events in subsequent rounds)
  alive: 'boolean',
})

// Event categories Phase 1 actually emits. The full nine-category set
// arrives in Phase 3 per the design doc.
export const PHASE1_EVENT_CATEGORIES = ['aging', 'need_critical', 'death']
