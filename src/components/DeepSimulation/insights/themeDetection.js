// Phase 6/6d — Theme Detection
//
// One Sonnet call that reads the event log + bond/dialogue/cast summary
// and identifies 3-5 thematic patterns the simulation surfaced. Each
// theme gets a name, a 1-2 sentence description, an evidence list
// referencing actual events, and a rough frequency indicator.
//
// Cost target: ~$0.02 per sim.

import { callClaude } from '../../../api.js'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 600
const TEMPERATURE = 0.6

const SYSTEM_PROMPT = `You are reading a fiction simulation and identifying thematic patterns. Themes are not plot summaries — they are the deeper currents the events expose: "betrayal and trust", "the cost of leadership", "found family", "the weight of memory", "rebellion against fate".

Read the events and bonds below. Identify 3–5 themes that emerge naturally. For each:
- A 2–5 word theme name.
- A 1–2 sentence description that anchors the theme in this simulation's specifics.
- Evidence: 1–3 specific events or characters that exemplify the theme.
- Frequency: one of "dominant", "recurring", or "thread" — how often the theme surfaced.

Be honest. If a theme didn't truly emerge, skip it. Better 3 real themes than 5 padded ones.

IMPORTANT: characters with similar or identical names may be intentionally distinct — writers sometimes use shared names deliberately, and the cast may include multiple kinds (e.g. a vampire dog Nyra and a separate human assassin named Nyra). Do not infer thematic connections from shared names alone; require other evidence (shared scenes, mirrored arcs, explicit reference) before treating a name overlap as meaningful.

Return ONLY a JSON object:

{
  "themes": [
    { "name": "<2-5 word name>", "description": "<1-2 sentences>", "evidence": ["<event or character>"], "frequency": "dominant|recurring|thread" }
  ]
}`

function buildUserContent({ events, agents, dialogues = [], roundCount, timeUnit, chronicle = null }) {
  const lines = []
  lines.push(`# Simulation snapshot`)
  lines.push(`Span: ${roundCount} ${timeUnit}-rounds · ${events.length} events`)
  const bound = agents.filter(a => a.source === 'bound')
  if (bound.length > 0) {
    lines.push(`Named characters: ${bound.map(a => `${a.name} (${a.status || 'alive'})`).join(', ')}`)
  }

  if (chronicle) {
    lines.push('')
    lines.push('# Chronicle (the chronicler\'s framing of the run)')
    lines.push(chronicle.slice(0, 2000))
  }

  // Dramatic events: prioritise death/betrayal/conflict/cooperation
  const weight = { betrayal: 10, death: 8, conflict: 6, cooperation: 4, birth: 3, travel: 1 }
  const top = (events || [])
    .map(e => ({ e, w: weight[e.category] ?? 0 }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 30)
  if (top.length > 0) {
    lines.push('')
    lines.push('# Top dramatic events')
    for (const { e } of top) lines.push(`- r${e.round} [${e.category}] ${e.content}`)
  }

  // Bond final shape per bound char
  const bondLines = []
  for (const a of bound) {
    const top3 = Object.values(a.bonds || {})
      .sort((x, y) => (y.intensity ?? 0) - (x.intensity ?? 0))
      .slice(0, 3)
    if (top3.length === 0) continue
    const txt = top3.map(b => {
      const other = agents.find(x => x.id === b.otherId)
      return `${other?.name || b.otherId}: ${b.type} (intensity ${(b.intensity ?? 0).toFixed(2)}, trust ${(b.trust ?? 0).toFixed(2)})`
    }).join('; ')
    bondLines.push(`- ${a.name} → ${txt}`)
  }
  if (bondLines.length > 0) {
    lines.push('')
    lines.push('# Final bonds among named characters')
    lines.push(bondLines.join('\n'))
  }

  // Dialogue highlights — first line of each dialogue scene
  if (dialogues.length > 0) {
    lines.push('')
    lines.push('# Dialogue highlights')
    for (const d of dialogues.slice(0, 6)) {
      const first = d.lines?.[0]
      if (first) lines.push(`- r${d.round} ${d.eventCategory}: ${first.speaker}: "${first.line}"`)
    }
  }

  return lines.join('\n')
}

export async function detectThemes({ events, agents, dialogues = [], roundCount, timeUnit, chronicle = null }) {
  const userContent = buildUserContent({ events, agents, dialogues, roundCount, timeUnit, chronicle })
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
    return { themes: [], error: err.message || String(err), usage: null, cost: 0 }
  }
  if (res?.error) return { themes: [], error: res.message || 'api_error', usage: null, cost: 0 }

  const raw = res?.content?.[0]?.text || ''
  const m = raw.replace(/```(?:json)?\s*|\s*```/g, '').match(/\{[\s\S]*\}/)
  let parsed = { themes: [] }
  if (m) {
    try { parsed = JSON.parse(m[0]) }
    catch { parsed = { themes: [] } }
  }
  const usage = res?.usage || null
  const cost = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0
  return {
    themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 7) : [],
    usage, cost,
  }
}
