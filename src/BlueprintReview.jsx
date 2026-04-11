/**
 * BlueprintReview — the screen the writer sees after Import & Analyse completes.
 *
 * Appears BEFORE anything is committed to the Story Bible or Mindmap.
 * The writer reviews and makes all character identity decisions here.
 *
 * Four sections:
 *  A) Character Identity Review (potential duplicates)
 *  B) New Characters
 *  C) Updates to Existing Characters
 *  D) MindMap Preview
 */

import { useState } from 'react';
import { mergeProfiles } from './CharacterIdentityResolver.js';

// Theme colors — must match App.jsx
const C = {
  bg: '#09090c', bgCard: '#111116', bgDeep: '#0d0d11', bgElevated: '#161620',
  border: '#1c1c24', borderMid: '#2a2a36', borderAcc: '#3a1212',
  acc: '#8b1f1f', accBright: '#c0392b',
  gold: '#c9a857', purple: '#7b5fc4', purpleLight: '#a685e8',
  parch: '#ddd5bb', muted: '#5a5450', mutedLight: '#8a8278',
  green: '#2d8a4e', teal: '#1a8a7a', blue: '#3a6fa0', tagBg: '#161620',
  node: { character:'#c0392b', event:'#c9a857', location:'#2d8a4e', artifact:'#7b5fc4', theme:'#1a8a7a', chapter:'#3a6fa0', note:'#5a5450' }
};

const genId = () => Math.random().toString(36).slice(2, 8);

const CONFIDENCE_COLORS = {
  certain: C.accBright,
  high: C.gold,
  medium: C.teal,
  low: C.muted,
};

const METHOD_LABELS = {
  exact_name_match: 'Exact Name Match',
  name_with_qualifier: 'Name + Qualifier',
  substring_match: 'Substring Match',
  spelling_variation: 'Spelling Variation',
  ai_descriptor_match: 'AI Context Analysis',
};

/**
 * @param {object} props
 * @param {Array} props.matches - potential duplicate pairs from resolver
 * @param {Array} props.newCharacters - genuinely new characters
 * @param {Array} props.updates - updates to existing characters
 * @param {Array} props.profiles - all extracted profiles from analyser
 * @param {object} props.blueprint - the full blueprint JSON
 * @param {Function} props.onApply - callback when writer clicks Apply to Project
 * @param {Function} props.onCancel - callback to go back
 */
