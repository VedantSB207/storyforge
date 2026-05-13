# StoryForge Deep Simulation Engine
## Implementation Design Document

**Version 1.9**
**Branch:** `deep-simulation-rebuild`
**Document location in repo:** `docs/SIMULATION_ENGINE_DESIGN.md`

---

## How to use this document

This is the source of truth for the Deep Simulation engine rebuild. Every Claude Code session working on this rebuild reads this document at the start. The first action of every session is:

1. Verify the current branch is `deep-simulation-rebuild`
2. Read this document fully
3. Read the codebase to understand the current state
4. If anything in this document conflicts with what is found in the codebase, the codebase is the truth — flag the conflict to the user before making changes

The document is divided into seven sections. Sections 1–3 are architectural background. Section 4 is the Phase 1 implementation brief — that is what gets built first. Sections 5 and 6 are verification and integration. Section 7 contains the briefs for Phases 2–5, which become active only after the previous phase has been verified working.

---

## Section 0 — Setup

### Branch creation

The first Claude Code session in this rebuild does the following:

```
1. Verify the current branch is `main` and working tree is clean.
   If not clean, stop and ask the user how to proceed.
2. Create the new branch: git checkout -b deep-simulation-rebuild
3. Push the branch to remote: git push -u origin deep-simulation-rebuild
4. Confirm the branch is active and remote is set
5. Create the docs/ directory if it does not exist
6. Save this document to docs/SIMULATION_ENGINE_DESIGN.md
7. Commit the documentation: git commit -m "docs: add simulation engine design document"
```

All subsequent sessions verify they are on `deep-simulation-rebuild` before any work begins. Switching to `main` is only permitted when explicitly merging at the end of the rebuild.

### Working principle

The `main` branch contains the working app the writer uses day-to-day. It must not break. All experimental work happens on this branch. When the rebuild is complete and tested, the branch is merged into `main` as a single deliberate action.

---

## Section 1 — Vision and Positioning

### What Deep Simulation is

Deep Simulation is a real multi-agent simulation system. Agents are persistent objects with state — personality, memory, age, needs, relationships, location, faction. They interact in rounds. Information propagates between them through a graph that respects physical, social, and factional distance. Events distort as they travel. Some agents witness directly; others learn through rumour, message, or scrying. Some agents die; others are born. The system models a living world that evolves in response to a writer's story situation.

This is the actual implementation of StoryForge's "narrative physics engine" positioning.

### What it does not replace

The existing SimPanel is preserved untouched and renamed "Quick Scenario." It remains the fast prompt-based brainstorming tool (~$0.02 per run, instant). Deep Simulation is added as a separate new tab. Both coexist. They serve different writing problems.

Quick Scenario is for daily brainstorming — a writer wonders "what if Jojo betrays Nyra here?" and gets an instant prose-based scenario.

Deep Simulation is for serious architectural work — a writer wants to know how a multi-faction conflict plays out across six months, with hundreds of agents reacting to information propagating through their world. Takes minutes, costs $1–25 per run, produces a readable chronicle.

### Why both exist

Different tools for different writing problems. Both belong in the product. The Dashboard surfaces insights from both as separate panels.

---

## Section 2 — Architecture Overview

### System flow (in plain words)

A simulation run takes inputs from the writer's existing project state (Story Bible characters, Import & Analyse blueprint, world rules, notes, Timeline chapters). It uses those inputs to detect a world taxonomy — which genres of being inhabit this world. From the taxonomy it generates a census (the broad world population, potentially thousands of agents). From the census it draws an active cast for the specific scenario being run (the subset whose decisions are actually computed each round). Then it runs a round loop. Each round: events are perceived, state is updated, decisions are made, actions are taken, propagation happens, everything is logged. Information flows between agents through a graph that respects distance. The output is a chronicle (Progressive mode) or a comparison across variants (Scenario mode).

### Agent state schema

Each agent is a JavaScript object with eight layers of state. Below is the full schema.

