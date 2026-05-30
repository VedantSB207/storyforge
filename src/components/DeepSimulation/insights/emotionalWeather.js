// Phase 6/6d — Emotional Weather (refreshed in Phase 7/7b)
//
// Pure aggregation, no LLM. Walks the event log + per-round emotion
// snapshots (when present) to produce a time-series the chart renders:
//   • stress       — mean stress across living agents per round
//   • contentment  — mean contentment per round
//   • conflict     — count of conflict + betrayal events per round
//   • bondFormation— first-time bonds formed per round
//
// Phase 7/7b: when the runner provides `emotionSnapshots`, stress and
// contentment come directly from those (real per-round measurement). On
// older runs that lack snapshots, we fall back to the Phase 6 interpolation
// (final state + event pulses) and tag the result so the UI can show the
// "interpolated" disclaimer only when it's actually interpolated data.
//
// Output: { perRound: [...], peaks, valleys, summary, dataSource }
//   dataSource: 'snapshots' (real, Phase 7/7b) | 'interpolated' (legacy)

export function computeEmotionalWeather({ events = [], agents = [], roundCount = 0, emotionSnapshots = null }) {
  if (roundCount <= 0) return { perRound: [], peaks: {}, valleys: {}, summary: 'No data.', dataSource: 'snapshots' }

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

  // Phase 7/7b — real per-round emotion when the runner provides snapshots.
  // We pool bound + NPC means weighted by their respective counts so the
  // single "average stress" line reflects the full living population.
  if (Array.isArray(emotionSnapshots) && emotionSnapshots.length > 0) {
    const perRound = []
    const byRound = new Map()
    for (const s of emotionSnapshots) byRound.set(s.round, s)
    for (let r = 1; r <= roundCount; r++) {
      const snap = byRound.get(r)
      let meanStress = 0, meanContent = 0
      let boundCount = 0, boundStress = 0, boundContent = 0
      if (snap) {
        for (const [, e] of Object.entries(snap.bound || {})) {
          boundStress  += e.stress
          boundContent += e.contentment
          boundCount   += 1
        }
        const npc = snap.npc
        const npcN = npc?.count || 0
        const total = boundCount + npcN
        if (total > 0) {
          meanStress  = (boundStress  + (npc?.meanStress      || 0) * npcN) / total
          meanContent = (boundContent + (npc?.meanContentment || 0) * npcN) / total
        }
      }
      perRound.push({
        round: r,
        stress:        +meanStress.toFixed(3),
        contentment:   +meanContent.toFixed(3),
        conflict:      conflictByRound[r] + betrayalByRound[r],
        cooperation:   cooperationByRound[r],
        bondFormation: bondFormationByRound[r],
        deaths:        deathByRound[r],
      })
    }
    const peakStress      = perRound.reduce((p, x) => x.stress > p.stress ? x : p, perRound[0])
    const peakConflict    = perRound.reduce((p, x) => x.conflict > p.conflict ? x : p, perRound[0])
    const peakContentment = perRound.reduce((p, x) => x.contentment > p.contentment ? x : p, perRound[0])
    return {
      perRound,
      peaks: { stress: peakStress, conflict: peakConflict, contentment: peakContentment },
      valleys: {},
      summary: buildSummary(perRound, peakStress, peakConflict, peakContentment),
      dataSource: 'snapshots',
    }
  }

  // ── Legacy path (Phase 6/6d) — final state + event pulses ──────────────
  // Kept so simulations saved before 7b can still render. UI shows the
  // "interpolated from final state" disclaimer only when dataSource is
  // 'interpolated'.
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
    dataSource: 'interpolated',
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
