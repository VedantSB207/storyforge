// Phase 6/6a-i — Character Inference
//
// One Sonnet call per bound Bible character to extract structured initial
// state. Cached on the project; re-runs only when the source character
// profile text changes (compared via FNV-1a hash).

import { callClaude } from '../../../api.js'

export const INFERENCE_MODEL       = 'claude-sonnet-4-20250514'
export const INFERENCE_MAX_TOKENS  = 600
export const INFERENCE_TEMPERATURE = 0.3

// FNV-1a 32-bit hash. Used to detect when a character's profile text has
// changed so cached inference can be invalidated for just that one
// character.
export function profileHash(char) {
  const text = [
    char?.name || '',
    char?.species || '',
    char?.role || '',
    char?.traits || '',
    char?.stakes || '',
    char?.secrets || '',
    char?.contradictions || '',
    char?.description || '',
  ].join('||')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16)
}

// ── Prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are reading a character's profile to extract initial state for a story simulation. Read the profile carefully and infer fields that are explicit or strongly implied. Be conservative.

For each field:
- Mark approximate inferences with "approximate": true.
- If a field is genuinely unspecified (and you can't justify an inference), use a defensible default with a reasoning note that explains your choice.
- Numeric age: pick a single number. If the profile says "young", "old", "ancient", "child", etc., translate that into a reasonable number for the species.
- Status: one of "alive", "missing", "dead", "exiled", "dormant".
- Location: one of "central", "north", "south", "east", "west", "wilderness". Pick the region that best fits where this character is currently. If genuinely unknown, default to "central".

For keyRelationships: list explicit relationships mentioned in the profile (companions, masters, rivals, enemies, family). For each, name the other party AS THEY APPEAR IN THE PROFILE (use the exact name string the writer uses). Use these relationship types: companion, friend, ally, mentor, student, family, lover, rival, enemy, acquaintance.

If World Rules custom narrative rules are provided, honor them. For example, if rules say "vampires age 1 year per century of mortal time", and the profile says "200-year-old vampire", set age to 2.

Return ONLY a JSON object matching this exact schema:

{
  "age": { "value": <number>, "approximate": <boolean>, "reasoning": "<short clause>" },
  "status": "<one of: alive | missing | dead | exiled | dormant>",
  "statusReasoning": "<short clause>",
  "location": "<one of the regions above>",
  "locationReasoning": "<short clause>",
  "backgroundSummary": "<2-3 sentence summary of who they are and where they are at story start, in plain prose>",
  "keyRelationships": [
    { "with": "<other character's name>", "type": "<relationship type>", "evidence": "<short clause>" }
  ]
}`

// ── Single character inference ───────────────────────────────────────────
// Returns: { ok, inference, usage, cost, error }
export async function inferCharacter({ char, chapterExcerpts = '', worldRulesText = '' }) {
  const userContent = buildUserContent({ char, chapterExcerpts, worldRulesText })
  let res
  try {
    res = await callClaude({
      model:       INFERENCE_MODEL,
      max_tokens:  INFERENCE_MAX_TOKENS,
      temperature: INFERENCE_TEMPERATURE,
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
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return { ok: false, error: 'no_json_in_response', raw }
  let parsed
  try { parsed = JSON.parse(m[0]) }
  catch (err) { return { ok: false, error: `parse_failed: ${err.message}`, raw } }

  // Defensive normalisation
  const inference = {
    agentId:             `agent_${char.id}`,
    name:                char.name,
    age:                 normaliseAge(parsed.age, char),
    status:              normaliseStatus(parsed.status),
    statusReasoning:     parsed.statusReasoning || '',
    location:            normaliseLocation(parsed.location),
    locationReasoning:   parsed.locationReasoning || '',
    backgroundSummary:   parsed.backgroundSummary || '',
    keyRelationships:    Array.isArray(parsed.keyRelationships)
      ? parsed.keyRelationships.filter(r => r?.with && r?.type)
      : [],
    profileHash:         profileHash(char),
    inferredAt:          new Date().toISOString(),
    raw:                 parsed,
  }

  const usage = res?.usage || null
  const cost  = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0

  return { ok: true, inference, usage, cost }
}

// ── Bulk inference for all bound chars ───────────────────────────────────
// Uses cached results where the profile hash matches; only re-infers for
// characters whose profile text has changed.
//
// Phase 6/6a-ii: worldRulesText now receives the writer's customNarrativeRules
// directly (not lore stringified) — resolves Phase 6a-i Deviation 1. The
// rules also salt the per-character cache hash so changing them invalidates
// inferences.
//
// onProgress fires per character with { charId, name, status }.
// Returns { inferences: { agentId: inference }, totalCost, errors, callsUsed }.
export async function inferAllCharacters({ chars, worldRulesText = '', cachedHydration = {}, onProgress = null }) {
  const inferences = { ...(cachedHydration.inferences || {}) }
  const errors = []
  let totalCost = 0
  let callsUsed = 0

  // Salt the cache hash with the world rules text so a rules edit triggers
  // re-inference for every character (their "age" or "species" interpretation
  // depends on rules).
  const rulesSalt = hashText(worldRulesText || '')

  for (const char of chars) {
    const agentId = `agent_${char.id}`
    const hash = profileHash(char) + ':' + rulesSalt
    const cached = inferences[agentId]
    if (cached && cached.profileHash === hash) {
      onProgress?.({ charId: char.id, name: char.name, status: 'cached' })
      continue
    }
    onProgress?.({ charId: char.id, name: char.name, status: 'inferring' })
    // Parallel friendly: kept sequential for simplicity + small N (≤20). If
    // the writer has many chars this is the spot to switch to Promise.all
    // with a chunk size.
    const result = await inferCharacter({ char, worldRulesText })
    callsUsed += 1
    if (result.ok) {
      // Persist the salted hash so cache invalidation tracks rules changes
      result.inference.profileHash = hash
      inferences[agentId] = result.inference
      totalCost += result.cost || 0
      onProgress?.({ charId: char.id, name: char.name, status: 'done' })
    } else {
      errors.push({ charId: char.id, name: char.name, error: result.error })
      onProgress?.({ charId: char.id, name: char.name, status: 'error', error: result.error })
    }
  }

  return { inferences, totalCost, errors, callsUsed }
}

// Tiny FNV-1a helper for the rules salt — same recipe as profileHash but
// over an arbitrary string.
function hashText(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16)
}

// ── Helpers ─────────────────────────────────────────────────────────────
function buildUserContent({ char, chapterExcerpts, worldRulesText }) {
  const lines = [`# Character: ${char.name || 'Unnamed'}`]
  if (char.species)        lines.push(`Species/Type: ${char.species}`)
  if (char.role)           lines.push(`Role: ${char.role}`)
  if (char.traits)         lines.push(`Traits: ${char.traits}`)
  if (char.stakes)         lines.push(`What they stand to lose: ${char.stakes}`)
  if (char.secrets)        lines.push(`Secrets: ${char.secrets}`)
  if (char.contradictions) lines.push(`Contradictions: ${char.contradictions}`)
  if (char.description)    lines.push(`Description: ${char.description}`)
  let out = lines.join('\n')
  if (chapterExcerpts) out += `\n\n# Relevant Chapter Excerpts\n${chapterExcerpts}`
  if (worldRulesText)  out += `\n\n# World Rules (writer-stated)\n${worldRulesText}`
  return out
}

function normaliseAge(age, char) {
  if (!age || typeof age !== 'object') {
    return { value: 30, approximate: true, reasoning: 'no age field returned; fell back to default' }
  }
  let value = Number(age.value)
  if (!Number.isFinite(value) || value <= 0) value = 30
  if (value > 100000) value = 100000   // sanity cap
  return {
    value,
    approximate: !!age.approximate,
    reasoning:   age.reasoning || '',
  }
}

const VALID_STATUSES = ['alive', 'missing', 'dead', 'exiled', 'dormant']
function normaliseStatus(s) {
  const v = String(s || '').toLowerCase()
  return VALID_STATUSES.includes(v) ? v : 'alive'
}

const VALID_REGIONS = ['central', 'north', 'south', 'east', 'west', 'wilderness']
function normaliseLocation(loc) {
  const v = String(loc || '').toLowerCase()
  return VALID_REGIONS.includes(v) ? v : 'central'
}
