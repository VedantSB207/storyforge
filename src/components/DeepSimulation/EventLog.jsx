import { C } from '../../constants.js'

// Phase 1 — basic chronological event list. No filtering, no severity colours
// beyond category tinting. Phase 3 adds significance, filtering, butterfly
// traces, etc.

const CATEGORY_COLOR = {
  aging:         C.muted,
  need_critical: C.gold,
  death:         C.accBright,
}

export function EventLog({ events, emptyText = 'No events yet.' }) {
  if (!events || events.length === 0) {
    return (
      <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui', padding: 12 }}>
        {emptyText}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {events.map((e, i) => {
        const col = CATEGORY_COLOR[e.category] || C.mutedLight
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 11, fontFamily: 'system-ui' }}>
            <span style={{ color: C.muted, width: 60, flexShrink: 0 }}>Round {e.round}</span>
            <span style={{ color: col, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.08em', width: 80, flexShrink: 0 }}>{e.category}</span>
            <span style={{ color: C.parch, fontFamily: 'Georgia,serif', fontStyle: 'italic' }}>{e.content}</span>
          </div>
        )
      })}
    </div>
  )
}
