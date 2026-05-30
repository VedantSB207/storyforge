// Phase 7/7a — Psychology Review / Edit screen.
//
// Shown after either the questionnaire or AI inference completes. Lets the
// writer see what was derived and override any value. Adjusting the
// Enneagram type/wing/health re-derives the dials; adjusting an
// underlying dial directly flips `source` to 'manual' so the writer's
// edit is sacred (mirrors the Phase 6 hydration architecture).

import { useEffect, useMemo, useState } from 'react'
import { C } from '../../constants.js'
import {
  ENNEAGRAM_TYPES, ENNEAGRAM_LABELS, WINGS_OF, ATTACHMENT_STYLES,
  BIG_FIVE_KEYS, MARKER_KEYS, bandOf, normaliseProfile,
} from './psychologySchema.js'
import { mapEnneagramToProfile, enneagramHeadline } from './enneagramMapper.js'

const BIG_FIVE_LABELS = {
  openness:          'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion:      'Extraversion',
  agreeableness:     'Agreeableness',
  neuroticism:       'Neuroticism',
}

const MARKER_LABELS = {
  narcissism:       'Narcissism',
  machiavellianism: 'Machiavellianism',
  callousness:      'Callousness',
  vengefulness:     'Vengefulness',
}

const HEALTH_BAND_LABEL = {
  healthy:   'Healthy (integrated)',
  average:   'Average',
  unhealthy: 'Unhealthy (disintegrated)',
}

