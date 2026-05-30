# Phase 5 Brief — Results Experience Core + Spatial/Causal Visualizations

**Branch:** `deep-simulation-rebuild`
**Prerequisite commit:** `2c40021` (Phase 4b.1 — verifications complete)
**Design doc:** `docs/SIMULATION_ENGINE_DESIGN.md` (currently v1.6)

---

## Part A — Design doc update (v1.7) + two pre-Phase-5 fixes

### A.1 — Design doc update

Add a new section near the end (just before the "Output as world experience" North Star already documented at v1.3):

> ### Phase 5 split into Phase 5 and Phase 6
>
> The output experience layer is split into two phases for incremental verification:
>
> - **Phase 5 — Results experience core + spatial/causal visualizations.** The visible "world experience" — character threads, dialogue scene polish, map view, bond network, butterfly trace visualization. The headline payoff of the rebuild.
> - **Phase 6 — Insight panels, analytics, and polish.** Blind spot detection, promotion candidates, emotional weather, theme detection, real-time progress streaming, credit observability, scenario comparison UI polish.

Bump to **v1.7**, add changelog:

> v1.7 — Phase 5/6 split documented. Phase 5 = visible world experience. Phase 6 = analytical depth + polish.

Commit alone before code.

### A.2 — Pre-Phase-5 fixes (commit alongside v1.7 doc or separately)

Two issues surfaced in Phase 4b.1 verification that should land before the visualization work:

**Fix 1 — Bidirectional bond promotion**

In `src/components/DeepSimulation/bondsLayer.js`, `maybePromoteType` is one-directional: once a bond hits rivalry or enmity, sustained cooperation cannot promote it back to friendship or love. Run B of Phase 4b.1's variance test had a Chameleon→Chameleon bond at intensity 1.0 / trust 1.0 with 27 cooperate events that stayed `rivalry` because of a single early conflict.

Required behavior:
- If type is `rivalry` AND last 10 history entries are 70%+ cooperative (cooperate, co_witness positive) AND trust > 0.3 → promote back to `friendship`
- If type is `enmity` AND last 10 history entries show no betrayals AND 50%+ cooperative AND trust > 0 → demote to `rivalry` (re-promotion path)
- If type is `enmity` AND last 15 history entries show no betrayals AND 70%+ cooperative AND trust > 0.4 → demote two steps to `friendship`
- Document the windowed-history logic at the top of `maybePromoteType`

Test: re-run a 200×30 sim, confirm at least one bidirectional promotion event appears in some bond's history.

**Fix 2 — Difficulty preset**

Every Phase 4 test produced 80-95% mortality. The base depletion rates in `stateUpdaters.js` are too harsh for any narrative that isn't apocalyptic. Add a user-selectable difficulty preset.

In `deepSimSchema.js`:
```
DIFFICULTY_PRESETS = {
  gentle:   { physDecay: 0.7, safetyDecay: 0.7, belongDecay: 0.8 },
  standard: { physDecay: 1.0, safetyDecay: 1.0, belongDecay: 1.0 },
  harsh:    { physDecay: 1.3, safetyDecay: 1.3, belongDecay: 1.2 }
}
```

In `stateUpdaters.js`: multiply base depletion rates by the active preset's multipliers.

In `SimulationRunner.js`: accept `difficulty: 'gentle' | 'standard' | 'harsh'` config, default `'standard'`.

In `DeepSimulation.jsx` setup screen: add a difficulty dropdown with three options + a short tooltip explaining each ("Gentle — slow-burn drama, most characters survive. Standard — balanced pressure. Harsh — apocalyptic, most characters perish.").

Test: run same params under each preset, report final mortality percentages.

---

## Part B — Phase 5 implementation

### Goal

The writer opens a completed simulation and experiences their world. Not raw data, not status telemetry — actual character arcs, spatial context, relationship dynamics, and causal chains they can read and explore. The "post-mortem" of a Progressive sim becomes a document a writer can spend an hour with.

### What unlocks after Phase 5

- **Character Threads** — per-bound-character chronological arc through the simulation, with their POV events, bonds formed, actions taken, dialogue spoken
- **Map View** — regions, agent positions, event locations, propagation paths visible spatially
- **Bond Network** — force-directed graph of relationships across all bound characters and significant NPCs, colored by type and weighted by intensity
- **Butterfly Trace View** — interactive causal chain visualization (pick a knowledge entry, walk back to origin; pick an event, see all descendants)
- **Polished results screen** — replaces current text-list layout with a proper tabbed/sectioned experience

