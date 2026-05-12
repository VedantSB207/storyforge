// Phase 2.5 — narrative summary
// One Claude call after the deterministic round loop completes. Reads the
// event log as story material, returns prose for the writer instead of
// agent-state telemetry.

import { callClaude } from '../../api.js'
import { NARRATIVE_MODEL, NARRATIVE_MAX_TOKENS } from './deepSimSchema.js'

const SYSTEM_PROMPT = `You are writing a brief narrative chronicle of a simulation run for a fiction writer. The writer built this world; you are showing them what happened in it.

Read the events as story material, not status updates. Name characters who appear, especially the Story Bible characters by their actual names. Describe events in narrative prose. Documentary tone, like a chronicler observing — not breathless, not over-dramatic. 2 to 4 paragraphs.

Different characters witnessed different things or heard distorted versions. Use this in your chronicle — when you mention a major event, sometimes name who saw it firsthand and who heard rumours of it. The asymmetry is part of the story; what someone *thinks* happened is often more revealing than what actually happened. Honor those perspective gaps when they appear in the source material.

Agents took actions during this simulation — they ate, rested, traveled, formed bonds, fought, betrayed, allied. Some characters formed deep relationships; some broke them. Use these dynamics in your chronicle. When a bound character had significant interactions, name the other party. When betrayals or alliances happened among bound characters, lean into them — those are the dramatic spine of what unfolded.

Be honest if the simulation was uneventful. If little happened, lean into the existential quiet — say so as story rather than padding. A short, true chronicle is better than a long, padded one.

Some scenes have actual dialogue between characters captured below. When you describe these moments in the chronicle, you may quote a line if it serves the story — but don't quote at length, and don't quote every dialogue. Pick the lines that ring most true to the arc.

Do NOT use technical terms. No 'agent', 'round', 'tier', 'NPC', 'simulation', 'cast', 'census', 'mortality', 'depletion', 'state', 'propagation', 'hop', 'bond intensity'. Use story language: characters live, age, hunger, fear, die. Time passes. Seasons turn. Word travels — accurately, or not. Friendships form. Trust breaks.

Return ONLY a JSON object, no preamble or trailing text:

{
  "headline": "one-line summary, 8-12 words",
  "narrative": "the chronicle, 2-4 paragraphs of flowing prose, separated by \\n\\n",
  "notableEvents": ["3-5 story-language bullet points of moments worth flagging"]
}`

