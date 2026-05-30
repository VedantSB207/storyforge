# Phase 7 Brief — Character Psychology & Emotional Depth

**Branch:** `character-psychology` (new, off `main` at `0be43e6`)
**Design doc:** `docs/SIMULATION_ENGINE_DESIGN.md` (currently v1.10)

Phase 6 (Deep Simulation rebuild) is merged to `main`. Phase 7 builds the layer that makes characters behave like *people* — a psychological profile per character that drives every decision, and an emotional-depth layer (memorial bonds) built on top of it.

The through-line: **how a character acts — in any scenario, not just death — is a function of who they are. The engine needs a real model of who they are.**

---

## Part A — Design doc update (v1.11) before Phase 7 code

Add two sections near the end of the design doc.

### Section 1 — Character Psychology Engine

> Every character carries a psychological profile that biases their decisions across the entire simulation. The profile uses a hybrid model: **Enneagram is the writer-facing interface; validated continuous models are the engine.**
>
> - The writer selects (or the AI infers) an **Enneagram type + wing + health level** — familiar, evocative, narratively rich.
> - That selection maps to the simulation's actual machinery: a **Big Five (OCEAN)** distribution, an **attachment style** (secure / anxious / avoidant / fearful), and **antagonist markers** (narcissism, Machiavellianism, callousness, vengefulness).
> - The Enneagram **health level** modulates the antagonist markers — a healthy Type 8 is protective and decisive; an unhealthy Type 8 is domineering and vengeful.
> - The writer can fine-tune any underlying value after the mapping. The Enneagram is the human-readable label; the simulation computes only on the continuous values.
>
> Profiles bias probabilities, they do not script outcomes. A high-vengefulness character is *more likely* to seek revenge, never guaranteed to. A per-project "psychological influence" dial in World Rules controls how strongly psychology shapes behavior. This preserves StoryForge's core identity: a narrative physics engine, not a ghostwriter. Psychology is gravity, not fate.
>
> Main characters get a profile via writer choice (questionnaire or AI inference). NPCs draw from a genre-aware pool of psychological archetypes.

### Section 2 — Emotional Depth

> Building on the psychology layer, Phase 7 adds emotional continuity:
>
> - **Emotion snapshots** — the runner records each character's emotional state per round, replacing the interpolated approximation used by the Emotional Weather panel. This gives grief and other long-running emotions a real trajectory to attach to.
> - **Memorial bonds** — when a bonded character dies, the survivor's bond toward them persists, flagged memorial. How that bond decays or intensifies, and how it influences the survivor's decisions, is a function of the survivor's psychology. An anxious-attachment, high-neuroticism character may spiral; an avoidant, high-conscientiousness character may channel grief into purpose. The same loss produces different stories in different characters — exactly as in life.

Bump version to **v1.11**, add changelog:

> v1.11 — Phase 7: Character Psychology Engine (Enneagram-interface hybrid over Big Five + attachment + antagonist markers, writer questionnaire or AI inference, NPC archetype pool, psychology drives all decisions). Emotion snapshots (real per-round emotional trajectory). Memorial bonds (psychology-driven grief).

Commit this design doc update alone before any Phase 7 code.

---

## Part B — Phase 7 implementation

Three core workstreams. Implement in order. **Hard stop and verify after each.**

1. **7a — Character Psychology Engine** (the foundation)
2. **7b — Emotion snapshots**
3. **7c — Memorial bonds**

After 7c verifies, STOP. Do not build 7d (grief & trauma mechanics) or 7e (time-based effects) — those are decided after the core is felt in real runs.

---

## Workstream 7a — Character Psychology Engine

The foundation of the phase. Get it right before anything else. **Hard stop after 7a.**

### New files

**`src/components/Psychology/psychologySchema.js`** (~150-200 lines)

The data model and the constants.

