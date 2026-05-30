// Phase 7/7a — Character Questionnaire
//
// Enneagram-led, no LLM. ~10 questions tally per-type scores. After the
// last question, the highest-scoring type wins; the second-highest among
// the two adjacent types becomes the wing. Two final questions pin the
// health level + attachment style.
//
// The scoring table below is a pragmatic mapping, not a clinically
// validated instrument — it should land the writer near the right area
// for a few clarifying tweaks in PsychologyReview.

import { useState } from 'react'
import { C } from '../../constants.js'
import { mapEnneagramToProfile } from './enneagramMapper.js'
import { ATTACHMENT_STYLES, normaliseProfile } from './psychologySchema.js'
import { tallyScores, pickTypeAndWing, scoreQuestionnaireAnswers } from './questionnaireScoring.js'

// Re-export for backwards compatibility with existing imports.
export { scoreQuestionnaireAnswers }

// Each option is `{ label, scores: { typeNum: weight, ... } }`.
// Weights can be negative to nudge away from a type.
// Question wording aims at behavior rather than vocabulary.
const ENNEAGRAM_QUESTIONS = [
  {
    q: 'When something feels wrong, this character…',
    options: [
      { label: 'Calls it out and tries to fix it immediately.',                  scores: { 1: 3, 8: 1 } },
      { label: 'Quietly offers to help whoever is suffering most.',              scores: { 2: 3, 9: 1 } },
      { label: 'Reorganises until the result looks impressive.',                 scores: { 3: 3 } },
      { label: 'Withdraws and feels everything more intensely than anyone else.', scores: { 4: 3, 5: 1 } },
      { label: 'Studies the situation from a distance before reacting.',         scores: { 5: 3 } },
      { label: 'Checks with their trusted people before deciding.',              scores: { 6: 3 } },
      { label: 'Looks for the bright side or a way out.',                        scores: { 7: 3 } },
      { label: 'Confronts whoever caused it, head-on.',                          scores: { 8: 3 } },
      { label: 'Tries to keep the peace and not make things worse.',             scores: { 9: 3 } },
    ],
  },
  {
    q: 'Their biggest fear is…',
    options: [
      { label: 'Being corrupt, defective, or wrong.',           scores: { 1: 3 } },
      { label: 'Being unloved or unwanted.',                    scores: { 2: 3, 4: 1 } },
      { label: 'Being worthless without achievement.',          scores: { 3: 3 } },
      { label: 'Having no identity or significance.',           scores: { 4: 3 } },
      { label: 'Being helpless, useless, or overwhelmed.',      scores: { 5: 3 } },
      { label: 'Being without support or guidance.',            scores: { 6: 3 } },
      { label: 'Being trapped in pain or deprivation.',         scores: { 7: 3 } },
      { label: 'Being controlled or violated by others.',       scores: { 8: 3 } },
      { label: 'Losing connection or being cut off from others.', scores: { 9: 3, 2: 1 } },
    ],
  },
  {
    q: 'Under stress, this character tends to…',
    options: [
      { label: 'Become rigid and resentful.',                   scores: { 1: 3 } },
      { label: 'Become demanding or possessive.',               scores: { 2: 3 } },
      { label: 'Become cynical and detached.',                  scores: { 3: 2, 5: 1, 9: 1 } },
      { label: 'Become moody and self-absorbed.',               scores: { 4: 3 } },
      { label: 'Withdraw further into thought or solitude.',    scores: { 5: 3 } },
      { label: 'Become anxious and over-vigilant.',             scores: { 6: 3 } },
      { label: 'Become scattered or impulsive.',                scores: { 7: 3 } },
      { label: 'Become dominating or vengeful.',                scores: { 8: 3 } },
      { label: 'Become passive or disappear.',                  scores: { 9: 3 } },
    ],
  },
  {
    q: 'They prefer to relate to others by…',
    options: [
      { label: 'Setting standards and modeling the right way.', scores: { 1: 3 } },
      { label: 'Anticipating needs and giving care.',           scores: { 2: 3 } },
      { label: 'Inspiring admiration and ambition.',            scores: { 3: 3 } },
      { label: 'Sharing deep, distinctive emotional truth.',    scores: { 4: 3 } },
      { label: 'Sharing insight and analysis, sparingly.',      scores: { 5: 3 } },
      { label: 'Building loyalty and reliability.',             scores: { 6: 3 } },
      { label: 'Bringing energy, fun, and options.',            scores: { 7: 3 } },
      { label: 'Protecting and challenging.',                   scores: { 8: 3 } },
      { label: 'Being calm and accepting.',                     scores: { 9: 3 } },
    ],
  },
  {
    q: 'When stakes rise, they typically…',
    options: [
      { label: 'Double down on principles and the plan.',       scores: { 1: 2, 6: 1 } },
      { label: 'Look for who needs help and pull them in.',     scores: { 2: 2, 9: 1 } },
      { label: 'Outperform — find the win, become it.',         scores: { 3: 3 } },
      { label: 'Withdraw to process before acting.',            scores: { 4: 2, 5: 2 } },
      { label: 'Brace, plan, and seek backup.',                 scores: { 6: 3 } },
      { label: 'Improvise — keep moving, keep options open.',   scores: { 7: 3 } },
      { label: 'Take charge by force of will.',                 scores: { 8: 3 } },
      { label: 'Try to lower the temperature for everyone.',    scores: { 9: 3 } },
    ],
  },
  {
    q: 'Their work or art tends to be…',
    options: [
      { label: 'Carefully crafted, ethically driven.',          scores: { 1: 3 } },
      { label: 'Centered on people and feelings.',              scores: { 2: 2, 4: 1, 9: 1 } },
      { label: 'Polished, status-conscious, success-shaped.',   scores: { 3: 3 } },
      { label: 'Original, melancholy, uniquely theirs.',        scores: { 4: 3 } },
      { label: 'Deep, technical, ideas-first.',                 scores: { 5: 3 } },
      { label: 'Reliable, community-oriented.',                 scores: { 6: 2, 9: 1 } },
      { label: 'Playful, varied, broad in interest.',           scores: { 7: 3 } },
      { label: 'Direct, powerful, unflinching.',                scores: { 8: 3 } },
      { label: 'Patient, harmonious, easy to be around.',       scores: { 9: 3 } },
    ],
  },
  {
    q: 'They are most easily wounded by…',
    options: [
      { label: 'Being called unjust or hypocritical.',          scores: { 1: 3 } },
      { label: 'Being rejected after giving so much.',          scores: { 2: 3 } },
      { label: 'Being seen as a failure or fake.',              scores: { 3: 3 } },
      { label: 'Being overlooked or treated as ordinary.',      scores: { 4: 3 } },
      { label: 'Being intruded on or expected to perform.',     scores: { 5: 3 } },
      { label: 'Being betrayed by trusted people.',             scores: { 6: 3 } },
      { label: 'Being trapped, bored, or denied.',              scores: { 7: 3 } },
      { label: 'Being shown weakness or controlled.',           scores: { 8: 3 } },
      { label: 'Being forced into conflict.',                   scores: { 9: 3 } },
    ],
  },
  {
    q: 'In a group, others typically see them as…',
    options: [
      { label: 'The conscience — sometimes the scold.',         scores: { 1: 3 } },
      { label: 'The helper — sometimes overbearing.',           scores: { 2: 3 } },
      { label: 'The star — sometimes the actor.',               scores: { 3: 3 } },
      { label: 'The artist — sometimes the dramatist.',         scores: { 4: 3 } },
      { label: 'The expert — sometimes the recluse.',           scores: { 5: 3 } },
      { label: 'The deputy — sometimes the worrier.',           scores: { 6: 3 } },
      { label: 'The spark — sometimes the runner.',             scores: { 7: 3 } },
      { label: 'The protector — sometimes the bully.',          scores: { 8: 3 } },
      { label: 'The mediator — sometimes the ghost.',           scores: { 9: 3 } },
    ],
  },
  {
    q: 'When they fall in love or form deep loyalty, it shows up as…',
    options: [
      { label: 'Steadfast commitment and high standards.',      scores: { 1: 2, 6: 1 } },
      { label: 'Constant care, sometimes smothering.',          scores: { 2: 3 } },
      { label: 'Pride in their partner; want them to shine.',   scores: { 3: 3 } },
      { label: 'Aching intensity; idealisation then disappointment.', scores: { 4: 3 } },
      { label: 'Quiet trust and shared private worlds.',        scores: { 5: 3 } },
      { label: 'Fierce loyalty; would die for chosen people.',  scores: { 6: 2, 8: 2 } },
      { label: 'Adventure, fun, plans for the future.',         scores: { 7: 3 } },
      { label: 'Protective, sometimes possessive.',             scores: { 8: 3 } },
      { label: 'Easygoing presence; agreeing too much.',        scores: { 9: 3 } },
    ],
  },
  {
    q: 'Their secret strength — the thing they are quietly best at — is…',
    options: [
      { label: 'Making things better, with discipline.',        scores: { 1: 3 } },
      { label: 'Reading what others need before they ask.',     scores: { 2: 3 } },
      { label: 'Performing under pressure.',                    scores: { 3: 3 } },
      { label: 'Seeing beauty and meaning others miss.',        scores: { 4: 3 } },
      { label: 'Going deeper than anyone else into a problem.', scores: { 5: 3 } },
      { label: 'Spotting risks early and preparing for them.',  scores: { 6: 3 } },
      { label: 'Finding the next possibility, fast.',           scores: { 7: 3 } },
      { label: 'Acting without flinching when others freeze.',  scores: { 8: 3 } },
      { label: 'Bringing peace into a room of chaos.',          scores: { 9: 3 } },
    ],
  },
]

