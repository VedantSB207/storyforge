// Phase 6/6d — Insight Panel shared wrapper
//
// Each of the four insight tabs (BlindSpots / PromotionCandidates /
// EmotionalWeather / Themes) renders inside this shell so they share
// title styling, empty-state copy, error-state copy, and cost footer.

import { C } from '../../../constants.js'

export function InsightPanel({
  title,
  subtitle = null,
  insight,                 // the precomputed insight object | null
  empty,                   // what to render when insight is null
  children,                // tab-specific content (rendered when insight is present and has data)
  cost = null,             // $ cost for this insight, displayed in footer
  usage = null,
}) {
  if (!insight) {
    return (
      <div style={containerStyle}>
        <PanelHeader title={title} subtitle={subtitle} />
        <div style={emptyStateStyle}>
          {empty || (
            <>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Insight panels were not generated for this run.</div>
              <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>
                Enable "Generate insight panels" on the setup screen before running to see analytical observations here.
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
  if (insight.error) {
    return (
      <div style={containerStyle}>
        <PanelHeader title={title} subtitle={subtitle} />
        <div style={errorStyle}>
          <div style={{ fontSize: 12, color: C.accBright, marginBottom: 4 }}>Insight generation failed.</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui' }}>{insight.error}</div>
        </div>
      </div>
    )
  }
  return (
    <div style={containerStyle}>
      <PanelHeader title={title} subtitle={subtitle} />
      <div style={{ padding: '0 6px' }}>
        {children}
      </div>
      {(cost != null && cost > 0) && (
        <div style={costFooterStyle}>
          {usage && `${usage.input_tokens || 0} in / ${usage.output_tokens || 0} out tokens · `}
          ${cost.toFixed(4)}
        </div>
      )}
    </div>
  )
}

function PanelHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 16, color: C.purpleLight, fontFamily: 'Georgia, serif', fontWeight: 500 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginTop: 3, fontStyle: 'italic' }}>{subtitle}</div>
      )}
    </div>
  )
}

const containerStyle = {
  padding: '18px 24px',
  fontFamily: 'Georgia, serif',
  maxWidth: 880,
  margin: '0 auto',
}

const emptyStateStyle = {
  padding: '40px 20px',
  textAlign: 'center',
  backgroundColor: C.bgCard,
  border: `1px dashed ${C.border}`,
  borderRadius: 6,
  fontFamily: 'system-ui',
}

const errorStyle = {
  padding: '18px 24px',
  backgroundColor: C.accBright + '12',
  border: `1px solid ${C.accBright}44`,
  borderRadius: 6,
}

const costFooterStyle = {
  marginTop: 16,
  paddingTop: 8,
  borderTop: `1px solid ${C.border}`,
  fontSize: 9,
  color: C.muted,
  fontFamily: 'system-ui',
  textAlign: 'right',
}

// ─── Tab renderers ─────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  region:     C.teal,
  character:  C.gold,
  taxonomy:   C.purpleLight,
  pacing:     C.muted,
  general:    C.mutedLight,
}

export function BlindSpotsTab({ insight }) {
  const observations = insight?.observations || []
  return (
    <InsightPanel
      title="Blind Spots"
      subtitle="Under-served regions, characters, and beats — what the simulation didn't quite reach."
      insight={insight}
      cost={insight?.cost}
      usage={insight?.usage}
    >
      {observations.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>No blind spots detected.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {observations.map((o, i) => (
            <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 8,
                  backgroundColor: (CATEGORY_COLORS[o.category] || C.muted) + '22',
                  color: CATEGORY_COLORS[o.category] || C.muted,
                  fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>{o.category}</span>
                <span style={{ fontSize: 14, color: C.parch, fontFamily: 'Georgia, serif', fontWeight: 500 }}>{o.title}</span>
              </div>
              <div style={{ fontSize: 13, color: C.mutedLight, lineHeight: 1.6, fontFamily: 'Georgia, serif' }}>{o.body}</div>
            </div>
          ))}
        </div>
      )}
      {(insight?.findings?.length || 0) > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Raw heuristic findings ({insight.findings.length})
          </summary>
          <div style={{ marginTop: 8, padding: 10, backgroundColor: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 10, color: C.muted, fontFamily: 'monospace', maxHeight: 260, overflow: 'auto' }}>
            {insight.findings.map((f, i) => <div key={i}>{JSON.stringify(f)}</div>)}
          </div>
        </details>
      )}
    </InsightPanel>
  )
}