export default function BlueprintReview({
  matches: initialMatches = [],
  newCharacters: initialNew = [],
  updates: initialUpdates = [],
  profiles = [],
  blueprint = {},
  onApply,
  onCancel,
}) {
  const [section, setSection] = useState('identity');
  const [matches, setMatches] = useState(initialMatches.map(m => ({ ...m, decision: null })));
  const [newChars, setNewChars] = useState(initialNew.map(c => ({ ...c, accepted: true, edited: false })));
  const [charUpdates, setCharUpdates] = useState(
    initialUpdates.map(u => ({
      ...u,
      newFields: u.newFields.map(f => ({ ...f, accepted: true })),
    }))
  );
  const [mergePreview, setMergePreview] = useState(null); // index of match being merge-previewed
  const [mergedName, setMergedName] = useState('');
  const [disambiguation, setDisambiguation] = useState('');
  const [mindmapSelections, setMindmapSelections] = useState({ characters: true, relationships: true, artifacts: true });

  // Section counts
  const unresolvedMatches = matches.filter(m => !m.decision).length;
  const acceptedNew = newChars.filter(c => c.accepted).length;
  const pendingUpdates = charUpdates.filter(u => u.newFields.some(f => f.accepted)).length;

  const SECTIONS = [
    { id: 'identity', label: 'Character Identity Review', count: unresolvedMatches, color: C.accBright, icon: '⚡' },
    { id: 'new', label: 'New Characters', count: acceptedNew + '/' + newChars.length, color: C.green, icon: '➕' },
    { id: 'updates', label: 'Updates to Existing', count: pendingUpdates, color: C.teal, icon: '↻' },
    { id: 'mindmap', label: 'MindMap Preview', count: null, color: C.purple, icon: '◎' },
  ];

  // Apply all decisions
  const handleApply = () => {
    const mergedChars = [];
    const resolvedMatches = [];
    const linkedTimelines = [];

    for (const m of matches) {
      if (m.decision === 'same') {
        const merged = m._merged || mergeProfiles(m.characterA, m.characterB, m.characterA.name || m.characterA.primaryName);
        mergedChars.push(merged);
        resolvedMatches.push({ ...m, merged });
      } else if (m.decision === 'different') {
        resolvedMatches.push({ ...m, disambiguationNote: m._disambiguationNote || '' });
      } else if (m.decision === 'timeline') {
        linkedTimelines.push({
          characterA: m.characterA,
          characterB: m.characterB,
          link: 'timeline_variant',
        });
        resolvedMatches.push(m);
      }
    }

    const acceptedNewChars = newChars.filter(c => c.accepted).map(c => ({
      id: genId(),
      name: c.primaryName || c.name,
      aliases: c.aliases || [],
      species: c.species || '',
      role: c.role || '',
      traits: '',
      stakes: c.stakes || '',
      secrets: c.secrets || '',
      contradictions: c.contradictions || '',
      established: c.established || '',
      arc: c.arc || '',
      abilities: c.abilities || '',
      appearances: c.appearances || [],
    }));

    const acceptedUpdates = charUpdates.map(u => ({
      existingCharId: u.existingChar.id,
      fields: u.newFields.filter(f => f.accepted),
    })).filter(u => u.fields.length > 0);

    // Build edges from blueprint relationships
    const relationships = (blueprint.relationships || []).map(r => ({
      between: r.between,
      dynamic: r.dynamic,
      tension: r.tension,
    }));

    onApply({
      mergedChars,
      newChars: acceptedNewChars,
      updates: acceptedUpdates,
      linkedTimelines,
      relationships,
      mindmapSelections,
      blueprint,
    });
  };

  // ── Profile Card
  const ProfileCard = ({ profile, label, color }) => {
    const p = profile || {};
    const name = p.name || p.primaryName || '(unnamed)';
    return (
      <div style={{ flex: 1, backgroundColor: C.bgCard, border: `1px solid ${color || C.border}44`, borderRadius: '6px', padding: '14px', minWidth: 0 }}>
        {label && <div style={{ fontSize: '9px', color: color || C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>{label}</div>}
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: C.parch, marginBottom: '3px' }}>{name}</div>
        {p.aliases && p.aliases.length > 1 && (
          <div style={{ fontSize: '10px', color: C.mutedLight, fontFamily: 'system-ui', marginBottom: '8px' }}>
            Also: {p.aliases.filter(a => a !== name).join(', ')}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', fontSize: '11px' }}>
          {p.role && <Field label="Role" value={p.role} color={C.acc} />}
          {p.species && <Field label="Species" value={p.species} color={C.teal} />}
          {p.established && <Field label="Established" value={p.established} color={C.mutedLight} />}
          {p.secrets && <Field label="Secrets" value={p.secrets} color={C.accBright} />}
          {p.stakes && <Field label="Stakes" value={p.stakes} color={C.gold} />}
          {p.arc && <Field label="Arc" value={p.arc} color={C.purpleLight} />}
          {p.contradictions && <Field label="Contradictions" value={p.contradictions} color={C.purple} />}
          {(p.appearances || []).length > 0 && (
            <Field label="Appears in" value={p.appearances.map(a => `${a.file} (${a.prominence})`).join(', ')} color={C.blue} />
          )}
        </div>
      </div>
    );
  };

  const Field = ({ label, value, color }) => (
    <div>
      <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{label}</div>
      <div style={{ color: color || C.mutedLight, fontStyle: 'italic', lineHeight: '1.5', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '220px', flexShrink: 0, backgroundColor: C.bgDeep, borderRight: `1px solid ${C.border}`, padding: '16px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 14px 14px', borderBottom: `1px solid ${C.border}`, marginBottom: '8px' }}>
          <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>Blueprint Review</div>
          <div style={{ fontSize: '11px', color: C.gold, fontStyle: 'italic', lineHeight: '1.5' }}>
            Review all findings before committing to your project. You decide what's real.
          </div>
        </div>

        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', borderLeft: `2px solid ${section === s.id ? s.color : 'transparent'}`, backgroundColor: section === s.id ? s.color + '18' : 'transparent', color: section === s.id ? s.color : C.muted, fontSize: '12px', cursor: 'pointer', fontFamily: 'system-ui', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{s.icon} {s.label}</span>
            {s.count !== null && <span style={{ fontSize: '10px', backgroundColor: section === s.id ? s.color + '44' : C.tagBg, color: section === s.id ? s.color : C.muted, padding: '1px 6px', borderRadius: '8px' }}>{s.count}</span>}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <div style={{ padding: '14px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={handleApply}
            style={{ width: '100%', padding: '10px', backgroundColor: C.purple, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'system-ui', fontWeight: 500 }}>
            Apply to Project
          </button>
          <button onClick={onCancel}
            style={{ width: '100%', padding: '8px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
            Back to Analysis
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

        {/* ── SECTION A: Character Identity Review ── */}
        {section === 'identity' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Character Identity Review</h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: '1.6' }}>
              These characters may refer to the same person. Review the evidence and make your decision. Two characters can intentionally share a name — you know your story best.
            </p>

            {matches.length === 0 && (
              <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.borderMid}`, borderRadius: '7px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: C.green, fontFamily: 'system-ui' }}>✓ No potential duplicates detected. All characters appear to be unique.</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {matches.map((m, idx) => (
                <div key={idx} style={{ backgroundColor: C.bgElevated, border: `1px solid ${m.decision ? C.green + '55' : CONFIDENCE_COLORS[m.confidence] + '44'}`, borderRadius: '8px', padding: '18px', position: 'relative' }}>
                  {/* Decision badge */}
                  {m.decision && (
                    <div style={{ position: 'absolute', top: '12px', right: '14px', fontSize: '10px', padding: '3px 10px', borderRadius: '10px', backgroundColor: C.green + '22', color: C.green, fontFamily: 'system-ui', fontWeight: 500 }}>
                      {m.decision === 'same' ? '✓ Same Character' : m.decision === 'different' ? '✗ Different Characters' : '⟳ Timeline Variant'}
                    </div>
                  )}

                  {/* Detection method + confidence */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: CONFIDENCE_COLORS[m.confidence] + '22', color: CONFIDENCE_COLORS[m.confidence], fontFamily: 'system-ui', border: `1px solid ${CONFIDENCE_COLORS[m.confidence]}44` }}>
                      {m.confidence}
                    </span>
                    <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>
                      {METHOD_LABELS[m.detectionMethod] || m.detectionMethod}
                    </span>
                  </div>

                  {/* Evidence */}
                  <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '5px', padding: '10px 12px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '9px', color: C.gold, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Evidence</div>
                    <div style={{ fontSize: '11px', color: C.parch, lineHeight: '1.6' }}>{m.evidence}</div>
                    {m.storyContext && (
                      <div style={{ fontSize: '10px', color: C.mutedLight, fontFamily: 'system-ui', marginTop: '6px', fontStyle: 'italic', lineHeight: '1.5' }}>{m.storyContext}</div>
                    )}
                  </div>

                  {/* Side-by-side profiles */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                    <ProfileCard profile={m.characterA} label={m.nameA} color={C.accBright} />
                    <ProfileCard profile={m.characterB} label={m.nameB} color={C.purple} />
                  </div>

                  {/* Merge preview */}
                  {mergePreview === idx && (
                    <div style={{ backgroundColor: C.bg, border: `1px solid ${C.green}55`, borderRadius: '6px', padding: '14px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '9px', color: C.green, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Merge Preview</div>
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Canonical Name</div>
                        <input value={mergedName} onChange={e => setMergedName(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', backgroundColor: C.bgCard, border: `1px solid ${C.borderMid}`, borderRadius: '4px', color: C.parch, fontSize: '13px', outline: 'none', fontFamily: 'Georgia,serif', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: C.mutedLight, fontFamily: 'system-ui', marginBottom: '10px', lineHeight: '1.5' }}>
                        All aliases will be preserved: {[...(m.characterA.aliases || [m.characterA.name || m.characterA.primaryName]), ...(m.characterB.aliases || [m.characterB.name || m.characterB.primaryName])].filter(Boolean).join(', ')}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => {
                          const merged = mergeProfiles(m.characterA, m.characterB, mergedName);
                          setMatches(prev => prev.map((mm, i) => i === idx ? { ...mm, decision: 'same', _merged: merged } : mm));
                          setMergePreview(null);
                        }}
                          style={{ padding: '7px 16px', backgroundColor: C.green, color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                          Confirm Merge
                        </button>
                        <button onClick={() => setMergePreview(null)}
                          style={{ padding: '7px 12px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Disambiguation input */}
                  {m.decision === 'different' && m._showDisambiguation && (
                    <div style={{ backgroundColor: C.bg, border: `1px solid ${C.teal}44`, borderRadius: '6px', padding: '14px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '10px', color: C.teal, fontFamily: 'system-ui', marginBottom: '6px' }}>What makes these two characters distinct? (added to both profiles)</div>
                      <textarea value={disambiguation} onChange={e => setDisambiguation(e.target.value)}
                        placeholder="e.g. Nyra (Human Assassin) is the human form; Nyra (Cat) is her transformed state..."
                        style={{ width: '100%', minHeight: '50px', padding: '7px 10px', backgroundColor: C.bgCard, border: `1px solid ${C.borderMid}`, borderRadius: '4px', color: C.parch, fontSize: '11px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.5' }} />
                      <button onClick={() => {
                        setMatches(prev => prev.map((mm, i) => i === idx ? { ...mm, _disambiguationNote: disambiguation, _showDisambiguation: false } : mm));
                        setDisambiguation('');
                      }}
                        style={{ marginTop: '8px', padding: '6px 14px', backgroundColor: C.teal, color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                        Save Note
                      </button>
                    </div>
                  )}

                  {/* Decision buttons */}
                  {!m.decision && mergePreview !== idx && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => {
                        setMergedName(m.characterA.name || m.characterA.primaryName || '');
                        setMergePreview(idx);
                      }}
                        style={{ flex: 1, padding: '9px', backgroundColor: C.green + '22', color: C.green, border: `1px solid ${C.green}55`, borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                        Same Character — Merge
                      </button>
                      <button onClick={() => {
                        setMatches(prev => prev.map((mm, i) => i === idx ? { ...mm, decision: 'different', _showDisambiguation: true } : mm));
                      }}
                        style={{ flex: 1, padding: '9px', backgroundColor: C.accBright + '18', color: C.accBright, border: `1px solid ${C.accBright}44`, borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                        Different Characters
                      </button>
                      <button onClick={() => {
                        setMatches(prev => prev.map((mm, i) => i === idx ? { ...mm, decision: 'timeline' } : mm));
                      }}
                        style={{ flex: 1, padding: '9px', backgroundColor: C.purple + '18', color: C.purpleLight, border: `1px solid ${C.purple}44`, borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                        Same, Different Timeline
                      </button>
                    </div>
                  )}

                  {/* Undo button */}
                  {m.decision && (
                    <button onClick={() => setMatches(prev => prev.map((mm, i) => i === idx ? { ...mm, decision: null, _merged: null, _disambiguationNote: '', _showDisambiguation: false } : mm))}
                      style={{ fontSize: '10px', color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'system-ui', padding: '4px 0', marginTop: '6px' }}>
                      ↩ Change decision
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION B: New Characters ── */}
        {section === 'new' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>New Characters</h2>
            <p style={{ margin: '0 0 14px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: '1.6' }}>
              Characters found in the imported files with no match in your existing Story Bible.
            </p>

            {newChars.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button onClick={() => setNewChars(prev => prev.map(c => ({ ...c, accepted: true })))}
                  style={{ padding: '6px 14px', backgroundColor: C.green + '22', color: C.green, border: `1px solid ${C.green}55`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                  Accept All
                </button>
                <button onClick={() => setNewChars(prev => prev.map(c => ({ ...c, accepted: false })))}
                  style={{ padding: '6px 14px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                  Dismiss All
                </button>
              </div>
            )}

            {newChars.length === 0 && (
              <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.borderMid}`, borderRadius: '7px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>All characters in the imported content already exist in your Story Bible.</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {newChars.map((c, idx) => (
                <div key={idx} style={{ backgroundColor: C.bgCard, border: `1px solid ${c.accepted ? C.green + '44' : C.border}`, borderRadius: '6px', padding: '14px', opacity: c.accepted ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: C.parch }}>{c.primaryName || c.name}</span>
                      {c.role && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: C.acc + '22', color: C.acc, fontFamily: 'system-ui' }}>{c.role}</span>}
                    </div>
                    <button onClick={() => setNewChars(prev => prev.map((cc, i) => i === idx ? { ...cc, accepted: !cc.accepted } : cc))}
                      style={{ padding: '4px 12px', backgroundColor: c.accepted ? C.green + '22' : 'transparent', color: c.accepted ? C.green : C.muted, border: `1px solid ${c.accepted ? C.green + '55' : C.border}`, borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                      {c.accepted ? '✓ Accepted' : 'Dismissed'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                    {c.species && <Field label="Species" value={c.species} color={C.teal} />}
                    {c.established && <Field label="Established" value={c.established} color={C.mutedLight} />}
                    {c.secrets && <Field label="Secrets" value={c.secrets} color={C.accBright} />}
                    {c.arc && <Field label="Arc" value={c.arc} color={C.purpleLight} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION C: Updates to Existing Characters ── */}
        {section === 'updates' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Updates to Existing Characters</h2>
            <p style={{ margin: '0 0 14px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: '1.6' }}>
              New information found in the import that doesn't exist in current profiles. Accepting will ADD to existing data — never overwrite.
            </p>

            {charUpdates.length === 0 && (
              <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.borderMid}`, borderRadius: '7px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>No new information found for existing characters.</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {charUpdates.map((u, uidx) => (
                <div key={uidx} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.teal}33`, borderRadius: '6px', padding: '14px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: C.parch, marginBottom: '12px' }}>{u.existingChar.name}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {u.newFields.map((f, fidx) => (
                      <div key={fidx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', backgroundColor: C.bgElevated, border: `1px solid ${f.accepted ? C.teal + '44' : C.border}`, borderRadius: '5px', padding: '10px 12px' }}>
                        <button onClick={() => {
                          setCharUpdates(prev => prev.map((uu, i) => i === uidx ? {
                            ...uu,
                            newFields: uu.newFields.map((ff, j) => j === fidx ? { ...ff, accepted: !ff.accepted } : ff)
                          } : uu));
                        }}
                          style={{ width: '20px', height: '20px', borderRadius: '3px', backgroundColor: f.accepted ? C.teal : 'transparent', border: `1.5px solid ${f.accepted ? C.teal : C.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', marginTop: '1px' }}>
                          {f.accepted && <span style={{ fontSize: '11px', color: C.bg, fontWeight: 'bold' }}>✓</span>}
                        </button>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '9px', color: C.teal, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>{f.field}</div>
                          <div style={{ fontSize: '11px', color: f.accepted ? C.parch : C.muted, fontStyle: 'italic', lineHeight: '1.5' }}>{f.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION D: MindMap Preview ── */}
        {section === 'mindmap' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>MindMap Preview</h2>
            <p style={{ margin: '0 0 14px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', lineHeight: '1.6' }}>
              Toggle which elements to add to your MindMap when applying.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {[
                { key: 'characters', label: 'Character Nodes', count: newChars.filter(c => c.accepted).length + matches.filter(m => m.decision === 'same').length, color: C.accBright },
                { key: 'relationships', label: 'Relationship Edges', count: (blueprint.relationships || []).length, color: C.gold },
                { key: 'artifacts', label: 'Artifact Nodes', count: 0, color: C.purple },
              ].map(item => (
                <div key={item.key} onClick={() => setMindmapSelections(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', backgroundColor: C.bgCard, border: `1px solid ${mindmapSelections[item.key] ? item.color + '44' : C.border}`, borderRadius: '6px', cursor: 'pointer' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '3px', backgroundColor: mindmapSelections[item.key] ? item.color : 'transparent', border: `1.5px solid ${mindmapSelections[item.key] ? item.color : C.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {mindmapSelections[item.key] && <span style={{ fontSize: '11px', color: C.bg, fontWeight: 'bold' }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: C.parch }}>{item.label}</div>
                    <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{item.count} items</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini preview SVG */}
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px', overflow: 'hidden' }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Preview</div>
              <svg width="100%" height="200" viewBox="0 0 600 200" style={{ display: 'block' }}>
                <rect width="600" height="200" fill={C.bg} rx="4" />
                {/* Root */}
                <circle cx="300" cy="100" r="16" fill={C.bgElevated} stroke={C.purpleLight} strokeWidth="1.5" />
                <text x="300" y="104" textAnchor="middle" fontSize="8" fill={C.purpleLight} fontFamily="Georgia,serif">Story</text>

                {/* Character nodes in circle */}
                {newChars.filter(c => c.accepted).slice(0, 12).map((c, i, arr) => {
                  const angle = (i / Math.max(arr.length, 1)) * Math.PI * 2 - Math.PI / 2;
                  const r = 70;
                  const x = 300 + Math.cos(angle) * r;
                  const y = 100 + Math.sin(angle) * r;
                  return (
                    <g key={i}>
                      <line x1="300" y1="100" x2={x} y2={y} stroke={C.borderMid} strokeWidth="0.5" opacity="0.5" />
                      <circle cx={x} cy={y} r="10" fill={C.accBright + '25'} stroke={C.accBright} strokeWidth="1" />
                      <text x={x} y={y + 3} textAnchor="middle" fontSize="5" fill={C.accBright} fontFamily="system-ui">
                        {(c.primaryName || c.name || '').slice(0, 6)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
