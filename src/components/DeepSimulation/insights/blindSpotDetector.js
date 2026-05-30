// Phase 6/6d — Blind Spot Detector
//
// Two-pass detection of under-served corners of the simulation:
//   1. Heuristic pass over the event log + agent state catches the
//      mechanical signals — regions that barely saw events, bound chars
//      who never made a Tier 2 decision, genres with no representatives,
//      time-stretches where a character disappears, etc.
//   2. One Sonnet call frames the heuristic findings as observations a
//      writer can act on, naming characters and regions explicitly.
//
// Cost target: ~$0.02 per sim.

import { callClaude } from '../../../api.js'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 800
const TEMPERATURE = 0.4

// ── Heuristic pass ──────────────────────────────────────────────────────
// Pure data → structured findings. Always runs; no LLM dependency.
export function findBlindSpotsHeuristic({ events = [], agents = [], roundCount = 0, censusStats = null, taxonomy = null }) {
  const findings = []

  // 1. Under-served regions
  const regionCounts = {}
  for (const ev of events) {
    const a = agents.find(x => x.id === ev.agentId)
    const region = a?.region || 'unknown'
    regionCounts[region] = (regionCounts[region] || 0) + 1
  }
  const totalEvents = events.length || 1
  for (const [region, count] of Object.entries(regionCounts)) {
    const share = count / totalEvents
    if (share < 0.05 && region !== 'unknown') {
      findings.push({
        category: 'region',
        signal: 'under-served',
        region,
        eventCount: count,
        share: +(share * 100).toFixed(1),
      })
    }
  }
  // Regions with zero events
  const knownRegions = ['central', 'north', 'south', 'east', 'west', 'wilderness']
  for (const r of knownRegions) {
    if (!regionCounts[r]) {
      findings.push({ category: 'region', signal: 'silent', region: r, eventCount: 0, share: 0 })
    }
  }

  // 2. Bound chars with no Tier 2 activity
  // Tier-2 activity proxy: an action event categorised as cooperation,
  // conflict, betrayal, or travel where the agent was the actor.
  const dramaticCats = new Set(['cooperation', 'conflict', 'betrayal', 'travel'])
  const dramaticByAgentId = {}
  for (const ev of events) {
    if (dramaticCats.has(ev.category)) {
      dramaticByAgentId[ev.agentId] = (dramaticByAgentId[ev.agentId] || 0) + 1
    }
  }
  const boundAgents = agents.filter(a => a?.source === 'bound')
  for (const a of boundAgents) {
    const dramaticCount = dramaticByAgentId[a.id] || 0
    if (a.alive && dramaticCount === 0) {
      findings.push({ category: 'character', signal: 'reactive_only', name: a.name, dramaticCount: 0, status: a.status })
    } else if (a.alive && dramaticCount < 2) {
      findings.push({ category: 'character', signal: 'low_agency', name: a.name, dramaticCount, status: a.status })
    }
    if (a.status === 'missing' || a.status === 'exiled') {
      findings.push({ category: 'character', signal: 'offstage_throughout', name: a.name, status: a.status })
    }
  }

  // 3. Genres with no representatives in the active cast
  if (taxonomy?.genres) {
    const presentGenres = new Set(agents.map(a => String(a.genreTag || '').split(':')[0]).filter(Boolean))
    for (const g of taxonomy.genres) {
      if (!presentGenres.has(g.id) && g.weight > 0.05) {
        findings.push({ category: 'taxonomy', signal: 'unrepresented_genre', genre: g.name, weight: g.weight })
      }
    }
  }

  // 4. Time stretches of silence (3+ consecutive rounds with < 1% of avg events)
  if (roundCount > 0) {
    const eventsPerRound = new Array(roundCount + 1).fill(0)
    for (const ev of events) eventsPerRound[ev.round] = (eventsPerRound[ev.round] || 0) + 1
    const avg = totalEvents / roundCount
    let runStart = null
    for (let r = 1; r <= roundCount; r++) {
      const isQuiet = eventsPerRound[r] < avg * 0.3
      if (isQuiet && runStart === null) runStart = r
      if (!isQuiet && runStart !== null) {
        if (r - runStart >= 3) {
          findings.push({ category: 'pacing', signal: 'quiet_stretch', startRound: runStart, endRound: r - 1, length: r - runStart })
        }
        runStart = null
      }
    }
    if (runStart !== null && roundCount - runStart >= 3) {
      findings.push({ category: 'pacing', signal: 'quiet_stretch', startRound: runStart, endRound: roundCount, length: roundCount - runStart + 1 })
    }
  }

  return findings
}

