// Phase 7/7a — Character Psychology Engine schema + constants.
//
// The data model and the constants for the hybrid Enneagram + Big Five +
// attachment + markers system. Pure data; no logic lives here.
//
// Design intent (see SIMULATION_ENGINE_DESIGN.md §8): the Enneagram is the
// writer-facing interface (familiar, evocative). The simulation engine
// computes only on the continuous values (Big Five, attachment, markers).
// enneagramMapper.js does the translation.

// ── Enneagram types ─────────────────────────────────────────────────────
// 1=Reformer, 2=Helper, 3=Achiever, 4=Individualist, 5=Investigator,
// 6=Loyalist, 7=Enthusiast, 8=Challenger, 9=Peacemaker
export const ENNEAGRAM_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const ENNEAGRAM_LABELS = Object.freeze({
  1: 'The Reformer',
  2: 'The Helper',
  3: 'The Achiever',
  4: 'The Individualist',
  5: 'The Investigator',
  6: 'The Loyalist',
  7: 'The Enthusiast',
  8: 'The Challenger',
  9: 'The Peacemaker',
})

// Each type's two wings are the adjacent types (1↔9, 1↔2).
export const WINGS_OF = Object.freeze({
  1: [9, 2],
  2: [1, 3],
  3: [2, 4],
  4: [3, 5],
  5: [4, 6],
  6: [5, 7],
  7: [6, 8],
  8: [7, 9],
  9: [8, 1],
})

// Riso–Hudson health levels: 1 most healthy, 9 most unhealthy.
// We use three bands: healthy 1-3, average 4-6, unhealthy 7-9.
export const HEALTH_BAND = Object.freeze({
  healthy:   { min: 1, max: 3 },
  average:   { min: 4, max: 6 },
  unhealthy: { min: 7, max: 9 },
})
export function bandOf(healthLevel) {
  const h = Number(healthLevel) || 5
  if (h <= 3) return 'healthy'
  if (h >= 7) return 'unhealthy'
  return 'average'
}

// ── Attachment styles ───────────────────────────────────────────────────
export const ATTACHMENT_STYLES = ['secure', 'anxious', 'avoidant', 'fearful']

// ── Big Five (OCEAN) ────────────────────────────────────────────────────
export const BIG_FIVE_KEYS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']

// ── Antagonist markers ──────────────────────────────────────────────────
// Inspired by the "Dark Triad/Tetrad" literature but used here as story
// fuel, not a clinical instrument. Values are 0–1 probabilities.
export const MARKER_KEYS = ['narcissism', 'machiavellianism', 'callousness', 'vengefulness']

// ── Profile sources ─────────────────────────────────────────────────────
// 'questionnaire' — writer answered the questionnaire
// 'inference'     — AI inferred from Bible text
// 'pool'          — NPC archetype assignment
// 'manual'        — writer edited a derived dial directly
// null            — no profile set yet (will prompt or auto-infer)
export const PROFILE_SOURCES = ['questionnaire', 'inference', 'pool', 'manual']

// ── Default profile ─────────────────────────────────────────────────────
// Used when a character has no psychology set yet. The engine treats a null
// `source` as "needs setup" and prompts the writer (or auto-infers when the
// writer has opted into inference).
export const DEFAULT_PROFILE = Object.freeze({
  enneagram: { type: null, wing: null, healthLevel: 5 },
  bigFive: {
    openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
    agreeableness: 0.5, neuroticism: 0.5,
  },
  attachment: 'secure',
  markers: { narcissism: 0.1, machiavellianism: 0.1, callousness: 0.1, vengefulness: 0.1 },
  source: null,
  reasoning: null,       // populated when source = 'inference'
  profileHash: null,     // FNV-1a hash of the source profile text (cache key)
  inferredAt: null,
})

// Deep-clone a default profile (callers shouldn't share the same object refs)
export function freshProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE))
}

