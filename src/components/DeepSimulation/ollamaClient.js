// Phase 4a — Ollama client with graceful degradation
//
// Health check at simulation start. If unreachable, set ollamaState.available
// false and all Tier 1 calls downgrade to Tier 0 deterministic. Per-request
// timeout 10s. No retries. JSON-mode prompt — parse defensively.
//
// HTTP must go through Electron main process for CORS-free, server-side URL
// (the user runs Ollama on a VPS at a configurable IP). When running in
// pure-Node test scripts, the tests stub `window.electronAPI.queryOllama`.

import {
  OLLAMA_DEFAULT_URL,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_TIMEOUT_MS,
  OLLAMA_HEALTH_TIMEOUT_MS,
} from './deepSimSchema.js'

// ── Health check + init ────────────────────────────────────────────────────
// Returns { available, model, url }. Never throws.
// Phase 4a.1: also does a 30s warmup generate call so the model is fully
// loaded before the simulation's per-call 10s budget starts ticking. Without
// this, cold-start model loads (~15s for 3B models, longer for 7B) cause
// every Tier 1 call to time out and Ollama to start a fresh runner each
// time — a death loop where the model is never warm.
export async function initOllama({ url = OLLAMA_DEFAULT_URL, model = OLLAMA_DEFAULT_MODEL } = {}) {
  if (!hasIPC()) return { available: false, model, url, reason: 'no_electron' }
  try {
    const health = await window.electronAPI.queryOllama({
      url, model, prompt: null, healthCheck: true, timeout: OLLAMA_HEALTH_TIMEOUT_MS,
    })
    if (!health?.ok) return { available: false, model, url, reason: health?.error || 'unreachable' }

    // Warmup: a tiny generate call with a generous timeout. Loads the model
    // into memory so subsequent simulation calls return fast.
    const warmup = await window.electronAPI.queryOllama({
      url, model,
      prompt: 'Reply with only this JSON: {"action":"OBSERVE","reason":"warmup"}',
      healthCheck: false,
      timeout: 60000,
    })
    if (!warmup?.ok) {
      // Model present but warmup failed — treat as unavailable so all Tier 1
      // calls downgrade cleanly rather than each individual call timing out.
      return { available: false, model, url, reason: `warmup_failed_${warmup?.error || 'unknown'}` }
    }
    return { available: true, model, url, warmupResponse: warmup.response }
  } catch (err) {
    return { available: false, model, url, reason: err.message }
  }
}

const hasIPC = () => typeof window !== 'undefined' && !!window.electronAPI?.queryOllama

// ── Decision prompt for an agent ───────────────────────────────────────────
// Compact, JSON-only output instruction. Parse defensively (Ollama models
// sometimes wrap with prose, or omit one of the fields).
function buildDecisionPrompt(agent, available, world) {
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

// ── decideViaOllama ────────────────────────────────────────────────────────
// Returns { action, reason } on success, null on any failure / timeout /
// unreachable / unparseable. Caller falls back to Tier 0.
export async function decideViaOllama(agent, available, world, ollamaState) {
  if (!ollamaState?.available || !hasIPC()) return null
  const prompt = buildDecisionPrompt(agent, available, world)
  let res
  try {
    res = await window.electronAPI.queryOllama({
      url:     ollamaState.url,
      model:   ollamaState.model,
      prompt,
      timeout: OLLAMA_TIMEOUT_MS,
    })
  } catch (err) {
    return null
  }
  if (!res?.ok) return null
  const raw = res.response || ''
  // Find the first {...} block — models occasionally add prose despite the prompt
  const m = raw.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let parsed
  try { parsed = JSON.parse(m[0]) }
  catch { return null }
  if (!parsed.action || !available.includes(parsed.action)) return null
  return { action: parsed.action, reason: parsed.reason || '' }
}

// Re-export defaults so other modules can import them from here too
export { OLLAMA_DEFAULT_URL, OLLAMA_DEFAULT_MODEL }
