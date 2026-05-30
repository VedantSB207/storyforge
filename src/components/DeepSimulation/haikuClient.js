// Phase 4b — Claude Haiku 4.5 client for Tier 1 decisions
//
// Replaces ollamaClient.js for the Tier 1 path. Anthropic API call per
// decision, supports concurrent batching via Promise.all (10 parallel by
// default — well under API rate limits and dramatically faster wall time
// than serial routing).
//
// Cost reference (verified at Phase 4b kickoff): Haiku 4.5 is $1/MTok input,
// $5/MTok output (standard non-batch). Decision prompts run ~200-400 input
// tokens / ~20-40 output tokens → ~$0.0004 per call. At MAX_TIER1_PER_SIM=400
// this caps Tier 1 spend at ~$0.16 worst case.

import { callClaude } from '../../api.js'

export const HAIKU_MODEL       = 'claude-haiku-4-5-20251001'
export const HAIKU_MAX_TOKENS  = 200
export const HAIKU_TEMPERATURE = 0.5
export const HAIKU_BATCH_SIZE  = 10   // Promise.all width

// Decision prompt — same JSON contract Ollama returned, so the rest of the
// pipeline is unchanged.
function buildPrompt(agent, available, world) {
  const needs = agent.needs || {}
  const bonds = Object.entries(agent.bonds || {}).slice(0, 3).map(([id, b]) => {
    const o = world?.agentById?.[id]
    return `${o?.name || id}:${b.type}/${(b.intensity ?? 0).toFixed(2)}`
  }).join(', ') || 'none'
  const recentKnowledge = (agent.knownFacts || [])
    .slice(-3)
    .map(k => `"${k.content}" (conf ${(k.confidence ?? 0).toFixed(2)})`)
    .join('; ') || 'none'

  return `You are picking the next action for one character in a writer's simulation. Reply with ONLY JSON, no preamble.

Character: ${agent.name} (${agent.genreTag || 'bound'})
Traits: ${(agent.traits || []).slice(0, 5).join(', ') || 'none'}
Region: ${agent.region}
Needs (0-1, lower=desperate): physiological=${(needs.physiological ?? 0).toFixed(2)}, safety=${(needs.safety ?? 0).toFixed(2)}, belonging=${(needs.belonging ?? 0).toFixed(2)}, esteem=${(needs.esteem ?? 0).toFixed(2)}, purpose=${(needs.purpose ?? 0).toFixed(2)}
Health=${(agent.health ?? 1).toFixed(2)}, stress=${(agent.stress ?? 0).toFixed(2)}
Bonds: ${bonds}
Recent knowledge: ${recentKnowledge}

Available actions: ${available.join(', ')}

Pick exactly ONE action from the available list. Reply only:
{"action": "<NAME>", "reason": "<one short clause>"}`
}

// Parse a model response defensively. Haiku 4.5 sometimes wraps JSON in
// markdown fences (```json ... ```); sometimes adds whitespace; rarely
// returns prose around it. Strip fences, find first {...}, JSON.parse.
function parseDecision(raw, available) {
  if (!raw) return null
  // Strip code fences
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, '').trim()
  // Find the first balanced-ish {...}
  const m = cleaned.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let parsed
  try { parsed = JSON.parse(m[0]) }
  catch { return null }
  if (!parsed.action || !available.includes(parsed.action)) return null
  return { action: parsed.action, reason: parsed.reason || '' }
}

// Single-agent Tier 1 decision. Returns { action, reason, usage } | null.
export async function decideViaHaiku(agent, available, world) {
  const prompt = buildPrompt(agent, available, world)
  let res
  try {
    res = await callClaude({
      model:       HAIKU_MODEL,
      max_tokens:  HAIKU_MAX_TOKENS,
      temperature: HAIKU_TEMPERATURE,
      messages:    [{ role: 'user', content: prompt }],
    })
  } catch (err) {
    return null
  }
  const raw = res?.content?.[0]?.text || ''
  const parsed = parseDecision(raw, available)
  if (!parsed) return null
  return { ...parsed, usage: res?.usage || null }
}

// Concurrent batch. `decisions` is an array of { agent, available, world }.
// Returns an array of { action, reason, usage } | null in the same order.
// Splits into chunks of HAIKU_BATCH_SIZE so we don't fire 100+ requests at
// once, but each chunk runs fully in parallel.
export async function decideBatchViaHaiku(decisions) {
  const results = new Array(decisions.length)
  for (let i = 0; i < decisions.length; i += HAIKU_BATCH_SIZE) {
    const chunk = decisions.slice(i, i + HAIKU_BATCH_SIZE)
    const chunkResults = await Promise.all(
      chunk.map(d => decideViaHaiku(d.agent, d.available, d.world))
    )
    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j]
    }
  }
  return results
}

export const _internal = { buildPrompt, parseDecision }
