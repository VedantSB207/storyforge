// Phase 6/6d — Promotion Candidates
//
// Find procedural NPCs whose action patterns suggest they earned narrative
// significance during the simulation. Two passes:
//   1. Heuristic scores each procedural agent on:
//      * Cooperation/conflict events with bound chars
//      * Number of bound chars they have a bond with
//      * Distinct categories of dramatic actions they participated in
//      * Witness role in cascade events
//   2. One Sonnet call frames the top 3-5 into recommendations the writer
//      can act on, with reasoning that names the NPC + the bound chars
//      they intersected with.
//
// Cost target: ~$0.02 per sim.

import { callClaude } from '../../../api.js'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 800
const TEMPERATURE = 0.5

// ── Heuristic scoring ───────────────────────────────────────────────────
export function scoreProceduralAgents({ events = [], agents = [] }) {
  const proceduralAgents = agents.filter(a => a?.source !== 'bound')
  const boundIds = new Set(agents.filter(a => a?.source === 'bound').map(a => a.id))
  const boundNameById = Object.fromEntries(agents.filter(a => a?.source === 'bound').map(a => [a.id, a.name]))

  // Tally per-agent stats
  const stats = new Map()
  for (const a of proceduralAgents) {
    stats.set(a.id, {
      id: a.id,
      name: a.name,
      genreTag: a.genreTag,
      region: a.region,
      alive: a.alive,
      coopWithBound:    0,
      conflictWithBound: 0,
      betrayalWithBound: 0,
      dramaticActions:   0,
      witnessCount:      0,
      boundConnections:  new Set(),
      categories:        new Set(),
      score: 0,
    })
  }

  const dramaticCats = new Set(['cooperation', 'conflict', 'betrayal', 'travel'])
  for (const ev of events) {
    const actor = stats.get(ev.agentId)
    if (actor) {
      if (dramaticCats.has(ev.category)) {
        actor.dramaticActions++
        actor.categories.add(ev.category)
      }
      if (ev.targetId && boundIds.has(ev.targetId)) {
        actor.boundConnections.add(ev.targetId)
        if (ev.category === 'cooperation')  actor.coopWithBound++
        if (ev.category === 'conflict')     actor.conflictWithBound++
        if (ev.category === 'betrayal')     actor.betrayalWithBound++
      }
    }
    // Reverse direction — bound actor targeting NPC
    const target = stats.get(ev.targetId)
    if (target && boundIds.has(ev.agentId)) {
      target.boundConnections.add(ev.agentId)
      if (ev.category === 'cooperation')  target.coopWithBound++
      if (ev.category === 'conflict')     target.conflictWithBound++
      if (ev.category === 'betrayal')     target.betrayalWithBound++
    }
  }

  // Also examine knownFacts for cross-agent intersections
  for (const a of proceduralAgents) {
    const s = stats.get(a.id)
    if (!s) continue
    for (const k of (a.knownFacts || [])) {
      if (k.sourceAgentId && boundIds.has(k.sourceAgentId)) {
        s.witnessCount++
      }
    }
    // Bonds with bound chars contribute too
    for (const otherId of Object.keys(a.bonds || {})) {
      if (boundIds.has(otherId)) s.boundConnections.add(otherId)
    }
  }

  // Score formula — weight cross-bound interactions highest, distinct
  // category breadth second, witness count modest.
  const scored = []
  for (const s of stats.values()) {
    s.score =
      s.coopWithBound     * 4 +
      s.conflictWithBound * 5 +
      s.betrayalWithBound * 7 +
      s.boundConnections.size * 3 +
      s.categories.size       * 2 +
      Math.min(s.witnessCount, 5) * 1 +
      Math.min(s.dramaticActions, 10) * 0.5
    if (s.score > 0) {
      scored.push({
        ...s,
        boundConnections: [...s.boundConnections].map(id => boundNameById[id] || id),
        categories: [...s.categories],
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 12)   // shortlist for the LLM
}

// ── LLM framing pass ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are reviewing a simulation for a fiction writer. Below is a shortlist of procedural background characters who earned outsized roles during the run, ranked by a mechanical score. Your job is to recommend 3–5 of them for promotion to named Bible characters, with reasoning the writer can act on.

For each recommendation:
- Name the NPC exactly as listed.
- Name the bound characters they intersected with.
- Cite specific behaviour (cooperated repeatedly, betrayed, witnessed cascades).
- Keep reasoning to 1–3 sentences — the writer wants signal, not narrative.

If fewer than 3 candidates have meaningful signals, return fewer (or none) — better honest than padded.

Return ONLY a JSON object:

{
  "candidates": [
    { "npcName": "<exact name>", "score": <number>, "reason": "<1-3 sentence rationale>", "boundIntersections": ["<bound char name>", ...] }
  ]
}`

function buildUserContent({ shortlist, agents, events, roundCount }) {
  const lines = []
  lines.push(`# Simulation context`)
  lines.push(`Span: ${roundCount} rounds, ${events.length} events`)
  lines.push(`Bound cast: ${agents.filter(a => a.source === 'bound').map(a => a.name).join(', ')}`)
  lines.push('')
  lines.push(`# Shortlisted procedural NPCs (top ${shortlist.length} by significance score)`)
  for (const s of shortlist) {
    lines.push(`- ${s.name} (${s.genreTag || 'unknown'}, region ${s.region || 'unknown'}, alive=${s.alive})`)
    lines.push(`    score: ${s.score.toFixed(1)} | cooperated with bound ${s.coopWithBound}× | conflict ${s.conflictWithBound}× | betrayal ${s.betrayalWithBound}× | witnessed bound ${s.witnessCount}× | dramatic actions ${s.dramaticActions}`)
    lines.push(`    intersections with bound chars: ${s.boundConnections.length > 0 ? s.boundConnections.join(', ') : '(none)'}`)
    lines.push(`    categories: ${s.categories.length > 0 ? s.categories.join(', ') : '(none)'}`)
  }
  return lines.join('\n')
}

export async function findPromotionCandidates({ events, agents, roundCount }) {
  const shortlist = scoreProceduralAgents({ events, agents })
  if (shortlist.length === 0) {
    return { shortlist: [], candidates: [], usage: null, cost: 0 }
  }

  const userContent = buildUserContent({ shortlist, agents, events, roundCount })
  // callClaude internally enforces 60s timeout via Electron stub.
  let res
  try {
    res = await callClaude({
      model:       MODEL,
      max_tokens:  MAX_TOKENS,
      temperature: TEMPERATURE,
      system:      SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    return { shortlist, candidates: [], error: err.message || String(err), usage: null, cost: 0 }
  }
  if (res?.error) return { shortlist, candidates: [], error: res.message || 'api_error', usage: null, cost: 0 }

  const raw = res?.content?.[0]?.text || ''
  const m = raw.replace(/```(?:json)?\s*|\s*```/g, '').match(/\{[\s\S]*\}/)
  let parsed = { candidates: [] }
  if (m) {
    try { parsed = JSON.parse(m[0]) }
    catch { parsed = { candidates: [] } }
  }
  const usage = res?.usage || null
  const cost = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0
  return {
    shortlist,
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 7) : [],
    usage, cost,
  }
}
