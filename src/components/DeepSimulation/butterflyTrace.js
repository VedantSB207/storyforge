// Phase 3 — butterflyTrace
// The causal graph of information propagation. Records origin events as
// nodes, Knowledge entries as nodes, and propagation hops as edges.
//
// Phase 3: trace is RECORDED only.
// Phase 4: trace will inform agent decisions.
// Phase 5: trace will be visualised.

// Shape:
//   {
//     events:    { [eventId]: <event with id> },
//     knowledge: { [knowledgeId]: <knowledge entry> },
//     edges:     [{ from, to, transmitter, receiver, round, distortionMode, confidenceLost }]
//   }
//
// Edge `from` is either an eventId (origin) or a knowledgeId (parent hop).
// Edge `to` is a knowledgeId.

export function createTrace() {
  return {
    events:    Object.create(null),
    knowledge: Object.create(null),
    edges:     [],
    // Adjacency indexes — populated as edges are added. Without these,
    // descendantsOf and traceBack are O(N²) and become hostile at scale
    // (1000 cast can produce 200k+ edges).
    _outByFrom: Object.create(null),   // fromId  → [edge, edge, ...]
    _inByTo:    Object.create(null),   // toId    → edge (single parent)
    // Deterministic counter for synthesised event IDs — replaces Math.random
    // so two runs with the same seed produce byte-identical IDs.
    _eventIdCounter: 0,
  }
}

// Record an origin event in the trace. Returns the event id (mutates event
// to add an id if it lacks one).
export function recordOriginEvent(event, trace) {
  if (!event.id) {
    trace._eventIdCounter = (trace._eventIdCounter || 0) + 1
    event.id = `ev_${event.round || 0}_${trace._eventIdCounter.toString(36)}`
  }
  trace.events[event.id] = {
    id:        event.id,
    round:     event.round,
    agentId:   event.agentId || event.originAgentId,
    agentName: event.agentName,
    category:  event.category,
    content:   event.content,
  }
  return event.id
}

// Record a Knowledge entry created during propagation.
export function recordKnowledge(entry, trace) {
  trace.knowledge[entry.id] = entry
  return entry.id
}

// Record an edge from a parent (event or earlier Knowledge) to a new
// Knowledge entry, with metadata on the hop.
export function recordPropagationEdge(fromId, toId, metadata, trace) {
  const edge = {
    from: fromId,
    to:   toId,
    transmitter:    metadata.transmitter || null,
    receiver:       metadata.receiver    || null,
    round:          metadata.round,
    distortionMode: metadata.distortionMode,
    confidenceLost: metadata.confidenceLost,
  }
  trace.edges.push(edge)
  // Maintain adjacency indexes
  if (!trace._outByFrom[fromId]) trace._outByFrom[fromId] = []
  trace._outByFrom[fromId].push(edge)
  trace._inByTo[toId] = edge
}

// Walk back from a Knowledge entry to its origin event. Returns an array
// of { id, kind, ... } in order from origin → final entry. O(hops) using
// the _inByTo adjacency index.
export function traceBack(knowledgeId, trace) {
  const path = []
  let current = trace.knowledge[knowledgeId]
  if (!current) return path
  const guardSeen = new Set()
  while (current && !guardSeen.has(current.id)) {
    guardSeen.add(current.id)
    path.unshift({ kind: 'knowledge', node: current })
    const incoming = trace._inByTo[current.id]
    if (!incoming) break
    if (trace.events[incoming.from]) {
      path.unshift({ kind: 'event', node: trace.events[incoming.from], edge: incoming })
      break
    }
    if (trace.knowledge[incoming.from]) {
      path[0].edge = incoming
      current = trace.knowledge[incoming.from]
    } else {
      break
    }
  }
  return path
}

// All Knowledge entries derived (directly or transitively) from one origin event.
// O(descendants) using _outByFrom adjacency index — was O(events × edges²)
// before, which made stress tests at 1000 cast hang.
export function descendantsOf(eventId, trace) {
  const out = []
  const seen = new Set()
  const queue = []
  const outFromOrigin = trace._outByFrom[eventId] || []
  for (const e of outFromOrigin) queue.push(e.to)
  while (queue.length) {
    const kid = queue.shift()
    if (seen.has(kid)) continue
    seen.add(kid)
    if (trace.knowledge[kid]) out.push(trace.knowledge[kid])
    const children = trace._outByFrom[kid] || []
    for (const e of children) {
      if (!seen.has(e.to)) queue.push(e.to)
    }
  }
  return out
}

export function traceStats(trace) {
  return {
    eventCount:     Object.keys(trace.events).length,
    knowledgeCount: Object.keys(trace.knowledge).length,
    edgeCount:      trace.edges.length,
  }
}
