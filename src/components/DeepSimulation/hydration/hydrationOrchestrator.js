// Phase 6/6a-i — Hydration orchestrator
//
// One-shot pipeline that runs character inference + relationship mapping
// for a project. Knowledge seeding is run separately by SimulationRunner
// at the moment a simulation actually starts (per-sim cost).

import { inferAllCharacters } from './characterInference.js'
import { mapRelationshipsToBonds, summarizeSeededBonds } from './relationshipMapper.js'

// Returns { hydrationData, cost, errors, callsUsed }.
// hydrationData shape:
// {
//   inferences:    { agentId: <inference> },
//   editedFields:  { agentId: { age?, status?, location?, backgroundSummary? } }, // user overrides preserved across re-infers
//   bondsByAgentId:{ agentId: { otherAgentId: bond } },
//   bondsSummary:  [...]  // for the Hydration Review UI
//   inferredAt:    ISO,
//   cost:          number,
//   callsUsed:     number,
//   profileHashes: { agentId: hash }
// }
export async function runHydration({
  chars,
  relationships = [],
  worldRulesText = '',
  cachedHydration = null,
  onProgress = null,
}) {
  // 1. Character inference (with cache hits short-circuiting)
  const inferenceResult = await inferAllCharacters({
    chars, worldRulesText,
    cachedHydration: cachedHydration || {},
    onProgress: onProgress ? (e) => onProgress({ stage: 'inference', ...e }) : null,
  })

  // 2. Relationship mapping — pure logic, no LLM
  if (onProgress) onProgress({ stage: 'mapping', status: 'mapping_relationships' })
  const bondsByAgentId = mapRelationshipsToBonds({
    relationshipWebData:    relationships,
    inferredRelationships:  inferenceResult.inferences,
    chars,
  })
  const bondsSummary = summarizeSeededBonds(bondsByAgentId, chars)

  // 3. Preserve writer edits from any previous hydration cycle
  const editedFields = (cachedHydration?.editedFields) || {}

  return {
    hydrationData: {
      inferences:    inferenceResult.inferences,
      editedFields,
      bondsByAgentId,
      bondsSummary,
      inferredAt:    new Date().toISOString(),
      cost:          inferenceResult.totalCost,
      callsUsed:     inferenceResult.callsUsed,
      errors:        inferenceResult.errors,
    },
    cost:        inferenceResult.totalCost,
    errors:      inferenceResult.errors,
    callsUsed:   inferenceResult.callsUsed,
  }
}

// Apply writer edits from the Hydration Review screen on top of inferences.
// Returns the merged view (inference field → edited field if present).
export function effectiveInference(hydrationData, agentId) {
  const inf  = hydrationData?.inferences?.[agentId]
  const edits = hydrationData?.editedFields?.[agentId] || {}
  if (!inf) return null
  return {
    ...inf,
    age:                edits.age              != null ? { ...inf.age, value: edits.age, approximate: false } : inf.age,
    status:             edits.status              ?? inf.status,
    location:           edits.location            ?? inf.location,
    backgroundSummary:  edits.backgroundSummary   ?? inf.backgroundSummary,
    _edited: {
      age:               edits.age              != null,
      status:            edits.status           != null,
      location:          edits.location         != null,
      backgroundSummary: edits.backgroundSummary!= null,
    },
  }
}

// Save a single writer edit. Returns the new hydrationData.
export function applyEdit(hydrationData, agentId, field, value) {
  const next = { ...hydrationData }
  const editedFields = { ...(next.editedFields || {}) }
  editedFields[agentId] = { ...(editedFields[agentId] || {}), [field]: value }
  next.editedFields = editedFields
  return next
}

// Reset one edited field — falls back to inferred value.
export function resetEdit(hydrationData, agentId, field) {
  const next = { ...hydrationData }
  const editedFields = { ...(next.editedFields || {}) }
  if (editedFields[agentId]) {
    const { [field]: _, ...rest } = editedFields[agentId]
    editedFields[agentId] = rest
  }
  next.editedFields = editedFields
  return next
}