```javascript
export const ATTACHMENT_STYLES = ['secure', 'anxious', 'avoidant', 'fearful'];

export const DEFAULT_PROFILE = {
  enneagram: { type: null, wing: null, healthLevel: 5 },  // healthLevel 1-9, 1=healthiest
  bigFive: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
  attachment: 'secure',
  markers: { narcissism: 0.1, machiavellianism: 0.1, callousness: 0.1, vengefulness: 0.1 },
  source: null  // 'questionnaire' | 'inference' | 'pool' | 'manual'
};
```

Plus the NPC archetype pool — preset profiles with names and genre-affinity weights:

```javascript
export const NPC_ARCHETYPES = [
  { name: 'The Steady One', enneagram: { type: 9, wing: 1, healthLevel: 4 }, genreWeights: { default: 1.0, cozy: 1.5, war: 0.6 } },
  { name: 'The Devoted',     enneagram: { type: 2, wing: 1, healthLevel: 5 }, genreWeights: { default: 1.0, romance: 1.6 } },
  { name: 'The Striver',     enneagram: { type: 3, wing: 4, healthLevel: 4 }, genreWeights: { default: 1.0 } },
  { name: 'The Loner',       enneagram: { type: 5, wing: 4, healthLevel: 5 }, genreWeights: { default: 1.0, mystery: 1.4 } },
  { name: 'The Volatile',    enneagram: { type: 4, wing: 5, healthLevel: 7 }, genreWeights: { default: 1.0, drama: 1.4 } },
  { name: 'The Predator',    enneagram: { type: 8, wing: 7, healthLevel: 8 }, genreWeights: { default: 0.6, war: 1.5, thriller: 1.6 } },
  { name: 'The Loyalist',    enneagram: { type: 6, wing: 7, healthLevel: 4 }, genreWeights: { default: 1.0 } },
  { name: 'The Dreamer',     enneagram: { type: 7, wing: 6, healthLevel: 4 }, genreWeights: { default: 1.0 } }
  // expand as useful
];
```

**`src/components/Psychology/enneagramMapper.js`** (~180-250 lines)

Pure logic, no LLM. Maps Enneagram type + wing + health level → Big Five + attachment + markers. This is the heart of the engine.

Base mapping per type (research-informed starting values; refine as needed):

| Type | O | C | E | A | N | Attachment | Notable markers |
|---|---|---|---|---|---|---|---|
| 1 Reformer | 0.5 | 0.85 | 0.4 | 0.5 | 0.6 | secure→anxious | low |
| 2 Helper | 0.5 | 0.6 | 0.75 | 0.85 | 0.55 | anxious | low |
| 3 Achiever | 0.55 | 0.8 | 0.8 | 0.4 | 0.45 | avoidant | narcissism 0.4 |
| 4 Individualist | 0.8 | 0.45 | 0.35 | 0.5 | 0.8 | anxious→fearful | low |
| 5 Investigator | 0.85 | 0.7 | 0.25 | 0.4 | 0.55 | avoidant | low-mid |
| 6 Loyalist | 0.45 | 0.75 | 0.45 | 0.6 | 0.75 | anxious | low |
| 7 Enthusiast | 0.8 | 0.4 | 0.85 | 0.55 | 0.4 | avoidant | low-mid |
| 8 Challenger | 0.55 | 0.75 | 0.8 | 0.3 | 0.35 | avoidant | narcissism 0.5, mach 0.5, vengeful 0.5 |
| 9 Peacemaker | 0.55 | 0.5 | 0.4 | 0.8 | 0.4 | secure→avoidant | low |

Wing nudges the adjacent type's values by ~15%. Health level modulation:
- Healthy (1-3): markers suppressed ×0.5, neuroticism −0.15, agreeableness +0.1
- Average (4-6): base values
- Unhealthy (7-9): markers amplified ×1.8, neuroticism +0.2, agreeableness −0.15

