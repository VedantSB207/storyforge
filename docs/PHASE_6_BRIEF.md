# Phase 6 Brief — Bible Hydration, World Rules, Insights, Live Experience, Polish

**Branch:** `deep-simulation-rebuild`
**Prerequisite commit:** `a1949f7` (Phase 5 complete)
**Design doc:** `docs/SIMULATION_ENGINE_DESIGN.md` (currently v1.7)

**This brief supersedes the prior Phase 6 brief.** Bible Hydration has been added as workstream 6a-i. Everything else from the prior brief is preserved.

---

## Part A — Design doc update (v1.8) before Phase 6 code

Add two new sections near the end of the design doc.

### Section 1 — Story is the base; simulation is the projection forward

> The simulation must honor the writer's existing story as initial state, not rebuild it from zero. A writer who has spent months developing characters, relationships, and a timeline expects the simulation to extend that work, not replicate it from a blank slate.
>
> Phase 6 introduces **Bible Hydration** as the simulation's initialization layer:
>
> - Character profiles are read by an LLM at the first simulation run on a project. The engine extracts each character's age, current status, current location, and background summary. The writer reviews and edits these in a **Hydration Review screen** before the simulation begins.
> - The **Relationship Web** is read by the engine and mapped to initial agent bonds. A Bible entry "Jojo and Nyra are companions" becomes a starting friendship bond between their agents, not a void.
> - A **story snapshot** field describes the moment from which the simulation projects forward. The writer chooses per-simulation whether to use a project-level snapshot or enter a per-simulation override.
> - Optional **Knowledge seeding** pre-loads each bound character's Knowledge layer with what they know at story start, drawn from their profile and the existing chapters. Default ON; can be disabled via a popup that explains the impact.
>
> After hydration, the simulation runs as it did in Phases 1–5 — but the world it explores is *the writer's world at the current story moment*, not a tabula rasa.

### Section 2 — World Rules

> The engine cannot assume Earth biology applies to every story. A fantasy world may have animals that live centuries; a slice-of-life drama may not care about aging at all. The writer is the authority on these rules, not the engine.
>
> Phase 6 introduces a **World Rules** panel as a top-level navigation item, separate from Story Bible and taxonomy. It contains:
>
> - **Aging behavior** — does aging matter? At what speed?
> - **Needs depletion** — per-need speed multipliers
> - **Per-kind lifespan overrides** — table of detected kinds with default lifespan ranges and overridable fields
> - **Global lifespan multiplier** — single dial scaling all lifespans
> - **Custom narrative rules** — free-text field where the writer describes any other rules of their world
>
> Additionally, the difficulty preset from Phase 5 is replaced by **Story-Scale Presets**:
>
> | Preset | Time unit | Rounds | Roughly covers |
> |---|---|---|---|
> | Thriller / Crisis | day | 30 | One month |
> | Drama / Focused story | week | 30 | 7 months |
> | Novel | month | 24 | 2 years |
> | Saga | year | 20 | 2 decades |
> | Generational epic | year | 100 | A century |
> | Custom | user-set | user-set | computed |

Bump version to **v1.8**, add changelog:

> v1.8 — Phase 6: Bible Hydration (character inference, relationship → bonds, story snapshot, knowledge seeding). World Rules panel + Story-Scale Presets. Insight panels (blind spot, promotion candidates, emotional weather, themes). Live progress streaming. Credit observability. LLM-enriched character narratives.

Commit this design doc update alone before any Phase 6 code.

---

## Part B — Phase 6 implementation

Six workstreams. Implement in this order:

1. **6a-i — Bible Hydration** (most foundational layer; STOP and verify before continuing)
2. **6a-ii — World Rules + Story-Scale Presets** (physics layer)
3. **6b — Phase 5 carryovers**
4. **6c — Live experience**
5. **6d — Insight panels**
6. **6e — Final polish**

Each commits separately.

---

## Workstream 6a-i — Bible Hydration

This is the single most important workstream of Phase 6. Get it right before moving on. **After 6a-i lands, stop and produce the verification report before continuing to 6a-ii.**

### New files

**`src/components/DeepSimulation/hydration/characterInference.js`** (~200-280 lines)