// ── LLM framing pass ────────────────────────────────────────────────────
// Take the heuristic findings + a thin event summary, ask Sonnet to write
// narrative observations the writer can act on.

const SYSTEM_PROMPT = `You are a story doctor reading the results of a simulation. The structured findings below are mechanical signals — your job is to translate them into writer-facing observations that name specific characters, regions, and beats.

Be honest. If the cast feels lopsided, say so. If the wilderness is silent, say so by name. If a Bible character was reactive throughout, name them.

Each observation should be 1–3 sentences in plain prose. Reference characters and regions explicitly. Do not pad. Skip findings that aren't story-relevant.

Return ONLY a JSON object:

{
  "observations": [
    { "category": "region|character|taxonomy|pacing", "title": "<short noun phrase>", "body": "<1-3 sentence observation>" }
  ]
}`

function buildUserContent({ findings, agents, events, taxonomy, roundCount, timeUnit }) {
  const lines = []
  lines.push(`# Simulation context`)
  lines.push(`Cast: ${agents.length} (${agents.filter(a => a.source === 'bound').length} bound + ${agents.filter(a => a.source !== 'bound').length} procedural)`)
  lines.push(`Span: ${roundCount} ${timeUnit}-rounds`)
  lines.push(`Total events: ${events.length}`)
  if (taxonomy?.genres) lines.push(`Taxonomy: ${taxonomy.genres.map(g => `${g.name} ${Math.round(g.weight*100)}%`).join(' · ')}`)
  lines.push('')
  lines.push('# Heuristic findings (raw signals)')
  for (const f of findings.slice(0, 40)) lines.push(JSON.stringify(f))
  lines.push('')
  lines.push('# Bound characters and their final status')
  for (const a of agents.filter(a => a.source === 'bound')) {
    lines.push(`- ${a.name}: status ${a.status || 'alive'}, region ${a.region || 'unknown'}, alive=${a.alive}`)
  }
  return lines.join('\n')
}

export async function detectBlindSpots({ events, agents, roundCount, timeUnit, censusStats, taxonomy }) {
  const findings = findBlindSpotsHeuristic({ events, agents, roundCount, censusStats, taxonomy })
  if (findings.length === 0) {
    return { findings: [], observations: [{ category: 'general', title: 'No blind spots detected', body: 'The simulation distributed events broadly across regions, characters, and time.' }], usage: null, cost: 0 }
  }

  const userContent = buildUserContent({ findings, agents, events, taxonomy, roundCount, timeUnit })
  // callClaude internally enforces a 60s AbortController timeout via the
  // Electron stub / browser proxy; we don't pass our own signal.
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
    return { findings, observations: [], error: err.message || String(err), usage: null, cost: 0 }
  }
  if (res?.error) {
    return { findings, observations: [], error: res.message || 'api_error', usage: null, cost: 0 }
  }

  const raw = res?.content?.[0]?.text || ''
  const m = raw.replace(/```(?:json)?\s*|\s*```/g, '').match(/\{[\s\S]*\}/)
  let parsed = { observations: [] }
  if (m) {
    try { parsed = JSON.parse(m[0]) }
    catch { parsed = { observations: [{ category: 'general', title: 'Parse failed', body: raw.slice(0, 400) }] } }
  }
  const usage = res?.usage || null
  const cost = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0
  return {
    findings,
    observations: Array.isArray(parsed.observations) ? parsed.observations.slice(0, 12) : [],
    usage, cost,
  }
}