```javascript
{
  // ===== Layer 1: Identity =====
  id: string,                       // unique
  name: string,
  source: 'bound' | 'procedural',   // bound = linked to Story Bible character
  bibleId: string | null,           // Story Bible character ID if bound
  genreTag: string,                 // e.g., 'animal_kingdom:rattlesnake', 'mythology:goblin'
  isUnique: boolean,                // bound agents only: is this a one-of-a-kind character

  // ===== Layer 2: Body and time =====
  age: number,                      // in years
  lifeExpectancy: number,           // for this species/role
  health: number,                   // 0-1 scalar
  conditions: string[],             // ['injured', 'pregnant', 'sick', 'starving']
  mortalityRisk: number,            // 0-1, recomputed each round
  timeHorizon: number,              // rounds ahead this agent thinks (mortality salience)

  // ===== Layer 3: Mind =====
  traits: string[],                 // 3-5 personality keywords (from Bible if bound)
  values: string[],                 // what they hold sacred
  fears: string[],                  // what they avoid
  cognitiveDisposition: {
    paranoiaTrust: number,          // -1 (paranoid) to 1 (trusting)
    conservatismNovelty: number,    // -1 (conservative) to 1 (novelty-seeking)
    socialSolitary: number          // -1 (solitary) to 1 (social)
  },
  perceptionAbilities: [            // for exceptional perception
    {
      type: string,                 // 'scrying', 'telepathy', 'remote_view', 'raven_network'
      range: string,                // 'global', 'faction', 'specific_target', 'region'
      targets: string[],            // agent IDs or place IDs
      conditions: string[]          // ['must_have_mirror', 'must_be_at_altar', 'must_be_awake']
    }
  ],

  // ----- Note on Bible character data shape -----
  // Story Bible stores `traits` as a comma-separated string and `secrets` as
  // multi-line free text. The agent state schema treats both as `string[]`.
  // The AgentFactory normalises at the boundary: `traits` is split on commas,
  // `secrets` is split on newlines, both trimmed and empty entries filtered.
  // Future code consuming agent state can rely on the array typing.

  // ===== Layer 4: Drives =====
  needs: {                          // 0-1 scalars, fluctuate each round
    physiological: number,          // hunger, shelter, rest
    safety: number,                 // current threat level
    belonging: number,              // social connection vs isolation
    esteem: number,                 // status in their community
    purpose: number                 // progress toward something self-defined
  },
  goals: [                          // ranked stack
    {
      id: string,
      description: string,
      priority: number,
      progress: number              // 0-1
    }
  ],
  longTermAspiration: string,

  // ===== Layer 5: Bonds =====
  relationships: {                  // map of other agent IDs to edge data
    [otherAgentId]: {
      type: string,                 // 'romantic'|'familial'|'platonic'|'mentor'|'rival'|'enemy'|'debt'|'professional'
      intensity: number,            // 0-1
      trust: number,                // 0-1, separate from intensity
      history: string[]             // key shared event IDs
    }
  },
  factions: string[],               // faction labels (v1: just labels)

  // ===== Layer 6: Knowledge =====
  knownFacts: [
    {
      factId: string,
      content: string,
      source: string,               // agent ID or 'witnessed_directly'
      confidence: number,           // 0-1
      witnessed: boolean,           // did this agent see it directly
      learnedAtRound: number,
      distortionLevel: number       // 0-1, how far from origin
    }
  ],
  secrets: string[],
  memoryDecayRate: number,          // 0-1, how fast unreinforced facts fade

  // ===== Layer 7: Position =====
  location: {
    region: string,
    town: string,
    place: string                   // specific place within town
  },
  travelSpeed: number,              // distance units per round
  socialEmbeddedness: string[],     // networks/groups they belong to
  dailyOrbit: string[],             // typical places visited each round

  // ===== Layer 8: Current state =====
  emotion: string,                  // 'calm'|'angry'|'grieving'|'fearful'|'joyful'|'anxious'|'vengeful'
  stress: number,                   // 0-1
  trustDisposition: number          // 0-1, current openness to others
}
```

### World taxonomy

At simulation start, the engine reads all character signals from across the project:
- Story Bible characters
- Import & Analyse blueprint output
- Notes
- World rules
- Timeline chapter summaries

It groups these into genre clusters. A genre is a category of being — `animal_kingdom`, `mythology`, `humans`, `spirits`, `mechanical`, etc. — with sub-categories specific to the world.

The engine then presents the detected taxonomy to the writer for review. The writer can:
- Confirm the detected genres
- Adjust weighting (animal kingdom prevalent, mythology rare, etc.)
- Add genres the engine didn't detect (a writer may plan to introduce a genre later)
- Suppress genres they don't want active in this simulation

The confirmed taxonomy drives NPC generation. The engine populates the world census with members of the confirmed genres in the confirmed proportions.

### Census and active cast

The world census is the total population that exists conceptually. It can be much larger than the active cast — potentially 5,000–20,000 agents — and includes any procedurally generated NPC who could plausibly exist in this world.

The active cast is the subset whose decisions are actually computed each round. The writer sets cast size (50, 200, 500, 1000, or 2000). The engine draws the active cast from the census based on relevance to the scenario — agents in scenario-relevant locations, factions, or relationships get prioritised.

A census-only agent can be promoted to active mid-simulation if a propagating event reaches them. A previously-active agent can drop back to census if they become irrelevant to the scenario.

### Event system

Every action in the simulation creates an event. Events have nine categories:

1. **Witnessed action** — physical action seen by agents in proximity
2. **Overheard speech** — partial speech caught by nearby agents
3. **Direct communication** — intentional communication from one agent to another
4. **Message delivered** — asynchronous communication via messenger
5. **Rumour** — multi-hop information passing through agents
6. **Environmental change** — weather, harvest, disaster, political shift
7. **Internal realisation** — insight from connecting existing knowledge
8. **Bond event** — betrayal, alliance, declaration, broken trust
9. **Death and birth** — special events with cascade effects

