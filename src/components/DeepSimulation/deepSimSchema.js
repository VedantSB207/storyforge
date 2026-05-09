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

// ─── Phase 2 additions ──────────────────────────────────────────────────────

// Census = total population that exists conceptually. Active cast = subset
// computed each round. Census size = active cast × this multiplier.
export const CENSUS_MULTIPLIER = 5

// LLM model and budget for the one-shot taxonomy detection at setup time.
// Round loop is still 100% deterministic — no LLM calls per round.
export const TAXONOMY_MODEL = 'claude-sonnet-4-20250514'
export const TAXONOMY_MAX_TOKENS = 2000

// Phase 2.5 narrative summary — one Claude call after the round loop
// completes, produces a flowing prose chronicle for the writer.
export const NARRATIVE_MODEL = 'claude-sonnet-4-20250514'
export const NARRATIVE_MAX_TOKENS = 1500

// ─── Phase 3 additions: information propagation ────────────────────────────

// LLM distortion budget. Trait-based distortion is unlimited (free). LLM
// distortion is reserved for hops that involve bound characters or
// plot-critical events. Caps protect against runaway cost on huge sims.
export const MAX_LLM_DISTORTION_CALLS_PER_ROUND = 5
export const MAX_LLM_DISTORTION_CALLS_PER_SIM   = 100

// Hop ceiling — stops a rumour cascade from running forever.
export const PROPAGATION_HOP_LIMIT = 3

// Confidence decay per hop. After 3 hops at 0.7^hop you reach ~0.34, still
// above the floor; after 7 you'd be at ~0.082, below the floor.
export const CONFIDENCE_DECAY_PER_HOP = 0.7

// Stop propagating once a hop's resulting confidence would fall below this.
export const CONFIDENCE_FLOOR = 0.1

// Per-transmitter cap on receivers per hop. Prevents one well-connected
// agent from broadcasting to everyone at once.
export const MAX_GOSSIP_RECEIVERS_PER_HOP = 3

// Probabilities for gossip transmission per relationship type.
export const GOSSIP_PROB_BONDED      = 0.8   // intensity * trust applied on top
export const GOSSIP_PROB_SAME_REGION = 0.25
export const GOSSIP_PROB_ADJACENT    = 0.10

// Which event categories propagate? Aging is private (a personal milestone),
// so we only propagate deaths and need-critical events. Death of bound
// characters is also flagged plot-critical for LLM-distortion priority.
export const PROPAGATABLE_CATEGORIES = ['death', 'need_critical']

// ─── Phase 3.5: persistence model ──────────────────────────────────────────
// Each simulation run is split into two artefacts:
//   - METADATA STUB lives in project's deepSimulationHistory[] (small, < 1 KB)
//   - FULL RESULT lives at <userData>/projects/<projectId>/deep-sims/<simId>.json
// The project file is therefore O(simulation count) in size, not O(simulation
// volume). Heavy data only loads when the writer opens that simulation.

export const DEEP_SIM_METADATA_SCHEMA = Object.freeze({
  simId:             'string (unique sim id, formerly entry.id)',
  timestamp:         'ISO timestamp',
  mode:              "'progressive' | 'scenario' (Phase 4)",
  castSize:          'number (active cast size requested)',
  roundCount:        'number',
  timeUnit:          "'hour'|'day'|'week'|'month'|'season'|'year'",
  seed:              'number (deterministic re-run seed)',
  summary:           'string (one-line plain-text summary)',
  narrativeHeadline: 'string | null (pulled out for list display)',
  alive:             'number',
  dead:              'number',
  totalEvents:       'number',
  totalCost:         'number USD (taxonomy + distortion + narrative)',
  censusStats:       '{ boundCount, proceduralCount, censusCount, activeCastCount, ... }',
  butterflyStats:    '{ eventCount, knowledgeCount, edgeCount } | null',
  llmCallsTotal:     'number | null',
})

