// Phase 6/6a-i — Knowledge seeding
//
// Optional layer. One Sonnet call per bound character that extracts "what
// this character knows at story start" from their profile + relevant
// chapters. Pre-loaded into agent.knownFacts before round 1.
//
// Default ON. Writer can disable via a setup-screen toggle with a popup
// explaining the impact.

import { callClaude } from '../../../api.js'

export const SEED_MODEL       = 'claude-sonnet-4-20250514'
export const SEED_MAX_TOKENS  = 700
export const SEED_TEMPERATURE = 0.4
export const MAX_SEEDED_ENTRIES_PER_CHAR = 8

const SYSTEM_PROMPT = `You are seeding a character's initial knowledge for a story simulation. The character is about to be dropped into a multi-agent simulation that projects their story forward. They need to know what their profile says they know — past events they witnessed, secrets they hold, facts about the world they're aware of.

Return 5-8 knowledge entries the character holds at story start. Each entry is a single short sentence describing one fact this character believes. Mix:
- Facts they witnessed directly (use "firsthand_history")
- Knowledge of themselves / their nature / their abilities (use "self_knowledge")
- Secrets they hold

For each entry:
- "content": the fact in the character's perspective ("My master Garm has gone missing." not "Garm has gone missing.")
- "confidence": 0.8-1.0 for things they witnessed or know about themselves; 0.5-0.7 for partial knowledge
- "source": "firsthand_history" OR "self_knowledge"
- "hops": 0
- "roundLearned": 0

Do NOT include:
- Facts the character does NOT yet know (don't pre-spoil mysteries)
- Things they only suspect (use confidence 0.5-0.7 for those)
- Generic world facts everyone knows

Return ONLY a JSON array, no preamble:

[
  { "content": "...", "confidence": 1.0, "source": "firsthand_history", "hops": 0, "roundLearned": 0 },
  ...
]`

// Per-character knowledge seeding.
export async function seedCharacterKnowledge({ char, chapterExcerpts = '', worldRulesText = '' }) {
  const userContent = buildUserContent({ char, chapterExcerpts, worldRulesText })
  let res
  try {
    res = await callClaude({
      model:       SEED_MODEL,
      max_tokens:  SEED_MAX_TOKENS,
      temperature: SEED_TEMPERATURE,
      system:      SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
  if (res?.error) {
    return { ok: false, error: res.message || 'api_error' }
  }
  const raw = res?.content?.[0]?.text || ''
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, '').trim()
  const m = cleaned.match(/\[[\s\S]*\]/)
  if (!m) return { ok: false, error: 'no_json_array_in_response', raw }
  let parsed
  try { parsed = JSON.parse(m[0]) }
  catch (err) { return { ok: false, error: `parse_failed: ${err.message}`, raw } }

  if (!Array.isArray(parsed)) return { ok: false, error: 'not_an_array' }
  const entries = parsed.slice(0, MAX_SEEDED_ENTRIES_PER_CHAR).map((e, idx) => ({
    id:             `kn_seed_${char.id}_${idx}`,
    originEventId:  `seed_${char.id}_${idx}`,
    source:         normaliseSource(e.source),
    sourceAgentId:  `agent_${char.id}`,
    ownerId:        `agent_${char.id}`,
    content:        String(e.content || '').trim() || '(empty)',
    confidence:     clamp01(Number(e.confidence) ?? 1.0),
    roundLearned:   0,
    hops:           0,
    distortionMode: 'seed',
  })).filter(e => e.content && e.content !== '(empty)')

  const usage = res?.usage || null
  const cost = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0
  return { ok: true, entries, usage, cost }
}

// ── Bulk seeding ─────────────────────────────────────────────────────────
// onProgress fires per character with { charId, name, status, count }.
export async function seedAllCharacterKnowledge({ chars, worldRulesText = '', onProgress = null }) {
  const knowledgeByAgentId = {}
  let totalCost = 0
  let callsUsed = 0
  const errors = []
  for (const char of chars) {
    const agentId = `agent_${char.id}`
    onProgress?.({ charId: char.id, name: char.name, status: 'seeding' })
    const result = await seedCharacterKnowledge({ char, worldRulesText })
    callsUsed += 1
    if (result.ok) {
      knowledgeByAgentId[agentId] = result.entries
      totalCost += result.cost || 0
      onProgress?.({ charId: char.id, name: char.name, status: 'done', count: result.entries.length })
    } else {
      knowledgeByAgentId[agentId] = []
      errors.push({ charId: char.id, name: char.name, error: result.error })
      onProgress?.({ charId: char.id, name: char.name, status: 'error', error: result.error })
    }
  }
  return { knowledgeByAgentId, totalCost, callsUsed, errors }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function buildUserContent({ char, chapterExcerpts, worldRulesText }) {
  const lines = [`# Character: ${char.name || 'Unnamed'}`]
  if (char.species)        lines.push(`Species/Type: ${char.species}`)
  if (char.role)           lines.push(`Role: ${char.role}`)
  if (char.traits)         lines.push(`Traits: ${char.traits}`)
  if (char.stakes)         lines.push(`What they stand to lose: ${char.stakes}`)
  if (char.secrets)        lines.push(`Secrets they hold: ${char.secrets}`)
  if (char.contradictions) lines.push(`Contradictions: ${char.contradictions}`)
  if (char.description)    lines.push(`Description: ${char.description}`)
  let out = lines.join('\n')
  if (chapterExcerpts) out += `\n\n# Chapter excerpts (events the character may have witnessed)\n${chapterExcerpts}`
  if (worldRulesText)  out += `\n\n# World Rules\n${worldRulesText}`
  return out
}

function normaliseSource(s) {
  const v = String(s || '').toLowerCase().replace(/[\s-]/g, '_')
  if (['firsthand_history', 'self_knowledge'].includes(v)) return v
  return 'firsthand_history'
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 1.0
  return Math.max(0.5, Math.min(1.0, n))
}
