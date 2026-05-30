// Phase 7/7a — Pure-logic side of the Character Questionnaire.
//
// Extracted into a .js file so it can be imported by Node-side test tooling
// without trying to parse the .jsx component. The React UI in
// CharacterQuestionnaire.jsx re-exports this so existing callers stay happy.

import { ATTACHMENT_STYLES, WINGS_OF, normaliseProfile } from './psychologySchema.js'
import { mapEnneagramToProfile } from './enneagramMapper.js'

// Tally an answer list — each answer is the option object the writer
// clicked. Each option carries `scores: { typeNum: weight }`. Negative
// weights are allowed but unused in the current question set.
export function tallyScores(answers) {
  const scores = { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 }
  for (const a of answers) {
    if (!a?.scores) continue
    for (const [type, w] of Object.entries(a.scores)) {
      scores[Number(type)] = (scores[Number(type)] || 0) + Number(w)
    }
  }
  return scores
}

// Top score → type. Wing is the adjacent type with the higher score.
// Ties resolve to the lower-numbered type — arbitrary but deterministic.
export function pickTypeAndWing(scores) {
  const sorted = Object.entries(scores)
    .map(([t, s]) => ({ type: Number(t), score: s }))
    .sort((a, b) => b.score - a.score || a.type - b.type)
  const type = sorted[0]?.type ?? 9
  const wings = WINGS_OF[type] || []
  const wingScores = wings.map(w => ({ wing: w, score: scores[w] || 0 }))
  wingScores.sort((a, b) => b.score - a.score || a.wing - b.wing)
  return { type, wing: wingScores[0]?.wing ?? wings[0] ?? null, scores }
}

// Compose a full normalised profile from raw answers + health + attachment.
// Used by the React UI on completion and by tests.
export function scoreQuestionnaireAnswers(answers, healthLevel = 5, attachment = 'secure') {
  const scores = tallyScores(answers)
  const { type, wing } = pickTypeAndWing(scores)
  const derived = mapEnneagramToProfile({ type, wing, healthLevel })
  return normaliseProfile({
    enneagram: { type, wing, healthLevel },
    bigFive: derived.bigFive,
    attachment: ATTACHMENT_STYLES.includes(attachment) ? attachment : derived.attachment,
    markers: derived.markers,
    source: 'questionnaire',
  })
}