### Workstream 5a — Results experience core

#### New files

**`src/components/DeepSimulation/CharacterThreads.jsx`** (~250-350 lines)

Renders one collapsible card per bound Bible character. Each card contains:

- Header: name, traits summary, starting region, age, alive/dead status at end
- Chronological timeline of significant events for this character:
  - Direct witness events (firsthand Knowledge, confidence=1)
  - Rumours received (Knowledge with confidence < 1, source != firsthand) — shown with confidence indicator
  - Actions taken (from `actionHistory`)
  - Bond events (formation, promotion, demotion, type change)
  - Dialogues they participated in (full dialogue scene inline)
- Final state: bonds summary, ending needs, ending knowledge count
- Visual treatment: serif font for narrative content, mono/small-caps for metadata

Sort timeline strictly by round, then by category priority (action > dialogue > witness > rumour).

Implementation:
- Pull data from `simulationResult.agents.filter(a => a.isBound)`, `simulationResult.events`, `simulationResult.dialogues`
- For each bound char, build a thread object via `threadBuilder.js`
- Render as expandable accordions — first character expanded by default

**`src/components/DeepSimulation/threadBuilder.js`** (~150-200 lines)

Pure data transformation:
- Input: `simulationResult`
- Output: `[{ agentId, name, traits, regionStart, regionEnd, alive, ageStart, ageEnd, timeline: [...], bondsSummary, finalNeeds }]`
- One thread per bound character
- Timeline entries normalized to `{ round, category, content, confidence?, dialogueRef? }`

Functions:
- `buildCharacterThreads(simulationResult) => thread[]`
- `getSignificantEvents(agent, simulationResult)` — filter logic for what makes the cut
- `summarizeBonds(agent, simulationResult)` — top 5 bonds with type + intensity

#### Modifications to existing results screen

**`src/components/DeepSimulation/DeepSimulation.jsx`**

Replace current single-column results screen with a tabbed layout:

```
┌─────────────────────────────────────────────────────┐
│ Sim header (mode, date, headline)                   │
├─────────────────────────────────────────────────────┤
│ [Chronicle] [Characters] [World] [Bonds] [Causation]│  ← tabs
├─────────────────────────────────────────────────────┤
│                                                     │
│ Active tab content                                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Tab content:
- **Chronicle** — the existing narrative + notable events + dialogue scenes (existing components, light polish)
- **Characters** — new `<CharacterThreads />` component
- **World** — new `<MapView />` component (workstream 5b)
- **Bonds** — new `<BondNetwork />` component (workstream 5b)
- **Causation** — new `<ButterflyTraceView />` component (workstream 5b)

Default tab: Chronicle. Tab state persists when user navigates away and returns to the same sim.

For Scenario mode results: an additional outer tab strip selects variant (Variant 1 / Variant 2 / Variant 3 / **Comparison**). Comparison tab shows existing cross-variant comparison output.

#### Dialogue scenes polish

Currently dialogue scenes render as plain text. Polish:
- Speaker names in small-caps bold
- Lines in italic serif
- Round indicator + event category badge at top of each scene
- Bond context indicator at top: "Friendship (intensity 0.4)" or "Enmity (trust -0.8)" — pulled from the speakers' bond state at the dialogue's round
- This helps the writer parse "two friends arguing" vs "two enemies briefly cooperating" at a glance

---

### Workstream 5b — Spatial and causal visualizations

#### Dependencies

Add to `package.json`:
- `konva` + `react-konva` — Map View
- `d3-force` + `react-force-graph-2d` — Bond Network

Butterfly Trace View uses native SVG via React, no extra dependency.

#### New files

**`src/components/DeepSimulation/MapView.jsx`** (~300-400 lines)

Konva-based interactive map.

Layout:
- 6 regions rendered as soft-edged blobs at fixed positions matching the adjacency graph from `positionGraph.js`:
  - central (middle)
  - north / south / east / west (around central)
  - wilderness (outer edge, connected only to specific regions)
- Adjacency lines between regions as faint paths
- Agent dots positioned within their region (jittered for visibility):
  - Bound Bible characters: larger, named, distinctive color per character
  - Procedural NPCs: smaller dots, colored by genre (animals=brown, supernatural=purple, humans=blue, etc.)
- Event markers at event locations, sized by significance, colored by category (death=red, betrayal=dark red, cooperation=green, conflict=orange, etc.)

Interactions:
- Hover an agent → tooltip with name, traits, current state, top 3 bonds
- Hover an event marker → tooltip with event description, round, witnesses count
- Click an agent → highlight all events they witnessed firsthand + all propagation edges into their knowledge
- Time slider at bottom: scrub round 1 → final round, map updates to show state at that round
  - Agents fade/disappear when they die
  - Event markers appear in the round they fired
  - Region density shifts as agents travel

Performance:
- At 200 cast: smooth scrubbing target 60fps
- At 1000 cast: reduce NPC dot count via density-based aggregation (cluster NPCs of same genre in same region into a single "group dot" with count badge)
- No animation of propagation paths (too visually noisy at 1000 cast); show propagation only on click

**`src/components/DeepSimulation/BondNetwork.jsx`** (~250-350 lines)

Force-directed graph using `react-force-graph-2d`.

Nodes:
- All bound Bible characters (always shown)
- NPCs with at least 3 bonds (significance filter — avoids 1000-node hairball)
- Node size proportional to bond count
- Node color: bound chars = unique color per character; NPCs = genre color
- Bound char nodes have name labels; NPC nodes show name on hover only

Edges:
- One edge per bond
- Edge color by bond type:
  - friendship = green
  - love = red
  - kinship = purple
  - rivalry = orange
  - enmity = dark red
  - weak = light gray
- Edge thickness proportional to intensity
- Edge opacity proportional to abs(trust) — strong trust or strong distrust both render solidly; neutral renders faint

Interactions:
- Click a node → highlight that agent's edges, dim others; click again to release
- Click an edge → side panel shows the full bond history (the 30-entry history with round-by-round delta)
- Hover an edge → tooltip with bond type, intensity, trust, last interaction round
- Filter bar: checkboxes to hide/show bond types

Time slider:
- Scrub round 1 → final
- Edges appear/disappear/change color as bonds form, promote, demote
- This is the key feature — watch relationships evolve over the simulation

Performance:
- At 200 cast typical bound bond network: ~50 nodes, ~150 edges — trivial
- At 1000 cast with significant-NPC filter: ~100-200 nodes, ~500 edges — manageable

**`src/components/DeepSimulation/ButterflyTraceView.jsx`** (~200-300 lines)

Interactive causal chain explorer.

Two modes (radio toggle at top):

**Mode A: Trace back from a Knowledge entry**
- User selects an agent from dropdown
- User selects a Knowledge entry from that agent's list (sorted by round, distortion mode shown)
- View renders the causal chain from origin event → all hops → this Knowledge entry
- Each hop: shows the content variant at that hop, the transmitter, distortion mode, confidence
- Origin highlighted with a star icon

**Mode B: Trace forward from an event**
- User selects an event (filterable by category and round)
- View renders the descendant tree: all Knowledge entries that derived from this event
- Tree layout (top-down)
- Each branch shows the content variant at that node, the agent who holds it, confidence
- Hover a node → tooltip with full content + round_learned
- Click a node → highlight the path back to origin

Implementation:
- Use the `_outByFrom` and `_inByTo` indexes on `butterflyTrace` (already O(1) lookups from Phase 3)
- Render as SVG tree with horizontal connector lines, color-coded by distortion mode (trait=blue, LLM=purple)

Empty states:
- "Select a Knowledge entry to trace back to its origin"
- "Select an event to see how it spread"

#### Modifications

**`src/components/DeepSimulation/DeepSimulation.jsx`**

Wire the three visualization components into the World, Bonds, Causation tabs respectively. Pass them the loaded simulation result.

**`src/components/DeepSimulation/visualizationHelpers.js`** (new, ~80-120 lines)

Shared utilities:
- `getAgentColor(agent)` — consistent color across all visualizations for the same character
- `getEventColor(category)` — consistent event category colors
- `getBondTypeColor(type)` — consistent bond colors
- `formatRoundLabel(round, timeUnit)` — "Year 12" / "Month 4" / "Day 17"
- `getGenreColor(genre)` — for procedural NPCs

---

## Performance and cost

### Performance targets

| Component | 200 cast target | 1000 cast target |
|---|---|---|
| Character Threads render | < 200ms | < 1s |
| Map View initial render | < 300ms | < 1s |
| Map View time-slider scrubbing | 60fps | 30fps minimum |
| Bond Network initial render | < 500ms | < 2s |
| Butterfly Trace single chain render | < 100ms | < 100ms |

If any target is missed, profile and report — but don't block on perfect performance at 1000 cast since most writers will work at 200-500 cast.

### Cost impact

Phase 5 is **cost-neutral** — no new LLM calls. All visualizations work over existing simulation data. The per-sim cost stays at the Phase 4b baseline (~$0.50-0.65 per Progressive sim).

LLM-driven character narrative enrichment (one Claude call per bound character to write a richer per-character story arc) is **deferred to Phase 6** as opt-in functionality.

---

## Test plan

After implementation, run end-to-end against the Jojo project.

1. **Pre-Phase-5 fixes verification**
   - Bond bidirectional promotion: run 200×30, find at least one bond that promoted back (rivalry→friendship or enmity→rivalry) — paste its history JSON
   - Difficulty preset: run 200×30 under each preset (gentle / standard / harsh), report final mortality percentage for each

2. **Character Threads**
   - Open the results screen for a 200-cast Progressive run
   - Confirm all bound Bible characters appear in Characters tab
   - For one character (suggest Jojo or Nyra), screenshot the thread or paste a sample of timeline entries
   - Confirm timeline entries include direct witnesses, rumours, actions, bond events, dialogues
   - Confirm dead characters show "Died in round X" status

3. **Map View**
   - Open World tab on the same sim
   - Screenshot the map at round 1 and round 30
   - Confirm regions render correctly, agents are in expected positions
   - Test time slider — does it scrub smoothly?
   - Click an agent and confirm event highlighting works
   - At 1000 cast: confirm NPC clustering renders, no UI freeze

4. **Bond Network**
   - Open Bonds tab
   - Screenshot the network at end-of-sim
   - Confirm bound chars appear with their bonds rendered as edges of correct color
   - Click on one edge → confirm bond history panel shows
   - Test time slider for bond evolution
   - Filter by bond type, confirm rendering updates

5. **Butterfly Trace View**
   - Open Causation tab
   - Trace back from one of Jojo's late-round Knowledge entries — paste a screenshot or description of the chain
   - Trace forward from one early-round death event — confirm descendant tree renders
   - Confirm distortion mode coloring works

6. **Scenario mode results polish**
   - Run a 3-variant scenario at 100×20
   - Confirm Variant 1 / Variant 2 / Variant 3 / Comparison tabs work
   - Confirm each variant's full results (Characters, World, Bonds, Causation) render

7. **Quick Scenario regression**
   - `git diff main -- src/components/SimPanel.jsx` empty

8. **Determinism**
   - Same seed twice, verify alive/dead/events/edges/bond counts identical with disableLLM=true

---

## Explicitly NOT in Phase 5

These come in Phase 6:

- Blind spot detection (which character types your writing has under-served)
- Promotion candidates UI (procedural NPCs worth becoming bound chars)
- Emotional weather chart
- Theme detection (cross-run patterns)
- Real-time progress streaming during sim
- Anthropic credit observability (cost preview + live spend)
- LLM-enriched character narratives (the "generate richer narrative for this character" button)
- Faction-as-first-class-object refactor

---

## What to report after Phase 5

- File diff summary
- Pre-Phase-5 fixes verification: bond promotion JSON showing bidirectional transition, mortality percentages under each difficulty preset
- Character Threads: paste sample timeline for one bound character (real data)
- Map View: screenshots at two rounds + description of interactions tested
- Bond Network: screenshot + description of one bond's history when clicked
- Butterfly Trace: screenshot of one traced chain (trace back AND forward modes)
- Scenario mode polish: confirm variant tabs work with new visualizations
- Performance numbers per component at 200 cast and 1000 cast
- Quick Scenario regression check
- Any deviations from this brief, with reasoning
- Phase 6 readiness assessment

Stop after Phase 5 report. Phase 6 not started.

---

## Commit discipline

- One commit for v1.7 design doc update before any code
- One commit for the two pre-Phase-5 fixes (bond bidirectional + difficulty preset)
- One commit per workstream: 5a (Character Threads), 5b-Map (MapView), 5b-Bonds (BondNetwork), 5b-Causation (ButterflyTraceView)
- All pushed to `deep-simulation-rebuild`
- Final merge to `main` happens after Phase 6 completes — not yet
