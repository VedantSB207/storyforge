// Phase 3 — distortion
// How information changes as it travels between agents.
//
// Two modes:
//   A) Trait-based  — deterministic, free, used for the vast majority
//   B) LLM-based    — Claude Sonnet 4 call, capped at 5/round and 100/sim
//
// The trait-based grammar is a hop-count degradation ladder applied to
// the variable parts of canned event content (names, ages, needs).
// Hash-driven so the same transmitter→receiver pair produces the same
// distortion (deterministic per simulation seed).
//
// Phase 1/2 emit three event categories:
//   aging         — "{name} is now {year}."
//   need_critical — "{name} is becoming desperate for {need}."
//   death         — "{name} died at age {ageStr}."
//
// We parse out the variable slots, degrade them by hop, then re-emit.

import { callClaude } from '../../api.js'

// Tiny FNV-1a hash → 32-bit non-negative int. Deterministic.
function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

// ── Degradation ladders ─────────────────────────────────────────────────────
// Hop 0 = original. Hop 1 = first paraphrase. Hop 2 = vague. Hop 3 = barely
// recognisable. The ladder index is `Math.min(hops, ladder.length - 1)`.

// Name → role → kind → "someone".
function degradeName(name, kindHint, hops) {
  if (hops <= 0) return name
  const ladder = [
    name,
    kindHint ? `the ${kindHint.toLowerCase()}` : 'someone',
    kindHint ? `some kind of ${genericFromKind(kindHint).toLowerCase()}` : 'someone',
    'someone',
  ]
  const idx = Math.min(hops, ladder.length - 1)
  return ladder[idx]
}

function genericFromKind(kind) {
  const k = (kind || '').toLowerCase()
  if (/dog|cat|wolf|owl|snake|chameleon|bird|fox|deer|fish|animal/.test(k)) return 'animal'
  if (/vampire|werewolf|witch|sage|troll|fairy|goblin|spirit|undead|dragon/.test(k)) return 'creature'
  if (/human|assassin|sage|monk|knight|king|queen/.test(k)) return 'person'
  return 'being'
}

// "26.1" → "around 26" → "old" → "ancient".
function degradeAge(ageStr, hops) {
  const ladder = [
    ageStr,
    `around ${Math.round(parseFloat(ageStr))}`,
    'old',
    'ancient',
  ]
  return ladder[Math.min(hops, ladder.length - 1)]
}

function degradeYear(yearStr, hops) {
  const ladder = [yearStr, `around ${yearStr}`, 'a long time', 'an age']
  return ladder[Math.min(hops, ladder.length - 1)]
}

// Need-string degradation: physiological → hunger → suffering → trouble.
function degradeNeed(need, hops) {
  const map = {
    physiological: ['food and shelter', 'hunger', 'suffering', 'something'],
    safety:        ['safety',           'fear',    'danger',    'something'],
    belonging:     ['companionship',    'loneliness', 'absence',  'something'],
    esteem:        ['recognition',      'pride',   'shame',     'something'],
    purpose:       ['purpose',          'doubt',   'emptiness', 'something'],
  }
  const ladder = map[need] || ['something', 'a need', 'something', 'something']
  return ladder[Math.min(hops, ladder.length - 1)]
}

// ── Parse event content back into slots ─────────────────────────────────────
function parseEvent(event, transmitter) {
  const category = event.category
  const name = event.agentName || transmitter?.name || 'someone'
  let detail = null
  const text = event.content || ''
  if (category === 'death') {
    const m = text.match(/at age ([\d.]+)/)
    detail = m ? m[1] : 'unknown'
  } else if (category === 'need_critical') {
    const m = text.match(/desperate for (\w+)/)
    detail = m ? m[1] : 'something'
  } else if (category === 'aging') {
    const m = text.match(/is now (\d+)/)
    detail = m ? m[1] : 'older'
  }
  return { category, name, detail }
}

