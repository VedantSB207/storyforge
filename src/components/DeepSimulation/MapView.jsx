// Phase 5/5b-Map — interactive Konva map of the world
//
// 6 regions arranged in a star (north/south/east/west around central,
// wilderness on the perimeter). Agents jitter within their region. Event
// markers appear at the actor's region. Time slider at bottom scrubs round
// state. Click an agent to highlight events they witnessed.

import { useState, useMemo, useRef } from 'react'
import { Stage, Layer, Circle, Line, Text, Group, Rect } from 'react-konva'
import { C } from '../../constants.js'
import {
  getAgentColor, getEventColor, getGenreColor,
  REGION_POSITIONS, REGION_RADIUS, regionCenter, agentPositionInRegion,
  formatRoundLabel,
} from './visualizationHelpers.js'

const STAGE_W = 900
const STAGE_H = 600
const CLUSTER_THRESHOLD = 25   // when > N NPCs of same kind in same region, cluster

export function MapView({ simulationResult }) {
  const agents     = simulationResult?.agents || []
  const events     = simulationResult?.events || []
  const roundCount = simulationResult?.roundCount || 30
  const timeUnit   = simulationResult?.timeUnit || 'year'
  const [round, setRound]   = useState(roundCount)
  const [hovered, setHovered] = useState(null)   // {kind, label, x, y}
  const [selected, setSelected] = useState(null) // agent.id

  // Build round-indexed event list. Each event has a `round` field.
  const eventsByRound = useMemo(() => {
    const byRound = new Array(roundCount + 1).fill(null).map(() => [])
    for (const e of events) {
      if (e.round != null && e.round >= 0 && e.round <= roundCount) byRound[e.round].push(e)
    }
    return byRound
  }, [events, roundCount])

  // For each agent at this round, are they alive? Walk death events.
  const aliveAtRound = useMemo(() => {
    const out = new Map(agents.map(a => [a.id, true]))
    for (let r = 1; r <= round; r++) {
      for (const e of eventsByRound[r] || []) {
        if (e.category === 'death' && e.agentId) out.set(e.agentId, false)
      }
    }
    return out
  }, [agents, eventsByRound, round])

  // Region adjacency for connector lines
  const ADJ = [
    ['central', 'north'], ['central', 'south'], ['central', 'east'], ['central', 'west'],
    ['north', 'east'], ['north', 'west'], ['south', 'east'], ['south', 'west'],
    ['central', 'wilderness'],
  ]

  // Filter agents: bound chars always shown. Procedural NPCs — if >25 of
  // same kind in same region, render as a single cluster dot.
  const renderedAgents = useMemo(() => {
    const bound = agents.filter(a => a.source === 'bound')
    const procedurals = agents.filter(a => a.source === 'procedural')
    const groups = new Map()
    for (const a of procedurals) {
      const k = `${a.region || 'unknown'}|${(a.genreTag || '').split(':')[0]}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(a)
    }
    const out = [...bound]
    const clusters = []
    for (const [k, grp] of groups.entries()) {
      if (grp.length > CLUSTER_THRESHOLD) {
        const [region, genre] = k.split('|')
        clusters.push({
          isCluster: true,
          region,
          genre,
          count: grp.filter(a => aliveAtRound.get(a.id)).length,
          totalCount: grp.length,
          x: regionCenter(region).x + (Math.random() * 40 - 20),
          y: regionCenter(region).y + (Math.random() * 40 - 20),
        })
      } else {
        out.push(...grp)
      }
    }
    return { agents: out, clusters }
  }, [agents, aliveAtRound])

  // Witnessed events for the selected agent
  const selectedWitnessIds = useMemo(() => {
    if (!selected) return new Set()
    const ag = agents.find(a => a.id === selected)
    if (!ag) return new Set()
    return new Set((ag.knownFacts || []).filter(k => k.source === 'firsthand').map(k => k.originEventId))
  }, [selected, agents])

  // Aggregated event markers up to this round, sized by significance
  const eventMarkers = useMemo(() => {
    const cats = ['death', 'betrayal', 'conflict', 'cooperation', 'travel']
    const out = []
    for (let r = 1; r <= round; r++) {
      for (const e of eventsByRound[r] || []) {
        if (!cats.includes(e.category)) continue
        const actor = agents.find(a => a.id === e.agentId)
        if (!actor) continue
        const center = regionCenter(actor.region || 'central')
        // FNV-style jitter from event id so markers don't overlap
        const seed = (e.id || `${r}:${e.agentId}`).split('').reduce((a, ch) => ((a + ch.charCodeAt(0)) * 31) >>> 0, 0)
        const angle = (seed % 360) * (Math.PI / 180)
        const radius = ((seed >> 8) % 60) + 30
        out.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
          color: getEventColor(e.category),
          category: e.category,
          round: e.round,
          eventId: e.id,
          content: e.content,
          highlighted: selectedWitnessIds.has(e.id),
        })
      }
    }
    return out
  }, [eventsByRound, round, agents, selectedWitnessIds])

  return (
    <div style={{ fontFamily: 'system-ui', color: C.parch }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>World Map</div>
        <div style={{ fontSize: 11, color: C.muted }}>
          {renderedAgents.agents.filter(a => aliveAtRound.get(a.id)).length} agents alive at {formatRoundLabel(round, timeUnit)}
        </div>
      </div>

      <div style={{ position: 'relative', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, overflow: 'hidden' }}>
        <Stage width={STAGE_W} height={STAGE_H}>
          <Layer>
            {/* Adjacency connectors */}
            {ADJ.map(([a, b], i) => {
              const A = REGION_POSITIONS[a], B = REGION_POSITIONS[b]
              if (!A || !B) return null
              return <Line key={i} points={[A.x, A.y, B.x, B.y]} stroke={C.border} strokeWidth={1} dash={[4, 4]} opacity={0.6}/>
            })}

            {/* Region blobs */}
            {Object.entries(REGION_POSITIONS).map(([name, pos]) => (
              <Group key={name}>
                <Circle x={pos.x} y={pos.y} radius={REGION_RADIUS} fill={C.bgElevated} opacity={0.7} stroke={C.border} strokeWidth={1}/>
                <Text
                  x={pos.x - 50} y={pos.y + REGION_RADIUS + 4}
                  text={name} fontSize={11}
                  fill={C.muted} align="center" width={100}
                  fontFamily="system-ui" fontStyle="italic"
                />
              </Group>
            ))}

            {/* Event markers (drawn before agents so agents render on top) */}
            {eventMarkers.map((m, i) => (
              <Circle
                key={i}
                x={m.x} y={m.y}
                radius={m.highlighted ? 6 : 4}
                fill={m.color}
                opacity={m.highlighted ? 0.95 : 0.6}
                stroke={m.highlighted ? C.purpleLight : 'transparent'}
                strokeWidth={m.highlighted ? 2 : 0}
                onMouseEnter={(e) => setHovered({ kind: 'event', label: `R${m.round}: ${m.content}`, x: e.target.x(), y: e.target.y() })}
                onMouseLeave={() => setHovered(null)}
              />
            ))}

            {/* Procedural cluster dots */}
            {renderedAgents.clusters.map((cluster, i) => (
              <Group
                key={`cluster-${i}`}
                onMouseEnter={() => setHovered({ kind: 'cluster', label: `${cluster.count}/${cluster.totalCount} ${cluster.genre} in ${cluster.region}`, x: cluster.x, y: cluster.y })}
                onMouseLeave={() => setHovered(null)}
              >
                <Circle x={cluster.x} y={cluster.y} radius={10} fill={getGenreColor(cluster.genre)} opacity={0.65}/>
                <Text
                  x={cluster.x - 12} y={cluster.y - 5}
                  text={String(cluster.count)} fontSize={9}
                  fill="#fff" align="center" width={24}
                  fontFamily="system-ui" fontStyle="bold"
                />
              </Group>
            ))}

            {/* Agent dots */}
            {renderedAgents.agents.map(a => {
              const pos = agentPositionInRegion(a)
              const alive = aliveAtRound.get(a.id)
              const isBound = a.source === 'bound'
              const isSelected = selected === a.id
              return (
                <Group
                  key={a.id}
                  onMouseEnter={() => setHovered({ kind: 'agent', label: `${a.name} (${a.source}) — ${(a.traits || []).slice(0,3).join(', ')}`, x: pos.x, y: pos.y })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(prev => prev === a.id ? null : a.id)}
                >
                  <Circle
                    x={pos.x} y={pos.y}
                    radius={isBound ? 6 : 3}
                    fill={getAgentColor(a)}
                    opacity={alive ? 1 : 0.3}
                    stroke={isSelected ? C.purpleLight : (isBound ? '#fff' : 'transparent')}
                    strokeWidth={isSelected ? 3 : (isBound ? 1.5 : 0)}
                  />
                  {isBound && (
                    <Text
                      x={pos.x - 50} y={pos.y - 18}
                      text={a.name}
                      fontSize={9}
                      fill={alive ? C.parch : C.muted}
                      align="center"
                      width={100}
                      fontFamily="system-ui"
                      opacity={alive ? 1 : 0.5}
                    />
                  )}
                </Group>
              )
            })}

            {/* Hover tooltip */}
            {hovered && (
              <Group>
                <Rect x={hovered.x + 12} y={hovered.y - 8} width={Math.min(380, hovered.label.length * 6)} height={22} fill={C.bgCard} opacity={0.95} stroke={C.border} strokeWidth={1} cornerRadius={3}/>
                <Text x={hovered.x + 18} y={hovered.y - 2} text={hovered.label} fontSize={10} fill={C.parch} fontFamily="system-ui"/>
              </Group>
            )}
          </Layer>
        </Stage>
      </div>

      {/* Time slider */}
      <div style={{ marginTop: 12, padding: '0 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Round {round}</span>
          <span style={{ fontSize: 10, color: C.muted }}>{formatRoundLabel(round, timeUnit)}</span>
        </div>
        <input
          type="range"
          min={1} max={roundCount}
          value={round}
          onChange={e => setRound(+e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {/* Selected agent panel */}
      {selected && (
        <SelectedAgentPanel
          agent={agents.find(a => a.id === selected)}
          witnessedCount={selectedWitnessIds.size}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function SelectedAgentPanel({ agent, witnessedCount, onClose }) {
  if (!agent) return null
  return (
    <div style={{ marginTop: 10, padding: '10px 14px', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: 'system-ui', color: C.parch, fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ fontSize: 13 }}>{agent.name}</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div style={{ color: C.muted, marginBottom: 4 }}>
        {agent.source} · region: {agent.region} · {agent.alive ? `alive · age ${agent.age?.toFixed(1)}` : 'dead'}
      </div>
      <div style={{ color: C.mutedLight, marginBottom: 4 }}>{(agent.traits || []).join(', ')}</div>
      <div style={{ color: C.muted, fontSize: 10 }}>
        Witnessed {witnessedCount} event{witnessedCount === 1 ? '' : 's'} firsthand · {Object.keys(agent.bonds || {}).length} bonds
      </div>
    </div>
  )
}
