// Phase 3.5 — Deep Simulation persistence
// Splits each simulation run into:
//   1. A lightweight metadata stub kept in the project's deepSimulationHistory[]
//   2. A full result file at <userData>/projects/<projectId>/deep-sims/<simId>.json
//
// The project JSON now stays small no matter how many simulations have run.
// Heavy data (full agent Knowledge, event log, butterfly trace) loads only
// when the writer opens that simulation's result panel.

import { isElectron } from '../../api.js'

// ── Shape detection ────────────────────────────────────────────────────────
// An "inline" entry is the pre-Phase-3.5 format that bundles agents/events
// straight into the project. New format keeps only metadata in the project.
export function isInlineEntry(entry) {
  if (!entry) return false
  return Array.isArray(entry.agents) && entry.agents.length > 0
}

export function isMetadataStub(entry) {
  return !!entry && !isInlineEntry(entry) && (entry.simId || entry.id)
}

// ── Build a metadata stub from a (possibly inline) entry ───────────────────
export function entryToMetadata(entry) {
  // Compute alive/dead from agents if available; else fall back to summary.
  const agents = Array.isArray(entry.agents) ? entry.agents : []
  const alive = agents.length > 0 ? agents.filter(a => a.alive).length : (entry.alive ?? null)
  const dead  = agents.length > 0 ? agents.length - alive : (entry.dead ?? null)
  const totalEvents = Array.isArray(entry.events) ? entry.events.length : (entry.totalEvents ?? null)

  // Total cost — derive from any usage info present (taxonomy + narrative + LLM distortion)
  const totalCost = entry.totalCost ?? estimateEntryCost(entry)

  return {
    simId:             entry.simId || entry.id,
    timestamp:         entry.timestamp,
    mode:              entry.mode,
    castSize:          entry.castSize,
    roundCount:        entry.roundCount,
    timeUnit:          entry.timeUnit,
    seed:              entry.seed ?? null,
    summary:           entry.summary ?? '',
    narrativeHeadline: entry.narrative?.headline || entry.narrativeHeadline || null,
    alive,
    dead,
    totalEvents,
    totalCost,
    censusStats:       entry.censusStats   || null,
    butterflyStats:    entry.butterflyStats || null,
    llmCallsTotal:     entry.llmCallsTotal ?? null,
    dialogueCount:     Array.isArray(entry.dialogues) ? entry.dialogues.length : 0,
  }
}

function estimateEntryCost(entry) {
  // Best-effort — entries from older runs may not have usage data
  let cost = 0
  if (entry.taxonomy?.usage) {
    cost += ((entry.taxonomy.usage.input_tokens || 0) * 3 + (entry.taxonomy.usage.output_tokens || 0) * 15) / 1_000_000
  }
  if (entry.narrative?.usage) {
    cost += ((entry.narrative.usage.input_tokens || 0) * 3 + (entry.narrative.usage.output_tokens || 0) * 15) / 1_000_000
  }
  return cost > 0 ? cost : null
}

// ── Build the full result file payload from an entry ───────────────────────
export function entryToFullPayload(entry) {
  return {
    id:               entry.simId || entry.id,
    timestamp:        entry.timestamp,
    mode:             entry.mode,
    castSize:         entry.castSize,
    roundCount:       entry.roundCount,
    timeUnit:         entry.timeUnit,
    seed:             entry.seed ?? null,
    taxonomy:         entry.taxonomy || null,
    censusStats:      entry.censusStats || null,
    agents:           entry.agents || [],
    events:           entry.events || [],
    butterflyStats:   entry.butterflyStats || null,
    butterflyTrace:   entry.butterflyTrace || null,
    narrative:        entry.narrative || null,
    llmCallsTotal:    entry.llmCallsTotal ?? null,
    tierCounters:     entry.tierCounters || null,
    dialogues:        entry.dialogues || [],
    insights:         entry.insights || null,        // Phase 6/6d
    summary:          entry.summary || '',
  }
}

// ── IPC wrappers ───────────────────────────────────────────────────────────
export async function saveSimResult(projectId, simId, fullResult) {
  if (!isElectron()) return { ok: false, error: 'no_electron' }
  return window.electronAPI.saveDeepSimResult(projectId, simId, fullResult)
}

export async function loadSimResult(projectId, simId) {
  if (!isElectron()) return { ok: false, error: 'no_electron' }
  return window.electronAPI.loadDeepSimResult(projectId, simId)
}

export async function listSimResults(projectId) {
  if (!isElectron()) return { ok: false, error: 'no_electron' }
  return window.electronAPI.listDeepSimResults(projectId)
}

export async function deleteSimResult(projectId, simId) {
  if (!isElectron()) return { ok: false, error: 'no_electron' }
  return window.electronAPI.deleteDeepSimResult(projectId, simId)
}

// ── Migration ──────────────────────────────────────────────────────────────
// Walk a project's deepSimulationHistory[]; for any inline entry, write a
// per-sim file and replace the entry with a metadata stub. Returns the new
// history array plus a count of how many entries were migrated.
//
// Idempotent: entries that are already stubs are passed through unchanged.
// Silent on success. On per-entry IPC failure, leaves the inline entry
// intact (caller can retry next session).
export async function migrateInlineHistory(projectId, history = []) {
  if (!Array.isArray(history) || history.length === 0) {
    return { history: [], migratedCount: 0, errors: [] }
  }
  if (!isElectron()) {
    return { history, migratedCount: 0, errors: [{ reason: 'no_electron' }] }
  }

  const out = []
  let migratedCount = 0
  const errors = []

  for (const entry of history) {
    if (!isInlineEntry(entry)) {
      out.push(entry)
      continue
    }
    const simId = entry.id || entry.simId
    if (!simId) {
      errors.push({ entry, reason: 'no_id' })
      out.push(entry)
      continue
    }
    try {
      const fullPayload = entryToFullPayload(entry)
      const writeRes = await window.electronAPI.saveDeepSimResult(projectId, simId, fullPayload)
      if (!writeRes?.ok) {
        errors.push({ simId, reason: writeRes?.error || 'save_failed' })
        out.push(entry)
        continue
      }
      out.push(entryToMetadata(entry))
      migratedCount++
    } catch (err) {
      errors.push({ simId, reason: err.message })
      out.push(entry)
    }
  }

  return { history: out, migratedCount, errors }
}
