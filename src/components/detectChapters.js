import { genId } from "../constants.js";

export function detectAndSplitChapters(rawText, sourceName = 'unknown') {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText.split('\n');
  const markers = [];

  // Pattern 1: Explicit chapter headings with numbers
  const chapterNumRe = /^(?:chapter|ch\.?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s*[:\-–—]\s*(.+))?$/i;
  // Pattern 2: ALL CAPS standalone headings, "Part N", "Act N", "Book N", "Scene N"
  const partRe = /^(?:part|act|scene|book)\s+(\d+|[ivxlc]+)(?:\s*[:\-–—]\s*(.+))?$/i;
  const allCapsRe = /^[A-Z][A-Z\s\d:'\-–—]{4,60}$/;
  // Pattern 3: Numbered sections or scene breaks
  const numberedRe = /^(\d+)\.\s*$/;
  const breakRe = /^\s*(?:\*\s*\*\s*\*|---+|___+|\* \* \*)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let match;
    // Priority 1: "Chapter N" patterns
    match = line.match(chapterNumRe);
    if (match) {
      const num = match[1];
      const title = match[2] ? match[2].trim() : null;
      markers.push({ line: i, title: title ? `Chapter ${num}: ${title}` : `Chapter ${num}`, priority: 1 });
      continue;
    }
    // Priority 2: Part/Act/Scene/Book headings
    match = line.match(partRe);
    if (match) {
      const title = match[2] ? `${line.split(/[:\-–—]/)[0].trim()}: ${match[2].trim()}` : line;
      markers.push({ line: i, title, priority: 2 });
      continue;
    }
    // Priority 2b: ALL CAPS standalone headings (surrounded by blank lines)
    if (allCapsRe.test(line)) {
      const prevBlank = i === 0 || !lines[i - 1].trim();
      const nextBlank = i === lines.length - 1 || !lines[i + 1]?.trim();
      if (prevBlank && nextBlank) {
        // Title case it
        const title = line.split(/\s+/).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
        markers.push({ line: i, title, priority: 2 });
      }
      continue;
    }
    // Priority 3: Numbered sections "1." on own line
    match = line.match(numberedRe);
    if (match) {
      markers.push({ line: i, title: `Section ${match[1]}`, priority: 3 });
      continue;
    }
    // Priority 3b: Scene breaks (only if we already have markers)
    if (breakRe.test(line) && markers.length > 0) {
      markers.push({ line: i, title: `Scene break`, priority: 3, isBreak: true });
    }
  }

  // Filter: use only the highest-priority pattern type found
  if (markers.length > 0) {
    const bestPriority = Math.min(...markers.map(m => m.priority));
    const filtered = markers.filter(m => m.priority === bestPriority && !m.isBreak);
    if (filtered.length > 0) {
      // Build chapters from markers
      const chapters = [];
      for (let i = 0; i < filtered.length; i++) {
        const start = filtered[i].line + 1; // skip the heading line
        const end = i < filtered.length - 1 ? filtered[i + 1].line : lines.length;
        const content = lines.slice(start, end).join('\n').trim();
        chapters.push({
          id: genId(),
          title: filtered[i].title,
          text: content,
          wordCount: content.split(/\s+/).filter(Boolean).length,
          source: sourceName,
        });
      }
      return chapters;
    }
  }

  // Pattern 4: No markers found — return entire text as one chapter
  return [{
    id: genId(),
    title: 'Chapter 1',
    text: rawText.trim(),
    wordCount: rawText.trim().split(/\s+/).filter(Boolean).length,
    source: sourceName,
  }];
}

/* ── WRITING PANEL ── */
