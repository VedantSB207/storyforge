// Phase 6/6e — Per-character narrative arc, on-demand.
//
// One Sonnet call (max 500 tokens) per character per click. Reads the
// character's full timeline + their relationships + their actions and
// returns 2–3 paragraphs of narrative arc — written from the chronicler's
// perspective, focused on one character's journey through the simulation.
//
// Cached per (simId, agentId). The caller (CharacterThreads) decides where
// to stash the cache. We don't persist to disk — too small to bother, and
// regenerating is cheap (~$0.01).
//
// Cost target: ~$0.01 per character per click. Honest range: $0.005–$0.02
// depending on timeline length.

import { callClaude } from '../../../api.js'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 500
const TEMPERATURE = 0.7

const SYSTEM_PROMPT = `You are writing a brief narrative arc for one character from a fiction simulation. The writer built this world; you're showing them how this single character's journey unfolded.

Write 2–3 paragraphs in story prose. Name the character, name the people they interacted with. Honor their actual bonds (kinship, friendship, rivalry, enmity) and how those bonds shifted. Reference the actual events they participated in or witnessed. Do not invent events that didn't happen.

If the character died, frame the arc around the death — what they were reaching for when it ended. If they lived but were offstage (missing, exiled), frame the arc around the absence. If they lived and acted, follow the through-line of their choices.

Be honest. If the character was passive, say so. If they kept finding the same trouble, say so. If their arc didn't really go anywhere, lean into the quiet rather than padding.

No technical terms ('agent', 'round', 'bond intensity', 'cooperation event'). Story language only.

Return ONLY a JSON object:

{
  "arc": "<2-3 paragraph narrative, separated by \\n\\n>",
  "headline": "<one-line arc summary, 6-12 words>"
}`

function buildUserContent({ thread, allAgents = [], dialogues = [] }) {
  const lines = []
  lines.push(`# Character: ${thread.name}`)
  lines.push(`Status at end: ${thread.alive ? `alive, age ${thread.ageEnd.toFixed(1)}` : `died in round ${thread.diedRound ?? '?'} at age ${thread.ageEnd.toFixed(1)}`}`)
  if (thread.regionStart !== thread.regionEnd) {
    lines.push(`Region: started in ${thread.regionStart}, ended in ${thread.regionEnd}`)
  } else {
    lines.push(`Region: ${thread.regionStart} throughout`)
  }
  if (thread.traits.length > 0) lines.push(`Traits: ${thread.traits.join(', ')}`)
  if (thread.backgroundSummary) lines.push(`Background: ${thread.backgroundSummary}`)

  if (thread.bondsSummary.length > 0) {
    lines.push('')
    lines.push('# Final bonds')
    for (const b of thread.bondsSummary) {
      lines.push(`- ${b.otherName}: ${b.type} (intensity ${b.intensity.toFixed(2)}, trust ${b.trust.toFixed(2)})`)
    }
  }

  // Timeline — keep capped at 30 entries; the chronicler doesn't need every aging event
  if (thread.timeline.length > 0) {
    lines.push('')
    lines.push('# Timeline (chronological)')
    const filtered = thread.timeline
      .filter(e => e.category !== 'aging' && e.category !== 'eat' && e.category !== 'rest')
      .slice(0, 30)
    for (const e of filtered) {
      const prefix = e.kind === 'rumour'    ? `[heard from ${e.source}, conf ${e.confidence?.toFixed(2)}] `
                   : e.kind === 'witnessed' ? '[witnessed] '
                   : e.kind === 'bond'      ? `[bond → ${e.toType}] `
                   : e.kind === 'dialogue'  ? '[dialogue] '
                   : ''
      lines.push(`- r${e.round} [${e.category}]: ${prefix}${e.content}`)
    }
  }

  // Dialogues for this character
  const myDialogues = dialogues.filter(d => d.participants?.some(p => p.agentId === thread.agentId))
  if (myDialogues.length > 0) {
    lines.push('')
    lines.push('# Dialogue scenes with this character')
    for (const d of myDialogues.slice(0, 4)) {
      lines.push(`## Round ${d.round} — ${d.eventCategory} — with ${d.participants.map(p => p.name).join(' & ')}`)
      for (const l of (d.lines || []).slice(0, 6)) {
        lines.push(`${l.speaker}: "${l.line}"`)
      }
    }
  }

  return lines.join('\n')
}

// Public — generate an arc for one character.
// Returns { arc, headline, usage, cost, error? }.
export async function generateCharacterArc({ thread, allAgents = [], dialogues = [] }) {
  if (!thread) return { error: 'no thread provided' }
  const userContent = buildUserContent({ thread, allAgents, dialogues })

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
    return { error: err.message || String(err) }
  }
  if (res?.error) return { error: res.message || 'api_error' }

  const raw = res?.content?.[0]?.text || ''
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, '').trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  let parsed = null
  if (m) {
    try { parsed = JSON.parse(m[0]) }
    catch { /* fall through to salvage below */ }
  }
  if (!parsed?.arc) {
    // Salvage: treat the raw response as prose
    return {
      arc: cleaned || raw,
      headline: '',
      usage: res?.usage || null,
      cost: estimateCost(res?.usage),
      _parseError: true,
    }
  }
  return {
    arc: parsed.arc,
    headline: parsed.headline || '',
    usage: res?.usage || null,
    cost: estimateCost(res?.usage),
  }
}

function estimateCost(usage) {
  if (!usage) return 0
  return ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
}
