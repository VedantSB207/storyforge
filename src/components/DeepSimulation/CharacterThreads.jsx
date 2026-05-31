// Phase 5/5a — CharacterThreads
// One collapsible card per bound Bible character, showing their chronological
// arc through the simulation: actions, witnessed events, rumours, bond
// promotions, dialogues. Data assembled by threadBuilder.js.
//
// Phase 6/6e — added per-character "Generate narrative arc" button. One Sonnet
// call (~$0.01) per click. Cached in component state.

import { useState, useMemo } from 'react'
import { C } from '../../constants.js'
import { buildCharacterThreads } from './threadBuilder.js'
import { getAgentColor, getEventColor, getBondTypeColor } from './visualizationHelpers.js'
import { generateCharacterArc } from './insights/characterArc.js'

export function CharacterThreads({ simulationResult }) {
  const threads = useMemo(
    () => buildCharacterThreads(simulationResult || {}),
    [simulationResult]
  )
  const dialogues = simulationResult?.dialogues || []
  const agents = simulationResult?.agents || []
  const [expanded, setExpanded] = useState(() => {
    // First character expanded by default
    return new Set(threads[0] ? [threads[0].agentId] : [])
  })
  // Phase 6/6e — per-character arc cache (agentId -> { arc, headline, cost, usage, generating?, error? })
  const [arcs, setArcs] = useState({})

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const handleGenerateArc = async (thread) => {
    setArcs(prev => ({ ...prev, [thread.agentId]: { generating: true } }))
    try {
      const result = await generateCharacterArc({ thread, allAgents: agents, dialogues })
      setArcs(prev => ({ ...prev, [thread.agentId]: result }))
    } catch (err) {
      setArcs(prev => ({ ...prev, [thread.agentId]: { error: err.message || String(err) } }))
    }
  }

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
          arcEntry={arcs[thread.agentId]}
          onGenerateArc={() => handleGenerateArc(thread)}
        />
      ))}
    </div>
  )
}

function CharacterCard({ thread, expanded, onToggle, arcEntry, onGenerateArc }) {
  const color = getAgentColor({ id: thread.agentId, source: 'bound' })
  const statusLabel = thread.alive
    ? `alive · age ${thread.ageEnd.toFixed(1)}`
    : `died in round ${thread.diedRound ?? '?'} at age ${thread.ageEnd.toFixed(1)}`
  const statusColor = thread.alive ? C.green : C.accBright
  // Phase 7/7c — strongest active grief this character carries.
  const topGrief = (thread.memorials || []).reduce((m, x) => Math.max(m, x.grief || 0), 0)

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
        {/* Phase 7/7c — grief indicator for characters carrying memorial bonds */}
        {topGrief > 0.05 && (
          <span title={`Grieving: ${(thread.memorials || []).filter(m => m.grief > 0.05).map(m => `${m.otherName} (${m.grief.toFixed(2)})`).join(', ')}`}
            style={{ fontSize: 10, fontFamily: 'system-ui', color: '#8a93a6', border: `1px solid #8a93a655`, borderRadius: 8, padding: '1px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11 }}>&#9670;</span>
            grieving {topGrief >= 0.6 ? '(raw)' : topGrief >= 0.3 ? '' : '(fading)'}
          </span>
        )}
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

          {/* Phase 7/7c — Memorial bonds (grief) */}
          {(thread.memorials || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: '#8a93a6', fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11 }}>&#9670;</span> Grief — memorial bonds
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {thread.memorials.map((m, i) => (
                  <div key={i} title={`Lost since round ${m.memorialSince ?? '?'}; was ${m.preMemorialType || m.type}`}
                    style={{
                      padding: '4px 8px', fontSize: 10, fontFamily: 'system-ui',
                      backgroundColor: '#8a93a618',
                      border: `1px dashed #8a93a677`,
                      color: '#aab2c0', borderRadius: 3,
                    }}>
                    {m.otherName} · was {m.preMemorialType || m.type} · grief {m.grief.toFixed(2)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 6/6e — Narrative arc (on-demand) */}
          <NarrativeArcBlock
            thread={thread}
            arcEntry={arcEntry}
            onGenerate={onGenerateArc}
          />

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

// Phase 6/6e — On-demand narrative arc block per character.
// Three states: not-generated (button), generating (spinner), generated (prose + regenerate).
function NarrativeArcBlock({ thread, arcEntry, onGenerate }) {
  const generating = !!arcEntry?.generating
  const hasArc     = !!arcEntry?.arc
  const error      = arcEntry?.error

  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', backgroundColor: C.bgElevated, border: `1px solid ${C.purple}33`, borderRadius: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasArc ? 10 : 0 }}>
        <span style={{ fontSize: 9, color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Narrative Arc
        </span>
        {generating ? (
          <span style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>writing…</span>
        ) : hasArc ? (
          <>
            <span style={{ flex: 1 }} />
            {arcEntry.cost > 0 && (
              <span style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui' }}>${arcEntry.cost.toFixed(4)}</span>
            )}
            <button
              onClick={onGenerate}
              title="Re-generate this character's narrative arc (~$0.01)"
              style={{
                padding: '3px 10px', fontSize: 10, fontFamily: 'system-ui',
                backgroundColor: 'transparent', color: C.muted,
                border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer',
              }}>
              Regenerate
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1 }} />
            <button
              onClick={onGenerate}
              title="Generate a 2-3 paragraph narrative arc for this character (~$0.01)"
              style={{
                padding: '5px 12px', fontSize: 11, fontFamily: 'system-ui',
                backgroundColor: C.purple, color: '#fff',
                border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>
              Generate narrative arc
            </button>
          </>
        )}
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.accBright, fontFamily: 'system-ui' }}>
          Generation failed: {error}
        </div>
      )}
      {hasArc && arcEntry.headline && (
        <div style={{ fontSize: 13, color: C.parch, fontStyle: 'italic', fontFamily: 'Georgia, serif', marginBottom: 8, lineHeight: 1.4 }}>
          &ldquo;{arcEntry.headline}&rdquo;
        </div>
      )}
      {hasArc && (
        <div style={{ fontSize: 13, color: C.parch, fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
          {arcEntry.arc.split(/\n\n+/).map((p, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>{p}</p>
          ))}
        </div>
      )}
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
