// Phase 6/6c — SimulationProgress
//
// Replaces the static spinner during an active simulation run. Shows the
// writer what the engine is actually doing in real time:
//   • Round progress bar (round X of Y)
//   • Live event log — last 20 events, scrolling, newest on top
//   • Tier counters — T0 / T1 (Haiku) / T2 (Sonnet) / dialogue / hydration
//   • Estimated time remaining (computed from elapsed × rounds-remaining/done)
//   • Live spend tracker
//   • Pause / Cancel buttons
//
// The component is presentational — all numbers come from props the parent
// has already lifted from the runner's yields.

import { C } from '../../constants.js'

export function SimulationProgress({
  round,                  // current round
  roundCount,             // total rounds
  agentsAlive,            // count
  agentsTotal,            // count
  censusStats,            // { censusCount, ... } | null
  events = [],            // most recent N (latest at end of array)
  tierCounters = null,    // { tier0Total, tier1Total, tier2Total, ... }
  dialogueCount = 0,
  hydrationCallsUsed = 0,
  paused = false,
  onPause = () => {},
  onCancel = () => {},
  startedAt = null,       // ms timestamp for ETA math
  liveCostUSD = 0,
  estimate = null,        // { lowEstimate, highEstimate } | null
  scenarioContext = null, // { variantIndex, variantCount, scope } | null
}) {
  const pct = Math.round((round / Math.max(roundCount, 1)) * 100)
  const eta = computeETA({ round, roundCount, startedAt, paused })

  // Most recent first, capped at 20
  const recentEvents = [...events].slice(-20).reverse()

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>
            {scenarioContext
              ? `Scenario · Variant ${scenarioContext.variantIndex + 1} of ${scenarioContext.variantCount}`
              : 'Deep Simulation Running'}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            Round {round} of {roundCount}
            {' · '}{agentsAlive}/{agentsTotal} alive
            {censusStats && ` · census ${censusStats.censusCount}`}
            {eta && ` · ~${eta} remaining`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onPause} style={btnSec}>{paused ? 'Resume' : 'Pause'}</button>
          <button onClick={onCancel} style={btnSec}>Cancel</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, backgroundColor: C.border, borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: paused ? C.gold : C.purple, transition: 'width 0.2s ease' }} />
      </div>

      {/* Tier counters + cost row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        <Counter label="T0 (det)" value={tierCounters?.tier0Total ?? 0} color={C.mutedLight} />
        <Counter label="T1 (Haiku)" value={tierCounters?.tier1Total ?? 0} color={C.teal} />
        <Counter label="T2 (Sonnet)" value={tierCounters?.tier2Total ?? 0} color={C.purpleLight} />
        <Counter label="Dialogue" value={dialogueCount} color={C.gold} />
        <Counter label="Hydration" value={hydrationCallsUsed} color={C.green} />
        <Counter
          label="Spend"
          value={`$${liveCostUSD.toFixed(3)}`}
          color={estimate && liveCostUSD > estimate.highEstimate ? C.accBright : C.parch}
          sub={estimate ? `of ~$${estimate.midEstimate.toFixed(2)}` : null}
        />
      </div>

      {/* Live event log */}
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, maxHeight: 440, overflow: 'auto' }}>
        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span>Latest events ({Math.min(20, events.length)} of {events.length})</span>
          {paused && <span style={{ color: C.gold }}>Paused</span>}
        </div>
        {recentEvents.length === 0 ? (
          <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui' }}>
            Round 1 still computing — events will start streaming when something happens.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentEvents.map((e, i) => (
              <EventRow key={`${e.round}-${e.agentId || ''}-${i}`} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Internals ────────────────────────────────────────────────────────────
function Counter({ label, value, color, sub }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 5, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 16, color, fontFamily: 'Georgia,serif', fontWeight: 'bold', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

const CATEGORY_COLORS = {
  death:        C.accBright,
  betrayal:     C.accBright,
  conflict:     C.gold,
  cooperation:  C.green,
  travel:       C.teal,
  birth:        C.green,
  need_critical:C.gold,
  aging:        C.muted,
  observe:      C.muted,
  eat:          C.muted,
  rest:         C.muted,
}

function EventRow({ event }) {
  const col = CATEGORY_COLORS[event.category] || C.mutedLight
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontFamily: 'system-ui', fontSize: 11 }}>
      <span style={{ width: 38, flexShrink: 0, color: C.muted, fontFamily: 'system-ui', fontSize: 10 }}>r{event.round}</span>
      <span style={{ width: 60, flexShrink: 0, color: col, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{event.category}</span>
      <span style={{ color: C.parch, lineHeight: 1.4 }}>{event.content || ''}</span>
    </div>
  )
}

function computeETA({ round, roundCount, startedAt, paused }) {
  if (paused) return null
  if (!startedAt || round <= 0) return null
  const elapsed = (Date.now() - startedAt) / 1000
  const perRound = elapsed / round
  const remaining = perRound * (roundCount - round)
  if (!Number.isFinite(remaining) || remaining <= 0) return null
  if (remaining < 60)    return `${Math.round(remaining)}s`
  if (remaining < 3600)  return `${Math.round(remaining / 60)}m ${Math.round(remaining % 60)}s`
  return `${(remaining / 3600).toFixed(1)}h`
}

const btnSec = {
  padding: '6px 12px',
  backgroundColor: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.muted,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'system-ui',
}
