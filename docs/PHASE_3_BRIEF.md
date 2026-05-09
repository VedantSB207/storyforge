# Phase 3 Brief — Information Propagation

**Branch:** `deep-simulation-rebuild`
**Prerequisite commit:** `3e98a9e` (Phase 2.5 complete)
**Design doc:** `docs/SIMULATION_ENGINE_DESIGN.md` (currently v1.2)

---

## Part A — Design doc update (v1.3) before Phase 3 code

Add a new section to `docs/SIMULATION_ENGINE_DESIGN.md` near the end, immediately before the Changelog section, titled:

### Output as world experience — North Star for Phase 5

> The output of a Deep Simulation run is not a chronicle. It is the writer experiencing their own world from above. A successful output makes the writer feel they have visited their own world and returned with:
>
> - **Aerial perspective** — patterns and proportions across the whole world they could not see from inside individual scenes
> - **Blind spot detection** — places, factions, or character types their writing has under-served
> - **Character sparks** — unexpected moments from procedural NPCs that suggest new bound characters or new directions for existing ones
> - **Causal threads** — chains of cause and effect across time that reveal where the world's logic stretches or breaks
> - **Emotional weather** — the tone and pressure of the world over the simulated period
> - **Promotion candidates** — procedural agents that took on outsized importance and could be brought into the bound cast
>
> The narrative summary delivered in Phase 2.5 is a bridge to this experience, not the experience itself. Phase 5 must build the experience layer: visualisations, infographics, comparative panels, surprise highlights, spark cards. The raw event log is a debug substrate, not a deliverable.

Then bump version to **v1.3**, add changelog entry:

> v1.3 — Output-as-world-experience North Star added for Phase 5. No code changes; vision capture only. This is the design intent for the output redesign that follows engine completion.

Commit this design doc update before any Phase 3 code, so the vision is locked in source control.

---

## Part B — Phase 3 implementation: Information Propagation

### Goal

Make events propagate between agents through space and social ties. Populate the Knowledge layer of each agent's state. Distort information as it travels. Record butterfly traces — the causal chains from origin events through their downstream effects.

This phase does NOT add agent decisions or actions. Agents still age, deplete, and die deterministically. Phase 3 is about what they **know** about each other and the world.

### What unlocks after Phase 3

- The Knowledge layer activates for the first time (was placeholder schema in Phase 1)
- Different agents have different — and potentially conflicting — understandings of the same event
- Phase 4 can build decisions on top of Knowledge: agents act based on what they know vs. what is true
- Phase 5 output gains real material: "Nyra witnessed the dragon's death directly. Russell heard about it third-hand by round 18, with the witch named as the killer instead of the assassin."

### Architectural principle

Information asymmetry is butterfly-effect-shaped. Any agent (including a procedural NPC) can originate an event whose distorted version reaches a bound character ten rounds later and shapes their understanding. This is what makes the simulation meaningful for a writer — surprises emerge from the propagation graph, not from the script.

---

## Files to create

### 1. `src/components/DeepSimulation/positionGraph.js`

**Role:** Where every agent is, and what counts as near.

**Contents:**

- At simulation init, assign every agent to a region
  - Regions drawn from Story Bible lore entries tagged as locations (if any exist)
  - If the project has no location lore, fall back to a default set of generic regions: `north`, `south`, `east`, `west`, `central`, plus `wilderness`
  - Bound Bible characters: place them in regions implied by their character profile (their description text, location field if present), default to `central` if unclear
  - Procedural NPCs: distribute across regions weighted by genre (e.g. animals more likely in `wilderness`, humans more likely in settled regions)
- Adjacency: regions form a simple graph. Default adjacency is everyone-to-central, plus geographic logic (north adjacent to east and west, etc.). Document the default adjacency map at the top of the file.
- Functions to export:
  - `initialisePositions(agents, lore) => positionState`
  - `distance(agentA, agentB, positionState) => number` (0 = same region, 1 = adjacent, 2+ = distant)
  - `adjacentAgents(agent, positionState) => Agent[]`
  - `regionsAdjacentTo(region) => string[]`

**Roughly 80-120 lines.**

### 2. `src/components/DeepSimulation/witnessRules.js`

**Role:** Who sees a given event when it fires.

**Contents:**

- For each event, compute a witness list at fire time
- Default proximity rules:
  - Same region as event location → witnesses with probability 1.0
  - Adjacent region → witnesses with probability 0.3
  - Distant → 0.0 unless exceptional perception
