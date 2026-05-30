// Phase 6/6a-i — Hydration Review screen
//
// The writer sees this after character inference completes. Per-character
// card with editable Age / Status / Location / Background Summary fields.
// Inferred relationships are listed read-only. Each editable field has a
// "Reset to inferred" affordance.

import { useState } from 'react'
import { C } from '../../../constants.js'
import { effectiveInference, applyEdit, resetEdit } from './hydrationOrchestrator.js'
import { getAgentColor } from '../visualizationHelpers.js'

const STATUS_OPTIONS = ['alive', 'missing', 'dead', 'exiled', 'dormant']
const REGION_OPTIONS = ['central', 'north', 'south', 'east', 'west', 'wilderness']

export function HydrationReview({
  hydrationData,
  setHydrationData,
  chars,
  bondsSummary = [],
  onConfirm,
  onRerun,
  onCancel,
  rerunning = false,
}) {
  const [expanded, setExpanded] = useState(() => new Set(chars.length > 0 ? [chars[0].id] : []))
  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const updateField = (agentId, field, value) => {
    setHydrationData(applyEdit(hydrationData, agentId, field, value))
  }
  const resetField = (agentId, field) => {
    setHydrationData(resetEdit(hydrationData, agentId, field))
  }

  if (!hydrationData?.inferences) {
    return (
      <div style={{ padding: 24, color: C.muted, fontFamily: 'system-ui', textAlign: 'center' }}>
        No hydration data available.
      </div>
    )
  }

  // Bond summary keyed by source character name
  const bondsByName = bondsSummary.reduce((m, b) => {
    if (!m[b.from]) m[b.from] = []
    m[b.from].push(b)
    return m
  }, {})

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 17, color: C.purpleLight, fontWeight: 500 }}>Story Setup — Review what the simulation sees</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginTop: 4, lineHeight: 1.6 }}>
          We read each character's profile and inferred their starting state. Edit anything that doesn't match your story. The simulation projects forward from these values.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {chars.map(char => {
          const agentId = `agent_${char.id}`
          const eff = effectiveInference(hydrationData, agentId)
          if (!eff) return null
          const color = getAgentColor({ id: agentId, source: 'bound' })
          const isExpanded = expanded.has(char.id)
          const charBonds = bondsByName[char.name] || []
          return (
            <CharacterCard
              key={char.id}
              char={char}
              eff={eff}
              color={color}
              expanded={isExpanded}
              onToggle={() => toggle(char.id)}
              bonds={charBonds}
              onUpdate={(field, value) => updateField(agentId, field, value)}
              onReset={(field) => resetField(agentId, field)}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui' }}>
          {hydrationData.callsUsed != null && `${hydrationData.callsUsed} inference calls · `}
          {hydrationData.cost != null && `$${(hydrationData.cost || 0).toFixed(4)} · `}
          {hydrationData.bondsSummary?.length || 0} bonds seeded
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btnSec}>Back</button>
          <button onClick={onRerun} disabled={rerunning} style={btnSec}>{rerunning ? 'Re-inferring…' : 'Re-run inference'}</button>
          <button onClick={onConfirm} style={btnPrimary}>Apply and continue →</button>
        </div>
      </div>
    </div>
  )
}

function CharacterCard({ char, eff, color, expanded, onToggle, bonds, onUpdate, onReset }) {
  const inf  = eff      // already merged
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 6, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, color: C.parch, fontFamily: 'Georgia, serif', fontWeight: 600 }}>{char.name}</span>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui' }}>{char.species} · {char.role}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui' }}>
          age {inf.age.value}{inf.age.approximate ? '~' : ''} · {inf.status} · {inf.location}
        </span>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: 'system-ui' }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <FieldEditor
              label="Age"
              value={inf.age?.value ?? 30}
              edited={!!inf._edited?.age}
              hint={inf.age?.approximate ? `~ ${inf.age?.reasoning || ''}` : (inf.age?.reasoning || '')}
              onChange={v => onUpdate('age', Number(v) || 0)}
              onReset={() => onReset('age')}
              type="number"
            />
            <FieldEditor
              label="Status"
              value={inf.status}
              edited={!!inf._edited?.status}
              hint={inf.statusReasoning}
              onChange={v => onUpdate('status', v)}
              onReset={() => onReset('status')}
              type="select"
              options={STATUS_OPTIONS}
            />
            <FieldEditor
              label="Location"
              value={inf.location}
              edited={!!inf._edited?.location}
              hint={inf.locationReasoning}
              onChange={v => onUpdate('location', v)}
              onReset={() => onReset('location')}
              type="select"
              options={REGION_OPTIONS}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <FieldEditor
              label="Background Summary"
              value={inf.backgroundSummary}
              edited={!!inf._edited?.backgroundSummary}
              onChange={v => onUpdate('backgroundSummary', v)}
              onReset={() => onReset('backgroundSummary')}
              type="textarea"
              fullWidth
            />
          </div>

          {/* Inferred relationships (read-only) */}
          {Array.isArray(inf.keyRelationships) && inf.keyRelationships.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Inferred Relationships</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {inf.keyRelationships.map((r, i) => (
                  <div key={i} style={{ fontSize: 11, fontFamily: 'system-ui', color: C.mutedLight, padding: '4px 8px', backgroundColor: C.bgElevated, borderRadius: 3 }}>
                    <strong style={{ color: C.parch }}>{r.with}</strong>
                    <span style={{ color: C.muted, margin: '0 6px' }}>·</span>
                    <span style={{ color: C.gold }}>{r.type}</span>
                    {r.evidence && <span style={{ color: C.muted, fontSize: 10, marginLeft: 8, fontStyle: 'italic' }}>— {r.evidence}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seeded bonds from the Relationship Web mapping */}
          {bonds.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Seeded Bonds at Round 0</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {bonds.map((b, i) => (
                  <span key={i} style={{
                    padding: '3px 8px', fontSize: 10, fontFamily: 'system-ui',
                    backgroundColor: getBondColor(b.type) + '22',
                    color: getBondColor(b.type),
                    border: `1px solid ${getBondColor(b.type)}55`,
                    borderRadius: 3,
                  }}>
                    {b.to} · {b.type} · int {b.intensity?.toFixed(2)} · {b.source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldEditor({ label, value, edited, hint, onChange, onReset, type = 'text', options = [], fullWidth = false }) {
  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: C.bg,
    color: C.parch,
    border: `1px solid ${edited ? C.gold + '66' : C.borderMid}`,
    borderRadius: 3,
    fontSize: 12,
    fontFamily: 'system-ui',
    outline: 'none',
    boxSizing: 'border-box',
  }
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: edited ? C.gold : C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}{edited ? ' · edited' : ''}
        </span>
        {edited && (
          <button onClick={onReset} style={{ fontSize: 9, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'system-ui', textDecoration: 'underline' }}>
            reset
          </button>
        )}
      </div>
      {type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, minHeight: 60, fontFamily: 'Georgia, serif', lineHeight: 1.5, resize: 'vertical' }}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
      {hint && (
        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'system-ui', marginTop: 3, fontStyle: 'italic', lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function getBondColor(type) {
  const colors = {
    kinship: '#8e24aa', love: '#e91e63', friendship: '#43a047',
    rivalry: '#ef6c00', enmity: '#7b1f1f', weak: '#bdbdbd',
  }
  return colors[type] || '#bdbdbd'
}

const btnPrimary = {
  padding: '8px 16px',
  backgroundColor: C.purple,
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'system-ui',
  cursor: 'pointer',
}

const btnSec = {
  padding: '8px 14px',
  backgroundColor: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'system-ui',
  cursor: 'pointer',
}
