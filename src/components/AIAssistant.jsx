import { useState, useRef, useEffect } from "react";
import { callClaude } from "../api.js";
import { C } from "../constants.js";

export function AIAssistant({ open, onClose, project, chars, lore, currentTab }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('general');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const MODES = [
    { id: 'general',     label: 'Assistant',    color: C.purpleLight, desc: 'General story help' },
    { id: 'continuity',  label: 'Continuity',   color: C.gold,        desc: 'Check for plot holes & contradictions' },
    { id: 'character',   label: 'Characters',   color: C.accBright,   desc: 'Develop & analyse characters' },
    { id: 'plot',        label: 'Plot',         color: C.teal,        desc: 'Next beats, structure, pacing' },
    { id: 'voice',       label: 'Voice',        color: C.green,       desc: 'Tone, style & prose feedback' },
    { id: 'production',  label: 'Production',   color: C.blue,        desc: 'Adaptation, comic, film, show' },
  ];

  const QUICK = {
    general:    ["What's the most interesting unexplored thread in my story?", "Give me 3 story directions I haven't considered", "What is this story actually about beneath the surface?"],
    continuity: ["Check for contradictions in my world rules", "Which character arcs are unresolved?", "What did I promise the reader that I haven't paid off yet?"],
    character:  ["Which character is the most underdeveloped?", "How would my characters react if they all met at once?", "What secret would create the most narrative tension?"],
    plot:       ["What should happen in the next chapter?", "Where is the midpoint crisis of this story?", "How do I raise the stakes without changing the genre?"],
    voice:      ["What tone am I writing in and is it consistent?", "What's the Sedaris 'ugly detail' I'm avoiding in this story?", "Where does my prose lose momentum?"],
    production: ["How would this story work as a comic series?", "What's the pitch for a short film version?", "Which scenes would be most visually striking on screen?"],
  };

  const buildContext = () => {
    const parts = [`PROJECT: "${project?.title || 'Untitled'}"${project?.genre ? ` (${project.genre})` : ''}`];
    if (chars.length > 0) {
      parts.push('\nCHARACTERS:\n' + chars.map(c =>
        [`• ${c.name}${c.species ? ` (${c.species})` : ''}${c.role ? ` — ${c.role}` : ''}`,
         c.traits        ? `  Traits: ${c.traits}` : '',
         c.stakes        ? `  Stakes: ${c.stakes}` : '',
         c.secrets       ? `  Secrets: ${c.secrets}` : '',
         c.contradictions? `  Contradictions: ${c.contradictions}` : '',
        ].filter(Boolean).join('\n')
      ).join('\n\n'));
    }
    if (lore.length > 0) {
      parts.push('\nWORLD RULES:\n' + lore.map(r => `[${r.cat}] ${r.rule}`).join('\n'));
    }
    parts.push(`\nWriter is currently on the "${currentTab}" tab.`);
    return parts.join('\n');
  };

  const SYSTEM = {
    general: `You are the StoryForge AI — a master narrative assistant embedded inside a writer's production tool. You have full access to the writer's project data below. You are a creative collaborator, not a yes-machine. Be direct, specific, and intellectually honest. Push back when the writer is taking the easy path. Draw on craft principles from Amy Tan, Salman Rushdie, David Sedaris, Judy Blume, and Margaret Atwood where relevant — but never lecture. Keep responses focused and under 250 words unless the writer explicitly asks for more.`,
    continuity: `You are a continuity editor embedded in StoryForge. Your job is to find contradictions, broken promises, unresolved threads, and logical inconsistencies in the writer's story. Be precise — cite specific details. Don't soften findings. A story that contradicts itself loses the reader permanently. Under 200 words per response.`,
    character: `You are a character analyst and development coach embedded in StoryForge. You know each character's traits, secrets, contradictions, and stakes. Your job is to find underdevelopment, inconsistencies in how characters are written, and opportunities for deeper characterisation. Judy Blume's test: how would this character defy your expectations? LeVar Burton's test: what does this character stand to lose? Use these frameworks actively. Under 200 words.`,
    plot: `You are a story architect embedded in StoryForge. You understand plot structure, pacing, tension, and narrative momentum. Your job is to help the writer make the next right story decision — not the safe one, the right one. Be concrete: name specific scenes, specific beats, specific reversals. Under 200 words.`,
    voice: `You are a prose and voice editor embedded in StoryForge. You understand tone, style, rhythm, and the difference between writing that pulls readers forward and writing that loses them. Sedaris's ugly detail test applies here: what is the writer protecting themselves from saying? Under 200 words.`,
    production: `You are a production consultant embedded in StoryForge — thinking about how this story moves from manuscript to comic, short film, TV series, or feature film. You think about visual storytelling, adaptation decisions, what translates to screen and what doesn't, and what makes a compelling pitch. Under 250 words.`,
  };

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);
    try {
      const ctx = buildContext();
      const data = await callClaude({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: `${SYSTEM[mode] || SYSTEM.general}\n\nPROJECT CONTEXT:\n${ctx}`,
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        });
      const reply = data.content?.[0]?.text || 'No response.';
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setLoading(false);
  };

  const activeMode = MODES.find(m => m.id === mode);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: open ? '360px' : '0',
      backgroundColor: C.bgDeep, borderLeft: `1px solid ${open ? C.border : 'transparent'}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s ease', overflow: 'hidden', zIndex: 100,
      boxShadow: open ? '-4px 0 24px #00000055' : 'none',
    }}>
      {open && <>
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '22px', height: '22px', backgroundColor: C.purple, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff' }}>✦</div>
            <span style={{ fontSize: '13px', color: C.parch, fontFamily: 'system-ui', fontWeight: 500 }}>Story AI</span>
            <span style={{ fontSize: '10px', color: activeMode.color, fontFamily: 'system-ui', backgroundColor: activeMode.color + '22', padding: '1px 7px', borderRadius: '8px' }}>{activeMode.label}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '10px', fontFamily: 'system-ui', padding: '2px 6px' }}>clear</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px' }}>×</button>
          </div>
        </div>

        {/* Mode pills */}
        <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} title={m.desc}
              style={{ padding: '3px 9px', backgroundColor: mode === m.id ? m.color + '33' : 'transparent', color: mode === m.id ? m.color : C.muted, border: `1px solid ${mode === m.id ? m.color + '66' : C.border}`, borderRadius: '10px', fontSize: '10px', cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Empty state with quick actions */}
          {messages.length === 0 && (
            <div>
              <div style={{ fontSize: '11px', color: C.muted, fontFamily: 'system-ui', fontStyle: 'italic', marginBottom: '14px', lineHeight: '1.6' }}>
                {chars.length > 0
                  ? `I know your ${chars.length} character${chars.length > 1 ? 's' : ''}, ${lore.length} world rule${lore.length !== 1 ? 's' : ''}, and your current project. Ask me anything.`
                  : 'Add characters and world rules to the Story Bible to unlock context-aware advice.'}
              </div>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Quick questions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(QUICK[mode] || QUICK.general).map((q, i) => (
                  <button key={i} onClick={() => send(q)}
                    style={{ padding: '8px 10px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '5px', color: C.mutedLight, fontSize: '11px', cursor: 'pointer', fontFamily: 'Georgia,serif', fontStyle: 'italic', textAlign: 'left', lineHeight: '1.4' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: m.role === 'assistant' ? '2px' : 0, paddingRight: m.role === 'user' ? '2px' : 0 }}>
                {m.role === 'user' ? 'You' : 'Story AI'}
              </div>
              <div style={{
                maxWidth: '92%', padding: '10px 12px', borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                backgroundColor: m.role === 'user' ? C.purple + '33' : C.bgCard,
                border: `1px solid ${m.role === 'user' ? C.purple + '55' : C.border}`,
                fontSize: '12px', color: C.parch, lineHeight: '1.75', fontFamily: 'Georgia,serif',
              }}>
                {m.content.split('\n').map((line, j) => {
                  const bold = line.match(/^\*\*(.*?)\*\*(.*)$/);
                  if (bold) return <div key={j} style={{ fontWeight: 'bold', color: activeMode.color, marginBottom: '3px', fontFamily: 'system-ui', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bold[1]}{bold[2]}</div>;
                  return line.trim() ? <p key={j} style={{ margin: '0 0 6px 0' }}>{line}</p> : null;
                })}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '2px' }}>Story AI</div>
              <div style={{ padding: '10px 14px', borderRadius: '10px 10px 10px 2px', backgroundColor: C.bgCard, border: `1px solid ${C.border}`, display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: C.purple, opacity: 0.7,
                    animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Ask about ${activeMode.desc.toLowerCase()}...`}
              rows={2}
              style={{ flex: 1, padding: '8px 10px', backgroundColor: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: '6px', color: C.parch, fontSize: '12px', outline: 'none', fontFamily: 'Georgia,serif', resize: 'none', lineHeight: '1.5' }} />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              style={{ width: '36px', height: '36px', backgroundColor: input.trim() && !loading ? C.purple : C.tagBg, color: input.trim() && !loading ? '#fff' : C.muted, border: 'none', borderRadius: '6px', fontSize: '14px', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↑</button>
          </div>
          <div style={{ fontSize: '9px', color: C.muted, fontFamily: 'system-ui', marginTop: '5px' }}>Enter to send · Shift+Enter for new line</div>
        </div>

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-5px); }
          }
        `}</style>
      </>}
    </div>
  );
}

/* ── API KEY SETUP SCREEN ── */