Each event carries:
```javascript
{
  id: string,
  category: string,                 // one of the nine above
  round: number,
  origin: {
    agentId: string,                // who originated it
    location: object                // where it happened
  },
  content: string,                  // what happened
  witnesses: string[],              // agent IDs who perceived it directly
  significance: number,             // 0-1, computed from impact
  causedBy: string[],               // event IDs that led to this event (for butterfly traces)
  consequences: string[]            // event IDs this caused later (populated retroactively)
}
```

### Propagation graph

Information moves between agents through three mechanics:

**Distance shapes speed.** Physical distance, social distance (friends-of-friends), and factional distance (in-group vs out-group) all affect how fast information reaches an agent. The same fact can reach two agents at very different speeds depending on which network it travels through.

**Each hop distorts.** Information is filtered through the carrier's Mind layer. A paranoid carrier amplifies threats. A loyal carrier softens doubts about their leader. A drunk witness mangles details. Distortion is character-driven, not random.

**Attribution decays.** Original source is obscured across hops. After enough hops, no one can name a source. This is when speculation, conspiracy, and exploitation gain traction — and when the Narrative Divergence Engine has something real to operate on.

### Round structure

Each round is a sequence of phases:

1. **Perceive** — process incoming events from the previous round
2. **Update state** — needs deplete, emotions shift, knowledge updates
3. **Decide** — choose action (most decisions deterministic, some via LLM)
4. **Act** — execute action, generating new events
5. **Propagate** — information flows along the graph
6. **Log** — record the round's events for the chronicle

### Decision logic split

Most decisions are deterministic, driven by needs vector and trait logic. LLM calls fire only for:

- Named character (Story Bible) decisions
- Plot-critical NPC decisions
- Dialogue when characters speak
- High-stakes information distortion (rumours about to become major plot drivers)
- Complex moral choices that deterministic rules can't handle
- Novel situations the rules don't cover

This is what keeps cost manageable. Tier routing sends low-stakes deterministic decisions through Ollama running locally on the user's VPS; high-stakes decisions go through Claude Sonnet 4.

### Two simulation modes

**Progressive mode.** Forward-moving timeline. Round 1 → Round 2 → Round 3. State accumulates. Decisions in round 5 are shaped by what happened in rounds 1–4. Output is a chronicle of how the story unfolds. Supports pause-and-inject mid-simulation. Use case: planning chapter sequences and multi-chapter arcs.

**Scenario mode.** Branching from a single fixed starting moment. Same scene, replayed N times with different decision paths. Each variant independent — no state carries between variants. Output is a comparison across variants. Supports both auto-generated variants and writer-defined manual variants. Use case: deciding what should happen in a single pivotal beat.

Mode is picked at the start of every simulation. Writer chooses each time.

### Round count and time unit

Writer sets two values:
- Time unit per round: 1 hour / 1 day / 1 week / 1 month / 1 season / 1 year
- Round count: 5 to 500

The engine adjusts mortality probabilities, birth rates, message travel times, and memory decay based on the time unit. Short scenarios (12 hours over 12 rounds) ignore aging. Long scenarios (30 years over 60 rounds) give dynastic mechanics meaningful time to play out.

### Output system

**End-of-run narrative summary** (added in Phase 2.5) — one Claude API call after the round loop completes, produces a flowing prose chronicle for the writer. Replaces a wall of state telemetry as the primary results display. Returns headline + 2–4 paragraphs + 3–5 notable-event bullets in story language. Per-call cost is comparable to taxonomy detection (~$0.02–0.05 depending on event log size). The detailed event log is preserved beneath as a collapsible technical view.

**Progressive mode output** — eight sections (nine if Narrative Divergence Engine is active):

1. Executive Summary — one paragraph, LLM-generated
2. Timeline Chronicle — chronological event log, filterable by significance
3. Character Threads — per-named-character arc as readable narrative
4. Butterfly Traces — interactive cause-and-effect chains, click to trace
5. Map View — geographic snapshot scrubbable through rounds
6. Relationship Matrix Changes — bond deltas before/after
7. Promotion Candidates — NPCs that had outsized impact, one-click promote to Story Bible
8. Plot Path Suggestions — 3–5 paths surfaced from real simulation data
9. Divergence Map (if NDE on) — theory mutation tree, residual belief percentages

**Scenario mode output** — three views plus synthesis:

1. Variant Cards — scannable summary per variant
2. Divergence Tree — visual tree of where variants split
3. Per-Variant Deep Dive — full eight-section chronicle per variant
4. Recommendation Panel — synthesis comparing variants

### Persistence

