// Phase 4b/3 — Dialogue generation for plot-critical moments.
//
// Fires after the round loop completes (so the full event log + final bond
// state is available). Selects up to MAX_DIALOGUES_PER_SIM events deserving
// dialogue (betrayal > reconciliation > broken-cooperation > plain
// cooperation/conflict), then generates each as a short 4-8 line scene
// via Claude Sonnet in parallel.
//
// Cost target: ~$0.01-0.02 × 15 cap = ~$0.15-0.30 per sim.

import { callClaude } from '../../api.js'

export const MAX_DIALOGUES_PER_SIM = 15
const DIALOGUE_MODEL       = 'claude-sonnet-4-20250514'
const DIALOGUE_MAX_TOKENS  = 400
const DIALOGUE_TEMPERATURE = 0.8

// Categories that can trigger dialogue
const DIALOGUE_TRIGGER_CATEGORIES = new Set(['cooperation', 'conflict', 'betrayal', 'death'])

// Score an event for dialogue priority. Higher = more deserving.
function scoreEventForDialogue(event, agent, target, world) {
  if (!DIALOGUE_TRIGGER_CATEGORIES.has(event.category)) return 0

  const bond = agent?.bonds?.[target?.id]
  const reverseBond = target?.bonds?.[agent?.id]

  let score = 0
  // Both must be bound chars OR one bound + one recurring NPC with high bond
  const bothBound = agent?.source === 'bound' && target?.source === 'bound'
  const boundPlusRecurring = (agent?.source === 'bound' || target?.source === 'bound') &&
    ((bond?.intensity ?? 0) > 0.5 || (reverseBond?.intensity ?? 0) > 0.5)
  if (!bothBound && !boundPlusRecurring) return 0

  // Base score by category
  if (event.category === 'betrayal')    score += 100
  if (event.category === 'death')       score += 80
  if (event.category === 'conflict')    score += 50
  if (event.category === 'cooperation') score += 30

  // Bond-aware multipliers
  if (bond) {
    // Betrayal between bonded chars: highest priority
    if (event.category === 'betrayal' && bond.intensity > 0.3) score += 40
    // Conflict between previously-cooperating bonded chars
    if (event.category === 'conflict' && bond.type === 'friendship') score += 30
    if (event.category === 'conflict' && (bond.type === 'love' || bond.type === 'kinship')) score += 50
    // Cooperation between previously-conflicted chars (reconciliation)
    if (event.category === 'cooperation' && (bond.type === 'rivalry' || bond.type === 'enmity')) score += 60
    if (event.category === 'cooperation' && bond.trust < -0.3) score += 30
  }

  // Both bound = bonus
  if (bothBound) score += 20

  return score
}