// Build the user payload — keeps token use bounded even for huge runs
function buildUserContent({ project, taxonomy, chars, summary, events, roundCount, timeUnit, censusStats, agents = [], butterflyStats = null, dialogues = [] }) {
  const parts = []

  parts.push(`# Project\nTitle: ${project?.title || 'Untitled'}${project?.genre ? ` (${project.genre})` : ''}`)

  if (chars && chars.length > 0) {
    parts.push('# Story Bible Characters (named, important)')
    for (const c of chars) {
      const bits = [`- ${c.name || 'Unnamed'}`]
      if (c.species)        bits.push(`species: ${c.species}`)
      if (c.role)           bits.push(`role: ${c.role}`)
      if (c.traits)         bits.push(`traits: ${c.traits}`)
      if (c.stakes)         bits.push(`what they stand to lose: ${c.stakes}`)
      parts.push(bits.join(' · '))
    }
  }

  if (taxonomy?.genres?.length) {
    parts.push('# World Taxonomy (the kinds of beings who live in this world)')
    for (const g of taxonomy.genres) {
      const kindNames = g.kinds.filter(k => k.included !== false).map(k => k.name).join(', ')
      parts.push(`- ${g.name} (${Math.round(g.weight * 100)}% of the world): ${kindNames}`)
    }
  }

  // Time horizon
  parts.push(`# Time elapsed in story\n${roundCount} ${timeUnit}-segments — roughly ${approximateHorizon(roundCount, timeUnit)}.`)

  // Final state
  parts.push(`# Final state of the world
- Living: ${summary.alive} of ${summary.total}
- Died during this stretch: ${summary.dead}
- Average age at end: ${summary.avgAge.toFixed(1)} years
- Average needs (0-1, lower = more desperate): physiological ${summary.avgNeeds.physiological.toFixed(2)}, safety ${summary.avgNeeds.safety.toFixed(2)}, belonging ${summary.avgNeeds.belonging.toFixed(2)}, esteem ${summary.avgNeeds.esteem.toFixed(2)}, purpose ${summary.avgNeeds.purpose.toFixed(2)}
${censusStats ? `- Active cast: ${censusStats.activeCastCount} (${censusStats.boundCount} named, ${censusStats.activeCastCount - censusStats.boundCount} background)` : ''}`)

  // Event log digest — keep it bounded
  parts.push('# Events that occurred (raw log, your raw material)')
  parts.push(digestEvents(events))

  // Phase 3 — multi-perspective Knowledge sample for bound characters
  const boundAgents = agents.filter(a => a?.source === 'bound' && Array.isArray(a.knownFacts) && a.knownFacts.length > 0)
  if (boundAgents.length > 0) {
    parts.push('# What the named characters know (multi-perspective sample)')
    const lines = []
    for (const a of boundAgents.slice(0, 5)) {
      const sample = [...a.knownFacts]
        .sort((x, y) => (y.confidence || 0) - (x.confidence || 0))
        .slice(0, 4)
      const knowledgeLines = sample.map(k => {
        const sourceTag = k.source === 'firsthand'
          ? 'witnessed firsthand'
          : `heard from ${k.source}, ${k.hops} hop${k.hops === 1 ? '' : 's'} away, confidence ${k.confidence.toFixed(2)}`
        return `    - "${k.content}" (${sourceTag})`
      }).join('\n')
      lines.push(`  ${a.name}:\n${knowledgeLines}`)
    }
    parts.push(lines.join('\n\n'))
  }

  if (butterflyStats) {
    parts.push(`# Information graph
${butterflyStats.eventCount} origin events propagated through ${butterflyStats.knowledgeCount} pieces of knowledge across ${butterflyStats.edgeCount} hops.`)
  }

  // Phase 4a — top dramatic events + bond summaries for bound chars
  const SIGNIFICANCE_WEIGHT = {
    betrayal:      10,
    death:          8,
    conflict:       6,
    cooperation:    3,
    travel:         2,
    need_critical:  2,
    eat:            0,
    rest:           0,
    observe:        0,
    aging:          0,
  }
  const topSignificant = (events || [])
    .map(e => ({ e, w: SIGNIFICANCE_WEIGHT[e.category] ?? 1 }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 8)
  if (topSignificant.length > 0) {
    parts.push('# Top significant events (use these as your dramatic spine)')
    parts.push(topSignificant.map(({ e }) => `- round ${e.round}: ${e.content}`).join('\n'))
  }

  // Bond summary for bound chars — who bonded with whom and how
  const boundBondLines = []
  for (const a of (agents || []).filter(a => a?.source === 'bound')) {
    const top = Object.values(a.bonds || {}).sort((x, y) => y.intensity - x.intensity).slice(0, 3)
    if (top.length === 0) continue
    const lines = top.map(b => {
      const o = (agents || []).find(x => x.id === b.otherId)
      const name = o?.name || b.otherId
      return `    - ${name}: ${b.type} (intensity ${(b.intensity ?? 0).toFixed(2)}, trust ${(b.trust ?? 0).toFixed(2)})`
    }).join('\n')
    boundBondLines.push(`  ${a.name} formed bonds with:\n${lines}`)
  }
  if (boundBondLines.length > 0) {
    parts.push('# Bonds among bound characters at end of simulation')
    parts.push(boundBondLines.join('\n\n'))
  }

  // Phase 4b/3 — dialogue scenes for the chronicler to draw from
  if (dialogues && dialogues.length > 0) {
    const topDialogues = dialogues.slice(0, 5)
    parts.push('# Dialogue scenes from key moments (you may quote sparingly)')
    for (const d of topDialogues) {
      const names = d.participants.map(p => p.name).join(' & ')
      parts.push(`## Round ${d.round} — ${names} — ${d.eventCategory}`)
      parts.push(d.lines.map(l => `${l.speaker}: "${l.line}"`).join('\n'))
    }
  }

  // Action chains: cooperation/conflict/betrayal pairs in close rounds
  const dramaticActions = (events || []).filter(e =>
    e.category === 'betrayal' || e.category === 'conflict' || e.category === 'cooperation'
  )
  if (dramaticActions.length > 0) {
    const chains = []
    for (const e of dramaticActions.slice(0, 30)) {
      // Did the target do something significant within 3 rounds after?
      const followups = dramaticActions.filter(f =>
        f.agentId === e.targetId && f.round > e.round && f.round <= e.round + 3
      ).slice(0, 1)
      if (followups.length > 0) {
        chains.push(`- round ${e.round}: ${e.content} → round ${followups[0].round}: ${followups[0].content}`)
      }
      if (chains.length >= 3) break
    }
    if (chains.length > 0) {
      parts.push('# Top dramatic action chains (causation, A → B)')
      parts.push(chains.join('\n'))
    }
  }

  return parts.join('\n\n')
}

// Pick the most narrative-relevant events without dumping 10k log lines.
// Strategy: all death events (always meaningful), all events involving named
// (bound) Bible characters, plus a sample of need_critical and aging events.
function digestEvents(events, charNames = []) {
  if (!events || events.length === 0) return '(No events fired during this stretch.)'

  const deaths        = events.filter(e => e.category === 'death')
  const needCriticals = events.filter(e => e.category === 'need_critical')
  const aging         = events.filter(e => e.category === 'aging')

  // Cap to keep within token budget
  const MAX_DEATH      = 40
  const MAX_NEED       = 30
  const MAX_AGING      = 20

  const lines = []
  lines.push(`Total events: ${events.length} (${deaths.length} deaths, ${needCriticals.length} need-critical moments, ${aging.length} aging milestones).`)
  lines.push('')

  if (deaths.length > 0) {
    lines.push('## Deaths')
    for (const e of deaths.slice(0, MAX_DEATH)) {
      lines.push(`- round ${e.round}: ${e.content}`)
    }
    if (deaths.length > MAX_DEATH) lines.push(`- ... and ${deaths.length - MAX_DEATH} more deaths`)
    lines.push('')
  }

  if (aging.length > 0) {
    lines.push('## Aging milestones')
    // First few + last few — gives a sense of the timeline
    const sample = aging.length <= MAX_AGING
      ? aging
      : [...aging.slice(0, MAX_AGING / 2), ...aging.slice(-MAX_AGING / 2)]
    for (const e of sample) {
      lines.push(`- round ${e.round}: ${e.content}`)
    }
    if (aging.length > MAX_AGING) lines.push(`- ... ${aging.length - MAX_AGING} other aging events condensed`)
    lines.push('')
  }

  if (needCriticals.length > 0) {
    lines.push('## Need-critical moments (hunger, danger, isolation, etc.)')
    const sample = needCriticals.length <= MAX_NEED
      ? needCriticals
      : [...needCriticals.slice(0, MAX_NEED / 2), ...needCriticals.slice(-MAX_NEED / 2)]
    for (const e of sample) {
      lines.push(`- round ${e.round}: ${e.content}`)
    }
    if (needCriticals.length > MAX_NEED) lines.push(`- ... ${needCriticals.length - MAX_NEED} other need-critical moments condensed`)
  }

  return lines.join('\n')
}

function approximateHorizon(rounds, unit) {
  const days = rounds * { hour: 1/24, day: 1, week: 7, month: 30, season: 90, year: 365 }[unit]
  if (days < 2)         return `${(days * 24).toFixed(0)} hours`
  if (days < 60)        return `${days.toFixed(0)} days`
  if (days < 365 * 2)   return `${(days / 30).toFixed(1)} months`
  return `${(days / 365).toFixed(1)} years`
}

// Public — generate the narrative summary. Returns { narrative, headline,
// notableEvents, usage } on success. Throws with bound error on failure
// (Phase 1 lesson: never silently swallow).
export async function generateNarrativeSummary({ simulationResult, project, taxonomy, chars, censusStats, roundCount, timeUnit }) {
  const userContent = buildUserContent({
    project,
    taxonomy,
    chars,
    summary: simulationResult.summary,
    events: simulationResult.events,
    roundCount,
    timeUnit,
    censusStats,
    agents: simulationResult.agents,
    butterflyStats: simulationResult.butterflyStats,
    dialogues: simulationResult.dialogues,
  })

  let response
  try {
    response = await callClaude({
      model:      NARRATIVE_MODEL,
      max_tokens: NARRATIVE_MAX_TOKENS,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    throw new Error(`Narrative summary failed: ${err.message || String(err)}`)
  }

  const raw = response?.content?.[0]?.text || ''
  if (!raw) throw new Error('Narrative summary returned empty response.')

  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    // Salvage: if JSON parsing fails, treat the whole response as narrative prose
    return {
      headline:      'Chronicle (narrator format unparsed)',
      narrative:     cleaned,
      notableEvents: [],
      generatedAt:   new Date().toISOString(),
      usage:         response?.usage || null,
      _parseError:   err.message,
    }
  }

  return {
    headline:      parsed.headline || '',
    narrative:     parsed.narrative || '',
    notableEvents: Array.isArray(parsed.notableEvents) ? parsed.notableEvents : [],
    generatedAt:   new Date().toISOString(),
    usage:         response?.usage || null,
  }
}

// Approximate USD cost of one narrative call (Sonnet 4 pricing)
export function estimateNarrativeCostUSD(usage) {
  if (!usage) return null
  return ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
}