- Snapshot of Story Bible at simulation start (v1) — no live editing mid-run
- No memory between simulation runs — each starts fresh from the same Bible
- Always exploratory — simulation never auto-rewrites the Bible
- Writer canonises outcomes manually — promote NPCs, adopt plot suggestions, accept or reject deaths
- Simulation results stored in new project field `deepSimulationHistory` (separate from existing `lastSimulation`)

#### Persistence model — split storage (Phase 3.5)

Each simulation run is split into two artefacts:

- **Metadata stub** lives in the project's `deepSimulationHistory[]` array — small (~1 KB per entry), holds simId, timestamp, cast/round/unit, summary, narrative headline, alive/dead counts, totalCost, censusStats, butterflyStats. Loaded with the project.
- **Full result file** lives at `<userData>/projects/<projectId>/deep-sims/<simId>.json` — heavy (tens to hundreds of MB at large cast sizes), holds full agent Knowledge layers, full event log, full taxonomy, full narrative. Loaded only when the writer opens that simulation's result panel.

This keeps the project file O(simulation count), not O(simulation volume). Auto-save churn no longer rewrites hundreds of megabytes whenever an unrelated state change fires elsewhere in the app.

Migration: pre-Phase-3.5 projects with bundled `deepSimulationHistory[]` (full data inline) are detected on Deep Simulation tab mount. Inline entries are written to per-sim files; the in-project entries are replaced with metadata stubs; the project is then re-saved. Idempotent and silent.

---

## Section 3 — Phased Build Plan

The build is divided into five phases. Each phase delivers something testable. The next phase begins only after the current phase is verified working with the user.

**Phase 1: Foundation.** Agent state schema. Persistence layer. Minimal round loop with mortality and needs only. New Deep Simulation tab visible in UI. Quick Scenario tab renamed and untouched. No NPC generation yet (uses only Story Bible characters). No propagation. No decision logic beyond needs-vector basics. No outputs beyond a basic event log. Estimated time: 1–2 weeks.

**Phase 2: World population.** Genre detection from project content. Writer-facing taxonomy review screen. NPC generation from genres. Census and active cast model. Phase 2 brings the world to life — agent counts scale up to the writer-set cast size. Estimated time: 1–2 weeks.

**Phase 3: Information propagation.** Event system with all nine categories. Propagation graph using distance, distortion, attribution decay. Trait-based distortion for low-stakes hops. Writer-seeded events at simulation start. Pause-and-inject in progressive mode. Estimated time: 1–2 weeks.

**Phase 4: Both simulation modes and decision logic.** Progressive and Scenario modes both functional. Decision logic split between deterministic rules and LLM calls. Ollama tier routing for low-stakes work. Cost-aware execution. LLM-based distortion for high-stakes hops. Estimated time: 2 weeks.

**Phase 5: Output specifications and UI.** All eight (or nine) Progressive mode panels. All three Scenario mode views plus recommendation. Promotion flow. Dashboard integration to surface Deep Simulation insights. Polish. Estimated time: 1–2 weeks.

**Total estimated time: 6–10 weeks of focused work.**

---

## Section 4 — Phase 1 Detailed Brief

This is what Claude Code builds in the first phase. Phases 2–5 briefs are in Section 7 and become active only after this phase is verified.

### Goal of Phase 1

A working but minimal Deep Simulation tab. The writer can run a simulation that uses only their existing Story Bible characters as agents, watch them age across rounds, see needs deplete, see mortality events fire, and read a basic event log. No NPCs generated yet. No information propagation yet. No output panels yet beyond the event log.

This phase proves the core architecture works before adding complexity.

### Files to create

```
src/components/DeepSimulation/
├── DeepSimulation.jsx           // main component, top-level UI
├── SimulationRunner.js          // round loop logic
├── AgentFactory.js              // creates agents from Story Bible characters
├── stateUpdaters.js             // needs depletion, age increment, mortality check
├── EventLog.jsx                 // basic event log display
└── deepSimSchema.js             // exports the AgentState schema as a documented constant
```

### Files to modify

```
src/App.jsx                      // add Deep Simulation tab to NAV array; rename existing Simulation to "Quick Scenario"
electron/main.js                 // no changes needed. The existing save-project IPC handler is a generic data passthrough; it persists any field added to the project data object, including deepSimulationHistory. A separate handler would be redundant.
src/components/Dashboard.jsx     // no changes needed. Dashboard's setTab('simulation') uses the tab ID, which is unchanged. Only the user-facing label changes from "✦ Simulation" to "✦ Quick Scenario" in the App.jsx NAV array.
```

### NAV array change

Current NAV (in App.jsx) has:
```
Dashboard | Write | Mindmap | ✦ Simulation | Story Bible | Relationship Web | Timeline | Library | Import & Analyse | Quick Capture | ✦ AI
```

New NAV after Phase 1:
```
Dashboard | Write | Mindmap | ✦ Quick Scenario | ✦ Deep Simulation | Story Bible | Relationship Web | Timeline | Library | Import & Analyse | Quick Capture | ✦ AI
```

