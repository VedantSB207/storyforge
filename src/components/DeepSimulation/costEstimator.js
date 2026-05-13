// Phase 6/6c — Cost estimator
//
// Projects a low/high USD estimate for a Deep Simulation run BEFORE it
// starts. Used in three places:
//   1. Setup screen — shown below the Run button as "Estimated: $0.45–$0.85"
//   2. Setup screen — warning banner when high-end exceeds $5
//   3. Results header — actual-vs-estimated comparison post-run
//
// Tier projections are anchored on observed Phase 6a-ii data (Jojo, 50 cast
// × 30 weeks): tier1 $0.0855, tier2 $0.1740, dialogue $0.0877, narrative
// $0.026, hydration $0.0587 (one-time), seeding $0.0876. We back these out
// to per-cast / per-round rates so they generalise to other sizes.
//
// Per-call pricing (Claude Sonnet 4 / Haiku 4.5):
//   * Sonnet input  $3 / Mtok, output $15 / Mtok
//   * Haiku  input  $1 / Mtok, output  $5 / Mtok
// Combined with typical token counts this works out to:
//   * Tier 1 call ≈ $0.0001
//   * Tier 2 call ≈ $0.003
//   * Hydration inference ≈ $0.005 per char
//   * Knowledge seeding ≈ $0.011 per char
//   * Dialogue ≈ $0.003 per scene
//   * Narrative ≈ $0.025
//
// Tier-call frequency (decisions per round):
//   * Haiku  ≈ 15% of cast per round (Tier 1)
//   * Sonnet ≈ 5% of cast per round  (Tier 2)
//   * Capped by MAX_TIER1_PER_ROUND/SIM and MAX_TIER2_PER_SIM in deepSimSchema

import { MAX_TIER1_PER_ROUND, MAX_TIER1_PER_SIM, MAX_TIER2_PER_SIM } from './deepSimSchema.js'

const COST_PER_TIER1 = 0.0001
const COST_PER_TIER2 = 0.003
const COST_PER_HYDRATION_CHAR = 0.005
const COST_PER_SEED_CHAR = 0.011
const COST_PER_DIALOGUE = 0.003
const COST_NARRATIVE = 0.025
const COST_COMPARISON = 0.05
const COST_PER_INSIGHT_PANEL = 0.02

// Tier rates calibrated against Phase 6a-ii (50×30, 11 bound) and Phase 6c
// (20×8, 11 bound) test data. Bound chars route to Tier 2 much more often
// than procedural NPCs, so the estimate has two terms: a per-cast baseline
// and a per-bound-char surcharge. The MAX_TIER1/2 caps in deepSimSchema
// then floor the result for huge configs.
const TIER1_RATE_PER_ROUND = 0.02
const TIER2_RATE_PER_ROUND_CAST  = 0.05
const TIER2_RATE_PER_ROUND_BOUND = 0.5
const DIALOGUE_RATE_PER_ROUND = 0.3

// ── Public API ───────────────────────────────────────────────────────────
// Returns { lowEstimate, highEstimate, breakdown, warn }.
// `breakdown` keys: hydration, seeding, tier1, tier2, dialogue, narrative,
//                   insightPanels, comparison.
// `warn` is true when highEstimate > 5.
export function estimateRunCost({
  castSize,
  roundCount,
  boundCharCount = 0,
  hasHydration = true,
  knowledgeSeedingEnabled = true,
  insightPanelsEnabled = false,
  variantCount = 1,
  mode = 'progressive',         // 'progressive' | 'scenario'
}) {
  const N = Math.max(1, castSize | 0)
  const R = Math.max(1, roundCount | 0)
  const V = Math.max(1, variantCount | 0)

  const B = Math.max(0, boundCharCount | 0)

  // Tier 1 (Haiku) — capped per-round and per-sim
  const tier1PerRound = Math.min(MAX_TIER1_PER_ROUND, N * TIER1_RATE_PER_ROUND)
  const tier1Calls = Math.min(MAX_TIER1_PER_SIM, tier1PerRound * R)
  const tier1Cost = tier1Calls * COST_PER_TIER1

  // Tier 2 (Sonnet) — per-round demand is per-cast baseline + per-bound-char
  // surcharge (bound chars are routed to Tier 2 much more often). Capped
  // per-sim at MAX_TIER2_PER_SIM.
  const tier2PerRound = N * TIER2_RATE_PER_ROUND_CAST + B * TIER2_RATE_PER_ROUND_BOUND
  const tier2Calls = Math.min(MAX_TIER2_PER_SIM, tier2PerRound * R)
  const tier2Cost = tier2Calls * COST_PER_TIER2

  // Dialogue — fixed cap of MAX_DIALOGUES_PER_SIM (15) regardless of rounds
  const dialogueCalls = Math.min(15, R * DIALOGUE_RATE_PER_ROUND)
  const dialogueCost = dialogueCalls * COST_PER_DIALOGUE

  // Hydration — one-time per project; only count if not already cached
  const hydrationCost = hasHydration ? 0 : boundCharCount * COST_PER_HYDRATION_CHAR

  // Knowledge seeding — runs every sim when enabled
  const seedingCost = knowledgeSeedingEnabled ? boundCharCount * COST_PER_SEED_CHAR : 0

  // Narrative — one Sonnet call per (variant)
  const narrativeCost = COST_NARRATIVE * V

  // Insight panels (6d — wired now, default off until 6d ships)
  const insightCost = insightPanelsEnabled ? 4 * COST_PER_INSIGHT_PANEL * V : 0

  // Per-run cost (one variant)
  const perRunBase = tier1Cost + tier2Cost + dialogueCost + seedingCost
  const perRunCost = perRunBase + narrativeCost + insightCost / V

  // Total: scenarios multiply by variantCount and add comparison narrative
  let totalLow, totalHigh
  const breakdown = {
    hydration:     hydrationCost,
    seeding:       seedingCost * V,
    tier1:         tier1Cost * V,
    tier2:         tier2Cost * V,
    dialogue:      dialogueCost * V,
    narrative:     narrativeCost,
    insightPanels: insightCost,
    comparison:    mode === 'scenario' ? COST_COMPARISON : 0,
  }
  const totalMid = hydrationCost
    + (perRunBase * V)
    + narrativeCost
    + insightCost
    + (mode === 'scenario' ? COST_COMPARISON : 0)

  // Range: ±30% on the LLM-driven portion; deterministic costs stay fixed
  totalLow  = totalMid * 0.7
  totalHigh = totalMid * 1.3

  return {
    lowEstimate:  +totalLow.toFixed(4),
    highEstimate: +totalHigh.toFixed(4),
    midEstimate:  +totalMid.toFixed(4),
    breakdown,
    warn: totalHigh > 5,
  }
}

// Format a range as a human-readable string for the UI.
// Example: $0.42–$0.78
export function formatEstimateRange(est) {
  if (!est) return ''
  const low = est.lowEstimate.toFixed(2)
  const high = est.highEstimate.toFixed(2)
  return `$${low}–$${high}`
}

// Compare actual cost against estimate for post-run header.
// Returns { status, pct } where status ∈ 'within' | 'under' | 'over'.
export function compareActualToEstimate(actual, estimate) {
  if (!estimate || !Number.isFinite(actual)) return null
  if (actual < estimate.lowEstimate)  return { status: 'under', pct: Math.round((actual / estimate.midEstimate) * 100) }
  if (actual > estimate.highEstimate) return { status: 'over',  pct: Math.round((actual / estimate.midEstimate) * 100) }
  return { status: 'within', pct: Math.round((actual / estimate.midEstimate) * 100) }
}
