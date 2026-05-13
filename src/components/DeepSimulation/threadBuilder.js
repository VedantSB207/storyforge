// Phase 5/5a — threadBuilder
// Pure data transformation: takes a completed simulation result and emits
// one chronological "thread" per bound Bible character — their POV events,
// rumours they received, actions they took, bonds formed, dialogues they
// participated in.
//
// No LLM calls. No engine state changes. The output is consumed by
// CharacterThreads.jsx for rendering.

// Category priority — used for tie-breaking when multiple timeline entries
// land on the same round. Higher number wins (renders first within a round).
const CATEGORY_PRIORITY = {
  death:          100,
  betrayal:       90,
  conflict:       80,
  dialogue:       70,
  bond_promoted:  65,
  cooperation:    60,
  travel:         55,
  rest:           40,
  eat:            30,
  observe:        20,
  need_critical:  15,
  witnessed:      10,
  rumour:         5,
  aging:          0,
}

// ── Build threads ──────────────────────────────────────────────────────────
// Input: simulationResult = { agents, events, dialogues, butterflyTrace, ... }
// Output: thread[] where each thread is:
//   { agentId, name, traits, regionStart, regionEnd, alive, ageStart, ageEnd,
//     timeline: [...], bondsSummary: [...], finalNeeds, knowledgeCount, dialogueCount }
export function buildCharacterThreads(simulationResult) {
  const { agents = [], events = [], dialogues = [] } = simulationResult || {}
  const bound = agents.filter(a => a?.source === 'bound')
  if (bound.length === 0) return []

  const agentById = Object.create(null)
  for (const a of agents) agentById[a.id] = a

  // Pre-index dialogues by participant
  const dialoguesByAgentId = Object.create(null)
  for (const d of dialogues) {
    for (const p of (d.participants || [])) {
      if (!dialoguesByAgentId[p.agentId]) dialoguesByAgentId[p.agentId] = []
      dialoguesByAgentId[p.agentId].push(d)
    }
  }

  // Pre-index events by primary actor (agentId) and by target (targetId)
  const eventsAsActor = Object.create(null)
  const eventsAsTarget = Object.create(null)
  for (const e of events) {
    if (e.agentId) {
      if (!eventsAsActor[e.agentId]) eventsAsActor[e.agentId] = []
      eventsAsActor[e.agentId].push(e)
    }
    if (e.targetId) {
      if (!eventsAsTarget[e.targetId]) eventsAsTarget[e.targetId] = []
      eventsAsTarget[e.targetId].push(e)
    }
  }

  return bound.map(agent => buildOneThread({
    agent, agentById, eventsAsActor, eventsAsTarget, dialoguesByAgentId,
  }))
}

function buildOneThread({ agent, agentById, eventsAsActor, eventsAsTarget, dialoguesByAgentId }) {
  const timeline = []

  // Actions taken — direct from event log where agentId === self
  for (const e of (eventsAsActor[agent.id] || [])) {
    // Skip own death; it shows as a top-level alive=false instead
    if (e.category === 'death' && e.agentId === agent.id) continue
    timeline.push({
      round:    e.round,
      category: e.category,
      content:  e.content,
      kind:     'action',
      eventId:  e.id || null,
      targetId: e.targetId || null,
      targetName: e.targetName || null,
    })
  }

  // Events where this agent was the target (received cooperation, conflict, betrayal etc.)
  for (const e of (eventsAsTarget[agent.id] || [])) {
    if (e.agentId === agent.id) continue   // avoid double-counting
    timeline.push({
      round:    e.round,
      category: e.category,
      content:  e.content,
      kind:     'targeted',
      eventId:  e.id || null,
      sourceId: e.agentId,
    })
  }

  // Knowledge entries — what this agent learned
  for (const k of (agent.knownFacts || [])) {
    if (k.source === 'firsthand') {
      // Skip own actions already in timeline (death of self is handled separately)
      // Include any other firsthand witness as a 'witnessed' entry
      timeline.push({
        round:        k.roundLearned,
        category:     'witnessed',
        content:      k.content,
        kind:         'witnessed',
        confidence:   k.confidence,
        originEventId: k.originEventId,
      })
    } else if (k.hops > 0) {
      timeline.push({
        round:        k.roundLearned,
        category:     'rumour',
        content:      k.content,
        kind:         'rumour',
        confidence:   k.confidence,
        source:       k.source,
        hops:         k.hops,
        distortionMode: k.distortionMode,
      })
    }
  }

  // Dialogues this agent participated in
  for (const d of (dialoguesByAgentId[agent.id] || [])) {
    const otherName = d.participants.find(p => p.agentId !== agent.id)?.name || '?'
    timeline.push({
      round:    d.round,
      category: 'dialogue',
      kind:     'dialogue',
      content:  `Dialogue with ${otherName} (${d.eventCategory})`,
      dialogueRef: d,
    })
  }

  // Bond promotions on this agent's bonds
  for (const b of Object.values(agent.bonds || {})) {
    const other = agentById[b.otherId]
    const otherName = other?.name || b.otherId
    for (const h of (b.history || [])) {
      if (h.eventType === 'promotion') {
        timeline.push({
          round:    h.round,
          category: 'bond_promoted',
          kind:     'bond',
          content:  `Bond with ${otherName} shifted: ${h.from} → ${h.to}`,
          fromType: h.from,
          toType:   h.to,
          otherId:  b.otherId,
          otherName,
        })
      }
    }
  }

  // Sort: by round ascending, then by category priority desc within same round
  timeline.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round
    return (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0)
  })

  // Filter out duplicate-content entries on the same round (rumour/witnessed
  // often duplicate the action entry already present)
  const seen = new Set()
  const dedupedTimeline = []
  for (const t of timeline) {
    const key = `${t.round}|${t.category}|${(t.content || '').slice(0, 60)}|${t.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    dedupedTimeline.push(t)
  }

  // Find death round if applicable
  const deathEvent = (eventsAsActor[agent.id] || []).find(e => e.category === 'death')
  const diedRound = deathEvent?.round ?? null

  return {
    agentId:        agent.id,
    name:           agent.name,
    traits:         agent.traits || [],
    values:         agent.values || [],
    regionStart:    agent.location?.region || 'unknown',
    regionEnd:      agent.region || agent.location?.region || 'unknown',
    alive:          agent.alive,
    diedRound,
    ageStart:       30,   // bound chars start at age 30 per AgentFactory
    ageEnd:         agent.age,
    timeline:       dedupedTimeline,
    bondsSummary:   summarizeBonds(agent, agentById),
    finalNeeds:     { ...(agent.needs || {}) },
    knowledgeCount: (agent.knownFacts || []).length,
    dialogueCount:  (dialoguesByAgentId[agent.id] || []).length,
  }
}

// Top 5 bonds, by intensity, with the other agent's name + bond detail.
export function summarizeBonds(agent, agentById = {}) {
  if (!agent.bonds) return []
  return Object.values(agent.bonds)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 5)
    .map(b => ({
      otherId:   b.otherId,
      otherName: agentById[b.otherId]?.name || b.otherId,
      otherSource: agentById[b.otherId]?.source || 'unknown',
      type:      b.type,
      intensity: b.intensity,
      trust:     b.trust,
      interactions: b.history?.length || 0,
    }))
}

// What makes a timeline entry significant enough to show? Currently we
// show everything because the per-character thread is the writer's deep-
// dive view. Phase 6 may add an "important moments only" filter.
export function getSignificantEvents(agent, simulationResult) {
  return (simulationResult.events || []).filter(e =>
    e.agentId === agent.id || e.targetId === agent.id
  )
}
