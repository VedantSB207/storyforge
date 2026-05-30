// Phase 6/6a-ii — World Rules schema
//
// World Rules are a top-level, project-level configuration that controls how
// the simulation engine interprets the writer's universe. They sit OUTSIDE
// the Story Bible (which is the writer's reference for the story) and govern
// engine behaviour — aging, mortality, lifespan, custom narrative rules.
//
// This file is the single source of truth for the schema. Any consumer
// (AgentFactory, NPCGenerator, stateUpdaters, narrativeSummary, taxonomy,
// characterInference, DeepSimulation.jsx) imports DEFAULT_WORLD_RULES from
// here for migration safety on projects that don't yet have a worldRules
// field.

// ── Story-Scale Presets ──────────────────────────────────────────────────
// Replaces the Phase 5 difficulty preset. Each preset picks a time-unit and
// a round count that matches a familiar story scale, plus a needs/aging
// multiplier set that paces mortality and exhaustion appropriately.
//
//   thriller — 30 days. Survival pressure compressed; aging is irrelevant.
//   drama    — 30 weeks (~7 months). Default; most stories sit here.
//   novel    — 24 months (2 years). Slow burn; relationships dominate.
//   saga     — 20 years. Multi-generational; aging matters; high mortality.
//   epic     — 100 years. Lifetimes pass; civilisational scale.
//
// `custom` is a sentinel — the writer can override the time-unit/rounds in
// DeepSimulation.jsx independently of the preset.
export const NARRATIVE_SCALE_PRESETS = Object.freeze({
  thriller: {
    id:           'thriller',
    label:        'Thriller (30 days)',
    timeUnit:     'day',
    rounds:       30,
    needsPace:    1.2,   // tight pressure; small needs lapse hurts
    agingMatters: false, // a month is nothing to a person
  },
  drama: {
    id:           'drama',
    label:        'Drama (30 weeks)',
    timeUnit:     'week',
    rounds:       30,
    needsPace:    1.0,
    agingMatters: false,
  },
  novel: {
    id:           'novel',
    label:        'Novel (24 months)',
    timeUnit:     'month',
    rounds:       24,
    needsPace:    0.8,
    agingMatters: false, // 2 years usually doesn't kill anyone
  },
  saga: {
    id:           'saga',
    label:        'Saga (20 years)',
    timeUnit:     'year',
    rounds:       20,
    needsPace:    0.7,
    agingMatters: true,
  },
  epic: {
    id:           'epic',
    label:        'Epic (100 years)',
    timeUnit:     'year',
    rounds:       100,
    needsPace:    0.6,
    agingMatters: true,
  },
})

export const NARRATIVE_SCALE_DEFAULT = 'drama'

// ── World Rules ──────────────────────────────────────────────────────────
// Saved on the project. Loaded when the project opens; falls back to this
// default if absent so existing projects keep working.
//
// aging.matters        — when false, mortality from aging is suppressed. Death
//                        from health (needs/conflict) still applies.
// aging.speed          — multiplier on per-round age increase. 1.0 = realtime;
//                        0.1 means each year-round only ages a character 0.1y
//                        (useful for mostly-immortal casts).
// needs.*Speed         — per-need multipliers on depletion rate. Higher = more
//                        pressure. Defaults stay at 1.0 (Phase 5 'standard').
// lifespanOverrides    — per-kind life expectancy override in years. Keyed by
//                        kind name (lowercase) or species/genreTag tail.
//                        Example: { 'vampire': 5000, 'sage': 2000 }
//                        Bound chars: keyed by lowercase character name AND
//                        by lowercase species, with name winning if both
//                        match.
// globalLifespanMultiplier — applied AFTER per-kind override. 2.0 doubles
//                            every species's lifespan.
// customNarrativeRules — free-text rules the writer wants honored by the
//                        chronicler + taxonomy detector + inference layer.
//                        Examples: "Vampires weakened but not killed by
//                        sunlight." "Werewolf cats are matrilineal."

export const DEFAULT_WORLD_RULES = Object.freeze({
  aging: {
    matters: true,
    speed:   1.0,
  },
  needs: {
    physiologicalSpeed: 1.0,
    safetySpeed:        1.0,
    belongingSpeed:     1.0,
    esteemSpeed:        1.0,
    purposeSpeed:       1.0,
  },
  lifespanOverrides:        {},   // { kindOrSpecies: years }
  globalLifespanMultiplier: 1.0,
  customNarrativeRules:     '',
  narrativeScale:           NARRATIVE_SCALE_DEFAULT, // 'thriller' | 'drama' | 'novel' | 'saga' | 'epic'
})

// Merge a partial/legacy worldRules onto the defaults so missing fields
// always have a value. Used on project load.
export function withDefaults(partial = null) {
  if (!partial || typeof partial !== 'object') return { ...DEFAULT_WORLD_RULES, lifespanOverrides: {}, needs: { ...DEFAULT_WORLD_RULES.needs } }
  return {
    aging: {
      matters: partial.aging?.matters ?? DEFAULT_WORLD_RULES.aging.matters,
      speed:   Number.isFinite(partial.aging?.speed) ? partial.aging.speed : DEFAULT_WORLD_RULES.aging.speed,
    },
    needs: {
      physiologicalSpeed: Number.isFinite(partial.needs?.physiologicalSpeed) ? partial.needs.physiologicalSpeed : 1.0,
      safetySpeed:        Number.isFinite(partial.needs?.safetySpeed)        ? partial.needs.safetySpeed        : 1.0,
      belongingSpeed:     Number.isFinite(partial.needs?.belongingSpeed)     ? partial.needs.belongingSpeed     : 1.0,
      esteemSpeed:        Number.isFinite(partial.needs?.esteemSpeed)        ? partial.needs.esteemSpeed        : 1.0,
      purposeSpeed:       Number.isFinite(partial.needs?.purposeSpeed)       ? partial.needs.purposeSpeed       : 1.0,
    },
    lifespanOverrides:        (partial.lifespanOverrides && typeof partial.lifespanOverrides === 'object') ? { ...partial.lifespanOverrides } : {},
    globalLifespanMultiplier: Number.isFinite(partial.globalLifespanMultiplier) ? partial.globalLifespanMultiplier : 1.0,
    customNarrativeRules:     typeof partial.customNarrativeRules === 'string' ? partial.customNarrativeRules : '',
    narrativeScale:           NARRATIVE_SCALE_PRESETS[partial.narrativeScale] ? partial.narrativeScale : NARRATIVE_SCALE_DEFAULT,
  }
}

// Map a Phase 5 difficulty preset to the Phase 6 needs.*Speed multipliers,
// for backward compatibility with stateUpdaters' depleteNeeds when a sim
// is run with no worldRules (e.g. the existing test suite).
export function legacyDifficultyToNeedsMultipliers(difficulty) {
  if (difficulty === 'gentle') return { physiological: 0.7, safety: 0.7, belonging: 0.8, esteem: 1.0, purpose: 1.0 }
  if (difficulty === 'harsh')  return { physiological: 1.3, safety: 1.3, belonging: 1.2, esteem: 1.0, purpose: 1.0 }
  return { physiological: 1.0, safety: 1.0, belonging: 1.0, esteem: 1.0, purpose: 1.0 }
}
