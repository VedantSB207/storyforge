# StoryForge Deep Simulation Engine
## Phase 2 Brief — World Population

**Branch:** `deep-simulation-rebuild`
**Prerequisite:** Phase 1 verified working
**Estimated time:** 1–2 weeks of Claude Code work

This document expands Section 7's Phase 2 placeholder in `docs/SIMULATION_ENGINE_DESIGN.md` into a full implementation brief. It also contains Phase 1 corrections that need to be applied to the main design document. Claude Code applies the corrections first, then begins Phase 2 work.

---

## Part A — Phase 1 Corrections to Apply to Main Design Doc

These are deviations Claude Code flagged during Phase 1 implementation. They need to land in `docs/SIMULATION_ENGINE_DESIGN.md` so Phase 2+ work starts from accurate information.

### Correction 1 — IPC handler not needed (Section 2 and Section 4)

**Original text in Section 4 "Files to modify":**
> `electron/main.js` — add IPC handler for `deepSimulationHistory` persistence

**Replace with:**
> `electron/main.js` — no changes needed. The existing `save-project` IPC handler is a generic data passthrough; it persists any field added to the project data object, including `deepSimulationHistory`. A separate handler would be redundant.

### Correction 2 — `char.traits` and `char.secrets` are strings, not arrays (Section 2 and Section 4)

**Add to the agent state schema in Section 2, after Layer 3 Mind:**
> **Note on Bible character data shape.** Story Bible stores `traits` as a comma-separated string and `secrets` as multi-line free text. The agent state schema treats both as `string[]`. The AgentFactory normalises at the boundary: `traits` is split on commas, `secrets` is split on newlines, both trimmed and empty entries filtered. Future code consuming agent state can rely on the array typing.

### Correction 3 — Dashboard.jsx requires no changes (Section 4)

**Original text in Section 4 "Files to modify":**
> `src/components/Dashboard.jsx` — no functional change yet, just verify the existing Simulation references update to Quick Scenario references

**Replace with:**
> `src/components/Dashboard.jsx` — no changes needed. Dashboard's `setTab('simulation')` uses the tab ID, which is unchanged. Only the user-facing label changes from "✦ Simulation" to "✦ Quick Scenario" in the App.jsx NAV array.

### Version bump

After applying these corrections, update the document header from **Version 1.0** to **Version 1.1**, and add to the changelog at the bottom:

```
**Version 1.1** — Phase 1 deviations folded back into doc:
  - IPC handler not needed (existing save-project handles new fields)
  - char.traits and char.secrets normalised at AgentFactory boundary
  - Dashboard.jsx unchanged (tab ID stable, only label changed)
```

---

## Part B — Phase 2 Implementation Brief

### Goal of Phase 2

Phase 2 brings the world to life. Until now, simulations only used Story Bible characters as agents — at most 22 agents in the Jojo project. Phase 2 adds genre detection, taxonomy review, procedural NPC generation, and the census/active cast model, scaling agent counts up to whatever the writer chooses (50, 200, 500, 1000, or 2000 active).

After Phase 2, a writer with 8 Story Bible characters can run a simulation with 500 active agents drawn from a procedurally generated world of ~2,500 census agents that matches their story's flavour — animal kingdom plus mythology plus whatever else the engine detects from their content.

What Phase 2 still doesn't do: information propagation (Phase 3), action-driven decision logic (Phase 4), Scenario mode (Phase 4), rich output panels (Phase 5). NPCs in Phase 2 just age, deplete needs, and die — same deterministic round loop as Phase 1, but at scale.

### Files to create

```
src/components/DeepSimulation/
├── worldTaxonomy.js          # genre detection logic + setup-time LLM call
├── TaxonomyReview.jsx        # writer-facing taxonomy review UI
├── NPCGenerator.js           # creates procedural agents from confirmed genres
└── CensusManager.js          # manages census + active cast distinction
```

### Files to modify

```
src/components/DeepSimulation/
├── DeepSimulation.jsx        # new flow: setup → taxonomy review → run
├── AgentFactory.js           # extended to create procedural agents alongside bound
├── SimulationRunner.js       # handle larger agent counts; performance-tested at 2000
└── deepSimSchema.js          # add genre tag schema, NPC fields, taxonomy schema

src/App.jsx                   # no changes expected (taxonomy lives inside simulation runs)
```

### Genre detection logic

At simulation start, after the writer clicks "Generate World Taxonomy," the engine reads:
- Story Bible characters (`chars` array)
- World rules and lore (`lore` array)
- Import & Analyse blueprint output (if it exists in project state)
- Project notes (if any)
- Timeline chapter summaries (if any)

The engine consolidates this content and makes ONE Claude API call. This is the only LLM call in Phase 2 — it happens once at setup, not in the round loop. Cost per call: roughly $0.03–0.05.

The system prompt instructs Claude to:
- Identify genres of being clearly evidenced in the content
- For each genre, propose 5–15 typical kinds appropriate to it
- For each kind, propose typical traits, life expectancy, and rough proportional count
- Be conservative — only include genres with clear evidence
- Provide brief reasoning for the writer