// ── NPC archetype pool ──────────────────────────────────────────────────
// Preset Enneagram profiles + names + genre-affinity weights. The pool
// covers the major dramatic registers (cooperators, antagonists, watchers,
// strivers, drifters) so any taxonomy gets a varied NPC psychology mix.
//
// The `genreWeights` table is consulted by npcArchetypePool against the
// detected taxonomy genres. Genres not listed fall back to `default`.
// Keep weights between 0 and 2; the pool draws weighted-random.
export const NPC_ARCHETYPES = Object.freeze([
  // Cooperators
  { name: 'The Steady One',  enneagram: { type: 9, wing: 1, healthLevel: 4 }, genreWeights: { default: 1.0, cozy: 1.5, romance: 1.1, war: 0.5, thriller: 0.5 } },
  { name: 'The Devoted',     enneagram: { type: 2, wing: 1, healthLevel: 5 }, genreWeights: { default: 1.0, romance: 1.6, drama: 1.3, war: 0.7 } },
  { name: 'The Loyalist',    enneagram: { type: 6, wing: 7, healthLevel: 4 }, genreWeights: { default: 1.0, war: 1.3, mystery: 1.1 } },
  { name: 'The Mentor',      enneagram: { type: 1, wing: 9, healthLevel: 3 }, genreWeights: { default: 1.0, drama: 1.2, fantasy: 1.2 } },

  // Strivers
  { name: 'The Striver',     enneagram: { type: 3, wing: 4, healthLevel: 4 }, genreWeights: { default: 1.0, drama: 1.2 } },
  { name: 'The Dreamer',     enneagram: { type: 7, wing: 6, healthLevel: 4 }, genreWeights: { default: 1.0, adventure: 1.4, romance: 1.1 } },

  // Watchers / Loners
  { name: 'The Loner',       enneagram: { type: 5, wing: 4, healthLevel: 5 }, genreWeights: { default: 1.0, mystery: 1.5, fantasy: 1.2 } },
  { name: 'The Volatile',    enneagram: { type: 4, wing: 5, healthLevel: 7 }, genreWeights: { default: 1.0, drama: 1.4 } },

  // Antagonists
  { name: 'The Predator',    enneagram: { type: 8, wing: 7, healthLevel: 8 }, genreWeights: { default: 0.6, war: 1.5, thriller: 1.6, horror: 1.4 } },
  { name: 'The Schemer',     enneagram: { type: 3, wing: 2, healthLevel: 7 }, genreWeights: { default: 0.6, thriller: 1.5, mystery: 1.4, political: 1.6 } },
  { name: 'The Zealot',      enneagram: { type: 1, wing: 2, healthLevel: 8 }, genreWeights: { default: 0.5, war: 1.4, religious: 1.6 } },

  // Outliers / edge cases
  { name: 'The Wanderer',    enneagram: { type: 9, wing: 8, healthLevel: 6 }, genreWeights: { default: 1.0, adventure: 1.3 } },
  { name: 'The Skeptic',     enneagram: { type: 5, wing: 6, healthLevel: 4 }, genreWeights: { default: 1.0, mystery: 1.4, sci_fi: 1.3 } },
  { name: 'The Survivor',    enneagram: { type: 6, wing: 5, healthLevel: 6 }, genreWeights: { default: 1.0, war: 1.4, horror: 1.3, thriller: 1.2 } },
])

// Validates and normalises a profile object into the canonical shape.
// Used on project load to migrate old data and on writer edits to clamp ranges.
export function normaliseProfile(raw) {
  if (!raw || typeof raw !== 'object') return freshProfile()
  const fresh = freshProfile()
  const clamp = (v, lo = 0, hi = 1) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return lo
    return Math.min(hi, Math.max(lo, n))
  }
  const ennType = ENNEAGRAM_TYPES.includes(Number(raw.enneagram?.type)) ? Number(raw.enneagram.type) : null
  const ennWing = ENNEAGRAM_TYPES.includes(Number(raw.enneagram?.wing)) ? Number(raw.enneagram.wing) : null
  const ennHealth = Math.min(9, Math.max(1, Math.round(Number(raw.enneagram?.healthLevel) || 5)))
  return {
    enneagram: { type: ennType, wing: ennWing, healthLevel: ennHealth },
    bigFive: Object.fromEntries(BIG_FIVE_KEYS.map(k => [k, clamp(raw.bigFive?.[k] ?? fresh.bigFive[k])])),
    attachment: ATTACHMENT_STYLES.includes(raw.attachment) ? raw.attachment : 'secure',
    markers: Object.fromEntries(MARKER_KEYS.map(k => [k, clamp(raw.markers?.[k] ?? fresh.markers[k])])),
    source: PROFILE_SOURCES.includes(raw.source) ? raw.source : null,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : null,
    profileHash: typeof raw.profileHash === 'string' ? raw.profileHash : null,
    inferredAt: typeof raw.inferredAt === 'string' ? raw.inferredAt : null,
  }
}
