// Phase 7/7a — Enneagram → Big Five + attachment + markers mapper.
//
// Pure logic, no LLM, no randomness. Given an Enneagram type + wing +
// health level, returns the simulation's actual computational substrate:
// Big Five (OCEAN) distribution + attachment style + antagonist markers.
//
// Source of values: the table in PHASE_7_BRIEF.md §7a, informed by the
// general consensus in Enneagram-to-Big-Five mapping research. These are
// reasonable narrative defaults, not a diagnostic instrument. Writers
// can override any value in PsychologyReview after the mapping.

import {
  ENNEAGRAM_TYPES, ENNEAGRAM_LABELS, WINGS_OF, BIG_FIVE_KEYS, MARKER_KEYS,
  bandOf,
} from './psychologySchema.js'

// ── Per-type base values ─────────────────────────────────────────────────
// O=openness, C=conscientiousness, E=extraversion, A=agreeableness, N=neuroticism
// Markers: narcissism, machiavellianism, callousness, vengefulness
// Attachment is the typical style; health level can shift it (handled below).

const TYPE_TABLE = Object.freeze({
  1: { // Reformer
    bigFive: { openness: 0.50, conscientiousness: 0.85, extraversion: 0.40, agreeableness: 0.50, neuroticism: 0.60 },
    attachment: 'secure',         // shifts to 'anxious' under stress
    attachmentUnhealthy: 'anxious',
    markers: { narcissism: 0.15, machiavellianism: 0.15, callousness: 0.10, vengefulness: 0.20 },
  },
  2: { // Helper
    bigFive: { openness: 0.50, conscientiousness: 0.60, extraversion: 0.75, agreeableness: 0.85, neuroticism: 0.55 },
    attachment: 'anxious',
    attachmentUnhealthy: 'anxious',
    markers: { narcissism: 0.20, machiavellianism: 0.20, callousness: 0.05, vengefulness: 0.15 },
  },
  3: { // Achiever
    bigFive: { openness: 0.55, conscientiousness: 0.80, extraversion: 0.80, agreeableness: 0.40, neuroticism: 0.45 },
    attachment: 'avoidant',
    attachmentUnhealthy: 'avoidant',
    markers: { narcissism: 0.40, machiavellianism: 0.35, callousness: 0.20, vengefulness: 0.15 },
  },
  4: { // Individualist
    bigFive: { openness: 0.80, conscientiousness: 0.45, extraversion: 0.35, agreeableness: 0.50, neuroticism: 0.80 },
    attachment: 'anxious',
    attachmentUnhealthy: 'fearful',
    markers: { narcissism: 0.20, machiavellianism: 0.15, callousness: 0.10, vengefulness: 0.20 },
  },
  5: { // Investigator
    bigFive: { openness: 0.85, conscientiousness: 0.70, extraversion: 0.25, agreeableness: 0.40, neuroticism: 0.55 },
    attachment: 'avoidant',
    attachmentUnhealthy: 'avoidant',
    markers: { narcissism: 0.20, machiavellianism: 0.25, callousness: 0.25, vengefulness: 0.15 },
  },
  6: { // Loyalist
    bigFive: { openness: 0.45, conscientiousness: 0.75, extraversion: 0.45, agreeableness: 0.60, neuroticism: 0.75 },
    attachment: 'anxious',
    attachmentUnhealthy: 'fearful',
    markers: { narcissism: 0.10, machiavellianism: 0.20, callousness: 0.10, vengefulness: 0.25 },
  },
  7: { // Enthusiast
    bigFive: { openness: 0.80, conscientiousness: 0.40, extraversion: 0.85, agreeableness: 0.55, neuroticism: 0.40 },
    attachment: 'avoidant',
    attachmentUnhealthy: 'avoidant',
    markers: { narcissism: 0.25, machiavellianism: 0.25, callousness: 0.20, vengefulness: 0.10 },
  },
  8: { // Challenger
    bigFive: { openness: 0.55, conscientiousness: 0.75, extraversion: 0.80, agreeableness: 0.30, neuroticism: 0.35 },
    attachment: 'avoidant',
    attachmentUnhealthy: 'avoidant',
    markers: { narcissism: 0.50, machiavellianism: 0.50, callousness: 0.40, vengefulness: 0.50 },
  },
  9: { // Peacemaker
    bigFive: { openness: 0.55, conscientiousness: 0.50, extraversion: 0.40, agreeableness: 0.80, neuroticism: 0.40 },
    attachment: 'secure',
    attachmentUnhealthy: 'avoidant',
    markers: { narcissism: 0.05, machiavellianism: 0.10, callousness: 0.10, vengefulness: 0.10 },
  },
})

// ── Wing nudge ──────────────────────────────────────────────────────────
// A wing nudges the core type's values ~15% toward the wing type's values.
const WING_WEIGHT = 0.15
function applyWing(coreType, wing) {
  const core = TYPE_TABLE[coreType]
  if (!wing || !TYPE_TABLE[wing]) return core
  const wt = TYPE_TABLE[wing]
  const blend = (a, b) => a * (1 - WING_WEIGHT) + b * WING_WEIGHT
  return {
    bigFive: Object.fromEntries(BIG_FIVE_KEYS.map(k => [k, blend(core.bigFive[k], wt.bigFive[k])])),
    attachment: core.attachment,            // wings don't change attachment
    attachmentUnhealthy: core.attachmentUnhealthy,
    markers: Object.fromEntries(MARKER_KEYS.map(k => [k, blend(core.markers[k], wt.markers[k])])),
  }
}