### Deep Simulation tab UI for Phase 1

Three screens:

**Setup screen** — visible when no simulation has been run yet, or when user clicks "New Simulation":
- Mode selector: Progressive (functional) | Scenario (greyed out with "Phase 4" badge)
- Cast size selector: 50 | 200 | 500 | 1000 | 2000 (Phase 1 will run only with Story Bible characters; if writer has 5 Bible characters and selects 200, only 5 agents run for now with a notice "NPC generation arrives in Phase 2")
- Round count: slider 5–500
- Time unit: dropdown (hour, day, week, month, season, year)
- Run Simulation button

**Running screen** — visible during simulation:
- Progress bar showing round X of Y
- Live event log streaming (basic format, no formatting yet)
- Pause button (functional for now, even though pause-and-inject arrives in Phase 3)
- Cancel button

**Results screen** — visible after simulation completes:
- Basic event log (all events in chronological order)
- Final state summary: how many agents alive vs dead, average needs scores, etc.
- Run Again button → returns to Setup screen

### Agent creation from Story Bible

The AgentFactory reads the project's `chars` array (existing Story Bible characters) and creates a bound agent for each. For Phase 1, only fields that exist in Story Bible are populated; other fields use defaults:

```javascript
function createAgentFromBibleCharacter(char) {
  return {
    id: `agent_${char.id}`,
    name: char.name,
    source: 'bound',
    bibleId: char.id,
    genreTag: 'unknown',          // populated in Phase 2
    isUnique: false,              // editable in Phase 2

    // Body and time — Phase 1 uses sensible defaults
    age: 30,                      // writer can adjust later
    lifeExpectancy: 80,
    health: 1.0,
    conditions: [],
    mortalityRisk: 0,
    timeHorizon: 10,

    // Mind — pull from Bible
    traits: char.traits || [],
    values: [],                   // populated later
    fears: [],
    cognitiveDisposition: {
      paranoiaTrust: 0,
      conservatismNovelty: 0,
      socialSolitary: 0
    },
    perceptionAbilities: [],

    // Drives — Phase 1 starts neutral
    needs: {
      physiological: 0.7,
      safety: 0.7,
      belonging: 0.5,
      esteem: 0.5,
      purpose: 0.5
    },
    goals: [],
    longTermAspiration: '',

    // Bonds — empty for Phase 1
    relationships: {},
    factions: [],

    // Knowledge — empty for Phase 1
    knownFacts: [],
    secrets: char.secrets || [],
    memoryDecayRate: 0.1,

    // Position — Phase 1 uses placeholder
    location: {
      region: 'unknown',
      town: 'unknown',
      place: 'unknown'
    },
    travelSpeed: 1,
    socialEmbeddedness: [],
    dailyOrbit: [],

    // Current state
    emotion: 'calm',
    stress: 0,
    trustDisposition: 0.5
  }
}
```

### Round loop for Phase 1

The SimulationRunner executes the round loop. For Phase 1 only three things happen each round:

1. **Age increment.** Every agent's age increases by the time unit (in years).
2. **Needs deplete.** Each need decreases slightly each round (rate proportional to time unit). When a need drops below 0.2, an event is logged: "Agent X is becoming desperate for [need]."
3. **Mortality check.** mortalityRisk is computed from age vs lifeExpectancy and current health. A random roll determines if death occurs. If death event fires, the agent is marked dead, an event is logged, and the agent stops acting in subsequent rounds.

No decisions, no propagation, no NPC generation, no LLM calls in Phase 1. Pure deterministic state evolution.

### Event log format for Phase 1

Each event is a simple object:

```javascript
{
  round: number,
  agentName: string,
  category: 'need_critical' | 'death' | 'aging',
  content: string                  // human-readable
}
```

Displayed as a chronological list in the EventLog component. No filtering, no significance, no causation tracking yet — those arrive in Phase 3.

### Persistence for Phase 1

The project save schema (in electron-store) gets a new field:

```javascript
{
  // ... existing fields unchanged ...
  deepSimulationHistory: [
    {
      id: string,                  // unique simulation run ID
      timestamp: ISO string,
      mode: 'progressive',         // only mode in Phase 1
      castSize: number,
      roundCount: number,
      timeUnit: string,
      agents: [...],               // final agent states
      events: [...],               // full event log
      summary: string              // brief text summary
    }
  ]
}
```

Existing `lastSimulation` field is untouched. Quick Scenario writes to `lastSimulation` as before. Deep Simulation writes to `deepSimulationHistory`.

### What Phase 1 deliberately does NOT do

This list is important. The temptation will be to add things; resist it.

