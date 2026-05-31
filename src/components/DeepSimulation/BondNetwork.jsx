// Phase 5/5b-Bonds — Bond Network visualization
//
// Force-directed graph via react-force-graph-2d. Bound chars always shown;
// NPCs with 3+ bonds also shown. Edges colored by bond type, weighted by
// intensity, opacity by abs(trust). Time slider scrubs bond formation
// over rounds. Edge click opens history panel.

import { useState, useMemo, useEffect, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { C } from '../../constants.js'
import {
  getAgentColor, getBondTypeColor, formatRoundLabel,
} from './visualizationHelpers.js'

const BOND_TYPES = ['friendship', 'love', 'kinship', 'rivalry', 'enmity', 'weak']
const NPC_MIN_BONDS = 3
const STAGE_W = 900
const STAGE_H = 600

export function BondNetwork({ simulationResult }) {
  const agents     = simulationResult?.agents || []
  const roundCount = simulationResult?.roundCount || 30
  const timeUnit   = simulationResult?.timeUnit || 'year'
  const [round, setRound]               = useState(roundCount)
  const [activeNode, setActiveNode]     = useState(null)
  const [activeEdge, setActiveEdge]     = useState(null)
  const [enabledTypes, setEnabledTypes] = useState(() => new Set(BOND_TYPES))
  const fgRef = useRef(null)

  // Filter agents: bound always + procedurals with enough bonds
  const includedAgents = useMemo(() => {
    return agents.filter(a => {
      if (a.source === 'bound') return true
      const n = Object.keys(a.bonds || {}).length
      return n >= NPC_MIN_BONDS
    })
  }, [agents])

  // Build nodes + edges. For time slider, walk each bond's history up to
  // current round; recompute type via the last 'promotion' entry at or
  // before current round.
  const graph = useMemo(() => {
    const includedIds = new Set(includedAgents.map(a => a.id))
    const nodes = includedAgents.map(a => ({
      id: a.id,
      name: a.name,
      source: a.source,
      color: getAgentColor(a),
      val: Math.max(2, Object.keys(a.bonds || {}).length),
    }))

    const links = []
    const seenPairs = new Set()
    for (const a of includedAgents) {
      for (const b of Object.values(a.bonds || {})) {
        if (!includedIds.has(b.otherId)) continue
        // Deduplicate symmetric edges (a→b and b→a are conceptually one)
        const pairKey = [a.id, b.otherId].sort().join('|')
        if (seenPairs.has(pairKey)) continue
        seenPairs.add(pairKey)

        // Walk history up to current round to compute type at that moment
        let typeAtRound = 'weak'
        let intensityAtRound = 0
        let trustAtRound = 0
        for (const h of (b.history || [])) {
          if (h.round > round) break
          if (h.eventType === 'promotion') {
            typeAtRound = h.to
          } else {
            intensityAtRound += (h.dIntensity || 0)
            trustAtRound    += (h.dTrust   || 0)
          }
        }
        intensityAtRound = Math.max(0, Math.min(1, intensityAtRound))
        trustAtRound = Math.max(-1, Math.min(1, trustAtRound))
        // If bond hasn't been touched yet (no history entries within this round), skip
        if (b.history?.length === 0) continue
        const firstRound = b.history?.[0]?.round ?? 0
        if (firstRound > round) continue
        if (!enabledTypes.has(typeAtRound)) continue
        // Phase 7/7c — memorial bonds render as ghost/dotted connections once
        // the bonded character has died (memorialSince <= current round).
        const isMemorial = !!b.memorial && (b.memorialSince ?? Infinity) <= round
        links.push({
          source: a.id,
          target: b.otherId,
          type: typeAtRound,
          intensity: intensityAtRound,
          trust: trustAtRound,
          // Ghost colour for memorial bonds; normal type colour otherwise.
          color: isMemorial ? '#8a93a6' : getBondTypeColor(typeAtRound),
          width: isMemorial ? 0.5 + (b.grief ?? intensityAtRound) * 2 : 0.5 + intensityAtRound * 3,
          memorial: isMemorial,
          grief: isMemorial ? (b.grief ?? 0) : 0,
          preMemorialType: b.preMemorialType || null,
          history: b.history || [],
        })
      }
    }
    return { nodes, links }
  }, [includedAgents, round, enabledTypes])

  // Cool down + force settings tweak once
  useEffect(() => {
    if (fgRef.current) {
      try { fgRef.current.d3Force('charge').strength(-60) } catch {}
      try { fgRef.current.d3Force('link').distance(50) } catch {}
    }
  }, [])

  const toggleType = (t) => setEnabledTypes(prev => {
    const next = new Set(prev)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    return next
  })

  return (
    <div style={{ fontFamily: 'system-ui', color: C.parch }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Bond Network — {graph.nodes.length} agents · {graph.links.length} bonds
          {graph.links.some(l => l.memorial) && (
            <span style={{ marginLeft: 8, color: '#8a93a6' }}>· ⋯ memorial (grief)</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {BOND_TYPES.map(t => (
            <button key={t} onClick={() => toggleType(t)} style={{
              padding: '4px 8px', fontSize: 9, fontFamily: 'system-ui',
              backgroundColor: enabledTypes.has(t) ? getBondTypeColor(t) + '33' : 'transparent',
              color: enabledTypes.has(t) ? getBondTypeColor(t) : C.muted,
              border: `1px solid ${enabledTypes.has(t) ? getBondTypeColor(t) + '66' : C.border}`,
              borderRadius: 3, cursor: 'pointer', textTransform: 'capitalize',
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <ForceGraph2D
            ref={fgRef}
            width={STAGE_W - (activeEdge ? 280 : 0)}
            height={STAGE_H}
            graphData={graph}
            backgroundColor={C.bgCard}
            nodeRelSize={4}
            nodeColor={n => n.color}
            nodeCanvasObjectMode={n => n.source === 'bound' ? 'after' : undefined}
            nodeCanvasObject={(node, ctx, globalScale) => {
              if (node.source !== 'bound') return
              ctx.font = `${10 / globalScale}px system-ui`
              ctx.fillStyle = '#fff'
              ctx.textAlign = 'center'
              ctx.fillText(node.name || '', node.x, node.y + node.val + 8)
            }}
            linkColor={l => l.color}
            linkWidth={l => l.width}
            linkOpacity={l => l.memorial ? 0.35 : 0.3 + Math.abs(l.trust) * 0.65}
            linkLineDash={l => l.memorial ? [3, 3] : null}
            onNodeClick={n => setActiveNode(prev => prev === n.id ? null : n.id)}
            onLinkClick={l => setActiveEdge(l)}
            cooldownTicks={100}
            warmupTicks={50}
          />
        </div>

        {activeEdge && (
          <BondHistoryPanel
            edge={activeEdge}
            agents={agents}
            onClose={() => setActiveEdge(null)}
          />
        )}
      </div>

      <div style={{ marginTop: 12, padding: '0 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Bond evolution slider</span>
          <span style={{ fontSize: 10, color: C.muted }}>{formatRoundLabel(round, timeUnit)}</span>
        </div>
        <input type="range" min={1} max={roundCount} value={round} onChange={e => setRound(+e.target.value)} style={{ width: '100%' }} />
      </div>
    </div>
  )
}

function BondHistoryPanel({ edge, agents, onClose }) {
  const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
  const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
  const sourceAgent = agents.find(a => a.id === sourceId)
  const targetAgent = agents.find(a => a.id === targetId)
  return (
    <div style={{ width: 280, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', maxHeight: STAGE_H, overflowY: 'auto', fontSize: 11, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12, color: getBondTypeColor(edge.type) }}>
          {edge.type.toUpperCase()}
        </strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div style={{ color: C.parch, marginBottom: 6 }}>
        <span style={{ color: getAgentColor(sourceAgent) }}>{sourceAgent?.name || sourceId}</span>
        <span style={{ color: C.muted }}> ↔ </span>
        <span style={{ color: getAgentColor(targetAgent) }}>{targetAgent?.name || targetId}</span>
      </div>
      <div style={{ color: C.muted, fontSize: 10, marginBottom: 10 }}>
        intensity {edge.intensity.toFixed(2)} · trust {edge.trust.toFixed(2)}
      </div>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        History ({edge.history.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {edge.history.map((h, i) => (
          <div key={i} style={{
            padding: '4px 6px', fontSize: 10,
            backgroundColor: h.eventType === 'promotion' ? getBondTypeColor(h.to) + '22' : C.bgElevated,
            color: h.eventType === 'promotion' ? getBondTypeColor(h.to) : C.mutedLight,
            borderRadius: 2,
          }}>
            <span style={{ color: C.muted, marginRight: 6 }}>r{h.round}</span>
            {h.eventType === 'promotion'
              ? <strong>{h.from} → {h.to}</strong>
              : <>
                  {h.eventType}{' '}
                  <span style={{ color: (h.dIntensity || 0) >= 0 ? C.green : C.accBright }}>
                    int {h.dIntensity > 0 ? '+' : ''}{h.dIntensity?.toFixed(2)}
                  </span>
                  {' '}
                  <span style={{ color: (h.dTrust || 0) >= 0 ? C.green : C.accBright }}>
                    trust {h.dTrust > 0 ? '+' : ''}{h.dTrust?.toFixed(2)}
                  </span>
                </>}
          </div>
        ))}
      </div>
    </div>
  )
}