Functions:
- `mapEnneagramToProfile({ type, wing, healthLevel }) => { bigFive, attachment, markers }`
- `describeProfile(profile) => string` (human-readable summary for UI + LLM prompts)

**`src/components/Psychology/psychologyInference.js`** (~150-200 lines)

LLM inference path. One Sonnet call per character that reads the character's Bible profile and proposes an Enneagram type + wing + health level + reasoning. The mapper then derives the rest.

- Input: character profile text (traits, fears, secrets, stakes, description) + the genre/world context
- Output: `{ enneagram: { type, wing, healthLevel }, reasoning: "..." }`
- Then `enneagramMapper` derives bigFive/attachment/markers
- Model: `claude-sonnet-4-20250514`, max_tokens 400, temperature 0.3
- Cached on the character (re-run only on profile edit, via text hash)
- Cost: ~$0.01-0.02 per main character, one-time

**`src/components/Psychology/CharacterQuestionnaire.jsx`** (~250-320 lines)

The questionnaire path. Enneagram-led, short (~10 questions) landing the writer on a type + wing + health level, plus 2 questions for attachment style. No LLM — the writer's answers map directly via a scoring table.

Question structure: each question presents 2-4 options, each weighted toward Enneagram types. After ~10 questions, tally → most likely type + wing. Two final questions calibrate health level (how the character handles stress) and attachment (how they bond). Show the result, let the writer confirm or override the type directly.

**`src/components/Psychology/PsychologyReview.jsx`** (~250-320 lines)

The review/edit screen, shown after either inference or questionnaire completes.

- Header: character name + the resulting Enneagram type label ("Type 8w7 — The Challenger, average-unhealthy")
- The derived underlying dials shown as adjustable sliders: Big Five (5), attachment (dropdown), antagonist markers (4)
- "Reasoning" shown if inference was used
- "Reset to mapped values" per dial
- The writer can adjust the Enneagram (re-derives dials) or adjust dials directly (sets source to 'manual')

**`src/components/Psychology/npcArchetypePool.js`** (~100-140 lines)

Pure logic. Assigns archetypes to NPCs by genre-aware weighted random draw.

- `assignArchetypes(npcs, detectedGenres, seededRng) => { agentId: profile }`
- Uses genre weights from `NPC_ARCHETYPES` to bias the distribution
- Deterministic given the seeded RNG (preserve determinism guarantee)

### Files to modify

**Story Bible character creation/edit UI** (wherever characters are introduced)
- Add a "Psychology" step when introducing or editing a character
- Toggle at the top: **"Answer a few questions"** vs **"Let AI infer from the profile"**
- Smart default: questionnaire if the character profile text is thin/empty, inference if there's substantial text. Writer can flip.
- Route to `CharacterQuestionnaire` or `psychologyInference` → then `PsychologyReview`
- Store the confirmed profile on the character in the Bible

**`src/components/DeepSimulation/AgentFactory.js`**
- Read each bound character's psychology profile from the Bible; apply to the agent
- For NPCs, apply the archetype-pool assignment
- Store the full profile (Enneagram + derived values) on the agent

**`src/components/DeepSimulation/NPCGenerator.js`**
- Call `npcArchetypePool.assignArchetypes` during NPC generation

**`src/components/DeepSimulation/decisionLogic.js`**
- Psychology biases action selection. Concretely:
  - High conscientiousness → bias toward goal-directed actions (PURSUE, BUILD)
  - Low agreeableness + high markers → bias toward CONFLICT, BETRAY
  - High agreeableness → bias toward COOPERATE, PROTECT
  - High neuroticism → larger swings under stress
  - High extraversion → more social actions (TALK, ALLY)
- These are *probability nudges* scaled by the World Rules "psychological influence" dial, not hard overrides

**Tier 2 prompts (in decisionLogic.js or wherever Tier 2 is assembled)**
- Inject `describeProfile(agent.psychology)` into the decision prompt context so Sonnet reasons in-character

