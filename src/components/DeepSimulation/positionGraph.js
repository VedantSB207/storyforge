// Phase 3 — positionGraph
// Where every agent is, and what counts as near. The propagation system
// uses this to compute witness lists and adjacent-agent gossip targets.
//
// Phase 3 is intentionally a coarse spatial model — six default regions
// arranged as a star around `central`. Phase 5 may refine to per-place
// granularity, but the propagation logic doesn't care: regions are just
// nodes in an adjacency graph.

// Default region adjacency map. Each region lists its direct neighbours.
// Distance 0 = same region, 1 = adjacent (in this list), 2+ = no edge.
const DEFAULT_ADJACENCY = {
  central:    ['north', 'south', 'east', 'west', 'wilderness'],
  north:      ['central', 'east', 'west'],
  south:      ['central', 'east', 'west'],
  east:       ['central', 'north', 'south'],
  west:       ['central', 'north', 'south'],
  wilderness: ['central'],
}

const DEFAULT_REGIONS = Object.keys(DEFAULT_ADJACENCY)

// Genre → region affinity weights (used to distribute procedural NPCs).
// Animals lean wilderness; humans lean settled; supernaturals scatter.
const GENRE_AFFINITY = {
  animal_kingdom:     { wilderness: 0.55, north: 0.10, south: 0.10, east: 0.10, west: 0.10, central: 0.05 },
  humans:             { central: 0.45, north: 0.15, south: 0.15, east: 0.10, west: 0.10, wilderness: 0.05 },
  supernatural:       { central: 0.25, north: 0.20, south: 0.20, east: 0.15, west: 0.15, wilderness: 0.05 },
  mythology:          { wilderness: 0.30, central: 0.25, north: 0.15, south: 0.10, east: 0.10, west: 0.10 },
  spirits:            { wilderness: 0.40, central: 0.20, north: 0.10, south: 0.10, east: 0.10, west: 0.10 },
  mechanical:         { central: 0.50, north: 0.15, south: 0.15, east: 0.10, west: 0.10, wilderness: 0.00 },
  undead:             { wilderness: 0.40, central: 0.20, north: 0.15, south: 0.15, east: 0.05, west: 0.05 },
}

// Regions a bound character's profile suggests, by keyword.
const REGION_KEYWORDS = {
  north:      ['north', 'mountain', 'cold', 'frost', 'ice', 'glacier'],
  south:      ['south', 'desert', 'jungle', 'tropical', 'sand'],
  east:       ['east', 'coast', 'sea', 'ocean', 'shore', 'harbour', 'harbor'],
  west:       ['west', 'plain', 'prairie', 'frontier'],
  central:    ['central', 'capital', 'city', 'town', 'court', 'palace', 'kingdom', 'castle', 'school', 'academy'],
  wilderness: ['wilderness', 'forest', 'wood', 'wild', 'cave', 'swamp', 'marsh', 'mountain', 'hidden'],
}

// Detect a region from free-text agent description fields. Returns first
// matching region or `central` as fallback.
function detectRegionFromText(...texts) {
  const blob = texts.filter(Boolean).join(' ').toLowerCase()
  for (const [region, keys] of Object.entries(REGION_KEYWORDS)) {
    for (const k of keys) {
      if (blob.includes(k)) return region
    }
  }
  return null
}

// ── Build region list from project lore ───────────────────────────────────
// If the project has lore entries with categories that imply geography,
// they become candidate regions. Otherwise we use the default six.
//
// Phase 3 keeps this simple: we still use the default region graph for
// adjacency. Lore-derived names are used only to assign agents to richer
// region labels — but the adjacency graph stays generic. Phase 5 may
// upgrade this to per-project adjacency.
export function deriveRegions(lore = []) {
  const found = new Set()
  for (const r of lore) {
    const cat = (r.cat || '').toLowerCase()
    if (cat === 'geography' || cat === 'location' || cat === 'place' || cat === 'setting') {
      // Keep the default regions as primary; lore just confirms presence
      const detected = detectRegionFromText(r.rule || '')
      if (detected) found.add(detected)
    }
  }
  if (found.size === 0) return DEFAULT_REGIONS
  // Always include central + wilderness so the graph stays connected
  found.add('central')
  found.add('wilderness')
  return DEFAULT_REGIONS.filter(r => found.has(r))
}

// Pick a weighted-random region for a procedural NPC based on genre.
function pickRegionForGenre(genreId, rng) {
  const weights = GENRE_AFFINITY[genreId] || GENRE_AFFINITY.humans
  const r = rng()
  let acc = 0
  for (const [region, w] of Object.entries(weights)) {
    acc += w
    if (r < acc) return region
  }
  return 'central'
}

// Pick a region for a bound Bible character from their profile text.
function pickRegionForBibleChar(agent, allCharData = {}) {
  // agent.bibleId points back to the original Story Bible char; we may not
  // have that data here, so detect from any free-text fields on the agent.
  const c = allCharData[agent.bibleId] || {}
  return (
    detectRegionFromText(c.species, c.role, c.traits, c.stakes, c.contradictions, c.location)
    || detectRegionFromText(...(agent.traits || []), ...(agent.values || []))
    || 'central'
  )
}

// ── Initialise positions for a full agent list ────────────────────────────
// Returns { regions, agentRegion: { [agentId]: region }, adjacency }.
// Mutates each agent in place to set agent.region (matches schema).
export function initialisePositions(agents, lore = [], chars = [], rng = Math.random) {
  const regions = deriveRegions(lore)
  const adjacency = DEFAULT_ADJACENCY
  const charById = {}
  for (const c of chars) charById[c.id] = c

  const agentRegion = {}
  for (const a of agents) {
    let region
    if (a.source === 'bound') {
      region = pickRegionForBibleChar(a, charById)
    } else {
      const [genreId] = String(a.genreTag || '').split(':')
      region = pickRegionForGenre(genreId, rng)
    }
    if (!regions.includes(region)) region = 'central'
    a.region = region
    a.location = a.location || { region, town: 'unknown', place: 'unknown' }
    a.location.region = region
    agentRegion[a.id] = region
  }

  return { regions, agentRegion, adjacency }
}

// ── Distance between two agents ───────────────────────────────────────────
// 0 = same region, 1 = adjacent regions, Infinity = otherwise
export function distance(agentA, agentB, positionState) {
  if (!agentA || !agentB) return Infinity
  const ra = agentA.region || positionState.agentRegion[agentA.id]
  const rb = agentB.region || positionState.agentRegion[agentB.id]
  if (!ra || !rb) return Infinity
  if (ra === rb) return 0
  const adj = positionState.adjacency[ra] || []
  if (adj.includes(rb)) return 1
  return Infinity
}

export function regionsAdjacentTo(region, positionState) {
  return positionState.adjacency[region] || []
}

// All agents in the same region or an adjacent region as `agent`,
// excluding `agent` itself. Used by the gossip step.
export function adjacentAgents(agent, agents, positionState) {
  const region = agent.region || positionState.agentRegion[agent.id]
  if (!region) return []
  const sameOrAdj = new Set([region, ...(positionState.adjacency[region] || [])])
  return agents.filter(o => o !== agent && sameOrAdj.has(o.region || positionState.agentRegion[o.id]))
}

// All agents in the same region as `agent`, excluding `agent`.
export function sameRegionAgents(agent, agents, positionState) {
  const region = agent.region || positionState.agentRegion[agent.id]
  if (!region) return []
  return agents.filter(o => o !== agent && (o.region || positionState.agentRegion[o.id]) === region)
}
