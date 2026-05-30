// Phase 2 — CensusManager
// Holds the distinction between census (~5x cast, conceptual population)
// and active cast (subset whose decisions are computed each round).
//
// Phase 2 relevance scoring is deliberately simple:
//   - bound agents (Bible chars): relevance = 1.0, always in active cast
//   - procedural NPCs: relevance from random sampling
// Phase 3+ will add graph-based relevance.

import { createAgentsFromBible } from './AgentFactory.js'
import { generateNPCs } from './NPCGenerator.js'
import { CENSUS_MULTIPLIER } from './deepSimSchema.js'
import { assignArchetypes, taxonomyGenres } from '../Psychology/npcArchetypePool.js'

// Build the full census + select the active cast for a simulation run.
// Returns:
//   {
//     boundAgents:      [...]   // Story Bible characters
//     proceduralAgents: [...]   // generated NPCs (the rest of census)
//     census:           [...]   // boundAgents + proceduralAgents
//     activeCast:       [...]   // bound + sampled procedural up to castSize
//     stats:            { ... } // counts for the results screen
//   }
export function buildCensus({
  chars,
  taxonomy,
  castSize,
  censusMultiplier = CENSUS_MULTIPLIER,
  rng = Math.random,
  // Phase 6/6a-i — hydration + seeded knowledge
  hydration = null,
  seededKnowledgeByAgentId = null,
  // Phase 6/6a-ii — world rules (lifespan + aging behaviour)
  worldRules = null,
}) {
  const boundAgents      = createAgentsFromBible(chars || [], hydration, seededKnowledgeByAgentId, worldRules)
  const proceduralAgents = generateNPCs({ taxonomy, castSize, censusMultiplier, rng, worldRules })

  // Phase 7/7a — assign psychological archetypes to NPCs from the genre-aware
  // pool. Uses the same seeded RNG so determinism is preserved. The Bible-bound
  // agents already carry their writer-set profile (or freshProfile if unset).
  const genres = taxonomyGenres(taxonomy)
  const archetypeMap = assignArchetypes(proceduralAgents, genres, rng)
  for (const npc of proceduralAgents) {
    const profile = archetypeMap[npc.id]
    if (profile) npc.psychology = profile
  }

  const census           = [...boundAgents, ...proceduralAgents]

  // Active cast = all bound + procedural sampled by relevance.
  // Phase 6/6a-i: exclude dead bound chars from active cast (they don't act).
  // Missing/exiled/dormant bound chars stay in the cast — they're offstage but
  // their bonds persist and others can reference them.
  const liveBound       = boundAgents.filter(a => a.alive)
  const proceduralSlots = Math.max(0, castSize - liveBound.length)
  const sampled         = sampleProceduralByRelevance(proceduralAgents, proceduralSlots, rng)
  const activeCast      = [...liveBound, ...sampled]

  return {
    boundAgents,
    proceduralAgents,
    census,
    activeCast,
    stats: {
      boundCount:        boundAgents.length,
      proceduralCount:   proceduralAgents.length,
      censusCount:       census.length,
      activeCastCount:   activeCast.length,
      requestedCastSize: castSize,
      censusMultiplier,
    },
  }
}

// Sample N procedural agents, weighted by relevance. Phase 2 is uniform —
// hook is in place so Phase 3 can drop in proximity / faction logic without
// touching DeepSimulation.jsx.
function sampleProceduralByRelevance(npcs, count, rng) {
  if (count <= 0 || npcs.length === 0) return []
  if (npcs.length <= count) return [...npcs]
  // Simple Fisher-Yates partial shuffle — good enough for uniform sampling
  const copy = [...npcs]
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (copy.length - i))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}