// Health-level question (single)
const HEALTH_QUESTION = {
  q: 'When they hit a real crisis, you most expect them to…',
  options: [
    { label: 'Find their best self — integrate, lead, heal.',  level: 2 },
    { label: 'Cope steadily, with the usual flaws.',           level: 5 },
    { label: 'Get worse — fall into their worst patterns.',    level: 8 },
  ],
}

// Attachment-style question (single)
const ATTACHMENT_QUESTION = {
  q: 'In close relationships, this character is most often…',
  options: [
    { label: 'Trusting and comfortable with closeness and independence.', value: 'secure' },
    { label: 'Worried about being abandoned; needs reassurance.',         value: 'anxious' },
    { label: 'Self-reliant; keeps emotional distance.',                   value: 'avoidant' },
    { label: 'Wants closeness but distrusts it; pulls in and pushes away.', value: 'fearful' },
  ],
}

// Pure-logic helpers (tallyScores, pickTypeAndWing, scoreQuestionnaireAnswers)
// live in questionnaireScoring.js so they can be imported by Node-side tests
// without parsing this .jsx component.

// ── Component ───────────────────────────────────────────────────────────
// onComplete(profile) — called with the normalised profile when the writer
// finishes the questionnaire. The parent typically routes to PsychologyReview.
export function CharacterQuestionnaire({ characterName, onComplete, onCancel }) {
  const total = ENNEAGRAM_QUESTIONS.length + 2   // + health + attachment
  const [stepIdx, setStepIdx]       = useState(0)
  const [answers, setAnswers]       = useState([])     // per-question option refs (Enneagram qs)
  const [healthLevel, setHealthLevel] = useState(null)
  const [attachment, setAttachment]   = useState(null)

  const onEnneagram = stepIdx < ENNEAGRAM_QUESTIONS.length
  const onHealth    = stepIdx === ENNEAGRAM_QUESTIONS.length
  const onAttach    = stepIdx === ENNEAGRAM_QUESTIONS.length + 1
  const done        = stepIdx >= total

  if (done) {
    // Compute profile, fire onComplete once.
    const scores = tallyScores(answers)
    const { type, wing } = pickTypeAndWing(scores)
    const health = healthLevel ?? 5
    const derived = mapEnneagramToProfile({ type, wing, healthLevel: health })
    const finalProfile = normaliseProfile({
      enneagram: { type, wing, healthLevel: health },
      bigFive: derived.bigFive,
      attachment: attachment || derived.attachment,
      markers: derived.markers,
      source: 'questionnaire',
      reasoning: null,
      profileHash: null,
      inferredAt: new Date().toISOString(),
    })
    // Defer to the next tick so React state isn't mutated mid-render.
    setTimeout(() => onComplete?.(finalProfile, scores), 0)
    return null
  }

  const handlePick = (option) => {
    if (onEnneagram) {
      setAnswers(prev => [...prev, option])
      setStepIdx(s => s + 1)
    } else if (onHealth) {
      setHealthLevel(option.level)
      setStepIdx(s => s + 1)
    } else if (onAttach) {
      setAttachment(option.value)
      setStepIdx(s => s + 1)
    }
  }

  const goBack = () => {
    if (stepIdx === 0) return
    if (onAttach) { setAttachment(null); setStepIdx(s => s - 1); return }
    if (onHealth) { setHealthLevel(null); setStepIdx(s => s - 1); return }
    setAnswers(prev => prev.slice(0, -1))
    setStepIdx(s => s - 1)
  }

  const cur = onEnneagram ? ENNEAGRAM_QUESTIONS[stepIdx]
            : onHealth    ? HEALTH_QUESTION
            : ATTACHMENT_QUESTION
  const progress = Math.round((stepIdx / total) * 100)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 28px', fontFamily: 'Georgia,serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: C.purpleLight, fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Psychology · {characterName || 'New character'}
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'system-ui' }}>
          Question {stepIdx + 1} of {total}
        </div>
      </div>
      <div style={{ height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ width: `${progress}%`, height: '100%', backgroundColor: C.purple, transition: 'width 0.2s ease' }} />
      </div>

      <div style={{ fontSize: 17, color: C.parch, lineHeight: 1.5, marginBottom: 16 }}>
        {cur.q}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cur.options.map((opt, i) => (
          <button key={i} onClick={() => handlePick(opt)}
            style={{
              textAlign: 'left', padding: '11px 14px', fontSize: 13,
              backgroundColor: C.bgCard, color: C.parch,
              border: `1px solid ${C.border}`, borderRadius: 5,
              cursor: 'pointer', fontFamily: 'system-ui', lineHeight: 1.5,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.purpleLight; e.currentTarget.style.backgroundColor = C.bgElevated }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border;       e.currentTarget.style.backgroundColor = C.bgCard }}>
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={goBack} disabled={stepIdx === 0}
          style={{
            padding: '6px 14px', fontSize: 11, fontFamily: 'system-ui',
            background: 'transparent', color: stepIdx === 0 ? C.muted : C.parch,
            border: `1px solid ${C.border}`, borderRadius: 4,
            cursor: stepIdx === 0 ? 'not-allowed' : 'pointer',
          }}>
          ← Back
        </button>
        {onCancel && (
          <button onClick={onCancel}
            style={{
              padding: '6px 14px', fontSize: 11, fontFamily: 'system-ui',
              background: 'transparent', color: C.muted,
              border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
            }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// scoreQuestionnaireAnswers is re-exported from questionnaireScoring.js above.
