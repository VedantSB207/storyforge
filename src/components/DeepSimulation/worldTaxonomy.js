// Phase 2 — world taxonomy detection
// Single Claude API call at simulation setup. Round loop stays deterministic.

import { callClaude } from '../../api.js'
import { TAXONOMY_MODEL, TAXONOMY_MAX_TOKENS } from './deepSimSchema.js'

// ── Build the project content blob the LLM reads ────────────────────────────
export function buildProjectContent({ chars = [], lore = [], timelineChapters = [], project = null }) {
  const parts = []

  if (project?.title || project?.genre) {
    parts.push(`# Project\nTitle: ${project.title || 'Untitled'}${project.genre ? ` (${project.genre})` : ''}`)
  }

  if (chars.length > 0) {
    parts.push('# Story Bible Characters')
    for (const c of chars) {
      const lines = [`- ${c.name || 'Unnamed'}`]
      if (c.species)        lines.push(`  species: ${c.species}`)
      if (c.role)           lines.push(`  role: ${c.role}`)
      if (c.traits)         lines.push(`  traits: ${c.traits}`)
      if (c.stakes)         lines.push(`  stakes: ${c.stakes}`)
      if (c.contradictions) lines.push(`  contradictions: ${c.contradictions}`)
      parts.push(lines.join('\n'))
    }
  }

  if (lore.length > 0) {
    parts.push('# World Rules / Lore')
    for (const r of lore) {
      parts.push(`- [${r.cat || 'Lore'}] ${r.rule || ''}`)
    }
  }

  if (timelineChapters.length > 0) {
    parts.push('# Timeline Chapters')
    for (const ch of timelineChapters) {
      parts.push(`- ${ch.title || 'Untitled chapter'}${ch.summary ? `: ${ch.summary}` : ''}`)
    }
  }

  return parts.join('\n\n')
}

// Stable, cheap fingerprint of project content. Used to detect when the
// taxonomy is stale (writer changed Bible or lore since last generation).
export function fingerprintContent({ chars = [], lore = [], timelineChapters = [] }) {
  const charSig = chars
    .map(c => `${c.id || c.name}:${(c.name || '').length}:${(c.species || '').length}:${(c.traits || '').length}`)
    .sort().join('|')
  const loreSig = lore
    .map(r => `${r.id || ''}:${(r.cat || '').length}:${(r.rule || '').length}`)
    .sort().join('|')
  const tlSig = timelineChapters
    .map(c => `${c.id || ''}:${(c.title || '').length}`)
    .sort().join('|')
  return `c${chars.length}-l${lore.length}-t${timelineChapters.length}::${hash(charSig + '||' + loreSig + '||' + tlSig)}`
}

// Tiny non-cryptographic 32-bit hash (FNV-1a) — good enough for stale check
function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// ── The detection prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a world taxonomy analyst for a multi-agent story-simulation engine. Given the writer's project content, you identify what genres of being inhabit this world.

Be conservative. Only include genres for which the content gives clear evidence. If only one species clearly matters, propose only that genre. Do not invent genres the content doesn't support.

For each genre, propose 5-15 typical kinds (species, archetypes, or roles) with realistic traits, life expectancy, and a proportional count. Counts represent how many of this kind appear per 100 active simulation agents — they should sum across all kinds in a way that makes sense for the world's flavour.

Common genres to consider: animal_kingdom, mythology, humans, spirits, mechanical, undead. Use snake_case ids.

Return ONLY a JSON object matching this exact shape, with no preamble or trailing text:

{
  "genres": [
    {
      "id": "animal_kingdom",
      "name": "Animal Kingdom",
      "weight": 0.5,
      "kinds": [
        {
          "id": "rattlesnake",
          "name": "Rattlesnake",
          "typicalTraits": ["venomous", "patient", "territorial"],
          "typicalLifeExpectancy": 25,
          "typicalSize": "small",
          "typicalCount": 12
        }
      ]
    }
  ],
  "reasoning": "Two-sentence explanation of what you saw in the content and why you chose these genres."
}

typicalSize must be one of: tiny, small, medium, large, huge.
weight is 0-1 and represents proportion of total population in this genre.
weight values across genres should sum to roughly 1.0.
typicalCount is a per-100-agents count, integer.`

// ── Generate taxonomy ──────────────────────────────────────────────────────
// Returns { taxonomy, raw, usage } on success, or throws with the underlying
// error message bound (NOT swallowed — Phase 1 lesson learned).
export async function generateTaxonomy(projectInputs) {
  const content = buildProjectContent(projectInputs)
  if (!content || content.trim().length < 30) {
    throw new Error('Not enough project content to detect a taxonomy. Add Story Bible characters and world rules first.')
  }

  let response
  try {
    response = await callClaude({
      model: TAXONOMY_MODEL,
      max_tokens: TAXONOMY_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    // Bind and re-throw — never silently swallow
    throw new Error(`Taxonomy detection failed: ${err.message || String(err)}`)
  }

  const raw = response?.content?.[0]?.text || ''
  if (!raw) throw new Error('Taxonomy detection returned empty response.')

  // Strip code fences if Claude added them despite instructions
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`Taxonomy response was not valid JSON: ${err.message}\n\nRaw response (first 500 chars): ${cleaned.slice(0, 500)}`)
  }

  // Normalise: stamp `detected: true`, `included: true` on every kind, attach metadata
  const taxonomy = {
    genres: (parsed.genres || []).map(g => ({
      id:       g.id || slug(g.name || 'unknown'),
      name:     g.name || g.id || 'Unknown',
      detected: true,
      weight:   clamp(Number(g.weight) || 0, 0, 1),
      kinds: (g.kinds || []).map(k => ({
        id:                    k.id || slug(k.name || 'unknown'),
        name:                  k.name || k.id || 'Unknown',
        included:              true,
        typicalTraits:         Array.isArray(k.typicalTraits) ? k.typicalTraits : [],
        typicalLifeExpectancy: Number(k.typicalLifeExpectancy) || 30,
        typicalSize:           k.typicalSize || 'medium',
        typicalCount:          Math.max(1, Math.round(Number(k.typicalCount) || 5)),
      })),
    })),
    reasoning:          parsed.reasoning || '',
    generatedAt:        new Date().toISOString(),
    contentFingerprint: fingerprintContent(projectInputs),
  }

  return {
    taxonomy,
    raw,
    usage: response?.usage || null,
  }
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// Approximate USD cost of one taxonomy call.
// Sonnet 4 pricing (as of 2025-05): $3/M input, $15/M output.
export function estimateCostUSD(usage) {
  if (!usage) return null
  const inCost  = (usage.input_tokens  || 0) * 3  / 1_000_000
  const outCost = (usage.output_tokens || 0) * 15 / 1_000_000
  return inCost + outCost
}