Output schema (saved to `deepSimSchema.js`):

```javascript
const TAXONOMY_SCHEMA = {
  genres: [
    {
      id: 'animal_kingdom',
      name: 'Animal Kingdom',
      detected: true,                    // true = engine; false = writer-added
      weight: 0.4,                        // 0-1 prevalence
      kinds: [
        {
          id: 'rattlesnake',
          name: 'Rattlesnake',
          typicalTraits: ['venomous', 'patient', 'territorial'],
          typicalLifeExpectancy: 25,
          typicalSize: 'small',           // tiny|small|medium|large|huge
          typicalCount: 12                // proportional count in census per 100 cast
        },
        // ... more kinds
      ]
    },
    // ... more genres
  ],
  reasoning: 'Detected animal_kingdom from Russell (rattlesnake), Nyra (cat)... etc.'
}
```

### TaxonomyReview UI

After detection, the writer sees a review screen.

**Layout:**
- Header: "Confirm Your World Taxonomy"
- Engine reasoning section (collapsible, shows the brief explanation Claude returned)
- Detected genres list — each genre is an expandable card
- Each card shows: genre name, weight slider (0–100%), expand toggle for kinds
- Inside expanded card: list of kinds, each with a checkbox (include/exclude), typical traits, count
- "Add new kind" button at bottom of each genre's card
- "Add new genre" button at bottom of the screen
- "Regenerate Taxonomy" button (re-runs the LLM call if the writer changed Bible content)
- "Confirm and Continue" button proceeds to simulation setup

**Behaviour:**
- Writer can adjust weight sliders (animal kingdom prominent, mythology rare)
- Suppress entire genres or specific kinds via checkboxes
- Add new genres the engine didn't detect (writer might plan to introduce a genre they haven't written yet)
- Add new kinds within existing genres
- The confirmed taxonomy is held in component state and passed to the SimulationRunner

The confirmed taxonomy is saved with each simulation run inside `deepSimulationHistory` for reproducibility — running the same simulation later produces comparable results.

### NPC Generator

Once taxonomy is confirmed, NPCGenerator creates procedural agents.

For each `genre × kind` combination, it generates `kind.typicalCount × (castSize / 100) × genre.weight` NPCs. So if cast size is 500, animal_kingdom weight is 0.4, and rattlesnake.typicalCount is 12, the engine generates `12 × 5 × 0.4 = 24` rattlesnake NPCs.

Each NPC is a fully-formed agent matching the eight-layer schema, but with values dice-rolled within ranges:

```javascript
function createProceduralAgent(genreId, kindId, kindTemplate) {
  return {
    // Identity
    id: generateId('npc'),
    name: generateName(genreId, kindId),     // random name appropriate to kind
    source: 'procedural',
    bibleId: null,
    genreTag: `${genreId}:${kindId}`,
    isUnique: false,

    // Body and time — randomised within ranges for this kind
    age: randomBetween(0.1, 0.9) * kindTemplate.typicalLifeExpectancy,
    lifeExpectancy: kindTemplate.typicalLifeExpectancy + randomJitter(0.2),
    health: randomBetween(0.7, 1.0),
    conditions: [],
    mortalityRisk: 0,
    timeHorizon: 10,

    // Mind — traits sampled from kind's typicalTraits with variation
    traits: sampleWithVariation(kindTemplate.typicalTraits, 3, 5),
    values: sampleFromGenericPool(2, 4),
    fears: sampleFromGenericPool(1, 3),
    cognitiveDisposition: {
      paranoiaTrust: randomBetween(-0.5, 0.5),
      conservatismNovelty: randomBetween(-0.5, 0.5),
      socialSolitary: randomBetween(-0.5, 0.5)
    },
    perceptionAbilities: [],

    // Drives — random starting needs
    needs: {
      physiological: randomBetween(0.4, 0.8),
      safety: randomBetween(0.4, 0.8),
      belonging: randomBetween(0.4, 0.8),
      esteem: randomBetween(0.3, 0.7),
      purpose: randomBetween(0.3, 0.7)
    },
    goals: [],
    longTermAspiration: '',

    // Bonds — empty for Phase 2 (Phase 3 will add)
    relationships: {},
    factions: [],

    // Knowledge — empty for Phase 2
    knownFacts: [],
    secrets: [],
    memoryDecayRate: 0.1,

    // Position — assigned by CensusManager
    location: null,
    travelSpeed: 1,
    socialEmbeddedness: [],
    dailyOrbit: [],

    // Current state
    emotion: 'calm',
    stress: randomBetween(0, 0.3),
    trustDisposition: randomBetween(0.4, 0.7)
  }
}
```

Phase 2 NPCs are deliberately simple. Phase 4 will use LLM-based richening for the active cast to add personality nuance. Phase 2 just needs them to exist and behave consistently with the deterministic round loop.

### CensusManager

The CensusManager handles two distinct populations.

**The census** — total population that exists conceptually in this simulation's world. Generated once at simulation start. Size is roughly 5–10x the active cast size (default 5x; configurable in `deepSimSchema.js` as a constant).