export function PsychologyReview({ character, profile, onSave, onCancel }) {
  // Local working copy
  const [local, setLocal] = useState(() => normaliseProfile(profile))
  useEffect(() => { setLocal(normaliseProfile(profile)) }, [profile])

  // Cache the values that would come from a pure mapping of the current
  // Enneagram + wing + health, so we can show "Reset to mapped" and detect
  // manual edits.
  const mapped = useMemo(() => {
    if (!local.enneagram?.type) return null
    return mapEnneagramToProfile({
      type: local.enneagram.type,
      wing: local.enneagram.wing,
      healthLevel: local.enneagram.healthLevel,
    })
  }, [local.enneagram?.type, local.enneagram?.wing, local.enneagram?.healthLevel])

  // When the Enneagram changes, re-derive the dials.
  const setEnneagram = (patch) => {
    setLocal(prev => {
      const ennNext = { ...prev.enneagram, ...patch }
      // Coerce wing to one adjacent to type if type changed
      if (patch.type && !WINGS_OF[patch.type].includes(ennNext.wing)) {
        ennNext.wing = WINGS_OF[patch.type][0]
      }
      const derived = mapEnneagramToProfile({
        type: ennNext.type, wing: ennNext.wing, healthLevel: ennNext.healthLevel,
      })
      return {
        ...prev,
        enneagram: ennNext,
        bigFive: derived.bigFive,
        attachment: derived.attachment,
        markers: derived.markers,
        // Source switches back to the original (inference/questionnaire) when
        // the writer re-derives via Enneagram. If they then adjust a dial,
        // it'll flip to 'manual' again below.
      }
    })
  }

  // Adjusting a derived dial directly flips source → 'manual'.
  const setBigFive = (key, v) => {
    setLocal(prev => ({
      ...prev,
      bigFive: { ...prev.bigFive, [key]: clamp01(v) },
      source: 'manual',
    }))
  }
  const setMarker = (key, v) => {
    setLocal(prev => ({
      ...prev,
      markers: { ...prev.markers, [key]: clamp01(v) },
      source: 'manual',
    }))
  }
  const setAttachment = (val) => {
    setLocal(prev => ({ ...prev, attachment: val, source: 'manual' }))
  }

  const resetField = (group, key) => {
    if (!mapped) return
    setLocal(prev => ({
      ...prev,
      [group]: { ...prev[group], [key]: mapped[group][key] },
      // If everything now matches mapped, source goes back to original;
      // otherwise stays manual. Cheap check: just leave source as-is unless
      // both bigFive and markers match mapped exactly.
    }))
  }

  const resetAttachment = () => {
    if (!mapped) return
    setLocal(prev => ({ ...prev, attachment: mapped.attachment }))
  }

  const save = () => onSave?.(normaliseProfile(local))

  const headline = enneagramHeadline(local)
  const band = bandOf(local.enneagram?.healthLevel ?? 5)

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 28px', fontFamily: 'Georgia,serif' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
          Psychology · {character?.name || 'Character'}
        </div>
        <div style={{ fontSize: 18, color: C.parch, fontFamily: 'Georgia, serif' }}>{headline}</div>
        {local.reasoning && (
          <div style={{ fontSize: 12, color: C.mutedLight, fontFamily: 'system-ui', fontStyle: 'italic', marginTop: 6, lineHeight: 1.6 }}>
            “{local.reasoning}”
          </div>
        )}
        {local.source && (
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
            Source: <strong style={{ color: C.mutedLight }}>{local.source}</strong>
          </div>
        )}
      </div>

      {/* Enneagram editor ─────────────────────────────────────────────── */}
      <Section title="Enneagram (writer-facing label)">
        <Row label="Type">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ENNEAGRAM_TYPES.map(t => (
              <button key={t} onClick={() => setEnneagram({ type: t })}
                title={ENNEAGRAM_LABELS[t]}
                style={{
                  padding: '6px 10px', fontSize: 11,
                  backgroundColor: local.enneagram.type === t ? C.purple : C.bgCard,
                  color: local.enneagram.type === t ? '#fff' : C.muted,
                  border: `1px solid ${local.enneagram.type === t ? C.purple : C.border}`,
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui',
                }}>
                {t}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Wing">
          <div style={{ display: 'flex', gap: 4 }}>
            {(WINGS_OF[local.enneagram.type] || []).map(w => (
              <button key={w} onClick={() => setEnneagram({ wing: w })}
                title={ENNEAGRAM_LABELS[w]}
                style={{
                  padding: '6px 12px', fontSize: 11,
                  backgroundColor: local.enneagram.wing === w ? C.purple : C.bgCard,
                  color: local.enneagram.wing === w ? '#fff' : C.muted,
                  border: `1px solid ${local.enneagram.wing === w ? C.purple : C.border}`,
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui',
                }}>
                w{w} · {ENNEAGRAM_LABELS[w]}
              </button>
            ))}
          </div>
        </Row>
        <Row label={`Health level (${local.enneagram.healthLevel}) — ${HEALTH_BAND_LABEL[band]}`}>
          <input type="range" min={1} max={9} step={1}
            value={local.enneagram.healthLevel}
            onChange={e => setEnneagram({ healthLevel: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', marginTop: 4 }}>
            1 = most integrated, 9 = most disintegrated. Modulates the antagonist markers.
          </div>
        </Row>
      </Section>

      {/* Big Five — derived underlying dials ──────────────────────────── */}
      <Section title="Big Five (the engine reads these)">
        {BIG_FIVE_KEYS.map(k => (
          <SliderRow
            key={k}
            label={BIG_FIVE_LABELS[k]}
            value={local.bigFive[k]}
            mapped={mapped?.bigFive[k]}
            onChange={v => setBigFive(k, v)}
            onReset={() => resetField('bigFive', k)}
          />
        ))}
      </Section>

      {/* Attachment ─────────────────────────────────────────────────── */}
      <Section title="Attachment style">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ATTACHMENT_STYLES.map(a => (
            <button key={a} onClick={() => setAttachment(a)}
              style={{
                padding: '6px 12px', fontSize: 11,
                backgroundColor: local.attachment === a ? C.purple : C.bgCard,
                color: local.attachment === a ? '#fff' : C.muted,
                border: `1px solid ${local.attachment === a ? C.purple : C.border}`,
                borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui',
              }}>
              {a}
            </button>
          ))}
          {mapped?.attachment && mapped.attachment !== local.attachment && (
            <button onClick={resetAttachment}
              style={{
                padding: '6px 10px', fontSize: 10,
                backgroundColor: 'transparent', color: C.gold,
                border: `1px solid ${C.gold}55`, borderRadius: 4,
                cursor: 'pointer', fontFamily: 'system-ui',
              }}>
              Reset to {mapped.attachment}
            </button>
          )}
        </div>
      </Section>

      {/* Antagonist markers ─────────────────────────────────────────── */}
      <Section title="Antagonist markers (modulated by health level)">
        {MARKER_KEYS.map(k => (
          <SliderRow
            key={k}
            label={MARKER_LABELS[k]}
            value={local.markers[k]}
            mapped={mapped?.markers[k]}
            onChange={v => setMarker(k, v)}
            onReset={() => resetField('markers', k)}
          />
        ))}
      </Section>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
        {onCancel && (
          <button onClick={onCancel}
            style={{
              padding: '8px 14px', fontSize: 12, fontFamily: 'system-ui',
              backgroundColor: 'transparent', color: C.muted,
              border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
            }}>
            Cancel
          </button>
        )}
        <button onClick={save}
          style={{
            padding: '8px 16px', fontSize: 12, fontFamily: 'system-ui',
            backgroundColor: C.purple, color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer',
          }}>
          Save Psychology
        </button>
      </div>
    </div>
  )
}

// ── Internals ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16, padding: '14px 16px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function SliderRow({ label, value, mapped, onChange, onReset }) {
  const edited = mapped != null && Math.abs(value - mapped) > 0.001
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.mutedLight, fontFamily: 'system-ui', minWidth: 150 }}>{label}</span>
        <span style={{ fontSize: 11, color: edited ? C.gold : C.parch, fontFamily: 'system-ui', minWidth: 36, textAlign: 'right' }}>
          {value.toFixed(2)}
        </span>
        {edited && (
          <button onClick={onReset}
            title={`Reset to mapped value ${mapped.toFixed(2)}`}
            style={{
              padding: '2px 8px', fontSize: 9, fontFamily: 'system-ui',
              backgroundColor: 'transparent', color: C.gold,
              border: `1px solid ${C.gold}55`, borderRadius: 3, cursor: 'pointer',
            }}>
            Reset ({mapped.toFixed(2)})
          </button>
        )}
      </div>
      <input type="range" min={0} max={1} step={0.01}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))
