import { useState, useRef } from "react";
import { callClaude, isElectron } from "../api.js";
import { C } from "../constants.js";
import { analyseCharacters } from "../CharacterStoryAnalyser.js";
import { resolveIdentities } from "../CharacterIdentityResolver.js";
import BlueprintReview from "../BlueprintReview.jsx";
import { detectAndSplitChapters } from "./detectChapters.js";

export function ImportAnalyse({ chars, setChars, lore, setLore, project, setImportedEdges, setTab, setManuscript }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [chatText, setChatText] = useState('');
  const [inputMode, setInputMode] = useState('paste'); // paste | file
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState('');
  const [blueprint, setBlueprint] = useState(null);
  const [activeSection, setActiveSection] = useState('characters');
  const [dragOver, setDragOver] = useState(false);
  const [saved, setSaved] = useState(false);

  const [fileErrors, setFileErrors] = useState([]);

  // New: character analyser + resolver state
  const [characterProfiles, setCharacterProfiles] = useState(null);
  const [resolverResults, setResolverResults] = useState(null);
  const [showReview, setShowReview] = useState(false);

  // In Electron: native file dialog reads directly from disk (Node/mammoth/pdf-parse)
  // In browser: classic FileReader + browser mammoth fallback
  const openElectronFiles = async () => {
    try {
      const results = await window.electronAPI.readFiles();
      if (!Array.isArray(results)) { setFileErrors(prev => [...prev, 'Failed to read files.']); return; }
      const ok = results.filter(r => !r.error);
      const errs = results.filter(r => r.error).map(r => `${r.name}: ${r.error}`);
      if (errs.length) setFileErrors(prev => [...prev, ...errs]);
      setFiles(prev => [...prev, ...ok]);
    } catch (err) {
      setFileErrors(prev => [...prev, `File read error: ${err.message}`]);
    }
  };

  const readFileBrowser = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'txt' || ext === 'md') {
        return await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res({ name: file.name, content: e.target.result, size: file.size, type: ext });
          r.onerror = rej;
          r.readAsText(file);
        });
      }
      if (ext === 'docx') {
        const mammoth = (await import('mammoth')).default;
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return { name: file.name, content: result.value, size: file.size, type: 'docx' };
      }
      if (ext === 'pdf') {
        // pdf-parse is Node-only; in browser, extract text from PDF using pdf.js
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return { name: file.name, content: text, size: file.size, type: 'pdf', pages: pdf.numPages };
      }
      setFileErrors(prev => [...prev, `${file.name}: Unsupported file type (.${ext})`]);
      return null;
    } catch (err) {
      setFileErrors(prev => [...prev, `${file.name}: ${err.message}`]);
      return null;
    }
  };

  const ACCEPTED = ['.txt', '.md', '.docx', '.pdf'];
  const isAccepted = (f) => ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext));

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    if (isElectron()) {
      // In Electron, we can't read dropped files directly (sandboxed renderer),
      // so fall back to the native file dialog
      openElectronFiles();
      return;
    }
    const dropped = Array.from(e.dataTransfer.files).filter(isAccepted);
    const read = (await Promise.all(dropped.map(readFileBrowser))).filter(Boolean);
    setFiles(prev => [...prev, ...read]);
  };

  const handleFileInput = async (e) => {
    if (isElectron()) {
      // In Electron, use native dialog for better file access
      openElectronFiles();
      return;
    }
    const picked = Array.from(e.target.files).filter(isAccepted);
    const read = (await Promise.all(picked.map(readFileBrowser))).filter(Boolean);
    setFiles(prev => [...prev, ...read]);
  };

  const getContent = () => {
    if (inputMode === 'file') return files.map(f => `=== FILE: ${f.name} ===\n${f.content}`).join('\n\n');
    return chatText;
  };

  const STEPS = [
    'Reading content and detecting conversation structure...',
    'Identifying all characters — named, implied, and referenced...',
    'Extracting world rules, magic systems, and lore constraints...',
    'Mapping established plot events and timeline...',
    'Detecting unexplored paths and "explore later" threads...',
    'Pulling backstory fragments — explicit and implied...',
    'Identifying foreshadowing and planted seeds...',
    'Extracting unresolved threads and open questions...',
    'Mapping character relationships and dynamics...',
    'Detecting the writer\'s fears — what\'s being circled but not written...',
    'Synthesising full story blueprint...',
  ];

  const analyse = async () => {
    const content = getContent();
    if (!content.trim()) return;
    setAnalysing(true); setBlueprint(null);
    for (let i = 0; i < STEPS.length; i++) {
      setProgress(STEPS[i]);
      await new Promise(r => setTimeout(r, 500 + Math.random() * 350));
    }
    try {
      const data = await callClaude({
          model: "claude-sonnet-4-20250514", max_tokens: 8192,
          system: `You are a master story analyst and narrative architect. You have been given raw content from a writer — this may be a manuscript draft, writing notes, an AI chat transcript where the writer was developing their story, or a mix of all three.

Your job is to extract a complete story blueprint from this raw material. Writers lose track of what was established, what was promised to the reader, what paths were discussed but abandoned, what backstory exists, and what the story is actually about beneath the surface.

Respond ONLY with a valid JSON object. No preamble, no markdown fences. The JSON must have exactly these keys:

{
  "storyCore": "1-2 sentences: what this story is fundamentally about — not the plot, the human truth underneath",
  "characters": [
    {
      "name": "character name",
      "role": "their function in the story",
      "established": "what is definitively known about them from this content",
      "secrets": "what seems hidden or implied but not stated",
      "arc": "what transformation or journey seems to be set up for them",
      "contradictions": "tensions within this character that the writer may not have fully noticed"
    }
  ],
  "worldRules": ["each established rule, constraint, or lore fact as a plain string"],
  "plotEvents": [
    { "event": "what happened", "chapter": "reference if known", "significance": "why this matters" }
  ],
  "unexploredPaths": [
    {
      "path": "the unexplored thread or direction",
      "source": "where it was mentioned or implied",
      "potential": "why this is worth pursuing — what it could unlock in the story"
    }
  ],
  "backstory": ["each backstory fragment as a plain string — explicit or strongly implied"],
  "foreshadowing": [
    { "plant": "what was planted", "possiblePayoff": "what it might be building toward" }
  ],
  "unresolvedThreads": [
    { "thread": "the unresolved element", "urgency": "high/medium/low", "note": "what needs to be decided" }
  ],
  "relationships": [
    { "between": "Character A & Character B", "dynamic": "the nature of their relationship", "tension": "the underlying tension or complication" }
  ],
  "writersFear": "Amy Tan's diagnostic: what is the writer consistently circling but not directly writing? What seems to be the thing they are most afraid to put on the page?",
  "nextSteps": ["3-5 concrete, specific story decisions the writer should make next, in order of priority"]
}

Extract only what is genuinely present or strongly implied in the content. Do not invent. If a field has nothing to extract, use an empty array or a note saying "not found in material".`,
          messages: [{ role: "user", content: `Analyse this story content:\n\n${content.slice(0, 80000)}` }]
        });
      if (data?.error) {
        const msg = data.error?.message || data.message || (typeof data.error === 'string' ? data.error : 'API error');
        throw new Error(msg);
      }
      const text = data.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsedBlueprint = JSON.parse(clean);
      setBlueprint(parsedBlueprint);

      // ── Run Character Story Analyser ──
      setProgress('Running deep character analysis across all files...');
      await new Promise(r => setTimeout(r, 300));
      try {
        const pastedContent = inputMode === 'paste' ? chatText : '';
        const fileList = inputMode === 'file' ? files : [];
        const { profiles } = await analyseCharacters(fileList, pastedContent);
        setCharacterProfiles(profiles);

        // ── Run Identity Resolver ──
        setProgress('Resolving character identities — finding potential duplicates...');
        await new Promise(r => setTimeout(r, 300));
        const resolverResult = await resolveIdentities(profiles, chars, fileList, pastedContent);
        setResolverResults(resolverResult);
        setShowReview(true);
      } catch (analyserErr) {
        console.warn('Character analyser/resolver error (non-fatal):', analyserErr);
        // Fall through — blueprint still available, just no review screen
      }
    } catch (e) {
      console.error('Analysis error:', e);
      setBlueprint({ error: e.message === 'API_KEY_MISSING' ? 'API key not set. Go to Settings (⚙) to add your Anthropic API key.' : `Analysis failed: ${e.message}` });
    }
    setAnalysing(false); setProgress('');
  };

  const SECTIONS = [
    { id: 'characters', label: 'Characters', count: blueprint?.characters?.length },
    { id: 'unexplored', label: 'Unexplored Paths', count: blueprint?.unexploredPaths?.length },
    { id: 'threads', label: 'Unresolved Threads', count: blueprint?.unresolvedThreads?.length },
    { id: 'world', label: 'World Rules', count: blueprint?.worldRules?.length },
    { id: 'foreshadowing', label: 'Foreshadowing', count: blueprint?.foreshadowing?.length },
    { id: 'backstory', label: 'Backstory', count: blueprint?.backstory?.length },
    { id: 'relationships', label: 'Relationships', count: blueprint?.relationships?.length },
    { id: 'nextsteps', label: 'Next Steps', count: blueprint?.nextSteps?.length },
  ];

  const Tag = ({ text, color }) => (
    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: color + '22', color, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>{text}</span>
  );

  // ── Blueprint Review Screen (shows BEFORE committing to Story Bible) ──
  if (showReview && resolverResults && blueprint && !blueprint.error) {
    return (
      <BlueprintReview
        matches={resolverResults.matches}
        newCharacters={resolverResults.newCharacters}
        updates={resolverResults.updates}
        profiles={characterProfiles || []}
        blueprint={blueprint}
        onApply={(result) => {
          // Apply merged characters
          const mergedIds = new Set();
          for (const mc of (result.mergedChars || [])) {
            // Remove the two source characters if they existed
            // and add the merged version
            setChars(prev => {
              const filtered = prev.filter(c => {
                const nameMatch = mc.aliases?.some(a => a.toLowerCase() === c.name?.toLowerCase());
                if (nameMatch) mergedIds.add(c.id);
                return !nameMatch;
              });
              return [...filtered, {
                id: mc.id || Math.random().toString(36).slice(2, 8),
                name: mc.name || mc.primaryName,
                aliases: mc.aliases || [],
                species: mc.species || '',
                role: mc.role || '',
                traits: mc.traits || '',
                stakes: mc.stakes || '',
                secrets: mc.secrets || '',
                contradictions: mc.contradictions || '',
                established: mc.established || '',
                arc: mc.arc || '',
                abilities: mc.abilities || '',
              }];
            });
          }

          // Add accepted new characters
          if (result.newChars?.length) {
            setChars(prev => [...prev, ...result.newChars]);
          }

          // Apply accepted updates to existing characters (add, never overwrite)
          for (const upd of (result.updates || [])) {
            setChars(prev => prev.map(c => {
              if (c.id !== upd.existingCharId) return c;
              const updated = { ...c };
              for (const f of upd.fields) {
                if (!updated[f.field]) {
                  updated[f.field] = f.value;
                } else {
                  updated[f.field] = updated[f.field] + '\n' + f.value;
                }
              }
              return updated;
            }));
          }

          // Merge world rules into lore
          const existingRules = new Set((lore || []).map(l => l.rule?.toLowerCase()));
          const newLore = (blueprint.worldRules || [])
            .filter(r => r && !existingRules.has(r.toLowerCase()))
            .map(r => ({ id: Math.random().toString(36).slice(2, 8), cat: 'Lore', rule: r }));
          if (newLore.length) setLore(prev => [...prev, ...newLore]);

          // Pass relationships to MindMap
          if (result.mindmapSelections?.relationships && result.relationships?.length) {
            setImportedEdges && setImportedEdges(prev => [...(prev || []), ...result.relationships]);
          }

          // Detect chapters from uploaded file content and populate manuscript
          if (setManuscript && files && files.length > 0) {
            const allText = files.map(f => f.content).filter(Boolean).join('\n\n');
            if (allText.trim()) {
              const detectedChapters = detectAndSplitChapters(allText, files[0]?.name);
              if (detectedChapters.length > 0) {
                setManuscript({ chapters: detectedChapters });
              }
            }
          }

          // Persist immediately in Electron
          if (isElectron() && project) {
            setTimeout(() => {
              // chars/lore state will have updated by next tick, auto-save effect will fire
            }, 100);
          }

          // Navigate to MindMap
          setShowReview(false);
          setSaved(true);
          if (setTab) setTab('mindmap');
        }}
        onCancel={() => setShowReview(false)}
      />
    );
  }

  if (blueprint && !blueprint.error) return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '200px', flexShrink: 0, backgroundColor: C.bgDeep, borderRight: `1px solid ${C.border}`, padding: '16px 0', overflow: 'auto' }}>
        {blueprint.storyCore && (
          <div style={{ padding: '0 14px 14px', borderBottom: `1px solid ${C.border}`, marginBottom: '8px' }}>
            <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>Story Core</div>
            <div style={{ fontSize: '11px', color: C.gold, fontStyle: 'italic', lineHeight: '1.5' }}>{blueprint.storyCore}</div>
          </div>
        )}
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderLeft: `2px solid ${activeSection === s.id ? C.purpleLight : 'transparent'}`, backgroundColor: activeSection === s.id ? C.purple + '18' : 'transparent', color: activeSection === s.id ? C.purpleLight : C.muted, fontSize: '12px', cursor: 'pointer', fontFamily: 'system-ui', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {s.label}
            {s.count > 0 && <span style={{ fontSize: '10px', backgroundColor: activeSection === s.id ? C.purple + '44' : C.tagBg, color: activeSection === s.id ? C.purpleLight : C.muted, padding: '1px 6px', borderRadius: '8px' }}>{s.count}</span>}
          </button>
        ))}
        <div style={{ padding: '14px 14px 0', borderTop: `1px solid ${C.border}`, marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => {
            if (showReview || resolverResults) {
              // Show the review screen instead of blindly saving
              setShowReview(true);
              return;
            }
            if (saved) return;
            // Fallback: if analyser didn't run, use old behavior
            const existingNames = new Set((chars || []).map(c => c.name?.toLowerCase()));
            const newChars = (blueprint.characters || [])
              .filter(c => c.name && !existingNames.has(c.name.toLowerCase()))
              .map(c => ({
                id: Math.random().toString(36).slice(2, 8),
                name: c.name,
                species: '',
                role: c.role || '',
                traits: '',
                stakes: '',
                secrets: c.secrets || '',
                contradictions: c.contradictions || '',
                established: c.established || '',
                arc: c.arc || '',
              }));
            if (newChars.length) setChars(prev => [...prev, ...newChars]);

            const existingRules = new Set((lore || []).map(l => l.rule?.toLowerCase()));
            const newLore = (blueprint.worldRules || [])
              .filter(r => r && !existingRules.has(r.toLowerCase()))
              .map(r => ({ id: Math.random().toString(36).slice(2, 8), cat: 'Lore', rule: r }));
            if (newLore.length) setLore(prev => [...prev, ...newLore]);

            setSaved(true);
          }}
            style={{ width: '100%', padding: '9px', backgroundColor: saved ? C.green + '33' : C.purple, color: saved ? C.green : '#fff', border: saved ? `1px solid ${C.green}55` : 'none', borderRadius: '4px', fontSize: '12px', cursor: saved ? 'default' : 'pointer', fontFamily: 'system-ui', fontWeight: 500, transition: 'all 0.2s' }}>
            {saved ? 'Saved to Project' : resolverResults ? 'Review & Save to Project ⚡' : 'Save to Project'}
          </button>
          {saved && <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textAlign: 'center', lineHeight: '1.4' }}>Characters and world rules merged into your Story Bible.</div>}
          <button onClick={() => { setBlueprint(null); setChatText(''); setFiles([]); setSaved(false); setCharacterProfiles(null); setResolverResults(null); setShowReview(false); }}
            style={{ width: '100%', padding: '7px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontFamily: 'system-ui' }}>New Analysis</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {activeSection === 'characters' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Characters Identified</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(blueprint.characters || []).map((c, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', color: C.parch }}>{c.name}</span>
                    <Tag text={c.role} color={C.acc} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[['Established', c.established, C.mutedLight], ['Arc Set Up', c.arc, C.teal], ['Secrets / Implied', c.secrets, C.accBright], ['Contradictions', c.contradictions, C.purpleLight]].map(([l, v, col]) => v && v !== 'not found in material' ? (
                      <div key={l}>
                        <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>{l}</div>
                        <div style={{ fontSize: '12px', color: col, fontStyle: 'italic', lineHeight: '1.5' }}>{v}</div>
                      </div>
                    ) : null)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'unexplored' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Unexplored Paths</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>Threads discussed, implied, or promised that were never written — your hidden story reserves.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(blueprint.unexploredPaths || []).map((p, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.gold}33`, borderLeft: `3px solid ${C.gold}`, borderRadius: '0 6px 6px 0', padding: '12px 16px' }}>
                  <div style={{ fontSize: '13px', color: C.parch, marginBottom: '6px', fontWeight: 'bold' }}>{p.path}</div>
                  <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', marginBottom: '6px' }}>Found in: <span style={{ color: C.mutedLight, fontStyle: 'italic' }}>{p.source}</span></div>
                  <div style={{ fontSize: '12px', color: C.gold, fontStyle: 'italic', lineHeight: '1.5' }}>{p.potential}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'threads' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Unresolved Threads</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(blueprint.unresolvedThreads || []).map((t, i) => {
                const uc = { high: C.accBright, medium: C.gold, low: C.muted }[t.urgency] || C.muted;
                return (
                  <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <Tag text={t.urgency || 'medium'} color={uc} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: C.parch, marginBottom: '4px' }}>{t.thread}</div>
                      {t.note && <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>{t.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeSection === 'world' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>World Rules Extracted</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {(blueprint.worldRules || []).map((r, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: '0 5px 5px 0', padding: '10px 14px', fontSize: '12px', color: C.mutedLight, fontStyle: 'italic', lineHeight: '1.5' }}>{r}</div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'foreshadowing' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Foreshadowing & Planted Seeds</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>Things planted in the story that are building toward something — don't forget to pay these off.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {(blueprint.foreshadowing || []).map((f, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Planted</div>
                  <div style={{ fontSize: '13px', color: C.parch, marginBottom: '8px' }}>{f.plant}</div>
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Possible Payoff</div>
                  <div style={{ fontSize: '12px', color: C.teal, fontStyle: 'italic' }}>{f.possiblePayoff}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'backstory' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Backstory Fragments</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {(blueprint.backstory || []).map((b, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: '0 5px 5px 0', padding: '10px 14px', fontSize: '12px', color: C.mutedLight, fontStyle: 'italic', lineHeight: '1.5' }}>{b}</div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'relationships' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Character Relationships</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {(blueprint.relationships || []).map((r, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '14px', color: C.parch, marginBottom: '5px', fontWeight: 'bold' }}>{r.between}</div>
                  <div style={{ fontSize: '12px', color: C.mutedLight, marginBottom: '5px', fontStyle: 'italic' }}>{r.dynamic}</div>
                  {r.tension && <div style={{ fontSize: '11px', color: C.accBright, fontFamily: 'system-ui' }}>Tension: {r.tension}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'nextsteps' && (
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Next Steps</h2>
            {blueprint.writersFear && (
              <div style={{ backgroundColor: C.bgElevated, border: `1px solid ${C.acc}44`, borderRadius: '6px', padding: '12px 16px', marginBottom: '18px' }}>
                <div style={{ fontSize: '9px', color: C.acc, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '5px' }}>Amy Tan's Diagnostic — What You're Avoiding</div>
                <div style={{ fontSize: '12px', color: C.accBright, fontStyle: 'italic', lineHeight: '1.6' }}>{blueprint.writersFear}</div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(blueprint.nextSteps || []).map((s, i) => (
                <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '12px 16px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: C.purple + '55', fontFamily: 'system-ui', minWidth: '24px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ fontSize: '13px', color: C.parch, lineHeight: '1.6', paddingTop: '2px' }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Import & Analyse</h2>
        <p style={{ margin: 0, fontSize: '12px', color: C.muted, fontFamily: 'system-ui', lineHeight: '1.7', fontStyle: 'italic' }}>
          Paste a chat transcript where you were developing this story, upload your manuscript or notes, and the engine will extract a full story blueprint — characters, unexplored paths, backstory, foreshadowing, unresolved threads, and what you're unconsciously avoiding writing.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '18px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '4px', width: 'fit-content' }}>
        {[['paste', 'Paste Chat / Text'], ['file', 'Upload Files']].map(([id, label]) => (
          <button key={id} onClick={() => setInputMode(id)}
            style={{ padding: '6px 18px', backgroundColor: inputMode === id ? C.bgElevated : 'transparent', color: inputMode === id ? C.parch : C.muted, border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontFamily: 'system-ui', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {inputMode === 'paste' && (
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>Chat Transcript or Story Notes</div>
          <div style={{ fontSize: '10px', color: C.muted + '88', fontFamily: 'system-ui', marginBottom: '8px', fontStyle: 'italic' }}>
            Paste your AI chat transcript, writing session notes, brainstorming documents, or any raw story material. Export a Claude chat as text from the chat menu, or copy-paste directly.
          </div>
          <textarea value={chatText} onChange={e => setChatText(e.target.value)}
            placeholder={"Paste chat transcript here...\n\nThis can be:\n• A Claude / ChatGPT conversation where you developed your story\n• Raw writing notes or a brainstorm document\n• Draft chapters or scene outlines\n• World-building notes\n\nThe messier and more raw, the better — that's where the real story lives."}
            style={{ width: '100%', minHeight: '220px', padding: '14px', backgroundColor: C.bgCard, border: `1px solid ${C.borderMid}`, borderRadius: '6px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.7' }} />
          {chatText.length > 0 && (
            <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', marginTop: '5px', textAlign: 'right' }}>{chatText.length.toLocaleString()} characters · ~{Math.round(chatText.length / 4).toLocaleString()} tokens</div>
          )}
        </div>
      )}

      {inputMode === 'file' && (
        <div style={{ marginBottom: '18px' }}>
          <div
            onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            style={{ border: `1.5px dashed ${dragOver ? C.purpleLight : C.borderMid}`, borderRadius: '8px', padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: dragOver ? C.purple + '11' : 'transparent', transition: 'all 0.2s', marginBottom: '12px' }}>
            <div style={{ fontSize: '26px', marginBottom: '10px', color: C.muted }}>↑</div>
            <div style={{ fontSize: '13px', color: C.mutedLight, marginBottom: '8px' }}>Drop files here or click to browse</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {[
                ['.txt',  C.teal],
                ['.md',   C.blue],
                ['.docx', C.purple],
                ['.pdf',  C.accBright],
              ].map(([ext, col]) => (
                <span key={ext} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: col + '22', color: col, fontFamily: 'system-ui', border: `1px solid ${col}44` }}>{ext}</span>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" multiple onChange={handleFileInput} style={{ display: 'none' }} />
          </div>
          {fileErrors.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              {fileErrors.map((err, i) => (
                <div key={i} style={{ fontSize: '11px', color: C.accBright, fontFamily: 'system-ui', padding: '5px 10px', backgroundColor: C.acc + '18', borderRadius: '4px', marginBottom: '4px' }}>⚠ {err}</div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {files.map((f, i) => {
                const typeCol = { txt: C.teal, md: C.blue, docx: C.purple, pdf: C.accBright }[f.type] || C.muted;
                return (
                  <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '5px', padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '3px', backgroundColor: typeCol + '22', color: typeCol, fontFamily: 'system-ui', flexShrink: 0, border: `1px solid ${typeCol}44` }}>.{f.type}</span>
                      <span style={{ fontSize: '12px', color: C.parch, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
                      {f.pages && <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{f.pages}pp</span>}
                      <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{(f.size / 1000).toFixed(1)}KB</span>
                      <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>{(f.content.length / 1000).toFixed(1)}K chars</span>
                      <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px', padding: '2px' }}>✕</button>
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textAlign: 'right', marginTop: '2px' }}>
                {files.reduce((s, f) => s + f.content.length, 0).toLocaleString()} total characters extracted
              </div>
            </div>
          )}
        </div>
      )}

      {analysing ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.purple}44`, borderRadius: '7px', padding: '20px 24px' }}>
          <div style={{ fontSize: '12px', color: C.purpleLight, marginBottom: '12px', fontFamily: 'system-ui' }}>Analysing...</div>
          <div style={{ height: '2px', backgroundColor: C.border, borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ width: '60%', height: '100%', backgroundColor: C.purple, animation: 'pulse 1.5s ease-in-out infinite', borderRadius: '2px' }} />
          </div>
          <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic' }}>{progress}</div>
        </div>
      ) : (
        <button onClick={analyse} disabled={!getContent().trim()}
          style={{ width: '100%', padding: '13px', backgroundColor: getContent().trim() ? C.purple : C.bgCard, color: getContent().trim() ? '#fff' : C.muted, border: `1px solid ${getContent().trim() ? C.purple : C.border}`, borderRadius: '6px', fontSize: '14px', cursor: getContent().trim() ? 'pointer' : 'not-allowed', fontFamily: 'system-ui', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
          Extract Story Blueprint →
        </button>
      )}

      {blueprint?.error && (
        <div style={{ marginTop: '12px', padding: '12px', backgroundColor: C.bgCard, border: `1px solid ${C.acc}55`, borderRadius: '5px', fontSize: '12px', color: C.accBright, fontFamily: 'system-ui' }}>{blueprint.error}</div>
      )}
    </div>
  );
}

/* ── AI ASSISTANT PANEL ── */