**The active cast** — the subset whose decisions are computed each round. Drawn at simulation start based on relevance scoring.

For Phase 2, relevance scoring is intentionally simple:
- All bound agents (Bible characters): relevance = 1.0, always in active cast
- Procedural NPCs: relevance = 0.0–1.0 based on:
  - Random sampling weight (default)
  - Faction overlap with named characters (if writer specified factions in scenario setup — optional in Phase 2)
  - Location proximity to writer-named locations (if any)

The cast is filled by sorting census agents by relevance descending, taking the top N where N = writer's cast size.

Phase 3 and Phase 4 will improve relevance with proper graph-based logic. For Phase 2, simple scoring is enough.

### Setup screen flow update

Phase 1's setup screen had: mode selector, cast size, round count, time unit, run button.

Phase 2 inserts a new step before "Run":

1. Setup screen renders with mode/cast/rounds/time-unit selectors
2. **NEW: "Generate World Taxonomy"** button (disabled until cast size is set)
3. Clicking it shows a loading state ("Reading your world...")
4. **TaxonomyReview** screen appears with detected genres
5. Writer reviews, adjusts weights, suppresses or adds, confirms
6. Returns to setup screen with taxonomy confirmed (shown as a summary card)
7. "Run Simulation" button now enabled

If the writer changes project content (adds Bible characters, edits world rules) between simulations, the taxonomy is stale and needs regeneration. The setup screen shows a "Regenerate Taxonomy" button when stale-detection logic identifies that project content has changed since last taxonomy generation.

### What Phase 2 deliberately does NOT do

This list matters. Resist the temptation to add things.

- No information propagation (Phase 3)
- No event types beyond aging, need_critical, death (Phase 3)
- No action-based decision logic for any agent (Phase 4)
- No LLM calls during the round loop — only at setup for taxonomy detection (Phase 4)
- No Scenario mode (Phase 4)
- No Ollama routing — taxonomy detection uses Claude directly (Phase 4)
- No rich output panels — still basic event log + state summary (Phase 5)
- No Dashboard integration of Deep Simulation results (Phase 5)
- No promotion flow for procedural NPCs (Phase 5)
- No relationship edges between agents (Phase 3)
- No faction memberships beyond labels (factions-as-objects is v2 of factions, not Phase 2)

### Verification checklist for Phase 2

- [ ] Branch is still `deep-simulation-rebuild`
- [ ] `main` is still untouched at `b38d146`
- [ ] Setup screen now shows "Generate World Taxonomy" as a required step before run
- [ ] Clicking it triggers an LLM call and shows a loading state
- [ ] TaxonomyReview screen appears with detected genres from your project content
- [ ] Detected genres are sensible given your Bible (animal_kingdom and mythology should both be detected for the Jojo project)
- [ ] Engine reasoning text is visible and explains the detection
- [ ] Weight sliders adjust prevalence
- [ ] Suppressing a genre or kind via checkbox removes it from the simulation
- [ ] Adding a new genre or kind manually works and is included in the simulation
- [ ] "Regenerate Taxonomy" re-runs detection
- [ ] Running a simulation with cast size 200 creates roughly 200 active agents
- [ ] Mix of bound agents (Bible characters) plus procedural NPCs visible in event log
- [ ] Procedural NPCs age, deplete needs, die — same as bound agents in Phase 1
- [ ] Census size is roughly 5x cast size (visible in the results screen as a stat)
- [ ] Closing and reopening the project preserves the last taxonomy used per simulation in `deepSimulationHistory`
- [ ] Quick Scenario still runs unchanged (assuming API credits are available)
- [ ] No regression in any other tab — Story Bible, Mindmap, Timeline, Dashboard, Write, Library, Import, Capture
- [ ] Performance is acceptable at 200 cast × 30 rounds (target: completes in under 10 seconds)
- [ ] Performance is acceptable at 1000 cast × 30 rounds (target: completes in under 60 seconds)

### When Phase 2 is verified

Stop. Report. Wait for the user to run through the verification checklist personally before any work begins on Phase 3.

The user will paste verification status back to chat. If all pass, the chat session writes the Phase 3 brief expansion to `docs/SIMULATION_ENGINE_DESIGN.md` (replacing Section 7's Phase 3 placeholder, bumping doc to Version 1.2).

---

## How Claude Code Should Use This Document

Sequence:

1. Verify branch is `deep-simulation-rebuild` and working tree is clean
2. Read `docs/SIMULATION_ENGINE_DESIGN.md` fully
3. Apply the three Phase 1 corrections from Part A above to the design doc
4. Bump design doc version to 1.1, add changelog entry
5. Commit the corrections: `git commit -m "docs: apply Phase 1 deviations (v1.1)"`
6. Audit existing Phase 1 code (`src/components/DeepSimulation/*`) to understand current shape
7. Begin Phase 2 implementation as specified in Part B above
8. Stop after Phase 2 implementation, before any verification
9. Report what was built and the file diff summary
10. Wait for the user to run the verification checklist personally

Do not skip any step. Do not start Phase 3.

---

## End of Phase 2 Brief