- No NPC generation (Phase 2)
- No genre detection or world taxonomy (Phase 2)
- No information propagation (Phase 3)
- No event categories beyond aging, need_critical, death (Phase 3)
- No decision logic for actions (Phase 4)
- No LLM calls anywhere in the engine (Phase 4)
- No Ollama integration (Phase 4)
- No Scenario mode (Phase 4)
- No output panels beyond the basic event log (Phase 5)
- No promotion flow (Phase 5)
- No Dashboard integration of Deep Simulation results (Phase 5)

---

## Section 5 — Verification Checklist Per Phase

Each phase ends with the user manually running through these verification steps before proceeding to the next phase.

### Phase 1 verification

- [ ] Branch is `deep-simulation-rebuild` and `main` is untouched
- [ ] Existing Simulation tab is renamed to ✦ Quick Scenario in NAV
- [ ] Existing SimPanel functionality is unchanged — Quick Scenario runs and produces the same output it did before
- [ ] New ✦ Deep Simulation tab appears in NAV after Quick Scenario
- [ ] Setup screen renders with mode selector, cast size, round count, time unit, run button
- [ ] Scenario mode option is greyed out with "Phase 4" badge
- [ ] Running a simulation with 5 Bible characters and 20 rounds completes without errors
- [ ] Event log shows aging events, need-critical events, and death events when mortality fires
- [ ] Results are saved to `deepSimulationHistory` in electron-store
- [ ] Closing and reopening the project preserves the history
- [ ] No regression in any other tab (Story Bible, Mindmap, Timeline, Dashboard, Write, etc.)

### Phase 2–5 verification

Verification checklists for Phases 2–5 are added to this document at the start of each phase by Claude Code, in collaboration with the user.

---

## Section 6 — UI Integration and Quick Scenario Preservation

### Preservation rule

The existing SimPanel.jsx component is not modified except for one change: the label in App.jsx NAV array changes from "✦ Simulation" to "✦ Quick Scenario." Everything else — all conspiracy engine logic, narrative divergence framing, prompt construction, output parsing — remains as-is. The component still writes to the existing `lastSimulation` field.

### Why this matters

If the rebuild fails or the user wants to roll back, Quick Scenario must continue to work as today. Treating it as untouchable infrastructure during the rebuild guarantees this.

### Dashboard integration (deferred to Phase 5)

The Dashboard's Simulation Insights panel currently reads from `lastSimulation`. In Phase 5, this panel splits into two: Quick Scenario Insights (reading from `lastSimulation`) and Deep Simulation Insights (reading from the most recent entry in `deepSimulationHistory`). Until Phase 5, the Dashboard is unchanged.

### Final merge to main

When all five phases are verified, the `deep-simulation-rebuild` branch is merged into `main` in a single deliberate operation:

```
1. Switch to main: git checkout main
2. Merge: git merge deep-simulation-rebuild
3. Resolve any conflicts (should be minimal since rebuild was purely additive)
4. Test the merged app end-to-end
5. Push to remote: git push origin main
6. Tag the release: git tag v2.0-deep-simulation
```

After merge, the rebuild branch can be archived but should not be deleted — it serves as a reference for the architectural transition.

---

## Section 7 — Phase 2–5 Briefs (Activated After Previous Phase Verification)

These briefs are placeholders for now. They become detailed implementation specifications when the previous phase is verified working. Claude Code expands each brief into full implementation detail at that time, in conversation with the user.

### Phase 2 — World Population

Build genre detection from project content. Build the writer-facing world taxonomy review screen. Build NPC generation from confirmed genres. Implement census and active cast model. Scale agent counts up to the writer-set cast size.

### Phase 3 — Information Propagation

Implement the full event system with all nine categories. Build the propagation graph using distance, distortion, and attribution decay. Implement trait-based distortion for low-stakes hops. Add writer-seeded events at simulation start. Implement pause-and-inject for Progressive mode.

### Phase 4 — Both Modes and Decision Logic

Implement Progressive mode fully (including pause-and-inject). Implement Scenario mode with both auto and manual variant generation. Build the decision logic split between deterministic rules and LLM calls. Integrate Ollama tier routing for low-stakes work. Add LLM-based distortion for high-stakes hops. Implement cost reporting per simulation run.

### Phase 4 split into 4a and 4b

Phase 4 is the largest phase in the engine and is split for incremental verification:

- **Phase 4a — Decisions, Actions, Ollama, Bonds.** Agents take actions based on needs, knowledge, and traits. Three-tier decision routing (deterministic / Ollama / Claude) controls cost. Bonds layer activates from interactions. Action events feed Phase 3 propagation. Progressive mode only. Dialogue and Scenario mode deferred.

- **Phase 4b — Dialogue, Scenario mode.** Claude-generated dialogue snippets for plot-critical interactions between bound characters. Scenario mode (N variants from the same starting moment, comparison output). Builds on the Phase 4a action and bond infrastructure.

### Tier 1 architecture: migrated from Ollama to Claude Haiku 4.5

