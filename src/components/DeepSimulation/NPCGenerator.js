// Phase 2 — NPC generator
// Produces procedural agents matching the eight-layer schema with
// dice-rolled values within ranges. No LLM calls.

import { genId } from '../../constants.js'
import { GENERIC_VALUES, GENERIC_FEARS } from './deepSimSchema.js'

// Random helpers (deterministic if you pass a seeded rng)
const between = (rng, lo, hi) => lo + (hi - lo) * rng()
const jitter  = (rng, frac) => 1 + (rng() * 2 - 1) * frac
const pick    = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const sampleN = (rng, arr, lo, hi) => {
  if (!arr.length) return []
  const n = Math.min(arr.length, Math.floor(between(rng, lo, hi + 1)))
  const copy = [...arr]
  const out  = []
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

// Trait sampling with mild variation: take 3-5 from typicalTraits, allowing
// occasional substitutions from a generic fallback pool. For Phase 2 we
// just resample from the kind's pool with occasional drops.
function sampleTraitsWithVariation(rng, typicalTraits, lo = 3, hi = 5) {
  if (!typicalTraits || typicalTraits.length === 0) return []
  const target = Math.min(typicalTraits.length, Math.max(lo, Math.floor(between(rng, lo, hi + 1))))
  return sampleN(rng, typicalTraits, target, target)
}

// Simple name generator — seeded with kind name + sequential index. Phase 4
// will replace with LLM enrichment for active cast members.
let nameCounter = 0
function generateName(genreId, kindTemplate, rng) {
  nameCounter += 1
  const stem = kindTemplate.name || kindTemplate.id || 'NPC'
  const tag  = String(nameCounter).padStart(3, '0')
  return `${stem} #${tag}`
}

export function resetNameCounter() {
  nameCounter = 0
}

// Create a single procedural agent
export function createProceduralAgent({ genreId, kindTemplate, rng = Math.random }) {
  const lifespan = Math.max(1, kindTemplate.typicalLifeExpectancy * jitter(rng, 0.2))
  return {
    // Layer 1 — Identity
    id:        `npc_${genId()}`,
    name:      generateName(genreId, kindTemplate, rng),
    source:    'procedural',
    bibleId:   null,
    genreTag:  `${genreId}:${kindTemplate.id}`,
    isUnique:  false,

    // Layer 2 — Body and time (random within ranges)
    age:            between(rng, 0.1, 0.9) * kindTemplate.typicalLifeExpectancy,
    lifeExpectancy: lifespan,
    health:         between(rng, 0.7, 1.0),
    conditions:     [],
    mortalityRisk:  0,
    timeHorizon:    10,

    // Layer 3 — Mind (sampled)
    traits: sampleTraitsWithVariation(rng, kindTemplate.typicalTraits, 3, 5),
    values: sampleN(rng, GENERIC_VALUES, 2, 4),
    fears:  sampleN(rng, GENERIC_FEARS, 1, 3),
    cognitiveDisposition: {
      paranoiaTrust:       between(rng, -0.5, 0.5),
      conservatismNovelty: between(rng, -0.5, 0.5),
      socialSolitary:      between(rng, -0.5, 0.5),
    },
    perceptionAbilities: [],

    // Layer 4 — Drives (random starting needs)
    needs: {
      physiological: between(rng, 0.4, 0.8),
      safety:        between(rng, 0.4, 0.8),
      belonging:     between(rng, 0.4, 0.8),
      esteem:        between(rng, 0.3, 0.7),
      purpose:       between(rng, 0.3, 0.7),
    },
    goals: [],
    longTermAspiration: '',

    // Layer 5 — Bonds (Phase 4a populates bonds map at runtime)
    relationships: {},
    bonds:         {},
    factions:      [],

    // Layer 6 — Knowledge (empty Phase 2)
    knownFacts:      [],
    secrets:         [],
    memoryDecayRate: 0.1,

    // Layer 7 — Position (placeholder; positionGraph fills region at runner init)
    region:   'unknown',
    location: { region: 'unknown', town: 'unknown', place: 'unknown' },
    travelSpeed:        1,
    socialEmbeddedness: [],
    dailyOrbit:         [],

    // Layer 8 — Current state
    emotion:          'calm',
    stress:           between(rng, 0, 0.3),
    trustDisposition: between(rng, 0.4, 0.7),

    // Lifecycle
    alive: true,
    _firedNeedCritical: {},

    // Phase 4a — action history
    actionHistory: [],
  }
}

// Generate the full set of NPCs for one census per the brief's formula:
//   for each genre × kind:
//     count = kind.typicalCount × (castSize / 100) × genre.weight × censusMultiplier
// Bound agents (Bible) are NOT generated here — those are added in CensusManager.
export function generateNPCs({ taxonomy, castSize, censusMultiplier, rng = Math.random }) {
  resetNameCounter()
  const npcs = []
  for (const genre of (taxonomy?.genres || [])) {
    if (!genre.kinds || genre.weight <= 0) continue
    for (const kind of genre.kinds) {
      if (kind.included === false) continue
      // Per-100-cast count, scaled to actual cast size and genre weight, then
      // multiplied to fill the census (which is 5x cast by default).
      const count = Math.round(
        kind.typicalCount * (castSize / 100) * genre.weight * censusMultiplier,
      )
      for (let i = 0; i < count; i++) {
        npcs.push(createProceduralAgent({ genreId: genre.id, kindTemplate: kind, rng }))
      }
    }
  }
  return npcs
}