// Public: pick top N events for dialogue.
// Returns array of { event, participants: [agent, target], score }.
export function selectDialogueCandidates(events, agentById, alreadyGenerated = 0) {
  const budget = MAX_DIALOGUES_PER_SIM - alreadyGenerated
  if (budget <= 0) return []

  const scored = []
  for (const ev of events) {
    if (!DIALOGUE_TRIGGER_CATEGORIES.has(ev.category)) continue
    if (!ev.targetId) continue
    const agent  = agentById[ev.agentId]
    const target = agentById[ev.targetId]
    if (!agent || !target) continue
    const score = scoreEventForDialogue(ev, agent, target, null)
    if (score === 0) continue
    scored.push({ event: ev, participants: [agent, target], score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, budget)
}

// ── Dialogue prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are writing brief dialogue scenes for a fiction simulation. Each scene is 4-8 lines of dialogue between two characters at a charged moment — a betrayal, a fight, a reconciliation, a parting.

Honor what each character knows and doesn't know — they may speak past each other, lie, reveal partial truths, or misunderstand each other. The asymmetry IS the drama.

Do NOT narrate. Do NOT add stage directions in parentheses. Just dialogue with NAME: prefixes. Keep lines short (one to two sentences each).

Return ONLY a JSON object, no preamble:

{
  "dialogue": [
    {"speaker": "<NAME>", "line": "<the line they speak>"},
    {"speaker": "<NAME>", "line": "<the next line>"}
  ]
}`

function describeKnowledgeAbout(viewer, subject) {
  // Their Knowledge entries that reference the other party by name in content
  const subjectName = subject?.name?.toLowerCase() || ''
  if (!subjectName) return null
  const entries = (viewer.knownFacts || []).filter(k =>
    k.content?.toLowerCase().includes(subjectName)
  )
  if (entries.length === 0) return null
  // Most recent + highest confidence
  entries.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  return entries[0]
}

// Generate dialogue for one event. Returns { id, round, eventId, participants,
// lines, category, generationCost, usage } or null on failure.
export async function generateDialogue({ event, participants, agentById, simId, dialogueIdx }) {
  const [a, b] = participants
  const bondAB = a.bonds?.[b.id]
  const bondBA = b.bonds?.[a.id]
  const aKnowledgeOfB = describeKnowledgeAbout(a, b)
  const bKnowledgeOfA = describeKnowledgeAbout(b, a)

  const userContent =
    `Two characters at a charged moment in a fiction simulation.\n\n` +
    `${a.name}:\n` +
    `  traits: ${(a.traits || []).slice(0, 5).join(', ') || '—'}\n` +
    `  values: ${(a.values || []).slice(0, 3).join(', ') || '—'}\n` +
    `  fears: ${(a.fears || []).slice(0, 3).join(', ') || '—'}\n` +
    `  current needs (lower=more desperate): ${JSON.stringify(a.needs)}\n` +
    `  ${a.name}'s view of ${b.name}: bond type ${bondAB?.type || 'unknown'}, intensity ${(bondAB?.intensity ?? 0).toFixed(2)}, trust ${(bondAB?.trust ?? 0).toFixed(2)}\n` +
    `  what ${a.name} thinks they know about ${b.name}: ${aKnowledgeOfB ? `"${aKnowledgeOfB.content}" (confidence ${aKnowledgeOfB.confidence?.toFixed(2)})` : 'no specific knowledge'}\n\n` +
    `${b.name}:\n` +
    `  traits: ${(b.traits || []).slice(0, 5).join(', ') || '—'}\n` +
    `  values: ${(b.values || []).slice(0, 3).join(', ') || '—'}\n` +
    `  fears: ${(b.fears || []).slice(0, 3).join(', ') || '—'}\n` +
    `  current needs: ${JSON.stringify(b.needs)}\n` +
    `  ${b.name}'s view of ${a.name}: bond type ${bondBA?.type || 'unknown'}, intensity ${(bondBA?.intensity ?? 0).toFixed(2)}, trust ${(bondBA?.trust ?? 0).toFixed(2)}\n` +
    `  what ${b.name} thinks they know about ${a.name}: ${bKnowledgeOfA ? `"${bKnowledgeOfA.content}" (confidence ${bKnowledgeOfA.confidence?.toFixed(2)})` : 'no specific knowledge'}\n\n` +
    `The moment: round ${event.round}, ${event.category}: "${event.content}"\n\n` +
    `Generate a brief 4-8 line dialogue scene between ${a.name} and ${b.name} in this moment. Honor the asymmetry of what each knows. Return JSON only.`

  let res
  try {
    res = await callClaude({
      model:       DIALOGUE_MODEL,
      max_tokens:  DIALOGUE_MAX_TOKENS,
      temperature: DIALOGUE_TEMPERATURE,
      system:      SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    return null
  }
  if (res?.error) return null
  const raw = res?.content?.[0]?.text || ''
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, '').trim()
  let parsed
  try { parsed = JSON.parse(cleaned) }
  catch { return null }
  if (!Array.isArray(parsed.dialogue) || parsed.dialogue.length === 0) return null

  const usage = res?.usage || null
  const cost  = usage
    ? ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000
    : 0

  return {
    id:             `dlg_${dialogueIdx}`,
    round:          event.round,
    eventId:        event.id,
    eventCategory:  event.category,
    eventContent:   event.content,
    participants:   participants.map(p => ({ agentId: p.id, name: p.name })),
    lines:          parsed.dialogue,
    generationCost: cost,
    usage,
  }
}

// Generate all candidates in parallel. Returns array of dialogue objects.
export async function generateDialogues({ candidates, agentById, simId = '' }) {
  if (!candidates || candidates.length === 0) return []
  const results = await Promise.all(
    candidates.map((c, i) => generateDialogue({
      event:        c.event,
      participants: c.participants,
      agentById,
      simId,
      dialogueIdx:  i,
    }))
  )
  return results.filter(Boolean)
}