**`src/components/WorldRules/worldRulesSchema.js`** + **`WorldRulesPanel.jsx`**
- Add `psychologicalInfluence: 0.6` to DEFAULT_WORLD_RULES (0 = psychology ignored, 1 = strong)
- Add a slider in the World Rules panel with explanatory text

**Project persistence**
- Store psychology profiles on Bible characters
- Migrate: characters without a profile get `source: null`; the sim prompts the writer to set one (or infers on first run with a notice)

### Determinism
Psychology must preserve the determinism guarantee: archetype assignment uses the seeded RNG, the mapper is pure, and `disableLLM:true` must still produce byte-identical runs (inference is skipped, profiles come from stored/questionnaire/pool data).

---

## Workstream 7b — Emotion snapshots

Makes the runner record real per-round emotional state, replacing the Emotional Weather interpolation from Phase 6. **Hard stop after 7b.**

### Changes

**`src/components/DeepSimulation/stateUpdaters.js`**
- Compute each agent's emotional state per round from: needs satisfaction, recent events affecting them, their psychology (high neuroticism = larger emotional swings)
- Emotional state fields: `stress`, `contentment`, `dominantEmotion` (derived label), plus a `grief` field (used by 7c)

**`src/components/DeepSimulation/SimulationRunner.js`**
- Emit per-round emotion snapshots:
  - For bound/named characters: full per-round per-character emotion (small count, always stored)
  - For NPC mass: aggregate per-round emotion (cheap)
- Thread into the final result and the per-round yields (so the live progress screen could later show emotional state)

**`src/components/DeepSimulation/insights/emotionalWeather.js`**
- Consume real snapshots instead of interpolating
- Remove the "interpolated from final state" disclaimer added in Phase 6e — it's now real data
- Per-character emotion trajectories become available (enables the grief visualizations in 7c)

**Persistence**
- Store aggregate per-round emotion always (cheap)
- Store per-character per-round emotion for bound/named characters always; for the full NPC mass, gate behind the existing "preserve causation data" style opt-in if size becomes a concern (measure first — bound-only is likely small enough to always keep)

### Determinism
Emotion computation is deterministic from agent state + events. `disableLLM:true` byte-identical must hold.

---

## Workstream 7c — Memorial bonds

The emotional-depth payoff, built on 7a (psychology) + 7b (emotion trajectory). **Hard stop after 7c.**

### Bond schema change
- Add to bonds: `memorial: false` (flag), `memorialSince: null` (round when the bonded character died), `preMemorialType` (the bond type the relationship had in life)
- A memorial bond keeps its original type (love stays love, kinship stays kinship) plus the memorial flag

### New file

**`src/components/DeepSimulation/memorialBonds.js`** (~200-280 lines)