// Rebuild a sentence from slots at given hop count.
function emitDistorted(slots, hops, kindHint) {
  const { category, name, detail } = slots
  const dName = degradeName(name, kindHint, hops)
  if (category === 'death') {
    const dAge = degradeAge(detail, hops)
    if (hops >= 3)      return `${cap(dName)} fell.`
    if (hops === 2)     return `Word came that ${dName} died, ${dAge}.`
    if (hops === 1)     return `${cap(dName)} has died, ${dAge}.`
    return `${cap(dName)} died at age ${dAge}.`
  }
  if (category === 'need_critical') {
    const dNeed = degradeNeed(detail, hops)
    if (hops >= 3)      return `${cap(dName)} is in trouble.`
    if (hops === 2)     return `${cap(dName)} struggles with ${dNeed}.`
    if (hops === 1)     return `${cap(dName)} is fighting ${dNeed}.`
    return `${cap(dName)} is becoming desperate for ${dNeed}.`
  }
  if (category === 'aging') {
    const dYear = degradeYear(detail, hops)
    if (hops >= 2)      return `${cap(dName)} grew older.`
    if (hops === 1)     return `${cap(dName)} reached ${dYear} years.`
    return `${cap(dName)} is now ${dYear}.`
  }
  return `${cap(dName)} did something.`
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// ── Trait-based distortion (free) ───────────────────────────────────────────
// Returns { content, mode, hops }. Caller computes hop count.
export function distortEventTraitBased(event, transmitter, receiver, hops) {
  // Hash mixes transmitter+receiver+event so the same pair produces the same
  // distortion every run (deterministic given a stable seed).
  const _h = hash([
    transmitter?.id || '_',
    receiver?.id || '_',
    event.id || event.content,
  ].join('|'))
  const slots = parseEvent(event, transmitter)
  const kindHint = (event.originAgentGenreTag || event.agentGenreTag || '').split(':')[1] || ''
  const content = emitDistorted(slots, hops, kindHint)
  return { content, mode: 'trait', hops }
}

// ── Decide whether to spend an LLM call on this hop ─────────────────────────
export function shouldUseLLM(event, transmitter, receiver, hops, llmCallsThisRound, llmCallsTotal, maxPerRound, maxPerSim) {
  if (llmCallsThisRound >= maxPerRound) return false
  if (llmCallsTotal     >= maxPerSim)   return false
  if (hops > 2) return false
  const bound = transmitter?.source === 'bound' || receiver?.source === 'bound' || event.originBound === true
  const plotCritical = event.category === 'death' && event.originBound === true
  return bound || plotCritical
}

// ── LLM-based distortion (Claude call, costs money) ─────────────────────────
const SYSTEM_PROMPT = `You are simulating how rumours distort as they pass between people. An event happened. It is being passed from one party to another. Return a single-sentence distorted version of the event from the receiver's perspective — preserve significance but lose, shift, or invent detail consistent with their traits and biases. Return ONLY the distorted sentence, no preamble or quotation marks.`

export async function distortEventLLM(event, transmitter, receiver, hops) {
  const transmitterDesc = describeAgent(transmitter)
  const receiverDesc    = describeAgent(receiver)
  const userContent =
    `Event: "${event.content}"\n\n` +
    `Transmitter: ${transmitterDesc}\n` +
    `Receiver: ${receiverDesc}\n\n` +
    `Hops from origin so far: ${hops}.\n` +
    `Return a single-sentence distorted version of this event as the receiver would now describe it.`
  let response
  try {
    response = await callClaude({
      model:       'claude-sonnet-4-20250514',
      max_tokens:  150,
      temperature: 0.7,
      system:      SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: userContent }],
    })
  } catch (err) {
    return { ...distortEventTraitBased(event, transmitter, receiver, hops), mode: 'trait_fallback', error: err.message }
  }
  const raw = response?.content?.[0]?.text || ''
  const cleaned = raw.replace(/^["']|["']$/g, '').trim() || distortEventTraitBased(event, transmitter, receiver, hops).content
  return {
    content: cleaned,
    mode: 'llm',
    hops,
    usage: response?.usage || null,
  }
}

function describeAgent(a) {
  if (!a) return 'unknown'
  const traits = (a.traits || []).slice(0, 3).join(', ')
  const genre = a.genreTag || (a.source === 'bound' ? 'bound character' : 'unknown')
  return `${a.name} (${genre}${traits ? `; ${traits}` : ''})`
}

export const _internal = {
  hash,
  parseEvent,
  emitDistorted,
  degradeName,
  degradeAge,
  degradeNeed,
  degradeYear,
}
