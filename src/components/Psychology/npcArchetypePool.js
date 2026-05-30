// Phase 7/7a — NPC archetype pool assignment.
//
// Pure logic, no LLM. Picks an archetype from NPC_ARCHETYPES for each
// procedural NPC, biased by detected taxonomy genres. All randomness goes
// through the supplied seeded RNG so determinism holds.
//
// Public:
//   assignArchetypes(npcs, detectedGenres, rng) -> { agentId: profile }
//   profileFromArchetype(archetype) -> profile (Enneagram + derived dials)

import { NPC_ARCHETYPES, normaliseProfile } from './psychologySchema.js'
import { mapEnneagramToProfile } from './enneagramMapper.js'

// Build the genre-aware weight for an archetype from a list of detected
// genre tags. Multiple genres compose multiplicatively; an archetype that
// strongly fits all detected genres dominates the draw.
function archetypeWeight(archetype, detectedGenres) {
  const w = archetype.genreWeights || { default: 1 }
  if (!detectedGenres || detectedGenres.length === 0) return w.default ?? 1
  // Use the maximum of per-genre weights so a single strong match still
  // boosts the archetype (vs multiplicative dampening for non-matches).
  let max = w.default ?? 1
  for (const g of detectedGenres) {
    const tag = String(g || '').toLowerCase()
    if (w[tag] != null) max = Math.max(max, w[tag])
  }
  return max
}

// Public — pick one archetype with weighted random draw using the supplied
// seeded RNG. Useful in tests and as a building block.
export function pickArchetype(detectedGenres, rng) {
  const weights = NPC_ARCHETYPES.map(a => archetypeWeight(a, detectedGenres))
  const total = weights.reduce((s, w) => s + w, 0)
  if (total <= 0) return NPC_ARCHETYPES[0]
  let r = rng() * total
  for (let i = 0; i < NPC_ARCHETYPES.length; i++) {
    r -= weights[i]
    if (r <= 0) return NPC_ARCHETYPES[i]
  }
  return NPC_ARCHETYPES[NPC_ARCHETYPES.length - 1]   // FP rounding safety
}

// Build a full normalised profile from an archetype's Enneagram spec.
// Returns a fresh object each call (no shared refs).
export function profileFromArchetype(archetype) {
  if (!archetype?.enneagram) return null
  const { type, wing, healthLevel } = archetype.enneagram
  const derived = mapEnneagramToProfile({ type, wing, healthLevel })
  return normaliseProfile({
    enneagram: { type, wing, healthLevel },
    bigFive: derived.bigFive,
    attachment: derived.attachment,
    markers: derived.markers,
    source: 'pool',
    reasoning: `Archetype: ${archetype.name}`,
    inferredAt: null,
    profileHash: null,
  })
}

// Public — assign archetypes to NPCs. Deterministic given the same `rng`.
// `npcs` is an array of agent-like objects with `.id`; we only use the id.
// `detectedGenres` is an array of genre tag strings (lowercase preferred).
// Returns a map: { agentId: profile }
export function assignArchetypes(npcs = [], detectedGenres = [], rng = Math.random) {
  const out = Object.create(null)
  for (const npc of npcs) {
    if (!npc?.id) continue
    const archetype = pickArchetype(detectedGenres, rng)
    out[npc.id] = profileFromArchetype(archetype)
    // Tag with the archetype name on the profile so the UI can show it.
    if (out[npc.id]) out[npc.id].archetypeName = archetype.name
  }
  return out
}

// Public — flatten a taxonomy into a list of genre tags suitable for the
// pool's genreWeights. Looks at taxonomy.genres[].id / .name and picks
// the most prevalent ones (weight ≥ 0.2). Used by the runner so it can
// hand npcArchetypePool the genres without re-implementing detection.
export function taxonomyGenres(taxonomy) {
  if (!taxonomy?.genres?.length) return []
  return taxonomy.genres
    .filter(g => (g.weight ?? 1) >= 0.2)
    .flatMap(g => {
      const labels = []
      if (g.id) labels.push(String(g.id).toLowerCase())
      if (g.name && g.name !== g.id) labels.push(String(g.name).toLowerCase())
      return labels
    })
}
