// Phase 7/7a — AI inference path for character psychology.
//
// One Sonnet call per character reading the Bible profile, returning an
// Enneagram type + wing + health level + reasoning. The mapper then
// derives Big Five + attachment + markers.
//
// Cached on the character via a FNV-1a hash of the source profile text +
// the world's customNarrativeRules (so a rules change re-infers). Cache
// hits return instantly; misses cost ~$0.01–0.02.
//
// Phase 6 conventions:
//  * model: claude-sonnet-4-20250514
//  * AbortController + 60s timeout (set by the existing api.callClaude)
//  * salvage on JSON parse failure (returns a best-effort default)

import { callClaude } from '../../api.js'
import { mapEnneagramToProfile } from './enneagramMapper.js'
import { ENNEAGRAM_TYPES, ATTACHMENT_STYLES, normaliseProfile } from './psychologySchema.js'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 400
const TEMPERATURE = 0.3

const SYSTEM_PROMPT = `You are reading a character's profile and choosing the Enneagram type that best captures who they are. This is for a fiction simulation engine — the goal is a narratively useful match, not a clinical diagnosis.

Choose:
- An Enneagram type (1–9). Use the standard labels: 1 Reformer / 2 Helper / 3 Achiever / 4 Individualist / 5 Investigator / 6 Loyalist / 7 Enthusiast / 8 Challenger / 9 Peacemaker.
- A wing (one of the two adjacent types). If the profile is ambiguous between wings, pick the one that sharpens the dramatic signal.
- A health level (1–9, where 1 is most healthy/integrated and 9 is most unhealthy/disintegrated). A villainous, controlling, vengeful character lands in 7–9; a grounded protagonist in 3–5; a saintly mentor in 1–3.
- An attachment style: one of "secure", "anxious", "avoidant", "fearful".
- 1–2 sentences of reasoning grounded in the profile.

If World Rules custom narrative rules are provided, honor them when typing the character. E.g. if rules state "vampires are weakened but not killed by sunlight" and the character is described as a vampire who avoids the sun, that does not by itself imply weakness — the rules say it's normal.

Return ONLY a JSON object:

{
  "enneagram": { "type": <1-9>, "wing": <1-9>, "healthLevel": <1-9> },
  "attachment": "<one of: secure | anxious | avoidant | fearful>",
  "reasoning": "<1-2 sentences>"
}`

// FNV-1a 32-bit. Salt with worldRulesText so a rules edit invalidates cache.
export function profileHash(char, worldRulesText = '') {
  const text = [
    char?.name || '', char?.species || '', char?.role || '',
    char?.traits || '', char?.stakes || '', char?.secrets || '',
    char?.contradictions || '', char?.description || '',
    '||rules:', String(worldRulesText || ''),
  ].join('||')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16)
}

function buildUserContent({ char, worldRulesText }) {
  const lines = [`# Character: ${char?.name || 'Unnamed'}`]
  if (char?.species)        lines.push(`Species/Type: ${char.species}`)
  if (char?.role)           lines.push(`Role: ${char.role}`)
  if (char?.traits)         lines.push(`Traits: ${char.traits}`)
  if (char?.stakes)         lines.push(`What they stand to lose: ${char.stakes}`)
  if (char?.secrets)        lines.push(`Secrets: ${char.secrets}`)
  if (char?.contradictions) lines.push(`Contradictions: ${char.contradictions}`)
  if (char?.description)    lines.push(`Description: ${char.description}`)
  if (worldRulesText)       lines.push(`\n# World Rules (writer-stated)\n${worldRulesText}`)
  return lines.join('\n')
}

// ── Public — infer one character ────────────────────────────────────────
// Returns { ok, profile, usage, cost, error?, raw? }.
// `profile` is a complete psychology profile (enneagram + derived bigFive
// + attachment + markers + reasoning + source + profileHash + inferredAt).
export async function inferCharacterPsychology({ char, worldRulesText = '' }) {
  const userContent = buildUserContent({ char, worldRulesText })
  let res
  try {
    res = await callClaude({
      model: MODEL, max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
  if (res?.error) return { ok: false, error: res.message || 'api_error' }

  const raw = res?.content?.[0]?.text || ''
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, '').trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return { ok: false, error: 'no_json_in_response', raw }
  let parsed
  try { parsed = JSON.parse(m[0]) }
  catch (err) { return { ok: false, error: `parse_failed: ${err.message}`, raw } }

  // Normalise + clamp
  const t = Number(parsed?.enneagram?.type)
  const w = Number(parsed?.enneagram?.wing)
  const h = Number(parsed?.enneagram?.healthLevel)
  if (!ENNEAGRAM_TYPES.includes(t)) return { ok: false, error: `bad_type:${t}`, raw }
  const wing = ENNEAGRAM_TYPES.includes(w) ? w : null
  const health = Math.min(9, Math.max(1, Math.round(Number.isFinite(h) ? h : 5)))
  const attachment = ATTACHMENT_STYLES.includes(parsed?.attachment) ? parsed.attachment : 'secure'

  // Derive Big Five + markers from the mapper
  const derived = mapEnneagramToProfile({ type: t, wing, healthLevel: health })
  // The LLM's attachment choice overrides the mapper's default — the writer
  // can edit later. The mapper's marker values stay (they're modulated by
  // health level which we just applied).
  const profile = normaliseProfile({
    enneagram: { type: t, wing, healthLevel: health },
    bigFive: derived.bigFive,
    attachment,
    markers: derived.markers,
    source: 'inference',
    reasoning: String(parsed?.reasoning || '').slice(0, 600),
    profileHash: profileHash(char, worldRulesText),
    inferredAt: new Date().toISOString(),
  })

  const usage = res?.usage || null
  const cost = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0
  return { ok: true, profile, usage, cost }
}

// ── Bulk inference for many chars, cache-aware ─────────────────────────
// `cachedProfiles` is a map { charId: profile }. Skips re-inferring when
// the cached profile's profileHash matches the current text.
// onProgress fires per char with { charId, name, status }.
// Returns { profiles, totalCost, callsUsed, errors }.
export async function inferAllPsychologies({ chars = [], worldRulesText = '', cachedProfiles = {}, onProgress = null }) {
  const profiles = { ...cachedProfiles }
  const errors = []
  let totalCost = 0
  let callsUsed = 0
  for (const char of chars) {
    const id = char.id
    const hash = profileHash(char, worldRulesText)
    const cached = profiles[id]
    if (cached && cached.profileHash === hash && cached.source === 'inference') {
      onProgress?.({ charId: id, name: char.name, status: 'cached' })
      continue
    }
    onProgress?.({ charId: id, name: char.name, status: 'inferring' })
    const result = await inferCharacterPsychology({ char, worldRulesText })
    callsUsed += 1
    if (result.ok) {
      profiles[id] = result.profile
      totalCost += result.cost || 0
      onProgress?.({ charId: id, name: char.name, status: 'done', type: result.profile.enneagram.type })
    } else {
      errors.push({ charId: id, name: char.name, error: result.error })
      onProgress?.({ charId: id, name: char.name, status: 'error', error: result.error })
    }
  }
  return { profiles, totalCost, callsUsed, errors }
}