Reads each bound Bible character's profile and infers structured initial state via one Sonnet call per character.

Inputs:
- Character profile text (name, description, traits, fears, secrets, stakes, other free-form fields)
- Optional excerpts from chapters where the character appears
- World Rules custom narrative rules (so inference respects the writer's stated world physics)

Output (per character):
```json
{
  "agentId": "...",
  "age": { "value": 8, "approximate": true, "reasoning": "described as 'young vampire dog still learning his powers'" },
  "status": "alive",
  "location": "central",
  "backgroundSummary": "Young vampire dog learning his powers under his master Garm, who has recently gone missing. Travels with his companions Nyra, Russell, Noctus, and Split-Eye.",
  "keyRelationships": [
    { "with": "Nyra", "type": "companion", "evidence": "described as travelling companion" },
    { "with": "Garm", "type": "mentor", "evidence": "master, currently missing" }
  ]
}
```

Prompt template:
- System: "You are reading a character's profile to extract initial state for a story simulation. Be conservative — only state what's explicit or strongly implied. Mark approximate inferences with `approximate: true`. Return strict JSON matching the schema."
- User: Character profile + relevant chapter excerpts + World Rules text

Cache the inference on the project. Re-run only when the character's profile is edited (compare text hash).

Model: `claude-sonnet-4-20250514`, max_tokens: 600 per character, temperature: 0.3.

Cost: ~$0.01-0.02 per character × typical 11 bound chars = $0.11-0.22 per project (one-time, cached after).

**`src/components/DeepSimulation/hydration/relationshipMapper.js`** (~120-180 lines)

Pure logic — no LLM call. Reads the Relationship Web and maps to initial agent bonds.

Mapping table:

```javascript
const RELATIONSHIP_TO_BOND_MAP = {
  'family|kin|parent|sibling|child|relative': 
    { bondType: 'kinship', intensity: 0.7, trust: 0.7 },
  'spouse|lover|romantic|partner|husband|wife': 
    { bondType: 'love', intensity: 0.8, trust: 0.7 },
  'friend|companion|ally|comrade|teammate': 
    { bondType: 'friendship', intensity: 0.6, trust: 0.6 },
  'mentor|teacher|master': 
    { bondType: 'friendship', intensity: 0.7, trust: 0.7 },
  'student|apprentice|protege': 
    { bondType: 'friendship', intensity: 0.7, trust: 0.6 },
  'rival|competitor|adversary': 
    { bondType: 'rivalry', intensity: 0.5, trust: -0.2 },
  'enemy|antagonist|nemesis|foe': 
    { bondType: 'enmity', intensity: 0.7, trust: -0.7 },
  'acquaintance|known': 
    { bondType: 'weak', intensity: 0.2, trust: 0.1 }
};
```

Functions:
- `mapRelationshipsToBonds(relationshipWebData, agentIdLookup) => { agentId: bondMap }`
- `getDefaultBondForRelationshipType(typeString) => { bondType, intensity, trust }`
- Adds a `history` entry to each created bond: `{ round: 0, eventType: 'hydration', dIntensity: <value>, dTrust: <value>, source: 'bible' }`

Handles asymmetric relationships (A → B may differ from B → A) by storing each direction separately.

**`src/components/DeepSimulation/hydration/knowledgeSeeder.js`** (~150-220 lines)

Optional layer. One Sonnet call per bound character that extracts "what this character knows at story start" from their profile + relevant chapters.

Default: ON. Writer can disable via a setup-screen toggle with a popup explaining impact.

Output (per character): an array of Knowledge entries to pre-load into the agent's Knowledge layer:
```json
[
  { 
    "content": "My master Garm has gone missing.", 
    "confidence": 1.0, 
    "source": "firsthand_history", 
    "hops": 0,
    "roundLearned": 0
  },
  { 
    "content": "I am still learning my powers as a vampire dog.", 
    "confidence": 1.0, 
    "source": "self_knowledge", 
    "hops": 0,
    "roundLearned": 0
  }
]
```

Cap: 5-8 entries per character.

Cost: ~$0.01 per character × 11 = $0.11 per simulation (only when toggle is on).

**`src/components/DeepSimulation/hydration/HydrationReview.jsx`** (~250-350 lines)

The review screen the writer sees after character inference completes (or when re-opening from settings).

Layout:
- Header: "Story Setup — Review what the simulation sees"
- Cards: one per bound character
- For each character:
  - Name + portrait/icon
  - Editable fields: Age, Status (dropdown), Location (dropdown from regions + custom), Background Summary (textarea)
  - Inferred Relationships section (read-only)
  - "Reset to inferred" button per field
  - "Keep my edits" indicator if writer has changed something
- Bottom: "Apply and continue" + "Re-run inference" buttons

When writer clicks Apply, the values become the project's stored hydration data.

**`src/components/DeepSimulation/hydration/storySnapshot.js`** (~80-120 lines)

Manages the story snapshot — the prose description of "where the story is right now."

Two storage tiers:
- **Project-level snapshot:** stored as `project.storySnapshot`. Edited in Story Bible (new section: "Story State").
- **Per-simulation snapshot:** stored in the simulation result. Overrides project-level for that run.

Functions:
- `getActiveSnapshot(project, simConfig) => string`
- `setProjectSnapshot(projectId, text)`
- `setSimSnapshot(simConfig, text)`

The active snapshot text gets injected into:
- Narrative summary prompts (system message)
- Dialogue generation prompts (system message)
- Tier 2 decision prompts for bound characters (context section)

### Files to modify

**`src/components/StoryBible/StoryBible.jsx`**
- Add "Story State" section near the top of the Bible
- Textarea for the project-level story snapshot
- Tooltip: "Describe where your story is right now. The simulation will project forward from this moment."
- Save on blur

**`src/components/DeepSimulation/DeepSimulation.jsx`** (setup screen)

Add hydration check at sim setup:
- If project has no hydration data, show "Setting up the story..." → run character inference → open Hydration Review → writer confirms → proceed to sim setup
- If hydration data exists, proceed directly

Sim setup screen gets new fields:

**Story snapshot mode** — radio with explanatory text:
- ○ Use project snapshot
  > *This simulation uses the story state defined in your Story Bible. All simulations from this project share the same starting moment. Best for exploring multiple possibilities from a fixed point in your story.*
- ○ Use custom for this run
  > *Enter a different story state just for this simulation. Best for exploring "what if my story were at a different moment" or comparing how events unfold from different starting points.*
  - If selected: show editable textarea pre-filled from project snapshot

**Knowledge seeding toggle** (default ON):
- Label: "☑ Seed character knowledge from your story *(recommended, ~$0.10-0.15 per simulation)*"
- On uncheck: show popup:
  > **Are you sure you want to disable knowledge seeding?**
  >
  > **With this ON:** Each bound character knows what your story says they know — past events they witnessed, secrets they hold. The simulation continues your story. Costs ~$0.10-0.15 per simulation.
  >
  > **With this OFF:** Characters start with no memory of your existing story. The simulation may produce scenes that contradict events you've already written. Best for "alternate universe" exploration. Saves ~$0.10-0.15 per simulation.
  >
  > [Keep it on] [Turn it off]
- Setting persists for this sim only

**`src/components/DeepSimulation/AgentFactory.js`**
- At bound agent creation, read hydration data:
  - Apply age from hydration (override any default)
  - Apply status (if dead, exclude from active cast; if missing, flag as offstage)
  - Apply location
  - Apply background summary into agent's `bibleContext` field (used by Tier 2 prompts)
- Read relationship mapping output and pre-populate `agent.bonds`
- If Knowledge seeding was on, pre-populate `agent.knownFacts` with seeded entries

**`src/components/DeepSimulation/SimulationRunner.js`**
- Accept new config params: `hydrationData`, `storySnapshot`, `knowledgeSeedingEnabled`
- Thread them to AgentFactory and to LLM prompts
- Track Knowledge seeding cost separately in `costBreakdown.hydration`

**`src/components/DeepSimulation/narrativeSummary.js`**
- Include `storySnapshot` in system prompt: "The writer's story currently sits at this moment: {snapshot}. Your chronicle should continue from there."
- Include each bound character's `backgroundSummary` so the chronicle frames their actions against established context

**`src/components/DeepSimulation/dialogue.js`**
- Include `storySnapshot` in system prompt for dialogue scenes
- Include each speaker's `backgroundSummary`

**Project persistence**
- Add `hydrationData` field to project schema (per-bound-character extracted state + writer edits)
- Add `storySnapshot` field (string)
- Migrate existing projects: missing fields populate as empty/null; trigger hydration on first sim run

### Status-aware cast management

Critical detail: agents with status `dead` or `missing` need special handling.

- **dead**: not in cast at all, but their name appears in other agents' Knowledge as a historical figure
- **missing**: in cast as an `offstage` agent — doesn't take actions or witness, but bonds toward them persist, and others may speak of them
- **exiled**: like missing, in a specific region the writer can mark
- **dormant**: in cast normally but action probability dramatically reduced

Implement these as agent state flags read by `decisionLogic.js` (filters availableActions) and `witnessRules.js` (filters witness eligibility).

---

## Workstream 6a-ii — World Rules + Story-Scale Presets

### New files

**`src/components/WorldRules/WorldRulesPanel.jsx`** (~300-400 lines)

A new top-level navigation tab. Layout sections:

1. **Time & Reality** — aging toggle + speed; per-need depletion sliders
2. **Per-Kind Lifespan Overrides** — table populated from taxonomy
3. **Global Lifespan Multiplier** — single dial 0.5x–10x
4. **Custom Narrative Rules** — free-text field
5. Save / Reset buttons

**`src/components/WorldRules/worldRulesSchema.js`** (~80-120 lines)

```javascript
export const DEFAULT_WORLD_RULES = {
  aging: { matters: true, speed: 1.0 },
  needs: {
    physiologicalSpeed: 1.0, safetySpeed: 1.0,
    belongingSpeed: 1.0, esteemSpeed: 1.0, purposeSpeed: 1.0
  },
  lifespanOverrides: {},
  globalLifespanMultiplier: 1.0,
  customNarrativeRules: ""
};

export const NARRATIVE_SCALE_PRESETS = {
  thriller: { label: "Thriller / Crisis", timeUnit: "day", rounds: 30, description: "One month — intense pace, acute pressure" },
  drama: { label: "Drama / Focused story", timeUnit: "week", rounds: 30, description: "7 months — character relationships, focused arc" },
  novel: { label: "Novel", timeUnit: "month", rounds: 24, description: "2 years — novel-length story" },
  saga: { label: "Saga", timeUnit: "year", rounds: 20, description: "2 decades — generational story" },
  epic: { label: "Generational epic", timeUnit: "year", rounds: 100, description: "A century — sweeping arc" }
};
```

**`src/components/WorldRules/lifespanResolver.js`** (~100 lines)

Resolves an agent's lifespan from kind + overrides + global multiplier. Falls back to real-world defaults for unknown kinds; for kinds with explicit overrides, uses overrides × global multiplier.

### Files to modify (for 6a-ii)

- `AgentFactory.js` + `NPCGenerator.js` — use `lifespanResolver` instead of hardcoded lifespan ranges
- `stateUpdaters.js` — apply `worldRules.aging.speed` and `worldRules.needs.*Speed` multipliers
- `SimulationRunner.js` — accept and thread `worldRules` config
- `narrativeSummary.js` — include `customNarrativeRules` in system prompt
- `worldTaxonomy.js` — include `customNarrativeRules` in taxonomy detection prompt
- `DeepSimulation.jsx` setup screen — replace difficulty dropdown with Story-Scale Preset selector
- `App.jsx` — add "World Rules" as a new top-level nav tab
- Project persistence — add `worldRules` field; migrate existing projects with `DEFAULT_WORLD_RULES`

---

## Workstream 6b — Phase 5 carryovers

### Scenario per-variant visualizations

Currently each variant in a Scenario run shows only narrative + headline. Wire each variant panel to use the full `ResultsScreen` with all tabs.

After Phase 6:
- Comparison tab: cross-variant analysis (existing)
- Variant 1: full layout
- Variant 2: full layout
- Variant 3: full layout

### Trace persistence opt-in

Add toggle on sim setup:

> ☐ **Preserve causation data** (saves butterfly trace with the simulation, ~50MB per 1000-cast run)

When on, persistence saves the full trace. When viewing past runs with this toggled on, the Causation tab works fully.

---

## Workstream 6c — Live experience

### Real-time progress streaming

Replace static "Running..." screen with `<SimulationProgress />` showing:
- Round progress bar
- Live event log (last 20 events, scrolling)
- Tier counters (T0 / T1 / T2 / dialogue / hydration)
- Estimated time remaining
- Cancel button

### Credit observability

- Pre-launch cost estimate below Run button: "Estimated cost: $0.45–0.85"
- If estimate exceeds $5: warning banner
- Live spend tracker during run
- Post-run: actual vs estimated comparison

New module: `costEstimator.js` for cost projection (cast × rounds × tier-projection × per-call cost).

---

## Workstream 6d — Insight panels

Four analytical panels added as new tabs in results layout. After 6d, the layout has 9 tabs: Chronicle / Characters / World / Bonds / Causation / **Blind Spots** / **Promotion Candidates** / **Emotional Weather** / **Themes**.

All four computed at the end of simulation:

- **Blind Spot Detection** — heuristic + LLM (one Sonnet call). Detects under-served regions, character types, genres. Cost ~$0.02.
- **Promotion Candidates** — heuristic + LLM (one Sonnet call). Identifies procedural NPCs whose action patterns suggest narrative significance. Cost ~$0.02.
- **Emotional Weather** — pure aggregation. Chart of average needs/stress over rounds. No LLM.
- **Theme Detection** — one Sonnet call. Identifies 3-5 thematic patterns. Cost ~$0.02.

Setup-screen toggle: "Generate insight panels (~$0.06 per simulation)" default ON.

---

## Workstream 6e — Final polish

### LLM-enriched character narratives

"Generate narrative arc" button on each CharacterThreads card. One Sonnet call per character on demand. Cached. Cost ~$0.01 per character.

### Help and onboarding text

Tooltips on all new UI elements. First-time-user banner on Deep Simulation tab.

### Documentation pass

Update design doc to v1.9 with all Phase 6 additions and a "How to use Deep Simulation" guide.

---

## Performance and cost

### Performance targets

Unchanged from prior brief. Hydration adds ~10-30s to first simulation run on a project; subsequent runs use cached data.

### Cost impact per Progressive simulation

| Layer | Cost |
|---|---|
| Phase 5 baseline | $0.50-0.65 |
| Hydration (one-time per project) | $0.11-0.22 |
| Knowledge seeding (default ON, per sim) | $0.10-0.15 |
| Insight panels (default ON, per sim) | $0.06 |
| **Total per sim (default settings, after first run)** | **$0.66-0.86** |
| **First sim on a new project** | **$0.77-1.08** |

For Scenario mode multiply by variant count + $0.05 for cross-variant comparison narrative.

---

## Test plan

### 6a-i — Bible Hydration

1. Open a fresh project (Jojo). Click into Deep Simulation tab.
2. Engine detects no hydration data → runs character inference → opens Hydration Review.
3. Verify all 11 bound characters have inferred fields populated.
4. **Critical check:** Jojo's age should reflect "young vampire dog learning his powers" — under 20, not the previous default of ~30.
5. **Critical check:** Master Akshara's age should reflect "ancient and wise" — 100+.
6. Edit one field (e.g., Jojo's age to 6). Save.
7. Re-open Hydration Review. Confirm edit persisted.
8. Edit a character's profile in Story Bible. Re-open Deep Simulation. Confirm engine offers to re-run inference for that character.
9. Run a 30-month Drama preset simulation with knowledge seeding ON.
10. Inspect a bound character's bonds at sim start (round 0). Confirm populated from Relationship Web — Jojo should have bonds with Nyra (friendship), Garm (friendship/mentor), etc.
11. Inspect a bound character's Knowledge at round 0. Confirm 5-8 pre-loaded entries with `source: 'firsthand_history'` or `source: 'self_knowledge'`.
12. Disable knowledge seeding via toggle. Confirm popup appears with correct text. Run sim. Confirm characters have no pre-loaded Knowledge.

### 6a-ii — World Rules + Story-Scale Presets

1. Open World Rules tab. Confirm exists in main nav.
2. Override Great Gray Owl lifespan to 150-250. Save.
3. Set global multiplier to 2x. Save.
4. Toggle "Aging matters" off. Save.
5. Run a 30-month Novel preset sim. Confirm:
   - NPCs of kind Great Gray Owl have lifespans 300-500 (overridden × multiplier)
   - No aging-related deaths
   - Custom narrative rules appear in narrative output if filled

### 6b — Carryovers

1. Run 3-variant Scenario. Confirm each variant has full tab layout.
2. Enable "Preserve causation data". Save. Open past run. Confirm Causation tab fully populated.

### 6c — Live experience

1. Start a sim. Confirm progress screen renders with live event log, tier counters, time remaining.
2. Cancel mid-run. Confirm clean halt.
3. Pre-launch estimate shows. Post-run actual matches estimate within reason.

### 6d — Insight panels

1. Run sim with insights ON. Confirm 4 new tabs populated with real content.
2. Paste samples in report.

### 6e — Polish

1. Generate character arc for Jojo. Confirm output, confirm cache.
2. Open new project: first-time-user banner appears.

### Final integration test

1. Fresh project with custom World Rules + edited hydration + project snapshot.
2. Drama preset, all defaults on. Run.
3. Verify all 9 tabs render.
4. Run 3-variant Scenario with all features. Verify per-variant tabs work.
5. Run 1000-cast stress with insights + knowledge seeding ON. Verify cost under $3.

### Regression
- `git diff main -- src/components/SimPanel.jsx` empty
- Determinism preserved with disableLLM:true

---

## What to report after each workstream

After **6a-i** (STOP and report before continuing):
- File diff
- Hydration Review screenshot for Jojo project (show all 11 characters' inferred fields)
- Jojo's age (must be young) and Master Akshara's age (must be old) — proof inference reads profile correctly
- A bound character's initial bonds at round 0 (real JSON dump showing Relationship-Web-sourced bonds)
- A bound character's seeded Knowledge at round 0 (real JSON dump, 5-8 entries)
- Sample narrative output that references the story snapshot

After **6a-ii**:
- World Rules panel screenshot
- Story-Scale Preset selector screenshot
- Mortality + narrative for a Novel preset run with custom lifespans

After **6b**:
- Per-variant tab working screenshot
- Past run with full Causation tab screenshot

After **6c**:
- Live progress screenshot mid-run
- Pre-launch estimate vs actual cost for one run

After **6d**:
- Sample content from each insight panel (real LLM output)

After **6e**:
- Sample character arc
- Updated design doc v1.9

Final report:
- Total cost across all tests
- Stress test results
- Performance numbers
- Merge readiness assessment for `deep-simulation-rebuild → main`

---

## Explicitly NOT in Phase 6

- Faction-as-first-class-object refactor
- Multi-project comparison
- Public wiki publishing
- Real-time collaboration
- Custom action vocabulary editor
- Audio/visual story prompts in dialogue
- Per-simulation tweaking of individual agent state mid-run

---

## Commit discipline

- One commit for v1.8 design doc update
- One commit per workstream: 6a-i, 6a-ii, 6b, 6c, 6d, 6e
- All pushed to `deep-simulation-rebuild`
- After Phase 6 verifies clean, `deep-simulation-rebuild` merges to `main`. This completes the rebuild.

---

## End-state vision

When Phase 6 completes, the writer's workflow becomes:

1. **Build the story** in Story Bible — characters, relationships, lore, chapters, timeline
2. **Set the world's physics** in World Rules — how aging works, how needs work, custom lifespans, custom rules
3. **Set the story state** in Bible — describe where the story currently sits
4. **Run a simulation** — engine reads everything from steps 1-3, runs the Hydration Review screen, applies the writer's confirmed initial state, then simulates forward
5. **Experience the world from above** — 9-tab results layout shows the chronicle, characters, world, bonds, causation, blind spots, promotion candidates, emotional weather, themes
6. **Generate per-character narrative arcs** on demand
7. **Run alternate Scenarios** to compare variants of how the story might unfold from the same moment

The simulation is no longer "what if these characters met today." It's "given everything you've built, what happens next." That's the engine you wanted.