export const DEEP_SIM_FULL_RESULT_SCHEMA = Object.freeze({
  id:               'string',
  timestamp:        'ISO timestamp',
  mode:             'string',
  castSize:         'number',
  roundCount:       'number',
  timeUnit:        'string',
  seed:             'number',
  taxonomy:         'TaxonomyShape (full taxonomy used)',
  censusStats:      'CensusStatsShape',
  agents:           'Agent[] (full state at end including knownFacts)',
  events:           'Event[] (full chronological event log)',
  butterflyStats:   '{ eventCount, knowledgeCount, edgeCount }',
  butterflyTrace:   'BFT | null (only stored if user has opted in — heavy)',
  narrative:        'NarrativeShape (Phase 2.5)',
  llmCallsTotal:    'number',
  summary:          'string',
})

// Knowledge entry shape — was placeholder in Phase 1, populated in Phase 3.
export const KNOWLEDGE_SCHEMA = Object.freeze({
  id:             'string (kn_<n>)',
  originEventId:  'string (ev_<n>) — points to the trace event node',
  source:         "'firsthand' | <transmitter agent name>",
  sourceAgentId:  'string (agent id, even when source is firsthand)',
  ownerId:        'string (the agent who holds this Knowledge)',
  content:        'string (event as this agent understands it; may be distorted)',
  confidence:     'number 0-1',
  roundLearned:   'number',
  hops:           'number (0 = firsthand, n = n hops removed)',
  distortionMode: "'witness' | 'trait' | 'llm' | 'trait_fallback' (absent when hops=0)",
})

// Allowed values for kind.typicalSize (sorted small→large)
export const KIND_SIZES = ['tiny', 'small', 'medium', 'large', 'huge']

// Schema for the world taxonomy object the engine generates and the writer
// reviews. Stored alongside each simulation run in deepSimulationHistory for
// reproducibility.
export const TAXONOMY_SCHEMA = Object.freeze({
  genres: [
    {
      id:       'string (e.g. animal_kingdom)',
      name:     'string (display label)',
      detected: 'boolean (true=engine, false=writer-added)',
      weight:   'number 0-1 (prevalence in census)',
      kinds: [
        {
          id:                    'string (e.g. rattlesnake)',
          name:                  'string (display label)',
          included:              'boolean (writer can suppress)',
          typicalTraits:         'string[]',
          typicalLifeExpectancy: 'number (years)',
          typicalSize:           'tiny | small | medium | large | huge',
          typicalCount:          'number (proportional count per 100 active cast)',
        },
      ],
    },
  ],
  reasoning:        'string (brief writer-facing explanation)',
  generatedAt:      'ISO timestamp',
  contentFingerprint: 'string (hash of chars+lore at generation time)',
})

// Default empty taxonomy — keeps the UI rendering cleanly before generation
export const EMPTY_TAXONOMY = {
  genres: [],
  reasoning: '',
  generatedAt: null,
  contentFingerprint: '',
}

// Phase 2.5 narrative shape — saved alongside each deepSimulationHistory entry
export const NARRATIVE_SCHEMA = Object.freeze({
  headline:       'string (one-line summary, 8-12 words)',
  narrative:      'string (2-4 paragraphs of prose chronicle)',
  notableEvents:  'string[] (3-5 story-language bullets)',
  generatedAt:    'ISO timestamp',
  usage:          '{ input_tokens, output_tokens } — for cost tracking',
})

// Generic value/fear pools for procedural NPCs. Phase 4 will replace with
// LLM enrichment for the active cast. Phase 2 just needs them to exist.
export const GENERIC_VALUES = [
  'survival', 'family', 'territory', 'reputation', 'freedom',
  'tradition', 'novelty', 'truth', 'loyalty', 'pleasure',
  'power', 'community', 'solitude', 'craft', 'faith',
]

export const GENERIC_FEARS = [
  'death', 'loss', 'isolation', 'failure', 'exposure',
  'capture', 'betrayal', 'starvation', 'pain', 'irrelevance',
]
