import { useState, useRef, useEffect } from 'react'
import { C, genId } from '../../constants.js'
import { TIME_UNITS } from './deepSimSchema.js'
import { createAgentsFromBible } from './AgentFactory.js'
import { runSimulationRounds, buildSummary } from './SimulationRunner.js'
import { EventLog } from './EventLog.jsx'

const CAST_SIZES = [50, 200, 500, 1000, 2000]

// Phase 1 — Deep Simulation main UI
//
// Three screens: setup → running → results.
// Only Story Bible characters become agents this phase. NPC generation
// arrives in Phase 2; if cast size > chars.length, we display a notice
// and run with whatever bound agents exist.

export function DeepSimulation({
  project,
  chars,
  deepSimulationHistory = [],
  setDeepSimulationHistory,
  setTab,
}) {
  const [step, setStep]           = useState('setup')           // 'setup' | 'running' | 'results'
  const [mode, setMode]           = useState('progressive')     // scenario greyed out (Phase 4)
  const [castSize, setCastSize]   = useState(50)
  const [roundCount, setRoundCount] = useState(20)
  const [timeUnit, setTimeUnit]   = useState('day')

  // Live run state
  const [round, setRound]         = useState(0)
  const [events, setEvents]       = useState([])
  const [agentsLive, setAgentsLive] = useState([])
  const [paused, setPaused]       = useState(false)
  const cancelRef                 = useRef(false)
  const pauseRef                  = useRef(false)

  // Final result (after run completes)
  const [finalSnapshot, setFinalSnapshot] = useState(null)

  useEffect(() => { pauseRef.current = paused }, [paused])

  const boundCount = chars?.length || 0
  const willRunWithCount = Math.min(boundCount, castSize)

  const startRun = async () => {
    if (boundCount === 0) return
    cancelRef.current = false
    pauseRef.current  = false
    setPaused(false)
    setStep('running')
    setEvents([])
    setRound(0)
    setFinalSnapshot(null)

    const initial = createAgentsFromBible(chars)
    setAgentsLive(initial)

    let lastSnap = null
    try {
      const gen = runSimulationRounds({
        initialAgents: initial,
        roundCount,
        timeUnit,
      })

      for await (const snap of gen) {
        // Honour pause: spin until unpaused or cancelled
        while (pauseRef.current && !cancelRef.current) {
          await new Promise(r => setTimeout(r, 200))
        }
        if (cancelRef.current) break

        setRound(snap.round)
        setEvents(snap.events)
        setAgentsLive(snap.agents)
        lastSnap = snap
        // Yield to the renderer
        await new Promise(r => setTimeout(r, 0))
      }
    } catch (err) {
      console.error('Deep Simulation error:', err)
      setEvents(prev => [...prev, {
        round: round || 0,
        agentName: 'engine',
        category: 'death',
        content: `Simulation error: ${err.message}`,
      }])
    }

    if (cancelRef.current || !lastSnap) {
      // Cancelled or never produced output — return to setup, leave history alone
      setStep('setup')
      return
    }

    const summary = buildSummary(lastSnap)
    setFinalSnapshot({ ...lastSnap, summary })

    // Persist to project history
    const entry = {
      id:         genId(),
      timestamp:  new Date().toISOString(),
      mode:       'progressive',
      castSize,
      roundCount,
      timeUnit,
      agents:     lastSnap.agents,
      events:     lastSnap.events,
      summary:    `${summary.alive}/${summary.total} alive, ${summary.dead} died over ${roundCount} ${timeUnit}-round${roundCount === 1 ? '' : 's'}.`,
    }
    if (setDeepSimulationHistory) {
      setDeepSimulationHistory(prev => [entry, ...(prev || [])])
    }

    setStep('results')
  }

  const cancelRun = () => {
    cancelRef.current = true
    pauseRef.current  = false
    setPaused(false)
  }

  const newSimulation = () => {
    setStep('setup')
    setEvents([])
    setRound(0)
    setFinalSnapshot(null)
    setAgentsLive([])
  }

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
        <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.purple}55`, borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: C.purpleLight, fontWeight: 'bold', marginBottom: 8 }}>✦ Deep Simulation — Phase 1 Foundation</div>
          <div style={{ fontSize: 12, color: C.mutedLight, lineHeight: '1.8', fontFamily: 'system-ui' }}>
            Real multi-agent simulation. Agents are persistent objects with state — age, health, needs, mortality. They evolve across rounds in deterministic time-step physics.<br /><br />
            <strong style={{ color: C.gold }}>Phase 1 scope:</strong> only Story Bible characters become agents. No NPC generation yet. No information propagation yet. No decisions yet. Just aging, needs, and mortality — the spine the rest of the engine builds on.
          </div>
        </div>

        {/* Mode selector */}
        <Section label="Simulation Mode">
          <div style={{ display: 'flex', gap: 8 }}>
            <ModeButton
              active={mode === 'progressive'}
              onClick={() => setMode('progressive')}
              label="Progressive"
              sub="Forward-moving timeline. State accumulates across rounds."
            />
            <ModeButton
              active={false}
              disabled
              label="Scenario"
              sub="Branching variants from a fixed moment."
              badge="Phase 4"
            />
          </div>
        </Section>

        {/* Cast size */}
        <Section label="Cast Size">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CAST_SIZES.map(n => (
              <button
                key={n}
                onClick={() => setCastSize(n)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: castSize === n ? C.purple : C.bgCard,
                  color: castSize === n ? '#fff' : C.muted,
                  border: `1px solid ${castSize === n ? C.purple : C.border}`,
                  borderRadius: 5,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: C.bgElevated, border: `1px solid ${C.gold}33`, borderRadius: 5, fontSize: 11, color: C.gold, fontFamily: 'system-ui', lineHeight: '1.5' }}>
            {boundCount === 0
              ? 'No Story Bible characters yet. Add at least one character before running.'
              : `Phase 1 will run with ${willRunWithCount} bound agent${willRunWithCount === 1 ? '' : 's'} from your Story Bible. NPC generation arrives in Phase 2.`}
          </div>
        </Section>

        {/* Round count */}
        <Section label={`Round Count — ${roundCount}`}>
          <input
            type="range"
            min={5}
            max={500}
            step={5}
            value={roundCount}
            onChange={e => setRoundCount(+e.target.value)}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
            <span>5</span><span>500</span>
          </div>
        </Section>

        {/* Time unit */}
        <Section label="Time Unit per Round">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIME_UNITS.map(u => (
              <button
                key={u}
                onClick={() => setTimeUnit(u)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: timeUnit === u ? C.acc + '33' : C.bgCard,
                  color: timeUnit === u ? C.accBright : C.muted,
                  border: `1px solid ${timeUnit === u ? C.acc + '66' : C.border}`,
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                  textTransform: 'capitalize',
                }}
              >
                {u}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>
            {roundCount} {timeUnit}-rounds = approximately {formatHorizon(roundCount, timeUnit)} of in-world time.
          </div>
        </Section>

        <button
          onClick={startRun}
          disabled={boundCount === 0}
          style={{
            width: '100%',
            padding: 13,
            backgroundColor: boundCount === 0 ? C.bgCard : C.purple,
            color: boundCount === 0 ? C.muted : '#fff',
            border: `1px solid ${boundCount === 0 ? C.border : C.purple}`,
            borderRadius: 6,
            fontSize: 14,
            cursor: boundCount === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'system-ui',
            letterSpacing: '0.05em',
          }}
        >
          {boundCount === 0 ? 'Add Story Bible characters first' : 'Run Simulation →'}
        </button>

        {/* History summary */}
        {(deepSimulationHistory || []).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Past Runs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {deepSimulationHistory.slice(0, 5).map(h => (
                <div key={h.id} style={{ padding: '8px 12px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11, fontFamily: 'system-ui' }}>
                  <div style={{ color: C.parch }}>{h.summary}</div>
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    {new Date(h.timestamp).toLocaleString()} · {h.castSize} cast · {h.roundCount} {h.timeUnit}-rounds
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Running screen ────────────────────────────────────────────────────────
  if (step === 'running') {
    const pct = Math.round((round / Math.max(roundCount, 1)) * 100)
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Deep Simulation Running</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
              Round {round} of {roundCount} · {agentsLive.filter(a => a.alive).length}/{agentsLive.length} alive
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPaused(p => !p)} style={btnSecondary}>{paused ? 'Resume' : 'Pause'}</button>
            <button onClick={cancelRun} style={btnSecondary}>Cancel</button>
          </div>
        </div>

        <div style={{ height: 4, backgroundColor: C.border, borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: paused ? C.gold : C.purple, transition: 'width 0.2s ease' }} />
        </div>

        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, maxHeight: 400, overflow: 'auto' }}>
          <EventLog events={events} emptyText="Round 1 still computing — events will start streaming when something happens." />
        </div>
      </div>
    )
  }

  // ── Results screen ────────────────────────────────────────────────────────
  const summary = finalSnapshot?.summary
  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, color: C.purpleLight, fontWeight: 500 }}>Simulation Complete</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            {finalSnapshot?.agents?.length || 0} agents · {roundCount} {timeUnit}-rounds · progressive mode
          </div>
        </div>
        <button onClick={newSimulation} style={btnSecondary}>New Simulation</button>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <Stat label="Alive" value={`${summary.alive} / ${summary.total}`} col={C.green} />
          <Stat label="Died" value={summary.dead} col={summary.dead > 0 ? C.accBright : C.muted} />
          <Stat label="Average Age" value={summary.avgAge.toFixed(1)} col={C.parch} />
        </div>
      )}

      {summary && (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Average Needs (living agents)</div>
          {Object.entries(summary.avgNeeds).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ width: 100, fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', textTransform: 'capitalize' }}>{k}</span>
              <div style={{ flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${v * 100}%`, height: '100%', backgroundColor: v < 0.2 ? C.accBright : v < 0.5 ? C.gold : C.green }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 11, color: C.parch, fontFamily: 'system-ui' }}>{(v * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
          Event Log — {events.length} event{events.length === 1 ? '' : 's'}
        </div>
        <EventLog events={events} emptyText="No events fired during this run." />
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function ModeButton({ active, onClick, label, sub, disabled, badge }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        flex: 1,
        padding: '12px 14px',
        backgroundColor: active ? C.purple + '22' : C.bgCard,
        color: active ? C.purpleLight : disabled ? C.muted : C.mutedLight,
        border: `1px solid ${active ? C.purple + '66' : C.border}`,
        borderRadius: 5,
        fontFamily: 'system-ui',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {badge && (
          <span style={{ fontSize: 9, backgroundColor: C.gold + '33', color: C.gold, padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{badge}</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: '1.4' }}>{sub}</div>
    </button>
  )
}

function Stat({ label, value, col }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, color: col, fontFamily: 'Georgia,serif', fontWeight: 'bold' }}>{value}</div>
    </div>
  )
}

const btnSecondary = {
  padding: '6px 14px',
  backgroundColor: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'system-ui',
}

function formatHorizon(rounds, unit) {
  const totalDaysApprox = rounds * { hour: 1/24, day: 1, week: 7, month: 30, season: 90, year: 365 }[unit]
  if (totalDaysApprox < 2)         return `${(totalDaysApprox * 24).toFixed(0)} hours`
  if (totalDaysApprox < 60)        return `${totalDaysApprox.toFixed(0)} days`
  if (totalDaysApprox < 365 * 2)   return `${(totalDaysApprox / 30).toFixed(1)} months`
  return `${(totalDaysApprox / 365).toFixed(1)} years`
}
