// Phase 4b/4 — Scenario comparison
// One Sonnet call after all variants complete. Produces a 2-3 paragraph
// comparison highlighting the most narratively significant divergences.

import { callClaude } from '../../api.js'

const MODEL       = 'claude-sonnet-4-20250514'
const MAX_TOKENS  = 800
const TEMPERATURE = 0.7

const SYSTEM_PROMPT = `You are comparing parallel variants of the same starting world in a fiction simulation. Each variant explored the same beginning with different deterministic seeds and is its own complete chronicle.

Write a brief comparison (2-3 paragraphs) highlighting the most narratively significant divergences across variants. Focus on:

- Which characters had dramatically different fates across variants (survived in some, died in others)
- Which alliances or rivalries formed in some variants but not others
- Which events seemed inevitable across all variants (i.e., consistent patterns the world keeps generating)
- Where the variants surprised the writer

Documentary tone — you are reporting on parallel worlds, not narrating them. Use story language: characters, names, fates. Avoid technical terms (variant, seed, simulation, agent).

Return ONLY a JSON object, no preamble:

{
  "comparison": "the 2-3 paragraph comparison, paragraphs separated by \\n\\n",
  "themes": ["3-5 short bullet points distilling the cross-variant pattern"]
}`

// Build the comparison prompt from variant data.
function buildUserContent({ variants, comparisonData, project, taxonomy }) {
  const parts = []
  parts.push(`# Project\nTitle: ${project?.title || 'Untitled'}${project?.genre ? ` (${project.genre})` : ''}`)
  parts.push(`# Scenario setup\n${variants.length} variants of the same starting world, ${variants[0]?.summary?.total ?? '?'} characters total, run forward for the same number of time units. Each variant uses a different random seed but the same starting conditions.`)

  // Per-variant headline + summary
  for (const v of variants) {
    parts.push(`## Variant ${v.variantIndex + 1}\n` +
      `Result: ${v.summary.alive}/${v.summary.total} alive, ${v.summary.dead} died.\n` +
      `Events: ${v.events.length}. Dialogues: ${v.dialogues?.length || 0}.\n` +
      `Headline (from this variant's narrative): ${v.narrative?.headline || '—'}`)
  }

  // Bound character fate divergence
  if (comparisonData.fateDelta?.length > 0) {
    parts.push('# Characters with divergent fates across variants')
    for (const f of comparisonData.fateDelta) {
      parts.push(`- ${f.name}: alive in variants ${f.aliveInVariants.map(i=>i+1).join(',')}; died in variants ${f.deadInVariants.map(i=>i+1).join(',')}`)
    }
  }

  // Category counts across variants
  if (comparisonData.categoryCounts) {
    parts.push('# Event category counts per variant (column per variant)')
    for (const [cat, counts] of Object.entries(comparisonData.categoryCounts)) {
      parts.push(`  ${cat}: ${counts.join(' | ')}`)
    }
  }

  // Per-variant top dialogue moments (one each, for flavor)
  parts.push('# Sample dialogue from each variant (one scene each)')
  for (const v of variants) {
    if (v.dialogues?.length > 0) {
      const d = v.dialogues[0]
      const names = d.participants.map(p => p.name).join(' & ')
      const lines = d.lines.slice(0, 3).map(l => `${l.speaker}: "${l.line}"`).join('\n  ')
      parts.push(`## Variant ${v.variantIndex + 1} — round ${d.round}, ${names}\n  ${lines}`)
    }
  }

  return parts.join('\n\n')
}

// Public: generate the comparison. Returns { comparison, themes, usage, cost }.
export async function generateScenarioComparison({ variants, comparisonData, project, taxonomy }) {
  const userContent = buildUserContent({ variants, comparisonData, project, taxonomy })

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
    return { comparison: `(Comparison generation failed: ${err.message || err})`, themes: [], usage: null, cost: 0 }
  }
  if (res?.error) {
    return { comparison: `(Comparison generation failed: ${res.message || 'api_error'})`, themes: [], usage: null, cost: 0 }
  }
  const raw = res?.content?.[0]?.text || ''
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, '').trim()
  let parsed
  try { parsed = JSON.parse(cleaned) }
  catch {
    return { comparison: cleaned, themes: [], usage: res?.usage || null, cost: 0, _parseError: true }
  }
  const usage = res?.usage || null
  const cost  = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0

  return {
    comparison: parsed.comparison || cleaned,
    themes:     Array.isArray(parsed.themes) ? parsed.themes : [],
    usage,
    cost,
  }
}
