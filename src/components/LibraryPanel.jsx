import { useState, useEffect } from "react";
import { callClaude, isElectron } from "../api.js";
import { C } from "../constants.js";

export function LibraryPanel({ project, chars, lore, manuscript, setManuscript }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('dateAdded');
  const [filterType, setFilterType] = useState('all');
  const [filterTag, setFilterTag] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [tagEditing, setTagEditing] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState(null);

  // Load files on mount
  useEffect(() => {
    if (!isElectron() || !project?.id) { setLoading(false); return; }
    window.electronAPI.libraryListFiles(project.id).then(meta => {
      setFiles(meta || []);
      setLoading(false);
    });
  }, [project?.id]);

  const addFiles = async () => {
    if (!isElectron()) return;
    const added = await window.electronAPI.libraryAddFiles(project.id);
    if (added?.length) setFiles(prev => [...prev, ...added]);
  };

  const deleteFile = async (filename) => {
    if (!isElectron()) return;
    await window.electronAPI.libraryDeleteFile(project.id, filename);
    setFiles(prev => prev.filter(f => f.filename !== filename));
    setConfirmDelete(null);
  };

  const openFile = async (filename) => {
    if (!isElectron()) return;
    await window.electronAPI.libraryOpenFile(project.id, filename);
  };

  const exportFile = async (filename) => {
    if (!isElectron()) return;
    await window.electronAPI.libraryExportFile(project.id, filename);
  };

  const toggleStar = async (filename) => {
    const f = files.find(x => x.filename === filename);
    if (!f) return;
    const updated = { ...f, starred: !f.starred };
    setFiles(prev => prev.map(x => x.filename === filename ? updated : x));
    if (isElectron()) await window.electronAPI.libraryUpdateMeta(project.id, filename, { starred: !f.starred });
  };

  const addTag = async (filename) => {
    if (!tagInput.trim()) { setTagEditing(null); return; }
    const f = files.find(x => x.filename === filename);
    if (!f) return;
    const newTags = [...(f.tags || []), tagInput.trim()];
    setFiles(prev => prev.map(x => x.filename === filename ? { ...x, tags: newTags } : x));
    if (isElectron()) await window.electronAPI.libraryUpdateMeta(project.id, filename, { tags: newTags });
    setTagEditing(null); setTagInput('');
  };

  const removeTag = async (filename, tag) => {
    const f = files.find(x => x.filename === filename);
    if (!f) return;
    const newTags = (f.tags || []).filter(t => t !== tag);
    setFiles(prev => prev.map(x => x.filename === filename ? { ...x, tags: newTags } : x));
    if (isElectron()) await window.electronAPI.libraryUpdateMeta(project.id, filename, { tags: newTags });
  };

  // Export manuscript
  const exportManuscript = async (format) => {
    const chs = manuscript?.chapters || [];
    const allText = chs.map((ch, i) => `${ch.title || 'Chapter ' + (i + 1)}\n\n${ch.text}`).join('\n\n---\n\n');
    if (format === 'txt') {
      const blob = new Blob([allText], { type: 'text/plain' });
      if (isElectron()) {
        const b64 = btoa(unescape(encodeURIComponent(allText)));
        await window.electronAPI.saveFileDialog(`${project.title || 'manuscript'}.txt`, b64, [{ name: 'Text', extensions: ['txt'] }]);
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'manuscript.txt'; a.click();
      }
    } else if (format === 'md') {
      const md = chs.map((ch, i) => `## ${ch.title || 'Chapter ' + (i + 1)}\n\n${ch.text}`).join('\n\n---\n\n');
      if (isElectron()) {
        const b64 = btoa(unescape(encodeURIComponent(md)));
        await window.electronAPI.saveFileDialog(`${project.title || 'manuscript'}.md`, b64, [{ name: 'Markdown', extensions: ['md'] }]);
      } else {
        const blob = new Blob([md], { type: 'text/markdown' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'manuscript.md'; a.click();
      }
    }
  };

  // Extract summary
  const extractSummary = async () => {
    const chs = manuscript?.chapters || [];
    const allText = chs.map((ch, i) => `${ch.title || 'Chapter ' + (i + 1)}\n\n${ch.text}`).join('\n\n');
    if (!allText.trim()) return;
    setSummaryLoading(true);
    try {
      const charContext = (chars || []).map(c => `${c.name}: ${c.role}${c.secrets ? ' | Secrets: ' + c.secrets : ''}`).join('\n');
      const loreContext = (lore || []).map(l => l.rule).join('\n');
      const resp = await callClaude({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a story analyst. Project: "${project.title}" (${project.genre || 'unknown genre'})\nCharacters:\n${charContext}\nWorld Rules:\n${loreContext}`,
        messages: [{ role: 'user', content: `Here is the complete manuscript written so far:\n\n${allText.slice(0, 40000)}\n\nPlease write a comprehensive story summary including:\n- One paragraph overall story synopsis\n- Each major character's arc as written so far\n- Key plot events in order\n- Major themes emerging from the text\n- Unresolved threads visible in the manuscript\n\nWrite in present tense, clear prose, under 800 words total.` }]
      });
      const text = resp?.content?.[0]?.text || resp?.message || 'No summary generated';
      setSummaryResult(text);
    } catch (err) {
      setSummaryResult('Error generating summary: ' + err.message);
    }
    setSummaryLoading(false);
  };

  // Filters
  const allTags = [...new Set(files.flatMap(f => f.tags || []))];
  const typeMap = { pdf: 'Documents', docx: 'Documents', doc: 'Documents', txt: 'Documents', md: 'Documents', jpg: 'Images', jpeg: 'Images', png: 'Images', gif: 'Images', mp3: 'Audio', wav: 'Audio', m4a: 'Audio' };
  const getCategory = (type) => typeMap[type] || 'Other';
  const typeIcon = (type) => ({ pdf: '📕', docx: '📘', doc: '📘', txt: '📄', md: '📓', jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', mp3: '🎵', wav: '🎵' }[type] || '📁');
  const formatSize = (bytes) => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';

  let filtered = files;
  if (search) filtered = filtered.filter(f => f.filename.toLowerCase().includes(search.toLowerCase()) || (f.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase())));
  if (filterType !== 'all') filtered = filtered.filter(f => getCategory(f.type) === filterType);
  if (filterTag) filtered = filtered.filter(f => (f.tags || []).includes(filterTag));
  filtered = [...filtered].sort((a, b) => sort === 'name' ? a.filename.localeCompare(b.filename) : sort === 'size' ? b.size - a.size : new Date(b.dateAdded) - new Date(a.dateAdded));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: C.bg }}>
      {/* Manuscript Exports Section */}
      <div style={{ flexShrink: 0, padding: '14px 20px', backgroundColor: C.bgDeep, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '10px', color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Manuscript Exports</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => exportManuscript('txt')} style={{ padding: '5px 12px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '4px', color: C.parch, cursor: 'pointer' }}>Export as .txt</button>
          <button onClick={() => exportManuscript('md')} style={{ padding: '5px 12px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '4px', color: C.parch, cursor: 'pointer' }}>Export as .md</button>
          <div style={{ width: '1px', height: '20px', backgroundColor: C.border }} />
          <button onClick={extractSummary} disabled={summaryLoading} style={{ padding: '5px 12px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.purple + '33', border: `1px solid ${C.purple}55`, borderRadius: '4px', color: C.purpleLight, cursor: summaryLoading ? 'wait' : 'pointer' }}>
            {summaryLoading ? 'Generating...' : '✦ Extract Summary'}
          </button>
        </div>
        {summaryResult && (
          <div style={{ marginTop: '10px', padding: '12px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase' }}>Story Summary</span>
              <button onClick={() => setSummaryResult(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: C.parch, lineHeight: '1.7', fontFamily: 'Georgia,serif', whiteSpace: 'pre-wrap' }}>{summaryResult}</div>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div style={{ flexShrink: 0, display: 'flex', gap: '8px', padding: '12px 20px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={addFiles} style={{ padding: '6px 14px', fontSize: '11px', fontFamily: 'system-ui', backgroundColor: C.purple + '33', border: `1px solid ${C.purple}55`, borderRadius: '4px', color: C.purpleLight, cursor: 'pointer' }}>+ Add Files</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files or tags..."
          style={{ flex: 1, minWidth: '140px', padding: '6px 10px', fontSize: '11px', fontFamily: 'system-ui', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '4px', color: C.parch, outline: 'none' }} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: '5px 8px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '4px', color: C.parch }}>
          <option value="dateAdded">Date Added</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
        <div style={{ display: 'flex', gap: '2px' }}>
          {['grid', 'list'].map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding: '4px 8px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: viewMode === v ? C.bgElevated : 'transparent', border: `1px solid ${viewMode === v ? C.border : 'transparent'}`, borderRadius: '3px', color: viewMode === v ? C.parch : C.muted, cursor: 'pointer' }}>
              {v === 'grid' ? '⊞' : '☰'}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Filter sidebar */}
        <div style={{ width: '200px', flexShrink: 0, borderRight: `1px solid ${C.border}`, padding: '12px', overflowY: 'auto' }}>
          <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Type</div>
          {['all', 'Documents', 'Images', 'Audio', 'Other'].map(t => (
            <div key={t} onClick={() => setFilterType(t)}
              style={{ padding: '5px 8px', fontSize: '11px', fontFamily: 'system-ui', cursor: 'pointer', borderRadius: '3px', marginBottom: '2px', backgroundColor: filterType === t ? C.bgElevated : 'transparent', color: filterType === t ? C.parch : C.muted }}>
              {t === 'all' ? 'All Files' : t} {t !== 'all' && <span style={{ fontSize: '9px', color: C.muted }}>({files.filter(f => getCategory(f.type) === t).length})</span>}
            </div>
          ))}
          {allTags.length > 0 && <>
            <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '16px', marginBottom: '8px' }}>Tags</div>
            {allTags.map(tag => (
              <div key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                style={{ padding: '5px 8px', fontSize: '11px', fontFamily: 'system-ui', cursor: 'pointer', borderRadius: '3px', marginBottom: '2px', backgroundColor: filterTag === tag ? C.purple + '33' : 'transparent', color: filterTag === tag ? C.purpleLight : C.muted }}>
                {tag}
              </div>
            ))}
          </>}
        </div>

        {/* File grid/list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.muted, fontFamily: 'system-ui', fontSize: '12px', padding: '40px' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.muted, fontFamily: 'system-ui', fontSize: '12px', padding: '40px' }}>
              {files.length === 0 ? 'No files yet. Click "Add Files" to upload documents, images, or references.' : 'No files match your search.'}
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '10px' }}>
              {filtered.map(f => (
                <div key={f.filename} style={{ backgroundColor: C.bgCard, border: `1px solid ${confirmDelete === f.filename ? '#c0392b66' : C.border}`, borderRadius: '6px', padding: '14px', position: 'relative', transition: 'border-color 0.15s' }}>
                  {/* Star */}
                  <span onClick={() => toggleStar(f.filename)} style={{ position: 'absolute', top: '8px', right: '8px', cursor: 'pointer', fontSize: '12px', opacity: f.starred ? 1 : 0.3 }}>{f.starred ? '★' : '☆'}</span>
                  {/* Icon */}
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{typeIcon(f.type)}</div>
                  {/* Name */}
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: C.parch, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.originalName || f.filename}>{f.originalName || f.filename}</div>
                  {/* Meta */}
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', marginBottom: '6px' }}>{formatSize(f.size)} · {new Date(f.dateAdded).toLocaleDateString()}</div>
                  {/* Tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '8px', minHeight: '18px' }}>
                    {(f.tags || []).map(t => (
                      <span key={t} style={{ fontSize: '8px', padding: '1px 5px', backgroundColor: C.purple + '22', color: C.purpleLight, borderRadius: '6px', fontFamily: 'system-ui' }}>
                        {t} <span onClick={() => removeTag(f.filename, t)} style={{ cursor: 'pointer', marginLeft: '2px' }}>×</span>
                      </span>
                    ))}
                    {tagEditing === f.filename ? (
                      <input value={tagInput} onChange={e => setTagInput(e.target.value)} onBlur={() => addTag(f.filename)} onKeyDown={e => e.key === 'Enter' && addTag(f.filename)} autoFocus placeholder="tag..."
                        style={{ fontSize: '8px', padding: '1px 4px', width: '50px', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '3px', color: C.parch, outline: 'none', fontFamily: 'system-ui' }} />
                    ) : (
                      <span onClick={() => { setTagEditing(f.filename); setTagInput(''); }} style={{ fontSize: '8px', color: C.muted, cursor: 'pointer', fontFamily: 'system-ui' }}>+ tag</span>
                    )}
                  </div>
                  {/* Actions */}
                  {confirmDelete === f.filename ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => deleteFile(f.filename)} style={{ flex: 1, padding: '3px 6px', fontSize: '9px', backgroundColor: '#c0392b', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>Delete</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '3px 6px', fontSize: '9px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openFile(f.filename)} style={{ flex: 1, padding: '3px', fontSize: '9px', backgroundColor: C.bgElevated, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>Open</button>
                      <button onClick={() => exportFile(f.filename)} style={{ flex: 1, padding: '3px', fontSize: '9px', backgroundColor: C.bgElevated, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>Export</button>
                      <button onClick={() => setConfirmDelete(f.filename)} style={{ padding: '3px 5px', fontSize: '9px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>🗑</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* List view */
            <div>
              {filtered.map(f => (
                <div key={f.filename} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderBottom: `1px solid ${C.border}11`, borderRadius: '4px' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = C.bgElevated} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <span onClick={() => toggleStar(f.filename)} style={{ cursor: 'pointer', fontSize: '12px', opacity: f.starred ? 1 : 0.3 }}>{f.starred ? '★' : '☆'}</span>
                  <span style={{ fontSize: '18px' }}>{typeIcon(f.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: C.parch, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName || f.filename}</div>
                    <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui' }}>{formatSize(f.size)} · {f.type} · {new Date(f.dateAdded).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                    {(f.tags || []).map(t => <span key={t} style={{ fontSize: '8px', padding: '1px 5px', backgroundColor: C.purple + '22', color: C.purpleLight, borderRadius: '6px', fontFamily: 'system-ui' }}>{t}</span>)}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => openFile(f.filename)} style={{ padding: '3px 8px', fontSize: '9px', backgroundColor: C.bgElevated, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>Open</button>
                    <button onClick={() => exportFile(f.filename)} style={{ padding: '3px 8px', fontSize: '9px', backgroundColor: C.bgElevated, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>Export</button>
                    <button onClick={() => confirmDelete === f.filename ? deleteFile(f.filename) : setConfirmDelete(f.filename)} style={{ padding: '3px 5px', fontSize: '9px', backgroundColor: confirmDelete === f.filename ? '#c0392b' : 'transparent', color: confirmDelete === f.filename ? '#fff' : C.muted, border: `1px solid ${confirmDelete === f.filename ? '#c0392b' : C.border}`, borderRadius: '3px', cursor: 'pointer', fontFamily: 'system-ui' }}>
                      {confirmDelete === f.filename ? 'Confirm?' : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── IMPORT & ANALYSE ── */
