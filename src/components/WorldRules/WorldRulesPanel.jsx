// Phase 6/6a-ii — World Rules Panel
//
// Top-level navigation tab. The writer's universe-level configuration sits
// here, OUTSIDE the Story Bible (which is the writer's character + lore
// reference). Five sections:
//
//   1. Time & Reality      — aging behaviour + needs depletion multipliers
//   2. Per-Kind Lifespan   — override life expectancy for specific characters
//                            or kinds (e.g. Vampires 5000, Master Akshara 2000)
//   3. Global Lifespan     — multiplier applied AFTER per-kind override
//   4. Custom Narrative    — free-text rules honored by chronicler + inference
//   5. Save / Reset        — persist to project; revert to defaults

import { useEffect, useState } from 'react'
import { C } from '../../constants.js'
import { DEFAULT_WORLD_RULES, withDefaults } from './worldRulesSchema.js'

const NEED_LABELS = {
  physiologicalSpeed: 'Physiological (hunger/sleep)',
  safetySpeed:        'Safety (shelter/danger)',
  belongingSpeed:     'Belonging (connection)',
  esteemSpeed:        'Esteem (respect)',
  purposeSpeed:       'Purpose (meaning)',
}

export function WorldRulesPanel({ worldRules, setWorldRules, chars = [] }) {
  // Local working copy — saves on blur or explicit "Save" button
  const [local, setLocal] = useState(() => withDefaults(worldRules))
  useEffect(() => { setLocal(withDefaults(worldRules)) }, [worldRules])

  const dirty = JSON.stringify(local) !== JSON.stringify(withDefaults(worldRules))

  const update = (path, value) => {
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const parts = path.split('.')
      let obj = next
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] ||= {}
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  const save = () => setWorldRules(withDefaults(local))
  const reset = () => {
    setLocal(withDefaults(null))
    setWorldRules(withDefaults(null))
  }

  // Lifespan overrides — render as a small key/value list with add/remove
  const overrideEntries = Object.entries(local.lifespanOverrides || {})
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const addOverride = () => {
    const k = newKey.trim().toLowerCase()
    const v = Number(newVal)
    if (!k || !Number.isFinite(v) || v <= 0) return
    update(`lifespanOverrides.${k}`, v)
    setNewKey(''); setNewVal('')
  }
  const removeOverride = (k) => {
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      delete next.lifespanOverrides[k]
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px', backgroundColor: C.bg, color: C.parch }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontFamily: 'Georgia, serif', color: C.parch, marginBottom: 4 }}>
          World Rules
        </div>
        <div style={{ fontSize: 12, color: C.mutedLight, fontFamily: 'system-ui', lineHeight: 1.6, maxWidth: 720 }}>
          Universe-level configuration. These rules govern <em>how</em> your world behaves in the simulation — aging, mortality, lifespan, plus any custom rules you want the chronicler and inference layer to honor. Story Bible stays for characters and lore; this is for engine behaviour.
        </div>
      </div>

      {/* Save bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, position: 'sticky', top: 0, padding: '8px 0', backgroundColor: C.bg, zIndex: 5 }}>
        <button onClick={save} disabled={!dirty}
          style={{ padding: '8px 16px', backgroundColor: dirty ? C.purple : C.bgElevated, color: dirty ? '#fff' : C.muted, border: 'none', borderRadius: 5, fontSize: 12, fontFamily: 'system-ui', cursor: dirty ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
          {dirty ? 'Save World Rules' : 'Saved'}
        </button>
        <button onClick={reset}
          style={{ padding: '8px 16px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, fontFamily: 'system-ui', cursor: 'pointer' }}>
          Reset to Defaults
        </button>
      </div>

      {/* ── Section 1: Time & Reality ─────────────────────────────── */}
      <Section title="Time & Reality" desc="Whether aging produces mortality, and how fast time and need pressure flow.">
        <Field label="Aging matters">
          <Toggle
            value={!!local.aging.matters}
            onChange={v => update('aging.matters', v)}
            onLabel="Yes — characters can die of old age"
            offLabel="No — aging produces no mortality (only health/conflict can kill)"
          />
        </Field>
        <Field label="Aging speed" desc="Multiplier on per-round age increase. 1.0 = real-time, 0.1 = mostly-immortal cast.">
          <NumberInput value={local.aging.speed} onChange={v => update('aging.speed', v)} min={0} max={10} step={0.05} />
        </Field>
        <div style={{ height: 1, background: C.border, margin: '16px 0' }}/>
        <div style={{ fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Needs Depletion Speed
        </div>
        {Object.keys(NEED_LABELS).map(k => (
          <Field key={k} label={NEED_LABELS[k]}>
            <NumberInput
              value={local.needs[k]}
              onChange={v => update(`needs.${k}`, v)}
              min={0} max={5} step={0.1}
            />
          </Field>
        ))}
      </Section>

      {/* ── Section 2: Per-Kind Lifespan Overrides ────────────────── */}
      <Section title="Per-Kind Lifespan Overrides" desc="Set life expectancy in years for a specific character, species, or kind. Keys match character names (lowercase), species, or kind ids. The first match wins.">
        {overrideEntries.length === 0 && (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', marginBottom: 12 }}>
            No overrides set. All agents use their species default.
          </div>
        )}
        {overrideEntries.map(([key, val]) => (
          <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ width: 200, fontSize: 12, color: C.parch, fontFamily: 'system-ui' }}>{key}</div>
            <input type="number"
              value={val}
              onChange={e => update(`lifespanOverrides.${key}`, Number(e.target.value))}
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui' }}>years</span>
            <button onClick={() => removeOverride(key)}
              style={{ marginLeft: 'auto', padding: '4px 8px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 10, fontFamily: 'system-ui', cursor: 'pointer' }}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <input
            placeholder="kind/name (e.g. vampire, witch, master akshara)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            style={{ ...inputStyle, width: 320 }}
          />
          <input type="number" placeholder="years" value={newVal}
            onChange={e => setNewVal(e.target.value)}
            style={inputStyle}
          />
          <button onClick={addOverride}
            style={{ padding: '6px 12px', backgroundColor: C.purple, color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontFamily: 'system-ui', cursor: 'pointer' }}>
            Add Override
          </button>
        </div>

        {/* Quick-pick from bound chars */}
        {chars.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Quick-pick from Story Bible
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {chars.map(c => (
                <button key={c.id} onClick={() => setNewKey((c.name || '').toLowerCase())}
                  style={{ padding: '4px 10px', backgroundColor: C.bgElevated, color: C.parch, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 11, fontFamily: 'system-ui', cursor: 'pointer' }}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 3: Global Lifespan Multiplier ─────────────────── */}
      <Section title="Global Lifespan Multiplier" desc="Multiplier applied to all lifespans after the per-kind override. 2.0 doubles every species's lifespan; 0.5 halves it.">
        <Field label="Multiplier">
          <NumberInput value={local.globalLifespanMultiplier}
            onChange={v => update('globalLifespanMultiplier', v)}
            min={0.01} max={100} step={0.1}/>
        </Field>
      </Section>

      {/* ── Section 4: Psychological Influence (Phase 7/7a) ─────────── */}
      <Section title="Psychological Influence" desc="How strongly character psychology biases decisions. 0 = psychology is ignored (Phase 6 behaviour, decisions driven by needs/bonds only). 1 = strong biasing (high-agreeableness characters cooperate noticeably more; high-marker characters conflict noticeably more). 0.6 default — present but never overrides physics.">
        <Field label={`Influence (${(local.psychologicalInfluence ?? 0.6).toFixed(2)})`}>
          <input type="range" min={0} max={1} step={0.05}
            value={local.psychologicalInfluence ?? 0.6}
            onChange={e => update('psychologicalInfluence', Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', marginTop: 6 }}>
            Probability nudge, not a hard override. A character is more <em>likely</em> to act in-character but never guaranteed to.
          </div>
        </Field>
      </Section>

      {/* ── Section 5: Custom Narrative Rules ─────────────────────── */}
      <Section title="Custom Narrative Rules" desc="Free-text rules the chronicler, taxonomy detector, and character inference will honor. Examples: 'Vampires weakened but not killed by sunlight.' 'Werewolf cats are matrilineal.'">
        <textarea
          value={local.customNarrativeRules}
          onChange={e => update('customNarrativeRules', e.target.value)}
          rows={6}
          placeholder="Write any custom rules you want the engine to honor. One rule per line works well."
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 5, color: C.parch, fontSize: 12, fontFamily: 'system-ui', lineHeight: 1.6, outline: 'none', resize: 'vertical' }}
        />
      </Section>

      {/* Footer save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button onClick={save} disabled={!dirty}
          style={{ padding: '8px 16px', backgroundColor: dirty ? C.purple : C.bgElevated, color: dirty ? '#fff' : C.muted, border: 'none', borderRadius: 5, fontSize: 12, fontFamily: 'system-ui', cursor: dirty ? 'pointer' : 'not-allowed' }}>
          {dirty ? 'Save World Rules' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

// ── Internal subcomponents ────────────────────────────────────────────
function Section({ title, desc, children }) {
  return (
    <div style={{ marginBottom: 32, padding: '20px 24px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 14, fontFamily: 'Georgia, serif', color: C.parch, marginBottom: 4 }}>{title}</div>
      {desc && <div style={{ fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', lineHeight: 1.6, marginBottom: 16 }}>{desc}</div>}
      {children}
    </div>
  )
}

function Field({ label, desc, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.parch, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      {desc && <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginBottom: 6 }}>{desc}</div>}
      {children}
    </div>
  )
}

function NumberInput({ value, onChange, min = 0, max = 100, step = 1 }) {
  return (
    <input type="number" value={value}
      onChange={e => onChange(Number(e.target.value))}
      min={min} max={max} step={step}
      style={inputStyle}
    />
  )
}

function Toggle({ value, onChange, onLabel, offLabel }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => onChange(true)}
        style={{ padding: '6px 12px', backgroundColor: value ? C.purple : C.bgElevated, color: value ? '#fff' : C.muted, border: 'none', borderRadius: 4, fontSize: 11, fontFamily: 'system-ui', cursor: 'pointer' }}>
        {onLabel}
      </button>
      <button onClick={() => onChange(false)}
        style={{ padding: '6px 12px', backgroundColor: !value ? C.purple : C.bgElevated, color: !value ? '#fff' : C.muted, border: 'none', borderRadius: 4, fontSize: 11, fontFamily: 'system-ui', cursor: 'pointer' }}>
        {offLabel}
      </button>
    </div>
  )
}

const inputStyle = {
  padding: '6px 10px',
  backgroundColor: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.parch,
  fontSize: 12,
  fontFamily: 'system-ui',
  outline: 'none',
  width: 120,
}
