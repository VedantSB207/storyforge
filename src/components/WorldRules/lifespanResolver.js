// Phase 6/6a-ii — Lifespan resolver
//
// Resolves the effective life expectancy for any agent (bound or procedural)
// by consulting, in order:
//
//   1. Per-character/kind override in worldRules.lifespanOverrides
//      (key matched case-insensitively against character name, then species,
//      then genreTag tail, then kind id).
//   2. The agent's intrinsic baseline (procedural: kind.typicalLifeExpectancy
//      with optional jitter; bound: default 80 unless overridden).
//   3. worldRules.globalLifespanMultiplier scales the result.
//
// Returns a positive number (years). Falls back to 80 if everything else is
// missing — matches the Phase 1 hard-coded default in AgentFactory.

const DEFAULT_BASELINE = 80

export function resolveLifespan({
  // Identity helpers — pass what's available
  characterName = null,
  species       = null,
  genreTag      = null,
  kindId        = null,
  // Baseline if no override matches
  baseline      = null,
  jitter        = 1.0,       // procedural agents apply jitter from their rng
  // The active worldRules object
  worldRules    = null,
}) {
  const overrides = worldRules?.lifespanOverrides || {}
  const candidates = [
    characterName,
    species,
    // Strip a "genre:" prefix if present (e.g. "humans:peasant" → "peasant")
    genreTag ? String(genreTag).split(':').pop() : null,
    kindId,
  ].filter(Boolean).map(s => String(s).toLowerCase().trim())

  // First matching override wins. Two passes:
  //   1. Exact match on any candidate.
  //   2. Substring match — override key is a substring of any candidate, OR
  //      a candidate is a substring of the override key. Catches "the witch"
  //      vs "The Witch (Nireth)" without the writer having to know the exact
  //      stored character name.
  for (const key of candidates) {
    if (overrides[key] != null && Number.isFinite(Number(overrides[key]))) {
      const overridden = Number(overrides[key])
      const mult = Number.isFinite(worldRules?.globalLifespanMultiplier) ? worldRules.globalLifespanMultiplier : 1.0
      return Math.max(1, overridden * mult)
    }
  }
  for (const overrideKey of Object.keys(overrides)) {
    const ovVal = Number(overrides[overrideKey])
    if (!Number.isFinite(ovVal)) continue
    const ok = String(overrideKey).toLowerCase().trim()
    if (ok.length < 3) continue   // single-letter substrings are too greedy
    for (const cand of candidates) {
      if (cand.includes(ok) || ok.includes(cand)) {
        const mult = Number.isFinite(worldRules?.globalLifespanMultiplier) ? worldRules.globalLifespanMultiplier : 1.0
        return Math.max(1, ovVal * mult)
      }
    }
  }

  // No per-kind override — use baseline (jittered if procedural) × global multiplier
  const fallback = Number.isFinite(baseline) ? baseline : DEFAULT_BASELINE
  const mult     = Number.isFinite(worldRules?.globalLifespanMultiplier) ? worldRules.globalLifespanMultiplier : 1.0
  return Math.max(1, fallback * jitter * mult)
}

// Find ALL applicable override keys for an agent, used by the UI to show
// the writer which overrides matched.
export function debugMatchedOverrideKeys({ characterName, species, genreTag, kindId, worldRules }) {
  const overrides = worldRules?.lifespanOverrides || {}
  const candidates = [
    characterName, species,
    genreTag ? String(genreTag).split(':').pop() : null,
    kindId,
  ].filter(Boolean).map(s => String(s).toLowerCase().trim())
  return candidates.filter(k => overrides[k] != null)
}