- Exceptional perception (cap at top of pipeline):
  - Agents whose Mind layer perception abilities include any of: `scrying`, `omniscient`, `telepathic`, `prophetic`, `clairvoyant`, `farsight` — can witness from any distance with probability 0.5
  - Detect these from agent traits/perception abilities at init time, cache the list
- Function: `computeWitnesses(event, agents, positionState, rng) => Agent[]`
- The RNG must be deterministic seeded from the simulation seed — same simulation must produce same witness lists for reproducibility

**Roughly 60-100 lines.**

### 3. `src/components/DeepSimulation/distortion.js`

**Role:** How information changes as it travels between agents.

**Two distortion modes:**

**A) Trait-based (deterministic, free)** — used for the vast majority of events:

- Input: event content, transmitter traits, receiver traits
- Output: a distorted version of the event content
- Mechanism: a hash-driven swap table over event detail tokens
  - For each detail field (who, what, where, when, why), apply a swap based on `hash(originalValue + transmitter.traits + receiver.traits)`
  - Swaps degrade: specific names → generic descriptions ("Jojo" → "a vampire dog" → "some animal" → "someone")
  - Numbers degrade: "26.1 years old" → "in his twenties" → "old" → "ancient"
  - Locations degrade similarly
- Document the swap rules clearly in code comments — they are the trait-distortion grammar

**B) LLM-based (Claude call, costs money)** — used sparingly:

- Trigger conditions:
  - Event involves a bound Bible character (named character with stakes), OR
  - Event is flagged plot-critical (deaths of bound characters, major realisations, etc.)
- Cap: maximum 5 LLM distortion calls per simulation round, max 100 per full simulation
- When cap is reached, fall back to trait-based for remaining events
- Prompt: "You are simulating how rumours distort. An event happened: [event]. It is being passed from [transmitter description] to [receiver description]. Return a single-sentence distorted version of the event from the receiver's perspective — preserve significance but lose, shift, or invent detail consistent with their traits and biases. Return only the distorted sentence."
- Model: `claude-sonnet-4-20250514`, max_tokens: 150, temperature: 0.7

**Functions to export:**

- `distortEventTraitBased(event, transmitter, receiver) => distortedEvent`
- `distortEventLLM(event, transmitter, receiver) => Promise<distortedEvent>`
- `shouldUseLLM(event, transmitter, receiver, llmCallsThisRound, maxLLMCallsPerRound) => boolean`

**Roughly 120-180 lines.**

### 4. `src/components/DeepSimulation/propagation.js`

**Role:** The information graph — how events spread from witnesses through social ties.

**Contents:**

- Per round, after deterministic events fire and witnesses are computed:
  1. **Direct witness step:** every witness gets a Knowledge entry with `source: 'firsthand'`, `confidence: 1.0`, `content: event`, `round_learned: currentRound`
  2. **Gossip step:** for each witness, identify their bonded agents (Bonds layer) and adjacent agents (positionGraph). With probability based on bond intensity and trust, propagate the event to those agents.
  3. **Distortion step:** when propagating, call `distortion.js` to produce the variant. Receiver gets Knowledge entry with `source: transmitter.name`, `confidence: parent_confidence * 0.7`, `content: distortedEvent`, `round_learned: currentRound`
  4. **Hop limit:** maximum 3 hops from origin (stops cascading rumours from running forever)
  5. **Confidence floor:** stop propagating when confidence drops below 0.1
- Each propagation step creates an entry in the butterfly trace
- Function: `propagateRound(roundEvents, agents, round, positionState, butterflyTrace) => { updatedAgents, distortionCallsUsed }`

**Roughly 150-200 lines.**

### 5. `src/components/DeepSimulation/butterflyTrace.js`

**Role:** The causal graph — origin events, propagations, eventual effects.

**Contents:**

- Data structure: directed graph
  - Nodes: events (originals) and knowledge entries (derived)
  - Edges: propagation hops with metadata `{ transmitter, receiver, round, distortionMode, confidenceLost }`
- Functions:
  - `createTrace() => emptyTrace`
  - `recordOriginEvent(event, trace) => updatedTrace`
  - `recordPropagationEdge(fromKnowledgeId, toKnowledgeId, metadata, trace) => updatedTrace`
  - `traceBack(knowledgeId, trace) => path[]` — walk from a knowledge entry back to origin event
  - `descendantsOf(eventId, trace) => knowledgeEntries[]` — all knowledge entries derived from one origin event
- Phase 3: trace is RECORDED only. Phase 4 will USE it for decisions. Phase 5 will VISUALISE it.

**Roughly 80-120 lines.**

---

## Files to modify

