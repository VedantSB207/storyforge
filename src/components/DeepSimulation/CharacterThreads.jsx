// Phase 5/5a — CharacterThreads
// One collapsible card per bound Bible character, showing their chronological
// arc through the simulation: actions, witnessed events, rumours, bond
// promotions, dialogues. Data assembled by threadBuilder.js.

import { useState, useMemo } from 'react'
import { C } from '../../constants.js'
import { buildCharacterThreads } from './threadBuilder.js'
import { getAgentColor, getEventColor, getBondTypeColor } from './visualizationHelpers.js'

export function CharacterThreads({ simulationResult }) {
  const threads = useMemo(
    () => buildCharacterThreads(simulationResult || {}),
    [simulationResult]
  )
  const [expanded, setExpanded] = useState(() => {
    // First character expanded by default
    return new Set(threads[0] ? [threads[0].agentId] : [])
  })

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (threads.length === 0) {
    return (
      <div style={{ padding: 24, fontSize: 12, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>
        No bound Bible characters in this simulation.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
      {threads.map(thread => (
        <CharacterCard
          key={thread.agentId}
          thread={thread}
          expanded={expanded.has(thread.agentId)}
          onToggle={() => toggle(thread.agentId)}
        />
      ))}
    </div>
  )
}

function CharacterCard({ thread, expanded, onToggle }) {
  const color = getAgentColor({ id: thread.agentId, source: 'bound' })
  const statusLabel = thread.alive
    ? `alive · age ${thread.ageEnd.toFixed(1)}`
    : `died in round ${thread.diedRound ?? '?'} at age ${thread.ageEnd.toFixed(1)}`
  const statusColor = thread.alive ? C.green : C.accBright

  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', display: 'flex',
          alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ fontSize: 16, color: C.parch, fontFamily: 'Georgia, serif', fontWeight: 600 }}>{thread.name}</span>
        <span style={{ fontSize: 11, color: statusColor, fontFamily: 'system-ui' }}>{statusLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui' }}>
          {thread.timeline.length} moments · {thread.bondsSummary.length} bonds · {thread.dialogueCount} dialogues
        </span>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: 'system-ui', marginLeft: 6 }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 18px' }}>
          {/* Header strip — traits + regions */}
          <div style={{ fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', marginBottom: 12, lineHeight: 1.6 }}>
            {thread.traits.length > 0 && (
              <div><strong style={{ color: C.muted, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.08em' }}>Traits:</strong> {thread.traits.join(', ')}</div>
            )}
            <div style={{ marginTop: 4 }}>
              <strong style={{ color: C.muted, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.08em' }}>Region:</strong> {thread.regionStart}
              {thread.regionStart !== thread.regionEnd && <span> → {thread.regionEnd}</span>}
            </div>
          </div>

          {/* Top bonds summary */}
          {thread.bondsSummary.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Top Bonds at End</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {thread.bondsSummary.map((b, i) => (
                  <div key={i} style={{
                    padding: '4px 8px', fontSize: 10, fontFamily: 'system-ui',
                    backgroundColor: getBondTypeColor(b.type) + '22',
                    border: `1px solid ${getBondTypeColor(b.type)}66`,
                    color: getBondTypeColor(b.type),
                    borderRadius: 3,
                  }}>
                    {b.otherName} · {b.type} · int {b.intensity.toFixed(2)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto', paddingRight: 6 }}>
            {thread.timeline.length === 0 ? (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui' }}>
                No notable events for this character.
              </div>
            ) : (
              thread.timeline.map((entry, i) => <TimelineEntry key={i} entry={entry} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineEntry({ entry }) {
  const color = getEventColor(entry.category)
  // Use a category-specific format
  if (entry.kind === 'dialogue') {
    return <DialogueEntry entry={entry} />
  }

  const subtle = entry.kind === 'rumour' || entry.kind === 'witnessed'
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 8px', backgroundColor: C.bgElevated, borderLeft: `2px solid ${color}`, borderRadius: 3 }}>
      <div style={{ width: 50, fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingTop: 1 }}>
        R{entry.round}
      </div>
      <div style={{ flex: 1, fontSize: 12, color: subtle ? C.mutedLight : C.parch, fontFamily: 'Georgia, serif', lineHeight: 1.5, fontStyle: subtle ? 'italic' : 'normal' }}>
        {entry.kind === 'rumour' && entry.source ? (
          <span style={{ color: C.muted, fontSize: 10 }}>heard from {entry.source} ({entry.hops} hop{entry.hops === 1 ? '' : 's'}, conf {entry.confidence?.toFixed(2)}): </span>
        ) : null}
        {entry.kind === 'witnessed' ? (
          <span style={{ color: C.muted, fontSize: 10 }}>witnessed: </span>
        ) : null}
        {entry.kind === 'bond' ? (
          <span style={{ color: getBondTypeColor(entry.toType), fontSize: 10, marginRight: 4, fontWeight: 'bold' }}>
            BOND
          </span>
        ) : null}
        {entry.content}
      </div>
      <div style={{ fontSize: 9, color, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, paddingTop: 1 }}>
        {entry.category}
      </div>
    </div>
  )
}

function DialogueEntry({ entry }) {
  const d = entry.dialogueRef
  if (!d) return null
  const color = getEventColor(d.eventCategory)
  return (
    <div style={{ padding: '8px 12px', backgroundColor: C.bgElevated, borderLeft: `2px solid ${C.purpleLight}`, borderRadius: 3 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 50, fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase' }}>R{entry.round}</span>
        <span style={{ fontSize: 9, color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'bold' }}>Dialogue</span>
        <span style={{ fontSize: 9, color, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d.eventCategory}</span>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui' }}>
          with {d.participants.map(p => p.name).join(' & ')}
        </span>
      </div>
      <div style={{ paddingLeft: 58 }}>
        {(d.lines || []).map((l, idx) => (
          <div key={idx} style={{ marginBottom: 3, fontSize: 12, fontFamily: 'Georgia, serif', lineHeight: 1.5 }}>
            <span style={{ color: C.purpleLight, fontVariant: 'small-caps', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em' }}>{l.speaker}: </span>
            <span style={{ color: C.parch, fontStyle: 'italic' }}>&ldquo;{l.line}&rdquo;</span>
          </div>
        ))}
      </div>
    </div>
  )
}