- **On-death conversion:** when an agent dies during the sim, scan all surviving agents' bonds toward them and flag those bonds memorial (`memorialSince = currentRound`, `preMemorialType` recorded)
- **At hydration:** when a bonded Bible character has status `dead`, create the survivor's bond toward them as memorial from round 0 (extends `relationshipMapper`)
- **Per-round decay/intensification** — a function of the survivor's psychology:
  - Avoidant attachment + high conscientiousness → memorial bond decays steadily (lets go, channels forward)
  - Anxious attachment + high neuroticism → memorial bond intensifies or stays high (can't let go, may spiral)
  - Secure attachment → moderate decay (grieves and recovers)
  - High vengefulness + the death was caused by a known agent → spawns/strengthens an enmity bond toward the cause
- **Trigger events:** learning the cause of death, encountering an agent connected to the deceased, or (later, 7e) anniversaries → intensify the memorial bond that round

### Influence on decisions — named grief behaviors
Memorial bonds inject specific behaviors into decision logic (scaled by psychological influence dial), NOT a global mood dampener:
- Pursue the deceased's unfinished goals (esp. high conscientiousness / secure)
- Seek out or avoid places/agents tied to the deceased (attachment-dependent)
- Hostility toward the agent who caused the death (high vengefulness / low agreeableness)
- Withdrawal from social action (high neuroticism / anxious)

### Files to modify
- `AgentFactory.js` / `relationshipMapper.js` — memorial bonds at hydration for dead Bible characters
- `SimulationRunner.js` — on-death hook calls `memorialBonds` conversion; per-round memorial update step
- `decisionLogic.js` / Tier 2 prompts — memorial grief behaviors + memorial context in prompts
- `narrativeSummary.js` / `dialogue.js` — memorial bond context so the chronicle and dialogue honor grief
- `BondNetwork.jsx` — render memorial bonds as ghost/dotted connections (distinct visual)
- `CharacterThreads.jsx` — show a grief indicator on characters carrying memorial bonds

### Determinism
Memorial conversion, decay, and behavior selection are deterministic from state + psychology. `disableLLM:true` byte-identical must hold.

---

## Performance and cost

| Layer | Cost |
|---|---|
| Psychology inference (main chars, one-time, cached) | ~$0.01-0.02 per character |
| Questionnaire path | $0 (no LLM) |
| NPC archetype assignment | $0 (deterministic) |
| Emotion snapshots | $0 (computed) |
| Memorial bonds | $0 (computed; minor Tier 2 prompt growth) |

Phase 7's only new cost is the one-time psychology inference for main characters (only when the writer chooses inference over questionnaire), comparable to Bible Hydration. Per-sim cost is essentially unchanged from Phase 6. Runtime impact is negligible — psychology biases existing decision logic, emotion and memorial updates are cheap per-round computations.

---

## Test plan

### 7a — Character Psychology Engine
1. Open a main character in Story Bible (Jojo). Confirm the Psychology step appears with the questionnaire/inference toggle.
2. **Inference path:** choose "Let AI infer." Confirm it reads Jojo's profile and proposes an Enneagram type with reasoning. Confirm the PsychologyReview screen shows derived Big Five + attachment + markers.
3. **Questionnaire path:** introduce a new character, choose "Answer questions." Confirm ~10 questions land on a type + wing + health level + attachment, then show PsychologyReview.
4. Adjust a derived dial manually. Confirm source flips to 'manual' and the adjustment persists.
5. Pick Type 8 health level unhealthy on a test character. Confirm derived markers (narcissism/Machiavellianism/vengefulness) are high. Pick Type 8 healthy. Confirm markers drop. (Health-level modulation works.)
6. Run a sim. Confirm:
   - Bound characters carry their Bible psychology profiles
   - NPCs carry pool-assigned archetypes (dump a few NPC profiles — confirm variety, genre-appropriate distribution)
   - A high-agreeableness character takes noticeably more COOPERATE/PROTECT actions; a high-marker low-agreeableness character takes more CONFLICT/BETRAY (psychology biasing decisions)
7. Set World Rules psychological influence to 0. Run. Confirm decisions are no longer psychology-biased (returns to Phase 6 behavior). Set to 1. Run. Confirm strong biasing. (Determinism dial works.)
8. `disableLLM:true` run is byte-identical across two runs.

### 7b — Emotion snapshots
1. Run a 30-round sim. Confirm the runner records per-round emotion for bound characters + aggregate for NPCs.
2. Open Emotional Weather tab. Confirm the chart now uses real per-round data (the curve should reflect actual round-by-round events, and the 6e "interpolated" disclaimer is gone).
3. Dump one bound character's per-round emotion trajectory. Confirm it's real (responds to events that round, not a smooth interpolation).
4. `disableLLM:true` byte-identical.

### 7c — Memorial bonds
1. Run a sim where a bonded character dies mid-run (the Jojo project reliably produces deaths). Confirm:
   - Survivors' bonds toward the deceased get flagged memorial with the correct `memorialSince` round and preserved `preMemorialType`
   - BondNetwork shows the memorial bond as a ghost/dotted connection
2. **Psychology-driven divergence (the key test):** Find two survivors with different attachment styles bonded to the same deceased. Confirm their memorial bonds evolve differently — the anxious/high-neuroticism one stays high or intensifies; the avoidant/high-conscientiousness one decays. Capture both trajectories.
3. Confirm a high-vengefulness survivor, when the death was caused by a known agent, develops/strengthens enmity toward that agent.
4. Confirm memorial grief behaviors appear in decisions (e.g., a survivor pursuing the deceased's unfinished goal, or withdrawing). Capture from the event log.
5. Hydration case: set a Bible character's status to dead, with a relationship to a living character. Run. Confirm the living character starts with a memorial bond at round 0.
6. Confirm the narrative references the grief (chronicle/dialogue honoring the memorial bond).
7. `disableLLM:true` byte-identical.

---

## What to report after each workstream

After **7a** (STOP):
- File diff
- PsychologyReview screenshot for Jojo (inference path) showing Enneagram + derived dials + reasoning
- Questionnaire screenshot + the profile it produced for a new character
- Type 8 healthy vs unhealthy derived-marker comparison (proof health-level modulation works)
- NPC profile dump showing archetype variety + genre-appropriate distribution
- Action-distribution comparison: high-agreeableness vs high-marker character (proof psychology biases decisions)
- Psychological-influence dial at 0 vs 1 (proof the determinism dial works)
- `disableLLM:true` byte-identical confirmation

After **7b** (STOP):
- File diff
- Emotional Weather tab screenshot with real (non-interpolated) data, disclaimer removed
- One bound character's real per-round emotion trajectory (JSON)
- `disableLLM:true` byte-identical confirmation

After **7c** (STOP):
- File diff
- Memorial bond JSON showing flag + memorialSince + preMemorialType
- BondNetwork screenshot with ghost/dotted memorial connections
- **The divergence capture:** two survivors, different attachment styles, same deceased, different memorial trajectories
- Vengeance case: high-vengefulness survivor developing enmity toward the death's cause
- Grief behavior in the event log
- Narrative excerpt honoring the grief
- `disableLLM:true` byte-identical confirmation

Final report after 7c:
- Total cost across tests
- Recommendation on whether 7d (grief & trauma mechanics) and 7e (time-based effects) are worth building, based on how 7c feels in real runs

---

## Explicitly NOT in Phase 7 (decide after 7c)

- 7d — Grief stages (denial → anger → bargaining → acceptance progression), trauma persistence, survivor's guilt
- 7e — Anniversary effects, inherited grief patterns
- Clinical-grade psychological accuracy (the goal is narratively rich and research-informed, not a diagnostic instrument)
- Psychology editing of agents mid-run
- Multi-character shared-trauma modeling

---

## Verification discipline (carry over from Phase 6)

**Verification reports contain only output from actual test runs.** Illustrative diagrams, UI mocks, or hypothetical event logs must be explicitly labeled as such, never presented in the same format as real test output. This protects the trust the phase-gated workflow depends on.

---

## Commit discipline

- One commit for the v1.11 design doc update
- One commit per workstream: 7a, 7b, 7c
- All pushed to `character-psychology`
- After 7c verifies clean and you've decided on 7d/7e, the branch merges to `main`

---

## End-state vision

When the Phase 7 core (7a-7c) completes, characters in StoryForge stop being interchangeable agents who happen to have different traits. They become *people* with coherent psychologies that explain why they act as they do — in every scenario, not just death. A grief-stricken character spirals or grows depending on who they are. An NPC whose caretaker was murdered might collapse, or might harden into a villain worthy of their own spin-off — emergently, because their psychology made it so.

That's the layer that turns a simulation of events into a simulation of *people*. It's the difference between "what happened" and "what these specific souls did when the world pressed on them."