The original Phase 4 design routed Tier 1 (procedural NPC decisions in ambiguous moments) through a local Ollama instance for cost discipline. In practice this proved unworkable at production scale: per-call latency on CPU inference grew from ~1s warm to 3-9s as prompts gained context, extrapolating to multi-hour wall times for 200-1000 cast simulations.

Phase 4b migrates Tier 1 to Claude Haiku 4.5 via the Anthropic API. Trade-off summary:

- **Wall time:** Haiku 4.5 with concurrent batching (10 parallel) brings 200-cast Progressive sims to under 5 minutes total
- **Cost:** ~$1.00-1.50 per Progressive sim added (verify against current Haiku 4.5 pricing during first run)
- **Reliability:** eliminates Ollama infrastructure dependency, warmup failures, and unavailability fallbacks
- **Quality:** Haiku 4.5 reasoning at decision-tier prompts exceeds llama3.2:3b

The `ollamaClient.js` module is preserved (marked deprecated) for potential future hybrid optimization (Path C in Phase 4 planning). Production Tier 1 calls route exclusively through Haiku.

Tier classification tightened from ~18% Tier 1 to ~5% Tier 1 (Tier 1 becomes a tiebreaker for genuinely ambiguous decisions rather than a default for unbound/non-critical agents). This further reduces both wall time and Tier 1 cost.

### Phase 5 — Output Specifications and UI

Build all eight Progressive mode output panels (plus the ninth if NDE is active). Build all three Scenario mode views plus the recommendation panel. Implement the promotion flow for procedural NPCs. Integrate Deep Simulation insights into the Dashboard. Polish the full UI.

---

### Phase 5 split into Phase 5 and Phase 6

The output experience layer is split into two phases for incremental verification:

- **Phase 5 — Results experience core + spatial/causal visualizations.** The visible "world experience" — character threads, dialogue scene polish, map view, bond network, butterfly trace visualization. The headline payoff of the rebuild.
- **Phase 6 — Insight panels, analytics, and polish.** Blind spot detection, promotion candidates, emotional weather, theme detection, real-time progress streaming, credit observability, scenario comparison UI polish.

### Output as world experience — North Star for Phase 5

The output of a Deep Simulation run is not a chronicle. It is the writer experiencing their own world from above. A successful output makes the writer feel they have visited their own world and returned with:

- **Aerial perspective** — patterns and proportions across the whole world they could not see from inside individual scenes
- **Blind spot detection** — places, factions, or character types their writing has under-served
- **Character sparks** — unexpected moments from procedural NPCs that suggest new bound characters or new directions for existing ones
- **Causal threads** — chains of cause and effect across time that reveal where the world's logic stretches or breaks
- **Emotional weather** — the tone and pressure of the world over the simulated period
- **Promotion candidates** — procedural agents that took on outsized importance and could be brought into the bound cast

The narrative summary delivered in Phase 2.5 is a bridge to this experience, not the experience itself. Phase 5 must build the experience layer: visualisations, infographics, comparative panels, surprise highlights, spark cards. The raw event log is a debug substrate, not a deliverable.

---

### Story is the base; simulation is the projection forward

The simulation must honor the writer's existing story as initial state, not rebuild it from zero. A writer who has spent months developing characters, relationships, and a timeline expects the simulation to extend that work, not replicate it from a blank slate.

Phase 6 introduces **Bible Hydration** as the simulation's initialization layer:

- Character profiles are read by an LLM at the first simulation run on a project. The engine extracts each character's age, current status, current location, and background summary. The writer reviews and edits these in a **Hydration Review screen** before the simulation begins.
- The **Relationship Web** is read by the engine and mapped to initial agent bonds. A Bible entry "Jojo and Nyra are companions" becomes a starting friendship bond between their agents, not a void.
- A **story snapshot** field describes the moment from which the simulation projects forward. The writer chooses per-simulation whether to use a project-level snapshot or enter a per-simulation override.
- Optional **Knowledge seeding** pre-loads each bound character's Knowledge layer with what they know at story start, drawn from their profile and the existing chapters. Default ON; can be disabled via a popup that explains the impact.

After hydration, the simulation runs as it did in Phases 1–5 — but the world it explores is *the writer's world at the current story moment*, not a tabula rasa.

### World Rules

The engine cannot assume Earth biology applies to every story. A fantasy world may have animals that live centuries; a slice-of-life drama may not care about aging at all. The writer is the authority on these rules, not the engine.

Phase 6 introduces a **World Rules** panel as a top-level navigation item, separate from Story Bible and taxonomy. It contains:

- **Aging behavior** — does aging matter? At what speed?
- **Needs depletion** — per-need speed multipliers
- **Per-kind lifespan overrides** — table of detected kinds with default lifespan ranges and overridable fields
- **Global lifespan multiplier** — single dial scaling all lifespans
- **Custom narrative rules** — free-text field where the writer describes any other rules of their world

Additionally, the difficulty preset from Phase 5 is replaced by **Story-Scale Presets**:

