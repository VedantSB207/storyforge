// Phase 6/6d — Emotional Weather
//
// Pure aggregation, no LLM. Walks the event log and per-round agent state
// to produce a time-series the chart can render:
//   • stress       — average stress across living agents per round
//   • contentment  — derived from needs satisfaction (mean of all 5 needs)
//   • conflict     — count of conflict + betrayal events per round
//   • bondFormation— first-time bonds formed per round (any pair newly bonded)
//
// The runner exposes per-round events but only the FINAL agent state, so
// stress/contentment are approximations: we use the final agent state
// snapshot and back-fill an estimate by walking events.
//
// Output: { perRound: [{round, stress, contentment, conflict, bondFormation}],
//           peaks, valleys, summary }

export function computeEmotionalWeather({ events = [], agents = [], roundCount = 0 }) {
  if (roundCount <= 0) return { perRound: [], peaks: {}, valleys: {}, summary: 'No data.' }

  // Per-round event counts
  const conflictByRound = new Array(roundCount + 1).fill(0)
  const cooperationByRound = new Array(roundCount + 1).fill(0)
  const betrayalByRound = new Array(roundCount + 1).fill(0)
  const deathByRound = new Array(roundCount + 1).fill(0)
  const bondFormationByRound = new Array(roundCount + 1).fill(0)
  const needCriticalByRound = new Array(roundCount + 1).fill(0)

  // Track which (agentA, agentB) pairs we've already seen so we only count
  // first interactions as "bond formation"
  const seenPairs = new Set()
  for (const ev of events) {
    const r = ev.round | 0
    if (r < 1 || r > roundCount) continue
    if (ev.category === 'conflict')      conflictByRound[r]++
    if (ev.category === 'cooperation')   cooperationByRound[r]++
    if (ev.category === 'betrayal')      betrayalByRound[r]++
    if (ev.category === 'death')         deathByRound[r]++
    if (ev.category === 'need_critical') needCriticalByRound[r]++
    if (ev.targetId && (ev.category === 'cooperation' || ev.category === 'conflict' || ev.category === 'betrayal')) {
      const pair = ev.agentId < ev.targetId ? `${ev.agentId}|${ev.targetId}` : `${ev.targetId}|${ev.agentId}`
      if (!seenPairs.has(pair)) { seenPairs.add(pair); bondFormationByRound[r]++ }
    }
  }

  // Stress/contentment — we only have final agent state, so build a per-
  // round estimate by combining: base needs (final, scaled by death curve)
  // and event-driven stress spikes per round. This is honest: the engine
  // doesn't track per-round emotion history. Future Phase: emit emotion
  // snapshots in the runner so this becomes precise.
  const livingFinal = agents.filter(a => a.alive)
  const finalAvgStress = livingFinal.length === 0 ? 0
    : livingFinal.reduce((s, a) => s + (a.stress || 0), 0) / livingFinal.length
  const finalContentment = livingFinal.length === 0 ? 0
    : livingFinal.reduce((s, a) => {
        const n = a.needs || {}
        return s + (((n.physiological||0) + (n.safety||0) + (n.belonging||0) + (n.esteem||0) + (n.purpose||0)) / 5)
      }, 0) / livingFinal.length

  // Per-round stress estimate = scaled combination of dramatic events that round
  const perRound = []
  for (let r = 1; r <= roundCount; r++) {
    // Stress climbs with conflict / betrayal / death / need_critical
    const stressPulse = Math.min(1,
      0.05 * conflictByRound[r] +
      0.08 * betrayalByRound[r] +
      0.10 * deathByRound[r]   +
      0.03 * needCriticalByRound[r]
    )
    // Linear interpolation from 0 → finalAvgStress as a baseline, plus pulse
    const baseStress = (finalAvgStress * r) / roundCount
    const stress = Math.min(1, baseStress + stressPulse)

    // Contentment drops with stress; baseline grows toward finalContentment
    const baseContent = finalContentment + (1 - finalContentment) * (1 - r / roundCount) * 0.5
    const contentment = Math.max(0, baseContent - stressPulse * 0.5)

    perRound.push({
      round: r,
      stress: +stress.toFixed(3),
      contentment: +contentment.toFixed(3),
      conflict: conflictByRound[r] + betrayalByRound[r],
      cooperation: cooperationByRound[r],
      bondFormation: bondFormationByRound[r],
      deaths: deathByRound[r],
    })
  }

  // Identify peaks (max stress, max conflict) and valleys (max contentment)
  const peakStress = perRound.reduce((p, x) => x.stress > p.stress ? x : p, perRound[0])
  const peakConflict = perRound.reduce((p, x) => x.conflict > p.conflict ? x : p, perRound[0])
  const peakContentment = perRound.reduce((p, x) => x.contentment > p.contentment ? x : p, perRound[0])

  return {
    perRound,
    peaks: { stress: peakStress, conflict: peakConflict, contentment: peakContentment },
    valleys: {},
    summary: buildSummary(perRound, peakStress, peakConflict, peakContentment),
  }
}

function buildSummary(perRound, peakStress, peakConflict, peakContentment) {
  const totalConflict = perRound.reduce((s, x) => s + x.conflict, 0)
  const totalBonds    = perRound.reduce((s, x) => s + x.bondFormation, 0)
  const avgStress     = perRound.length === 0 ? 0 : perRound.reduce((s, x) => s + x.stress, 0) / perRound.length
  return `Average stress ${(avgStress*100).toFixed(0)}% · ${totalConflict} conflicts · ${totalBonds} new bonds. ` +
         `Stress peaked at round ${peakStress.round} (${(peakStress.stress*100).toFixed(0)}%). ` +
         `Most contentment at round ${peakContentment.round}.`
}