### `src/components/DeepSimulation/SimulationRunner.js`

- After each round's deterministic events fire, call `computeWitnesses` for each event
- Then call `propagateRound` to spread information and distort
- Track `distortionCallsUsedThisRound` and `distortionCallsUsedTotal`; respect caps
- After all rounds, include `butterflyTrace` and final agent Knowledge layers in the simulation result object passed to narrative summary and saved to history

### `src/components/DeepSimulation/deepSimSchema.js`

- Activate the `Knowledge` field on agent state — was placeholder in Phase 1, now populated
- Add `region` field to agent state if not already there
- Add `butterflyTrace` to simulation result schema
- Add constants `MAX_LLM_DISTORTION_CALLS_PER_ROUND` (5), `MAX_LLM_DISTORTION_CALLS_PER_SIM` (100), `PROPAGATION_HOP_LIMIT` (3), `CONFIDENCE_FLOOR` (0.1)

### `src/components/DeepSimulation/AgentFactory.js`

- Add region assignment at agent creation, using `positionGraph.initialisePositions`
- Initialise empty Knowledge array on each agent

### `src/components/DeepSimulation/narrativeSummary.js`

- Update the system prompt to mention information asymmetry: "Different characters witnessed different things or heard distorted versions. Use this in your chronicle — when you mention a major event, sometimes name who saw it firsthand and who heard rumours of it. The asymmetry is part of the story."
- In the user prompt, include a small sample (max 5) of bound-character Knowledge entries showing their perspective. This gives the narrative writer multi-perspective material to use.

---

## Performance constraints

- **Test scale:** 200 cast × 30 rounds (Jojo default), then 1000 cast × 30 rounds (stress)
- **Trait-based distortion** is free and runs unlimited
- **LLM distortion** capped: max 5 calls per round, max 100 calls per full simulation
- **Cost projection:**
  - Phase 2.5 baseline: ~$0.05 per fresh sim
  - Phase 3 add-on: up to 100 LLM distortion calls × ~$0.005 each = ~$0.50 per sim worst case
  - Phase 3 total: ~$0.55 per fresh sim worst case, often lower
- Wall time: propagation step should add no more than 5-10s for 1000 cast × 30 rounds (trait-based is fast; LLM calls dominate when triggered)

---

## Test plan

After implementation, run end-to-end against the Jojo project at 200 cast × 30 year-rounds.

Capture and report:

1. **Knowledge layer sample** — pick one bound Bible character (e.g. Jojo) and one procedural NPC (e.g. a Chameleon). Console-log their full Knowledge array at end of simulation. Paste actual JSON in the report.
2. **Distortion verification** — find one event that fired in an early round. Trace its descendants through the butterfly graph. Show how the same origin event appears in different agents' Knowledge with different content/confidence. Paste actual examples.
3. **Butterfly trace sample** — paste a trace-back from a late-round Knowledge entry to its origin event. Should show the full hop chain.
4. **Updated narrative output** — does the new narrative now mention multi-perspective elements? Paste the actual narrative text. Compare informally to Phase 2.5's narrative.
5. **LLM call count and cost** — total distortion calls used, total cost of the simulation (taxonomy + narrative + distortion).
6. **Quick Scenario regression check** — confirm Quick Scenario still works untouched.
7. **1000-cast stress test** — run a 1000 × 30 simulation. Confirm no crashes, propagation completes, butterfly trace is non-empty, total cost stays under $1.

---

## Explicitly NOT in Phase 3

These come later; do not start them:

- Agent decisions and actions (Phase 4)
- Dialogue between agents (Phase 4)
- Ollama tier routing for cheap LLM calls (Phase 4)
- Output UI redesign — the "world experience" panels (Phase 5)
- Map visualisation (Phase 5)
- Character thread display (Phase 5)
- Promotion candidate UI (Phase 5)

---

## What to report after Phase 3

- File diff summary (lines added/removed per file)
- Sample agent Knowledge layer (real JSON, not pseudocode) — at least one bound character and one NPC
- Sample butterfly trace edges (real data)
- Distortion examples — same origin event, different downstream versions
- Total LLM distortion calls used and cost
- Updated narrative sample text (paste it)
- Any deviations from this brief and why
- Any concerns about scaling to 1000 cast

Stop after Phase 3 reports. Do not start Phase 4.

---

## Commit discipline

- One commit for the v1.3 design doc update before any code
- One commit for Phase 3 implementation when end-to-end test passes
- Both pushed to `deep-simulation-rebuild`
- Final merge to `main` only happens after all 5 phases are verified
