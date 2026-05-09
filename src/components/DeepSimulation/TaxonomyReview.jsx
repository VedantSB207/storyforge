import { useState } from 'react'
import { C, genId } from '../../constants.js'
import { KIND_SIZES } from './deepSimSchema.js'

// Phase 2 — taxonomy review screen
// Writer adjusts weights, suppresses kinds/genres, can add new ones,
// then confirms. Confirmed taxonomy goes back to DeepSimulation.jsx
// which carries it into the census + run.

export function TaxonomyReview({
  taxonomy,
  setTaxonomy,
  onConfirm,
  onRegenerate,
  onCancel,
  regenerating = false,
}) {
  const [reasoningOpen, setReasoningOpen]   = useState(true)
  const [expandedGenres, setExpandedGenres] = useState({})
  const [newGenreName, setNewGenreName]     = useState('')
  const [addingGenre, setAddingGenre]       = useState(false)
  const [newKindFor, setNewKindFor]         = useState(null)   // genre id currently adding a kind to
  const [newKindName, setNewKindName]       = useState('')
  const [errMsg, setErrMsg]                 = useState('')

  const toggleExpand = (id) => setExpandedGenres(p => ({ ...p, [id]: !p[id] }))

  // ── mutators (return new taxonomy via setTaxonomy)
  const updateGenre = (gid, patch) => {
    setTaxonomy({
      ...taxonomy,
      genres: taxonomy.genres.map(g => g.id === gid ? { ...g, ...patch } : g),
    })
  }

  const updateKind = (gid, kid, patch) => {
    setTaxonomy({
      ...taxonomy,
      genres: taxonomy.genres.map(g => g.id !== gid ? g : ({
        ...g,
        kinds: g.kinds.map(k => k.id === kid ? { ...k, ...patch } : k),
      })),
    })
  }

  const removeGenre = (gid) => {
    setTaxonomy({
      ...taxonomy,
      genres: taxonomy.genres.filter(g => g.id !== gid),
    })
  }

  const commitNewGenre = () => {
    setErrMsg('')
    const name = newGenreName.trim()
    if (!name) { setErrMsg('Genre name cannot be empty.'); return }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    if (taxonomy.genres.some(g => g.id === id)) {
      setErrMsg(`A genre named "${name}" already exists.`)
      return
    }
    setTaxonomy({
      ...taxonomy,
      genres: [...taxonomy.genres, {
        id, name, detected: false, weight: 0.2, kinds: [],
      }],
    })
    setExpandedGenres(p => ({ ...p, [id]: true }))
    setNewGenreName('')
    setAddingGenre(false)
  }

  const commitNewKind = (gid) => {
    setErrMsg('')
    const name = newKindName.trim()
    if (!name) { setErrMsg('Kind name cannot be empty.'); return }
    const kid = name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + genId().slice(0, 3)
    updateGenre(gid, {
      kinds: [
        ...taxonomy.genres.find(g => g.id === gid).kinds,
        {
          id: kid, name, included: true,
          typicalTraits: [], typicalLifeExpectancy: 30, typicalSize: 'medium', typicalCount: 5,
        },
      ],
    })
    setNewKindName('')
    setNewKindFor(null)
  }

  const removeKind = (gid, kid) => {
    updateGenre(gid, {
      kinds: taxonomy.genres.find(g => g.id === gid).kinds.filter(k => k.id !== kid),
    })
  }

  const totalWeight    = taxonomy.genres.reduce((s, g) => s + (g.weight || 0), 0)
  const includedKinds  = taxonomy.genres.reduce((s, g) => s + g.kinds.filter(k => k.included !== false).length, 0)

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto', fontFamily: 'Georgia,serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, color: C.purpleLight, fontWeight: 500 }}>Confirm Your World Taxonomy</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', marginTop: 2 }}>
            {taxonomy.genres.length} genre{taxonomy.genres.length === 1 ? '' : 's'} · {includedKinds} kind{includedKinds === 1 ? '' : 's'} included
            {totalWeight > 0 && ` · weights sum ${(totalWeight * 100).toFixed(0)}%`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onCancel}    style={btnSecondary}>Back</button>
          <button onClick={onRegenerate} disabled={regenerating} style={{ ...btnSecondary, opacity: regenerating ? 0.5 : 1 }}>{regenerating ? 'Regenerating…' : 'Regenerate'}</button>
        </div>
      </div>

      {/* Reasoning */}
      {taxonomy.reasoning && (
        <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 16, overflow: 'hidden' }}>
          <button onClick={() => setReasoningOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Engine Reasoning</span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: 'system-ui' }}>{reasoningOpen ? '−' : '+'}</span>
          </button>
          {reasoningOpen && (
            <div style={{ padding: '0 14px 12px', fontSize: 12, color: C.mutedLight, lineHeight: 1.6, fontFamily: 'system-ui', fontStyle: 'italic' }}>
              {taxonomy.reasoning}
            </div>
          )}
        </div>
      )}

      {/* Genres list */}
      {taxonomy.genres.length === 0 ? (
        <div style={{ padding: 20, fontSize: 12, color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui', backgroundColor: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 6, textAlign: 'center' }}>
          No genres detected. Add one manually below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {taxonomy.genres.map(g => (
            <GenreCard
              key={g.id}
              genre={g}
              expanded={!!expandedGenres[g.id]}
              onToggleExpand={() => toggleExpand(g.id)}
              onUpdate={(patch) => updateGenre(g.id, patch)}
              onRemove={() => removeGenre(g.id)}
              onUpdateKind={(kid, patch) => updateKind(g.id, kid, patch)}
              onRemoveKind={(kid) => removeKind(g.id, kid)}
              addingKind={newKindFor === g.id}
              onStartAddKind={() => { setNewKindFor(g.id); setNewKindName(''); setErrMsg('') }}
              onCancelAddKind={() => { setNewKindFor(null); setNewKindName(''); setErrMsg('') }}
              onCommitAddKind={() => commitNewKind(g.id)}
              newKindName={newKindName}
              setNewKindName={setNewKindName}
            />
          ))}
        </div>
      )}

      {/* Add genre */}
      {addingGenre ? (
        <div style={{ marginTop: 12, padding: 10, backgroundColor: C.bgCard, border: `1px solid ${C.purple}66`, borderRadius: 5, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            autoFocus
            value={newGenreName}
            onChange={e => setNewGenreName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitNewGenre(); if (e.key === 'Escape') { setAddingGenre(false); setNewGenreName(''); setErrMsg('') } }}
            placeholder='New genre name (e.g. "Mythology", "Spirits")'
            style={{ flex: 1, padding: '6px 10px', backgroundColor: C.bg, color: C.parch, border: `1px solid ${C.borderMid}`, borderRadius: 4, fontSize: 12, outline: 'none', fontFamily: 'system-ui' }}
          />
          <button onClick={commitNewGenre} style={{ padding: '6px 12px', backgroundColor: C.purple, color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }}>Save</button>
          <button onClick={() => { setAddingGenre(false); setNewGenreName(''); setErrMsg('') }} style={{ padding: '6px 10px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => { setAddingGenre(true); setErrMsg('') }} style={{ marginTop: 12, padding: '8px 14px', backgroundColor: 'transparent', color: C.purpleLight, border: `1px dashed ${C.purple}66`, borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', width: '100%' }}>+ Add Genre</button>
      )}
      {errMsg && (
        <div style={{ marginTop: 6, fontSize: 11, color: C.accBright, fontFamily: 'system-ui' }}>{errMsg}</div>
      )}

      {/* Confirm */}
      <button
        onClick={onConfirm}
        disabled={includedKinds === 0}
        style={{
          marginTop: 18, width: '100%', padding: 13,
          backgroundColor: includedKinds === 0 ? C.bgCard : C.purple,
          color: includedKinds === 0 ? C.muted : '#fff',
          border: `1px solid ${includedKinds === 0 ? C.border : C.purple}`,
          borderRadius: 6, fontSize: 14, fontFamily: 'system-ui',
          cursor: includedKinds === 0 ? 'not-allowed' : 'pointer',
          letterSpacing: '0.05em',
        }}
      >
        {includedKinds === 0 ? 'Include at least one kind to continue' : 'Confirm and Continue →'}
      </button>
    </div>
  )
}

// ── Genre card ──────────────────────────────────────────────────────────────
function GenreCard({
  genre, expanded, onToggleExpand, onUpdate, onRemove, onUpdateKind, onRemoveKind,
  addingKind, onStartAddKind, onCancelAddKind, onCommitAddKind, newKindName, setNewKindName,
}) {
  const includedCount = genre.kinds.filter(k => k.included !== false).length
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${genre.detected ? C.purple + '44' : C.gold + '44'}`, borderRadius: 6 }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onToggleExpand} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 0, width: 16 }}>{expanded ? '▾' : '▸'}</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: C.parch, fontWeight: 500 }}>{genre.name}</span>
            <span style={{ fontSize: 9, color: genre.detected ? C.purpleLight : C.gold, backgroundColor: (genre.detected ? C.purple : C.gold) + '22', padding: '1px 6px', borderRadius: 8, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {genre.detected ? 'detected' : 'writer-added'}
            </span>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui' }}>{includedCount}/{genre.kinds.length} kinds</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', width: 50 }}>Weight</span>
          <input
            type="range" min={0} max={1} step={0.05}
            value={genre.weight}
            onChange={e => onUpdate({ weight: +e.target.value })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: C.purpleLight, fontFamily: 'system-ui', width: 36, textAlign: 'right' }}>{Math.round(genre.weight * 100)}%</span>
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 4 }}>×</button>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 14px 12px' }}>
          {genre.kinds.length === 0 ? (
            <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', fontFamily: 'system-ui', padding: '6px 0' }}>No kinds defined yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {genre.kinds.map(k => (
                <KindRow
                  key={k.id}
                  kind={k}
                  onUpdate={(patch) => onUpdateKind(k.id, patch)}
                  onRemove={() => onRemoveKind(k.id)}
                />
              ))}
            </div>
          )}
          {addingKind ? (
            <div style={{ marginTop: 6, padding: '6px 8px', backgroundColor: C.bg, border: `1px solid ${C.gold}55`, borderRadius: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                autoFocus
                value={newKindName}
                onChange={e => setNewKindName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onCommitAddKind(); if (e.key === 'Escape') onCancelAddKind() }}
                placeholder='New kind name (e.g. "Wolf", "Witch", "Drone")'
                style={{ flex: 1, padding: '4px 8px', backgroundColor: C.bgCard, color: C.parch, border: `1px solid ${C.borderMid}`, borderRadius: 3, fontSize: 11, outline: 'none', fontFamily: 'system-ui' }}
              />
              <button onClick={onCommitAddKind} style={{ padding: '4px 10px', backgroundColor: C.gold, color: C.bg, border: 'none', borderRadius: 3, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui', fontWeight: 'bold' }}>Save</button>
              <button onClick={onCancelAddKind} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={onStartAddKind} style={{ marginTop: 6, padding: '5px 10px', backgroundColor: 'transparent', color: C.gold, border: `1px dashed ${C.gold}55`, borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>+ Add Kind</button>
          )}
        </div>
      )}
    </div>
  )
}

function KindRow({ kind, onUpdate, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', backgroundColor: kind.included === false ? 'transparent' : C.bgElevated, border: `1px solid ${kind.included === false ? C.border : 'transparent'}`, borderRadius: 4, opacity: kind.included === false ? 0.45 : 1 }}>
      <input type="checkbox" checked={kind.included !== false} onChange={e => onUpdate({ included: e.target.checked })} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.parch, fontWeight: 500 }}>{kind.name}</div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {kind.typicalTraits.length > 0 ? kind.typicalTraits.join(', ') : 'no traits'}
        </div>
      </div>
      <select
        value={kind.typicalSize}
        onChange={e => onUpdate({ typicalSize: e.target.value })}
        style={{ fontSize: 10, padding: '2px 4px', backgroundColor: C.bg, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: 'system-ui' }}
      >
        {KIND_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <NumberField label="life" value={kind.typicalLifeExpectancy} onChange={v => onUpdate({ typicalLifeExpectancy: Math.max(1, v) })} />
      <NumberField label="count/100" value={kind.typicalCount} onChange={v => onUpdate({ typicalCount: Math.max(0, v) })} />
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12, padding: 2 }}>×</button>
    </div>
  )
}

function NumberField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 50 }}>
      <span style={{ fontSize: 8, color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase' }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(+e.target.value || 0)}
        style={{ width: 50, fontSize: 11, padding: '2px 4px', backgroundColor: C.bg, color: C.parch, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: 'system-ui', textAlign: 'right' }}
      />
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