| Preset | Time unit | Rounds | Roughly covers |
|---|---|---|---|
| Thriller / Crisis | day | 30 | One month |
| Drama / Focused story | week | 30 | 7 months |
| Novel | month | 24 | 2 years |
| Saga | year | 20 | 2 decades |
| Generational epic | year | 100 | A century |
| Custom | user-set | user-set | computed |

---

## End of document

When this document is updated by future Claude Code sessions, the version number at the top is incremented and a brief changelog is added to the bottom.

---

### Changelog

**Version 1.0** — Initial document. Architecture and Phase 1 brief detailed. Phases 2–5 briefs are placeholders pending phase activation.

**Version 1.1** — Phase 1 deviations folded back into doc:
  - IPC handler not needed (existing save-project handles new fields)
  - char.traits and char.secrets normalised at AgentFactory boundary
  - Dashboard.jsx unchanged (tab ID stable, only label changed)

**Version 1.2** — Phase 2.5: narrative summary wrapper added; Add Genre button fix in TaxonomyReview.
  - End-of-run narrative chronicle (one Claude call) added to results screen
  - TaxonomyReview "Add Genre" / "Add Kind" buttons fixed (window.prompt is disabled in Electron renderer; replaced with inline text inputs)

**Version 1.3** — Output-as-world-experience North Star added for Phase 5. No code changes; vision capture only. This is the design intent for the output redesign that follows engine completion.

**Version 1.4** — Phase 3.5: Deep Simulation persistence refactor.
  - Split each run into metadata stub (in project) + full result file (per-sim file)
  - Added save/load/list/delete IPC handlers (`<userData>/projects/<projectId>/deep-sims/<simId>.json`)
  - Migration helper auto-converts pre-3.5 inline-history entries on first mount
  - Eliminates ~80 MB writes on every state change at 1000-cast scale; project file now O(simulation count)

**Version 1.5** — Phase 4 split into 4a and 4b documented. No code changes; planning capture only.

**Version 1.6** — Phase 4b architectural shift: Tier 1 migrated from Ollama (local) to Claude Haiku 4.5 (API). Tighter Tier 1 classification (~5%). Ollama path preserved deprecated for future hybrid optimization.

**Version 1.7** — Phase 5/6 split documented. Phase 5 = visible world experience. Phase 6 = analytical depth + polish.

**Version 1.8** — Phase 6: Bible Hydration (character inference, relationship → bonds, story snapshot, knowledge seeding). World Rules panel + Story-Scale Presets. Insight panels (blind spot, promotion candidates, emotional weather, themes). Live progress streaming. Credit observability. LLM-enriched character narratives.

**Version 1.9** — Phase 6a-ii landed. Top-level World Rules panel ships with: per-character/kind lifespan overrides (with substring fallback matching), aging matters toggle, aging speed multiplier, per-need depletion-rate multipliers, global lifespan multiplier, custom narrative rules. Story-Scale Presets (Thriller 30 days / Drama 30 weeks / Novel 24 months / Saga 20 years / Epic 100 years) replace the Phase 5 difficulty preset. customNarrativeRules thread through character inference, taxonomy detection, dialogue, and the chronicler. Mortality events now carry a `cause` field (`aging` | `health`). Verified on the Jojo project: long-lived chars (Vedant Organisation 10 000y, Master Akshara 2 000y, The Witch) survive a 30-week Drama run with `aging.matters: false`; zero aging deaths; chronicler honours vampire / werewolf-cat / eternal-institution rules. Test cost $0.55.

---

## Future phase backlog (post-rebuild)

After Phase 6 completes and `deep-simulation-rebuild` merges to `main`, the following are candidate workstreams for Phase 7 and beyond. They are NOT scoped for Phase 6.

### Phase 7 candidate — Emotional Depth

Modeling how loss and trauma persist as decision-influencing forces beyond the moment of the event. The simulation should let characters carry their past forward.

- **Memorial bonds** — bonds toward dead characters persist as a `memorial` flag on existing bond types (a love bond toward someone who has died remains a love bond, flagged memorial). Hydration creates them from Bible state when a bonded character has status `dead`, preserving hydration-time intensity. Memorial bonds flow into Tier 2 decision prompts as grief context — continuation of the dead's unfinished work, withdrawal patterns, seeking justice. They decay slowly by default and intensify on trigger events (e.g., learning new information about the death).
- **Trauma persistence** — significant events leave decision-biasing residue that decays over rounds.
- **Anniversary effects** — date-of-death and other significant dates trigger grief actions for memorial-bonded characters.
- **Grief stages** — denial → anger → bargaining → acceptance progression, configurable per character.
- **Survivor's guilt** — witnessing a death produces a specific bond mutation in the witness.
- **Inherited patterns** — children of dead characters carry forward grief signatures their parents had.

Together these distinguish a narrative physics engine from an AI writing assistant.
