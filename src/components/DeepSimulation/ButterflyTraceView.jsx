// Phase 5/5b-Causation — Butterfly Trace View
//
// Two modes:
//   A) Trace BACK from a Knowledge entry → origin event (linear chain)
//   B) Trace FORWARD from an event → descendant tree (top-down)
//
// Uses the O(1) _outByFrom and _inByTo adjacency indexes from Phase 3.
// Pure SVG render. Color-coded by distortion mode.

import { useState, useMemo } from 'react'
import { C } from '../../constants.js'
import { traceBack, descendantsOf } from './butterflyTrace.js'
import { getEventColor, getAgentColor, formatRoundLabel } from './visualizationHelpers.js'

const MODE_COLORS = {
  witness:        '#26c6da',
  trait:          '#5e9bd4',
  llm:            '#ce93d8',
  trait_fallback: '#ffb74d',
}

export function ButterflyTraceView({ simulationResult }) {
  const trace = simulationResult?.butterflyTrace
  const agents = simulationResult?.agents || []
  const events = simulationResult?.events || []
  const roundCount = simulationResult?.roundCount || 30
  const timeUnit = simulationResult?.timeUnit || 'year'
  const [mode, setMode] = useState('back')  // 'back' | 'forward'
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('')

  if (!trace) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui', color: C.muted }}>
        <div style={{ fontSize: 13 }}>Butterfly Trace data not available for this run.</div>
        <div style={{ fontSize: 11, marginTop: 6 }}>
          The full butterfly trace is generated during simulation but not persisted to disk in
          per-sim files (size optimisation). Run a fresh simulation to view trace data, or
          enable trace persistence in Phase 6.
        </div>
      </div>
    )
  }

  const agentById = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents])
  const boundAgents = agents.filter(a => a.source === 'bound')

  // For mode A: knowledge entries of the selected agent
  const agentKnowledge = useMemo(() => {
    const a = agentById[selectedAgentId]
    if (!a) return []
    return (a.knownFacts || [])
      .filter(k => k.hops > 0 || k.source === 'firsthand')
      .sort((x, y) => (x.roundLearned ?? 0) - (y.roundLearned ?? 0))
  }, [selectedAgentId, agentById])

  // For mode B: significant events (death/betrayal/conflict)
  const significantEvents = useMemo(() =>
    events
      .filter(e => ['death', 'betrayal', 'conflict', 'cooperation'].includes(e.category))
      .sort((a, b) => (a.round - b.round))
  , [events])

  // Compute the chain/tree
  const result = useMemo(() => {
    if (mode === 'back' && selectedKnowledgeId) {
      const path = traceBack(selectedKnowledgeId, trace)
      return { kind: 'chain', path }
    }
    if (mode === 'forward' && selectedEventId) {
      const event = trace.events[selectedEventId]
      const descendants = descendantsOf(selectedEventId, trace)
      return { kind: 'tree', event, descendants }
    }
    return null
  }, [mode, selectedKnowledgeId, selectedEventId, trace])

  return (
    <div style={{ fontFamily: 'system-ui', color: C.parch }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          onClick={() => setMode('back')}
          style={modeBtnStyle(mode === 'back')}
        >Trace BACK from Knowledge</button>
        <button
          onClick={() => setMode('forward')}
          style={modeBtnStyle(mode === 'forward')}
        >Trace FORWARD from Event</button>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        {mode === 'back' && (
          <>
            <select
              value={selectedAgentId}
              onChange={e => { setSelectedAgentId(e.target.value); setSelectedKnowledgeId('') }}
              style={selectStyle}
            >
              <option value="">Select agent…</option>
              {boundAgents.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({(a.knownFacts || []).length} facts)</option>
              ))}
            </select>
            {selectedAgentId && (
              <select
                value={selectedKnowledgeId}
                onChange={e => setSelectedKnowledgeId(e.target.value)}
                style={{ ...selectStyle, flex: 1 }}
              >
                <option value="">Select knowledge entry…</option>
                {agentKnowledge.map(k => (
                  <option key={k.id} value={k.id}>
                    r{k.roundLearned} · {k.source === 'firsthand' ? '[witnessed]' : `[hop ${k.hops}]`} · {(k.content || '').slice(0, 60)}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {mode === 'forward' && (
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            style={{ ...selectStyle, flex: 1 }}
          >
            <option value="">Select event…</option>
            {significantEvents.slice(0, 200).map(e => (
              <option key={e.id} value={e.id}>
                r{e.round} · {e.category} · {(e.content || '').slice(0, 60)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '14px 18px', minHeight: 380 }}>
        {!result && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontFamily: 'system-ui', fontSize: 12 }}>
            {mode === 'back'
              ? 'Select a bound character, then a knowledge entry to trace back to its origin.'
              : 'Select an event to see how it spread.'}
          </div>
        )}
        {result?.kind === 'chain' && <ChainView path={result.path} agentById={agentById} timeUnit={timeUnit}/>}
        {result?.kind === 'tree'  && <TreeView event={result.event} descendants={result.descendants} agentById={agentById} timeUnit={timeUnit}/>}
      </div>
    </div>
  )
}

function modeBtnStyle(active) {
  return {
    padding: '6px 14px',
    backgroundColor: active ? C.purple + '33' : 'transparent',
    color: active ? C.purpleLight : C.muted,
    border: `1px solid ${active ? C.purple + '66' : C.border}`,
    borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui',
  }
}

const selectStyle = {
  padding: '6px 10px',
  backgroundColor: C.bgCard,
  color: C.parch,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'system-ui',
}

// Vertical chain view: origin event → hop 1 → hop 2 → ... → leaf
function ChainView({ path, agentById, timeUnit }) {
  if (!path?.length) return <div style={{ color: C.muted, fontSize: 12, padding: 16 }}>No chain found.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {path.map((node, i) => {
        const isOrigin = node.kind === 'event'
        const knowledge = node.kind === 'knowledge' ? node.node : null
        const owner = knowledge ? agentById[knowledge.ownerId] : null
        const ev = isOrigin ? node.node : null
        const distortionMode = knowledge?.distortionMode || (isOrigin ? 'witness' : 'witness')
        const modeColor = MODE_COLORS[distortionMode] || C.muted
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flexShrink: 0, width: 18, height: 18, marginTop: 4, borderRadius: 9, backgroundColor: isOrigin ? '#ffd54f' : modeColor, color: '#000', fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
              {isOrigin ? '★' : (knowledge?.hops ?? 0)}
            </div>
            <div style={{ flex: 1, padding: '8px 12px', backgroundColor: C.bgElevated, border: `1px solid ${isOrigin ? '#ffd54f55' : modeColor + '44'}`, borderLeft: `3px solid ${isOrigin ? '#ffd54f' : modeColor}`, borderRadius: 4 }}>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {isOrigin
                  ? `Origin · ${formatRoundLabel(ev?.round, timeUnit)} · ${ev?.category}`
                  : `Hop ${knowledge?.hops} · ${formatRoundLabel(knowledge?.roundLearned, timeUnit)} · ${distortionMode} · conf ${knowledge?.confidence?.toFixed(2)}`}
              </div>
              <div style={{ fontSize: 12, color: C.parch, fontFamily: 'Georgia, serif', fontStyle: 'italic', lineHeight: 1.5 }}>
                &ldquo;{isOrigin ? ev?.content : knowledge?.content}&rdquo;
              </div>
              {owner && (
                <div style={{ fontSize: 10, color: getAgentColor(owner), fontFamily: 'system-ui', marginTop: 4 }}>
                  held by {owner.name} ({owner.source})
                </div>
              )}
              {isOrigin && ev?.agentName && (
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
                  actor: {ev.agentName}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Tree view for descendants
function TreeView({ event, descendants, agentById, timeUnit }) {
  if (!event) return <div style={{ color: C.muted, fontSize: 12 }}>Event not found.</div>
  // Group descendants by hop
  const byHop = new Map()
  for (const k of descendants) {
    if (!byHop.has(k.hops)) byHop.set(k.hops, [])
    byHop.get(k.hops).push(k)
  }
  const hops = [...byHop.keys()].sort((a, b) => a - b)
  return (
    <div>
      <div style={{ padding: '10px 14px', marginBottom: 14, backgroundColor: C.bgElevated, border: `1px solid #ffd54f55`, borderLeft: `3px solid #ffd54f`, borderRadius: 4 }}>
        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          ★ Origin · {formatRoundLabel(event.round, timeUnit)} · {event.category}
        </div>
        <div style={{ fontSize: 13, color: C.parch, fontFamily: 'Georgia, serif', fontStyle: 'italic', lineHeight: 1.5 }}>
          &ldquo;{event.content}&rdquo;
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
          Reached {descendants.length} downstream knowledge entr{descendants.length === 1 ? 'y' : 'ies'} across {hops.length} hop level{hops.length === 1 ? '' : 's'}.
        </div>
      </div>
      {hops.map(h => {
        const entries = byHop.get(h) || []
        return (
          <div key={h} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Hop {h} — {entries.length} hold{entries.length === 1 ? 'er' : 'ers'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entries.slice(0, 12).map((k, i) => {
                const owner = agentById[k.ownerId]
                const mode = k.distortionMode || 'witness'
                const modeColor = MODE_COLORS[mode] || C.muted
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 10px', backgroundColor: C.bgElevated, borderLeft: `2px solid ${modeColor}`, borderRadius: 3 }}>
                    <span style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', minWidth: 42 }}>R{k.roundLearned}</span>
                    <span style={{ flex: 1, fontSize: 11, color: C.mutedLight, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                      &ldquo;{k.content}&rdquo;
                    </span>
                    <span style={{ fontSize: 9, color: getAgentColor(owner), fontFamily: 'system-ui', textAlign: 'right' }}>
                      {owner?.name || k.ownerId}
                    </span>
                    <span style={{ fontSize: 9, color: modeColor, fontFamily: 'system-ui', minWidth: 50, textAlign: 'right', textTransform: 'uppercase' }}>
                      {mode} {k.confidence?.toFixed(2)}
                    </span>
                  </div>
                )
              })}
              {entries.length > 12 && (
                <div style={{ fontSize: 10, color: C.muted, fontStyle: 'italic', paddingLeft: 12 }}>
                  + {entries.length - 12} more at hop {h}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