export function PromotionCandidatesTab({ insight, agents = [] }) {
  const candidates = insight?.candidates || []
  return (
    <InsightPanel
      title="Promotion Candidates"
      subtitle="Procedural characters whose action patterns suggest they earned a name."
      insight={insight}
      cost={insight?.cost}
      usage={insight?.usage}
    >
      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>No procedural NPCs reached significant signal this run.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {candidates.map((c, i) => (
            <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.gold}33`, borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 8, backgroundColor: C.gold + '22', color: C.gold, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  rank {i + 1}
                </span>
                <span style={{ fontSize: 14, color: C.parch, fontFamily: 'Georgia, serif', fontWeight: 500 }}>{c.npcName}</span>
                {Number.isFinite(c.score) && (
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui' }}>· score {Number(c.score).toFixed(1)}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: C.mutedLight, lineHeight: 1.6, fontFamily: 'Georgia, serif' }}>{c.reason}</div>
              {(c.boundIntersections || []).length > 0 && (
                <div style={{ fontSize: 10, color: C.purple, fontFamily: 'system-ui', marginTop: 6, fontStyle: 'italic' }}>
                  Intersected with: {c.boundIntersections.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </InsightPanel>
  )
}

export function EmotionalWeatherTab({ insight }) {
  if (!insight || !insight.perRound || insight.perRound.length === 0) {
    return (
      <InsightPanel title="Emotional Weather" insight={insight} cost={0} />
    )
  }
  const data = insight.perRound
  const W = 640, H = 220, PAD = 32
  const maxConflict = Math.max(1, ...data.map(d => d.conflict))
  const xs = data.map(d => d.round)
  const xScale = (r) => PAD + ((r - 1) / Math.max(1, (xs.length - 1))) * (W - 2 * PAD)
  const yScale01 = (v) => H - PAD - v * (H - 2 * PAD)
  const yScaleConflict = (v) => H - PAD - (v / maxConflict) * (H - 2 * PAD)

  const buildPath = (key, scale) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.round).toFixed(1)},${scale(d[key]).toFixed(1)}`).join(' ')

  return (
    <InsightPanel
      title="Emotional Weather"
      subtitle={insight.summary}
      insight={insight}
      cost={0}
    >
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 16px' }}>
        <svg width={W} height={H} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}>
          {/* Grid */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={C.border} />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={C.border} />
          {/* Stress (red), Contentment (green), Conflict spikes (gold) */}
          <path d={buildPath('stress', yScale01)} stroke={C.accBright} strokeWidth="2" fill="none" />
          <path d={buildPath('contentment', yScale01)} stroke={C.green} strokeWidth="2" fill="none" />
          <path d={buildPath('conflict', yScaleConflict)} stroke={C.gold} strokeWidth="1.5" fill="none" strokeDasharray="3,3" />
          {/* Axis labels */}
          <text x={PAD} y={H - 8} fill={C.muted} fontSize="9" fontFamily="system-ui">round 1</text>
          <text x={W - PAD - 40} y={H - 8} fill={C.muted} fontSize="9" fontFamily="system-ui">round {xs[xs.length - 1]}</text>
        </svg>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 18, marginTop: 8, justifyContent: 'center', fontSize: 11, fontFamily: 'system-ui' }}>
          <span style={{ color: C.accBright }}>━ Stress</span>
          <span style={{ color: C.green }}>━ Contentment</span>
          <span style={{ color: C.gold }}>┄ Conflict (per round)</span>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', lineHeight: 1.5 }}>
        <strong style={{ color: C.parch }}>Peak stress:</strong> round {insight.peaks.stress.round} ({(insight.peaks.stress.stress * 100).toFixed(0)}%)
        {' · '}
        <strong style={{ color: C.parch }}>Peak conflict:</strong> round {insight.peaks.conflict.round} ({insight.peaks.conflict.conflict} events)
        {' · '}
        <strong style={{ color: C.parch }}>Most content:</strong> round {insight.peaks.contentment.round}
      </div>
    </InsightPanel>
  )
}

const FREQUENCY_COLORS = {
  dominant:  C.accBright,
  recurring: C.gold,
  thread:    C.teal,
}

export function ThemesTab({ insight }) {
  const themes = insight?.themes || []
  return (
    <InsightPanel
      title="Themes"
      subtitle="Patterns the simulation surfaced — the deeper currents under the plot."
      insight={insight}
      cost={insight?.cost}
      usage={insight?.usage}
    >
      {themes.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>No themes detected.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {themes.map((t, i) => (
            <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${(FREQUENCY_COLORS[t.frequency] || C.muted) + '55'}`, borderRadius: 6, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontSize: 15, color: C.parch, fontFamily: 'Georgia, serif',
                  fontWeight: 500, fontStyle: 'italic',
                }}>{t.name}</span>
                {t.frequency && (
                  <span style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 8,
                    backgroundColor: (FREQUENCY_COLORS[t.frequency] || C.muted) + '22',
                    color: FREQUENCY_COLORS[t.frequency] || C.muted,
                    fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>{t.frequency}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: C.mutedLight, lineHeight: 1.6, fontFamily: 'Georgia, serif', marginBottom: 6 }}>
                {t.description}
              </div>
              {(t.evidence || []).length > 0 && (
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>
                  Evidence: {t.evidence.join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </InsightPanel>
  )
}