// ── Health-level modulation ─────────────────────────────────────────────
// Healthy (1-3):   markers ×0.5, neuroticism −0.15, agreeableness +0.10
// Average (4-6):   base values, no change
// Unhealthy (7-9): markers ×1.8, neuroticism +0.20, agreeableness −0.15
//                  attachment may shift to the type's unhealthy variant
const clamp01 = (v) => Math.min(1, Math.max(0, v))

function applyHealthLevel(profile, healthLevel) {
  const band = bandOf(healthLevel)
  let bigFive = { ...profile.bigFive }
  let markers = { ...profile.markers }
  let attachment = profile.attachment

  if (band === 'healthy') {
    bigFive.neuroticism    = clamp01(bigFive.neuroticism    - 0.15)
    bigFive.agreeableness  = clamp01(bigFive.agreeableness  + 0.10)
    markers = Object.fromEntries(MARKER_KEYS.map(k => [k, clamp01(markers[k] * 0.5)]))
  } else if (band === 'unhealthy') {
    bigFive.neuroticism    = clamp01(bigFive.neuroticism    + 0.20)
    bigFive.agreeableness  = clamp01(bigFive.agreeableness  - 0.15)
    markers = Object.fromEntries(MARKER_KEYS.map(k => [k, clamp01(markers[k] * 1.8)]))
    attachment = profile.attachmentUnhealthy || attachment
  }
  return { bigFive, attachment, markers }
}

// ── Public — derive a profile from Enneagram type + wing + health ──────
// Returns { bigFive, attachment, markers }. The caller composes the full
// profile (adding source/reasoning/etc).
export function mapEnneagramToProfile({ type, wing, healthLevel }) {
  if (!ENNEAGRAM_TYPES.includes(Number(type))) {
    throw new Error(`enneagramMapper: invalid type ${type}`)
  }
  const t = Number(type)
  const w = ENNEAGRAM_TYPES.includes(Number(wing)) ? Number(wing) : null
  const h = Math.min(9, Math.max(1, Math.round(Number(healthLevel) || 5)))

  const winged   = applyWing(t, w)
  const modulated = applyHealthLevel(winged, h)
  return {
    bigFive: Object.fromEntries(BIG_FIVE_KEYS.map(k => [k, clamp01(modulated.bigFive[k])])),
    attachment: modulated.attachment,
    markers: Object.fromEntries(MARKER_KEYS.map(k => [k, clamp01(modulated.markers[k])])),
  }
}

// ── Public — human-readable summary for UI + LLM prompts ───────────────
export function describeProfile(profile) {
  if (!profile || !profile.enneagram?.type) {
    return 'No psychological profile assigned.'
  }
  const t = profile.enneagram.type
  const w = profile.enneagram.wing
  const h = profile.enneagram.healthLevel ?? 5
  const band = bandOf(h)
  const label = ENNEAGRAM_LABELS[t] || `Type ${t}`

  const bf = profile.bigFive || {}
  const mk = profile.markers || {}
  const traitLabels = []
  if (bf.openness >= 0.7)       traitLabels.push('imaginative')
  if (bf.openness <= 0.3)       traitLabels.push('conventional')
  if (bf.conscientiousness >= 0.7) traitLabels.push('disciplined')
  if (bf.conscientiousness <= 0.3) traitLabels.push('careless')
  if (bf.extraversion >= 0.7)   traitLabels.push('outgoing')
  if (bf.extraversion <= 0.3)   traitLabels.push('reserved')
  if (bf.agreeableness >= 0.7)  traitLabels.push('cooperative')
  if (bf.agreeableness <= 0.3)  traitLabels.push('combative')
  if (bf.neuroticism >= 0.7)    traitLabels.push('emotionally volatile')
  if (bf.neuroticism <= 0.3)    traitLabels.push('emotionally even')

  const markerLabels = []
  if (mk.narcissism >= 0.5)        markerLabels.push('grandiose')
  if (mk.machiavellianism >= 0.5)  markerLabels.push('manipulative')
  if (mk.callousness >= 0.5)       markerLabels.push('callous')
  if (mk.vengefulness >= 0.5)      markerLabels.push('vengeful')

  const wingTag = w ? `${t}w${w}` : `${t}`
  const headline = `${label} (${wingTag}, ${band} · level ${h})`
  const attach = `attachment: ${profile.attachment || 'secure'}`
  const traits = traitLabels.length ? `traits: ${traitLabels.join(', ')}` : 'traits: balanced'
  const marks  = markerLabels.length ? `markers: ${markerLabels.join(', ')}` : 'markers: low'

  return `${headline}; ${attach}; ${traits}; ${marks}.`
}

// ── Convenience — return the headline label only ──────────────────────
// e.g. "Type 8w7 — The Challenger, average-unhealthy"
export function enneagramHeadline(profile) {
  if (!profile?.enneagram?.type) return 'Unassigned'
  const t = profile.enneagram.type
  const w = profile.enneagram.wing
  const h = profile.enneagram.healthLevel ?? 5
  const tag = w ? `${t}w${w}` : `${t}`
  const band = bandOf(h)
  return `Type ${tag} — ${ENNEAGRAM_LABELS[t] || `Type ${t}`}, ${band} (level ${h})`
}
