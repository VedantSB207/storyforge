import { useState, useRef, useEffect } from "react";
import { callClaude, isElectron } from "../api.js";
import { C, genId } from "../constants.js";
import { detectAndSplitChapters } from "./detectChapters.js";

export function WritingPanel({ project, chars, lore, manuscript, setManuscript }) {
  const [chapters, setChapters] = useState(manuscript?.chapters?.length > 0 ? manuscript.chapters : [{ id: genId(), title: 'Chapter 1', text: '' }]);
  const [activeChapter, setActiveChapter] = useState(0);
  const [bibleOpen, setBibleOpen] = useState(true);
  const [expandedChar, setExpandedChar] = useState(null);
  const [aiLoading, setAiLoading] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const [titleVal, setTitleVal] = useState('');
  const [toolbarHover, setToolbarHover] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [dialogueChar, setDialogueChar] = useState(chars[0]?.name || '');
  const [importPrompt, setImportPrompt] = useState(null); // {chapters: [...], action: 'pending'}
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState('all'); // 'current' | 'all' | 'range'
  const [exportRange, setExportRange] = useState([1, chapters.length]);
  const [exporting, setExporting] = useState(false);
  const editorRef = useRef(null);
  const chaptersRef = useRef(chapters);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);

  // Import chapters from file via Electron file picker
  const importFromFile = async () => {
    if (!isElectron()) return;
    try {
      const files = await window.electronAPI.readFiles();
      if (!files || files.length === 0) return;
      const allText = files.map(f => f.content).filter(Boolean).join('\n\n');
      const detected = detectAndSplitChapters(allText, files[0]?.name || 'import');
      if (detected.length === 0) return;
      // If writer already has content, ask before overwriting
      const hasContent = chapters.some(ch => ch.text.trim().length > 0);
      if (hasContent) {
        setImportPrompt({ chapters: detected });
      } else {
        // No existing content — just replace
        setChapters(detected);
        setActiveChapter(0);
      }
    } catch (err) {
      console.error('File import error:', err);
    }
  };

  const applyImportedChapters = (mode) => {
    if (!importPrompt) return;
    if (mode === 'replace') {
      setChapters(importPrompt.chapters);
      setActiveChapter(0);
    } else if (mode === 'append') {
      setChapters(prev => [...prev, ...importPrompt.chapters]);
    }
    setImportPrompt(null);
  };

  // Export functions
  const getExportChapters = () => {
    if (exportScope === 'current') return [chapters[activeChapter]];
    if (exportScope === 'range') return chapters.slice(exportRange[0] - 1, exportRange[1]);
    return chapters;
  };

  const doExport = async (format) => {
    setExporting(true);
    const chs = getExportChapters();
    const title = project?.title || 'Manuscript';
    try {
      if (format === 'txt') {
        const text = chs.map((ch, i) => `${ch.title || 'Chapter ' + (i + 1)}\n\n${ch.text}`).join('\n\n---\n\n');
        const b64 = btoa(unescape(encodeURIComponent(text)));
        if (isElectron()) { await window.electronAPI.saveFileDialog(`${title}.txt`, b64, [{ name: 'Text', extensions: ['txt'] }]); }
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text])); a.download = `${title}.txt`; a.click(); }
      } else if (format === 'md') {
        const md = chs.map((ch, i) => `## ${ch.title || 'Chapter ' + (i + 1)}\n\n${ch.text}`).join('\n\n---\n\n');
        const b64 = btoa(unescape(encodeURIComponent(md)));
        if (isElectron()) { await window.electronAPI.saveFileDialog(`${title}.md`, b64, [{ name: 'Markdown', extensions: ['md'] }]); }
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md])); a.download = `${title}.md`; a.click(); }
      } else if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const margin = 72; // 1 inch
        const pageW = doc.internal.pageSize.getWidth() - margin * 2;
        let y = margin;
        // Title page
        doc.setFont('times', 'bold'); doc.setFontSize(24);
        doc.text(title, doc.internal.pageSize.getWidth() / 2, 300, { align: 'center' });
        doc.setFont('times', 'normal'); doc.setFontSize(14);
        doc.text('by Author', doc.internal.pageSize.getWidth() / 2, 340, { align: 'center' });
        doc.addPage();
        // Chapters
        for (let ci = 0; ci < chs.length; ci++) {
          const ch = chs[ci];
          y = margin;
          doc.setFont('times', 'bold'); doc.setFontSize(16);
          doc.text(ch.title || `Chapter ${ci + 1}`, margin, y); y += 30;
          doc.setFont('times', 'normal'); doc.setFontSize(12);
          const lines = doc.splitTextToSize(ch.text || '', pageW);
          for (const line of lines) {
            if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
            doc.text(line, margin, y); y += 18; // ~1.5 line height
          }
          if (ci < chs.length - 1) doc.addPage();
        }
        // Page numbers
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 2; i <= pageCount; i++) {
          doc.setPage(i); doc.setFontSize(10); doc.setFont('times', 'normal');
          doc.text(`${i}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 36, { align: 'center' });
        }
        const pdfData = doc.output('arraybuffer');
        const b64 = btoa(String.fromCharCode(...new Uint8Array(pdfData)));
        if (isElectron()) { await window.electronAPI.saveFileDialog(`${title}.pdf`, b64, [{ name: 'PDF', extensions: ['pdf'] }]); }
        else { const blob = new Blob([pdfData], { type: 'application/pdf' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title}.pdf`; a.click(); }
      } else if (format === 'docx') {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header, Footer, PageNumber } = await import('docx');
        const children = [];
        // Title page
        children.push(new Paragraph({ spacing: { before: 4000 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, size: 48, font: 'Times New Roman' })] }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'by Author', size: 28, font: 'Times New Roman' })] }));
        children.push(new Paragraph({ pageBreakBefore: true }));
        // Chapters
        for (let ci = 0; ci < chs.length; ci++) {
          const ch = chs[ci];
          if (ci > 0) children.push(new Paragraph({ pageBreakBefore: true }));
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: ch.title || `Chapter ${ci + 1}`, font: 'Times New Roman' })] }));
          const paras = (ch.text || '').split('\n').filter(l => l.trim());
          for (const p of paras) {
            children.push(new Paragraph({ spacing: { line: 480 }, children: [new TextRun({ text: p, size: 24, font: 'Times New Roman' })] }));
          }
        }
        const docxDoc = new Document({
          sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
            headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, italics: true, size: 18, font: 'Times New Roman' })] })] }) },
            footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20, font: 'Times New Roman' })] })] }) },
            children }],
        });
        const buffer = await Packer.toBuffer(docxDoc);
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        if (isElectron()) { await window.electronAPI.saveFileDialog(`${title}.docx`, b64, [{ name: 'Word', extensions: ['docx'] }]); }
        else { const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title}.docx`; a.click(); }
      }
      setExportOpen(false);
    } catch (err) { console.error('Export error:', err); }
    setExporting(false);
  };

  // Auto-save every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      setSaving(true);
      setManuscript({ chapters: chaptersRef.current });
      setLastSaved(new Date());
      setTimeout(() => setSaving(false), 600);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Save on window blur
  useEffect(() => {
    const handler = () => { setManuscript({ chapters: chaptersRef.current }); setLastSaved(new Date()); };
    window.addEventListener('blur', handler);
    return () => window.removeEventListener('blur', handler);
  }, []);

  // Sync chapters to parent on meaningful changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      setManuscript({ chapters });
    }, 2000);
    return () => clearTimeout(timer);
  }, [chapters]);

  const updateChapterText = (text) => {
    setChapters(prev => prev.map((ch, i) => i === activeChapter ? { ...ch, text } : ch));
  };

  const addChapter = () => {
    const newCh = { id: genId(), title: `Chapter ${chapters.length + 1}`, text: '' };
    setChapters(prev => [...prev, newCh]);
    setActiveChapter(chapters.length);
  };

  const removeChapter = (idx) => {
    if (chapters.length <= 1) return;
    setChapters(prev => prev.filter((_, i) => i !== idx));
    if (activeChapter >= idx && activeChapter > 0) setActiveChapter(activeChapter - 1);
  };

  const chapterWordCount = (text) => (text || '').split(/\s+/).filter(Boolean).length;
  const currentWords = chapterWordCount(chapters[activeChapter]?.text);
  const totalWords = chapters.reduce((sum, ch) => sum + chapterWordCount(ch.text), 0);
  const readingTime = Math.max(1, Math.round(totalWords / 200));

  const buildWritingContext = () => {
    const parts = [`PROJECT: "${project?.title || 'Untitled'}"${project?.genre ? ` (${project.genre})` : ''}`];
    if (chars.length > 0) {
      parts.push('\nCHARACTERS:\n' + chars.map(c =>
        [`• ${c.name}${c.species ? ` (${c.species})` : ''}${c.role ? ` — ${c.role}` : ''}`,
         c.secrets ? `  Secrets: ${c.secrets}` : '',
         c.contradictions ? `  Contradictions: ${c.contradictions}` : '',
        ].filter(Boolean).join('\n')
      ).join('\n'));
    }
    if (lore.length > 0) {
      parts.push('\nWORLD RULES:\n' + lore.slice(0, 30).map(r => `[${r.cat}] ${r.rule}`).join('\n'));
    }
    return parts.join('\n');
  };

  // Selection tracking for AI writing
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [selText, setSelText] = useState('');
  const [showWriteThis, setShowWriteThis] = useState(false);
  const [rewriteMode, setRewriteMode] = useState(null); // null | 'vivid' | 'concise' | 'gothic' | 'humorous' | 'custom'
  const [rewriteCustom, setRewriteCustom] = useState('');
  const [inlinePrompt, setInlinePrompt] = useState(null); // {line, text} for Cmd+Enter
  const [inlinePromptText, setInlinePromptText] = useState('');
  const undoStack = useRef([]);
  const MAX_UNDO = 50;

  const pushUndo = () => {
    const current = chapters[activeChapter]?.text || '';
    undoStack.current.push({ chapterIndex: activeChapter, text: current });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
  };

  const handleUndo = () => {
    if (undoStack.current.length === 0) return;
    const last = undoStack.current.pop();
    if (last) setChapters(prev => prev.map((ch, i) => i === last.chapterIndex ? { ...ch, text: last.text } : ch));
  };

  const onTextSelect = () => {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start !== end) {
      setSelStart(start); setSelEnd(end);
      setSelText(el.value.substring(start, end));
      setShowWriteThis(true);
    } else {
      setSelStart(null); setSelEnd(null); setSelText(''); setShowWriteThis(false);
    }
  };

  // Mode A: Write This (selected text → polished prose)
  const writeThis = async () => {
    if (!selText.trim()) return;
    setAiLoading('writeThis'); setAiResult(null);
    const currentText = chapters[activeChapter]?.text || '';
    const before = currentText.substring(Math.max(0, selStart - 200), selStart);
    const after = currentText.substring(selEnd, Math.min(currentText.length, selEnd + 200));
    try {
      const data = await callClaude({
        model: 'claude-sonnet-4-20250514', max_tokens: 1200,
        system: `You are a writing partner. ${buildWritingContext()}`,
        messages: [{ role: 'user', content: `The writer has selected this text in their manuscript: "${selText}"\n\nThis is either a rough note, placeholder, or instruction about what should happen here. Rewrite it as polished prose that fits the story's tone and style. Match the voice of the surrounding text.\n\nSurrounding context before: "${before}"\nSurrounding context after: "${after}"` }],
      });
      const reply = data.content?.[0]?.text || '';
      setAiResult({ actionId: 'writeThis', text: reply, replaceStart: selStart, replaceEnd: selEnd, original: selText });
    } catch (err) { setAiResult({ actionId: 'writeThis', text: 'Error: ' + err.message }); }
    setAiLoading(null);
  };

  // Mode C: Rewrite selection with tone
  const rewriteSelection = async (tone) => {
    if (!selText.trim()) return;
    setAiLoading('rewrite'); setAiResult(null);
    const instruction = tone === 'custom' ? rewriteCustom : `more ${tone}`;
    try {
      const data = await callClaude({
        model: 'claude-sonnet-4-20250514', max_tokens: 1200,
        system: `You are a writing editor. ${buildWritingContext()}`,
        messages: [{ role: 'user', content: `Rewrite this passage to be ${instruction}. Keep the same meaning and plot, only change the style/tone.\n\nOriginal:\n"${selText}"` }],
      });
      const reply = data.content?.[0]?.text || '';
      setAiResult({ actionId: 'rewrite', text: reply, replaceStart: selStart, replaceEnd: selEnd, original: selText, tone });
    } catch (err) { setAiResult({ actionId: 'rewrite', text: 'Error: ' + err.message }); }
    setAiLoading(null); setRewriteMode(null);
  };

  // Mode B: Write from cursor (Cmd+Enter on empty line)
  const writeFromCursor = async (instruction) => {
    setAiLoading('fromCursor'); setAiResult(null); setInlinePrompt(null);
    const currentText = chapters[activeChapter]?.text || '';
    const el = editorRef.current;
    const cursorPos = el ? el.selectionStart : currentText.length;
    const before = currentText.substring(Math.max(0, cursorPos - 800), cursorPos);
    try {
      const data = await callClaude({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        system: `You are a writing partner continuing the story. ${buildWritingContext()}`,
        messages: [{ role: 'user', content: instruction?.trim() ? `The writer wants this to happen next: "${instruction}"\n\nContinue from here:\n${before}` : `Continue the story naturally from here:\n${before}` }],
      });
      const reply = data.content?.[0]?.text || '';
      pushUndo();
      const newText = currentText.substring(0, cursorPos) + '\n\n' + reply + currentText.substring(cursorPos);
      updateChapterText(newText);
    } catch (err) { console.error(err); }
    setAiLoading(null);
  };

  // Replace selection with AI result
  const replaceSelection = () => {
    if (!aiResult || aiResult.replaceStart == null) return;
    pushUndo();
    const currentText = chapters[activeChapter]?.text || '';
    const newText = currentText.substring(0, aiResult.replaceStart) + aiResult.text + currentText.substring(aiResult.replaceEnd);
    updateChapterText(newText);
    setAiResult(null); setShowWriteThis(false);
  };

  // Insert AI result after selection
  const insertAfterSelection = () => {
    if (!aiResult || aiResult.replaceEnd == null) return;
    pushUndo();
    const currentText = chapters[activeChapter]?.text || '';
    const newText = currentText.substring(0, aiResult.replaceEnd) + '\n\n' + aiResult.text + currentText.substring(aiResult.replaceEnd);
    updateChapterText(newText);
    setAiResult(null); setShowWriteThis(false);
  };

  const AI_BUTTONS = [
    { id: 'continue',  label: 'Continue →',  icon: '→' },
    { id: 'stuck',     label: 'Stuck?',      icon: '?' },
    { id: 'scene',     label: 'Scene Check',  icon: '✓' },
    { id: 'dialogue',  label: 'Dialogue',     icon: '💬' },
    { id: 'describe',  label: 'Describe',     icon: '✦' },
  ];

  const AI_PROMPTS = {
    continue: `You are a writing partner. Continue the story naturally from where the writer left off. Write 2-3 paragraphs that maintain the established voice, pacing, and tone. Don't introduce new characters or major plot turns unless the momentum demands it. Match the writer's style exactly.`,
    stuck: `The writer is stuck. Based on what's written so far, suggest exactly 3 concrete, specific directions the scene could take next. For each, write 2 sentences: what happens, and why it serves the story. Number them 1-3. Don't be generic — reference specific characters and established plot threads.`,
    scene: `You are a continuity editor. Review the current scene against the Story Bible data provided. Check for: character voice consistency, factual contradictions with established lore, unearned emotional beats, pacing issues. Be specific — cite the exact text that concerns you. Under 200 words.`,
    dialogue: (charName) => `Suggest what ${charName} would say next in this scene, based on their established personality, secrets, and speech patterns. Write 3 options ranging from guarded to revealing. Each should feel authentic to this character, not generic.`,
    describe: `Take the writer's current passage and enrich it with sensory description — sight, sound, smell, texture, taste where appropriate. Don't change the plot or meaning, only deepen the immersion. Match the existing tone. Return the enhanced version.`,
  };

  const aiAction = async (actionId) => {
    if (aiLoading) return;
    setAiLoading(actionId);
    setAiResult(null);
    try {
      const currentText = chapters[activeChapter]?.text || '';
      const context = buildWritingContext();
      const systemPrompt = typeof AI_PROMPTS[actionId] === 'function'
        ? AI_PROMPTS[actionId](dialogueChar)
        : AI_PROMPTS[actionId];
      const userContent = actionId === 'describe'
        ? `Enrich this passage:\n\n${currentText.slice(-1500)}`
        : `Current chapter: ${chapters[activeChapter]?.title}\n\nText so far (last 2000 chars):\n${currentText.slice(-2000)}`;
      const data = await callClaude({
        model: 'claude-sonnet-4-20250514', max_tokens: 1200,
        system: `${systemPrompt}\n\nSTORY CONTEXT:\n${context}`,
        messages: [{ role: 'user', content: userContent }],
      });
      const reply = data.content?.[0]?.text || 'No response received.';
      setAiResult({ actionId, text: reply });
    } catch (err) {
      setAiResult({ actionId, text: err.message === 'API_KEY_MISSING' ? 'API key not set. Go to Settings.' : 'Connection error. Try again.' });
    }
    setAiLoading(null);
  };

  const insertAtCursor = () => {
    if (!aiResult) return;
    pushUndo();
    const current = chapters[activeChapter]?.text || '';
    updateChapterText(current + '\n\n' + aiResult.text);
    setAiResult(null);
  };

  const toolbarOpacity = editorFocused && !toolbarHover ? 0.3 : 1;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: C.bg }}>
      {/* Toolbar: chapter tabs + AI buttons */}
      <div
        onMouseEnter={() => setToolbarHover(true)}
        onMouseLeave={() => setToolbarHover(false)}
        style={{
          display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`,
          backgroundColor: C.bgDeep, padding: '0', flexShrink: 0, minHeight: '38px',
          opacity: toolbarOpacity, transition: 'opacity 0.3s ease',
        }}
      >
        {/* Chapter tabs */}
        <div style={{ display: 'flex', alignItems: 'center', overflow: 'auto', flex: 1, gap: '0' }}>
          {chapters.map((ch, i) => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              {editingTitle === i ? (
                <input value={titleVal} onChange={e => setTitleVal(e.target.value)}
                  onBlur={() => { setChapters(prev => prev.map((c, j) => j === i ? { ...c, title: titleVal || c.title } : c)); setEditingTitle(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                  autoFocus
                  style={{ background: C.bgElevated, border: `1px solid ${C.border}`, color: C.parch, fontSize: '11px', padding: '4px 8px', fontFamily: 'system-ui', width: '100px' }}
                />
              ) : (
                <button
                  onClick={() => setActiveChapter(i)}
                  onDoubleClick={() => { setEditingTitle(i); setTitleVal(ch.title); }}
                  style={{
                    padding: '0 14px', height: '38px', fontSize: '11px', fontFamily: 'system-ui',
                    background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    borderBottom: activeChapter === i ? `2px solid ${C.acc}` : '2px solid transparent',
                    color: activeChapter === i ? C.parch : C.muted, position: 'relative',
                  }}
                >
                  {ch.title}
                  <span style={{ fontSize: '9px', color: C.muted, marginLeft: '6px' }}>{chapterWordCount(ch.text).toLocaleString()}w</span>
                  {chapters.length > 1 && activeChapter === i && (
                    <span onClick={e => { e.stopPropagation(); removeChapter(i); }} style={{ marginLeft: '6px', fontSize: '10px', color: C.muted, cursor: 'pointer' }}>×</span>
                  )}
                </button>
              )}
            </div>
          ))}
          <button onClick={addChapter} style={{ padding: '0 10px', height: '38px', fontSize: '14px', background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }} title="Add blank chapter">+</button>
          {isElectron() && <button onClick={importFromFile} style={{ padding: '0 10px', height: '38px', fontSize: '10px', fontFamily: 'system-ui', background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }} title="Import chapters from file">📄 Import</button>}
        </div>

        {/* AI action buttons */}
        <div style={{ display: 'flex', gap: '4px', padding: '0 10px', flexShrink: 0, alignItems: 'center' }}>
          {AI_BUTTONS.map(btn => (
            <button key={btn.id} onClick={() => aiAction(btn.id)} disabled={!!aiLoading}
              style={{
                padding: '4px 10px', fontSize: '10px', fontFamily: 'system-ui', borderRadius: '4px',
                background: aiLoading === btn.id ? C.purple + '44' : C.bgElevated,
                border: `1px solid ${C.border}`, color: aiLoading === btn.id ? C.purpleLight : C.mutedLight,
                cursor: aiLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {aiLoading === btn.id ? '...' : btn.label}
            </button>
          ))}
          {/* Dialogue character picker */}
          <select value={dialogueChar} onChange={e => setDialogueChar(e.target.value)}
            style={{ fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bgElevated, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '3px 4px', maxWidth: '90px' }}
          >
            {chars.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Chapter import prompt */}
      {importPrompt && (
        <div style={{ backgroundColor: C.bgElevated, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: C.parch, fontFamily: 'system-ui' }}>
            Found <b style={{ color: C.purpleLight }}>{importPrompt.chapters.length} chapters</b> in imported file. Current chapters have content.
          </span>
          <button onClick={() => applyImportedChapters('replace')} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '4px 12px', backgroundColor: C.acc, color: C.parch, border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Replace all</button>
          <button onClick={() => applyImportedChapters('append')} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '4px 12px', backgroundColor: C.bgElevated, color: C.mutedLight, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer' }}>Add as new</button>
          <button onClick={() => setImportPrompt(null)} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '4px 12px', backgroundColor: 'transparent', color: C.muted, border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {/* AI result panel (inline, below toolbar) */}
      {aiResult && (
        <div style={{ backgroundColor: C.bgElevated, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', maxHeight: '220px', overflow: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', fontFamily: 'system-ui', color: C.purpleLight, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {aiResult.actionId === 'writeThis' ? '✦ Write This' : aiResult.actionId === 'rewrite' ? `Rewrite (${aiResult.tone || ''})` : AI_BUTTONS.find(b => b.id === aiResult.actionId)?.label || 'AI'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Show Replace/Insert for selection-based results */}
              {(aiResult.actionId === 'writeThis' || aiResult.actionId === 'rewrite') && aiResult.replaceStart != null && (
                <>
                  <button onClick={replaceSelection} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '3px 10px', backgroundColor: C.acc, color: C.parch, border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Replace Selection</button>
                  <button onClick={insertAfterSelection} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '3px 10px', backgroundColor: C.bgCard, color: C.parch, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer' }}>Insert After</button>
                </>
              )}
              {(aiResult.actionId === 'continue' || aiResult.actionId === 'describe') && (
                <button onClick={insertAtCursor} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '3px 10px', backgroundColor: C.acc, color: C.parch, border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Insert at cursor</button>
              )}
              <button onClick={() => { setAiResult(null); setShowWriteThis(false); }} style={{ fontSize: '10px', fontFamily: 'system-ui', padding: '3px 10px', backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '3px', cursor: 'pointer' }}>Dismiss</button>
            </div>
          </div>
          {/* Show original vs AI for writeThis/rewrite */}
          {(aiResult.actionId === 'writeThis' || aiResult.actionId === 'rewrite') && aiResult.original && (
            <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', marginBottom: '6px', padding: '6px 10px', backgroundColor: C.bg, borderRadius: '4px', borderLeft: `2px solid ${C.border}` }}>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', color: C.muted }}>Original</div>
              <div style={{ color: C.mutedLight, fontFamily: 'Georgia,serif', lineHeight: '1.5' }}>{aiResult.original}</div>
            </div>
          )}
          <div style={{ fontSize: '13px', lineHeight: '1.7', color: C.parch, fontFamily: 'Georgia,serif', whiteSpace: 'pre-wrap' }}>{aiResult.text}</div>
        </div>
      )}

      {/* Main area: editor + collapsible sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'auto', padding: '40px 24px', backgroundColor: '#0f0f14' }}>
          <div style={{ width: '100%', maxWidth: '720px', position: 'relative' }}>
            <textarea
              ref={editorRef}
              value={chapters[activeChapter]?.text || ''}
              onChange={e => updateChapterText(e.target.value)}
              onFocus={() => setEditorFocused(true)}
              onBlur={() => { setEditorFocused(false); setTimeout(onTextSelect, 100); }}
              onSelect={onTextSelect}
              onKeyDown={e => {
                // Cmd+Z for undo
                if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                  if (undoStack.current.length > 0) { e.preventDefault(); handleUndo(); }
                }
                // Cmd+Enter to write from cursor
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  const el = editorRef.current;
                  const pos = el.selectionStart;
                  const text = el.value;
                  // Check if current line is empty
                  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
                  const lineEnd = text.indexOf('\n', pos);
                  const currentLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
                  if (currentLine === '') {
                    setInlinePrompt({ pos });
                  } else {
                    writeFromCursor('');
                  }
                }
              }}
              placeholder="Begin writing..."
              style={{
                width: '100%', minHeight: '100%',
                fontFamily: 'Georgia,serif', fontSize: '15px', lineHeight: '2',
                backgroundColor: 'transparent', color: C.parch, border: 'none',
                outline: 'none', resize: 'none', padding: '0',
              }}
            />
            {/* Floating selection toolbar */}
            {showWriteThis && selText && !aiResult && (
              <div style={{ position: 'absolute', top: '-36px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px', backgroundColor: C.bgCard, border: `1px solid ${C.purple}55`, borderRadius: '6px', padding: '4px 6px', boxShadow: '0 4px 12px #000a', zIndex: 10 }}>
                <button onClick={writeThis} disabled={!!aiLoading}
                  style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.purple + '33', border: `1px solid ${C.purple}55`, borderRadius: '3px', color: C.purpleLight, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {aiLoading === 'writeThis' ? '...' : '✦ Write This'}
                </button>
                <button onClick={() => setRewriteMode('pick')} disabled={!!aiLoading}
                  style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '3px', color: C.mutedLight, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Rewrite ↻
                </button>
              </div>
            )}
            {/* Rewrite tone picker */}
            {rewriteMode === 'pick' && (
              <div style={{ position: 'absolute', top: '-72px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px', flexWrap: 'wrap', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 8px', boxShadow: '0 4px 12px #000a', zIndex: 11, maxWidth: '400px' }}>
                {['vivid', 'concise', 'gothic', 'humorous'].map(t => (
                  <button key={t} onClick={() => rewriteSelection(t)} style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '3px', color: C.parch, cursor: 'pointer', textTransform: 'capitalize' }}>More {t}</button>
                ))}
                <input value={rewriteCustom} onChange={e => setRewriteCustom(e.target.value)} placeholder="Custom..." onKeyDown={e => e.key === 'Enter' && rewriteSelection('custom')}
                  style={{ padding: '3px 8px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '3px', color: C.parch, width: '100px', outline: 'none' }} />
                <button onClick={() => setRewriteMode(null)} style={{ padding: '3px 6px', fontSize: '10px', background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}>✕</button>
              </div>
            )}
            {/* Inline prompt (Cmd+Enter on empty line) */}
            {inlinePrompt && (
              <div style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, display: 'flex', gap: '6px', alignItems: 'center', backgroundColor: C.bgCard, border: `1px solid ${C.purple}55`, borderRadius: '6px', padding: '8px 12px', zIndex: 10 }}>
                <span style={{ fontSize: '11px', color: C.purpleLight, fontFamily: 'system-ui' }}>✦</span>
                <input value={inlinePromptText} onChange={e => setInlinePromptText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { writeFromCursor(inlinePromptText); setInlinePromptText(''); } if (e.key === 'Escape') setInlinePrompt(null); }}
                  placeholder="What happens here? (Enter to let AI decide)"
                  autoFocus
                  style={{ flex: 1, padding: '4px 8px', fontSize: '12px', fontFamily: 'Georgia,serif', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '4px', color: C.parch, outline: 'none' }} />
                <button onClick={() => setInlinePrompt(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px' }}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Story Bible sidebar */}
        {bibleOpen && (
          <div style={{ width: '280px', borderLeft: `1px solid ${C.border}`, backgroundColor: C.bgDeep, overflow: 'auto', padding: '0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '11px', fontFamily: 'system-ui', color: C.muted, letterSpacing: '0.05em' }}>{project?.title} — Story Bible</span>
              <button onClick={() => setBibleOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '14px' }}>×</button>
            </div>
            <div style={{ padding: '8px 10px' }}>
              {chars.map(c => (
                <div key={c.id} onClick={() => setExpandedChar(expandedChar === c.id ? null : c.id)}
                  style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {c.secrets && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: C.acc, flexShrink: 0 }}/>}
                    <span style={{ fontSize: '12px', color: C.parch, fontFamily: 'Georgia,serif' }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', marginTop: '2px' }}>{c.role?.slice(0, 50)}</div>
                  {expandedChar === c.id && (
                    <div style={{ marginTop: '8px', fontSize: '10px', lineHeight: '1.6', color: C.mutedLight, fontFamily: 'system-ui' }}>
                      {c.species && <div><b style={{ color: C.muted }}>Species:</b> {c.species}</div>}
                      {c.traits && <div style={{ marginTop: '4px' }}><b style={{ color: C.muted }}>Traits:</b> {c.traits}</div>}
                      {c.secrets && <div style={{ marginTop: '4px', color: C.acc }}><b>Secrets:</b> {c.secrets}</div>}
                      {c.stakes && <div style={{ marginTop: '4px' }}><b style={{ color: C.muted }}>Stakes:</b> {c.stakes}</div>}
                      {c.contradictions && <div style={{ marginTop: '4px' }}><b style={{ color: C.muted }}>Contradictions:</b> {c.contradictions}</div>}
                      {c.arc && <div style={{ marginTop: '4px' }}><b style={{ color: C.muted }}>Arc:</b> {c.arc}</div>}
                    </div>
                  )}
                </div>
              ))}
              {lore.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '12px 10px 6px', borderTop: `1px solid ${C.border}`, marginTop: '8px' }}>World Rules ({lore.length})</div>
                  {lore.slice(0, 15).map(l => (
                    <div key={l.id} style={{ fontSize: '10px', color: C.mutedLight, fontFamily: 'system-ui', padding: '4px 10px', lineHeight: '1.5' }}>
                      <span style={{ color: C.muted }}>[{l.cat}]</span> {l.rule?.slice(0, 80)}
                    </div>
                  ))}
                  {lore.length > 15 && <div style={{ fontSize: '9px', color: C.muted, padding: '4px 10px' }}>+{lore.length - 15} more rules in Story Bible tab</div>}
                </>
              )}
            </div>
          </div>
        )}
        {!bibleOpen && (
          <button onClick={() => setBibleOpen(true)}
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              writingMode: 'vertical-rl', padding: '12px 6px', fontSize: '10px', fontFamily: 'system-ui',
              backgroundColor: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '4px',
              color: C.muted, cursor: 'pointer',
            }}
          >
            Story Bible ›
          </button>
        )}
      </div>

      {/* Bottom status bar */}
      <div style={{
        height: '28px', display: 'flex', alignItems: 'center', padding: '0 16px',
        backgroundColor: C.bgDeep, borderTop: `1px solid ${C.border}`,
        fontSize: '10px', color: C.muted, fontFamily: 'system-ui', gap: '16px', flexShrink: 0,
      }}>
        <span>{currentWords} words · ch.{activeChapter + 1}</span>
        <span style={{ color: C.border }}>|</span>
        <span>Total: {totalWords} words</span>
        <span style={{ marginLeft: 'auto', color: saving ? C.purpleLight : C.muted }}>
          {saving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Auto-saves every 30s'}
        </span>
        <span style={{ color: C.border }}>|</span>
        <button onClick={() => setExportOpen(o => !o)} style={{ background: 'none', border: 'none', color: exportOpen ? C.purpleLight : C.muted, cursor: 'pointer', fontSize: '10px', fontFamily: 'system-ui', padding: '0 4px' }}>
          ↗ Export
        </button>
        <span style={{ color: C.border }}>|</span>
        <span>{readingTime} min read</span>
      </div>

      {/* Export overlay panel */}
      {exportOpen && (
        <div style={{ position: 'absolute', bottom: '28px', left: 0, right: 0, height: '200px', backgroundColor: C.bgDeep, borderTop: `1px solid ${C.border}`, zIndex: 20, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: C.purpleLight, fontFamily: 'system-ui', fontWeight: 'bold' }}>Export Manuscript</span>
            <button onClick={() => setExportOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '14px' }}>✕</button>
          </div>
          {/* Scope */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', color: C.muted, fontFamily: 'system-ui' }}>Scope:</span>
            {[['current', `Current chapter (${chapters[activeChapter]?.title})`], ['all', `All ${chapters.length} chapters`], ['range', 'Range']].map(([val, label]) => (
              <button key={val} onClick={() => setExportScope(val)}
                style={{ padding: '3px 10px', fontSize: '10px', fontFamily: 'system-ui', backgroundColor: exportScope === val ? C.purple + '33' : C.bgElevated, border: `1px solid ${exportScope === val ? C.purple + '55' : C.border}`, borderRadius: '3px', color: exportScope === val ? C.purpleLight : C.muted, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
            {exportScope === 'range' && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input type="number" min={1} max={chapters.length} value={exportRange[0]} onChange={e => setExportRange([+e.target.value, exportRange[1]])}
                  style={{ width: '40px', padding: '2px 4px', fontSize: '10px', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '3px', color: C.parch, textAlign: 'center' }} />
                <span style={{ color: C.muted, fontSize: '10px' }}>to</span>
                <input type="number" min={1} max={chapters.length} value={exportRange[1]} onChange={e => setExportRange([exportRange[0], +e.target.value])}
                  style={{ width: '40px', padding: '2px 4px', fontSize: '10px', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '3px', color: C.parch, textAlign: 'center' }} />
              </div>
            )}
          </div>
          {/* Format buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {[['txt', 'Plain Text (.txt)'], ['md', 'Markdown (.md)'], ['docx', 'Word (.docx)'], ['pdf', 'PDF (.pdf)']].map(([fmt, label]) => (
              <button key={fmt} onClick={() => doExport(fmt)} disabled={exporting}
                style={{ padding: '8px 18px', fontSize: '11px', fontFamily: 'system-ui', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '5px', color: C.parch, cursor: exporting ? 'wait' : 'pointer' }}>
                {exporting ? '...' : label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── RELATIONSHIP WEB ── */
