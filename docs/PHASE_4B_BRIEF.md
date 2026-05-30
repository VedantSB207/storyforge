# Phase 4b Brief — Tier 1 to Haiku, Dialogue, Scenario Mode

**Branch:** `deep-simulation-rebuild`
**Prerequisite commit:** `fcfdd1f` (Phase 4a.1 — verifications complete)
**Design doc:** `docs/SIMULATION_ENGINE_DESIGN.md` (currently v1.5)

---

## Part A — Design doc update (v1.6) before Phase 4b code

Add a new subsection under the Phase 4 section explaining the Tier 1 architectural change:

> ### Tier 1 architecture: migrated from Ollama to Claude Haiku 4.5
>
> The original Phase 4 design routed Tier 1 (procedural NPC decisions in ambiguous moments) through a local Ollama instance for cost discipline. In practice this proved unworkable at production scale: per-call latency on CPU inference grew from ~1s warm to 3-9s as prompts gained context, extrapolating to multi-hour wall times for 200-1000 cast simulations.
>
> Phase 4b migrates Tier 1 to Claude Haiku 4.5 via the Anthropic API. Trade-off summary:
>
> - **Wall time:** Haiku 4.5 with concurrent batching (10 parallel) brings 200-cast Progressive sims to under 5 minutes total
> - **Cost:** ~$1.00-1.50 per Progressive sim added (verify against current Haiku 4.5 pricing during first run)
> - **Reliability:** eliminates Ollama infrastructure dependency, warmup failures, and unavailability fallbacks
> - **Quality:** Haiku 4.5 reasoning at decision-tier prompts exceeds llama3.2:3b
>
> The `ollamaClient.js` module is preserved (marked deprecated) for potential future hybrid optimization (Path C in Phase 4 planning). Production Tier 1 calls route exclusively through Haiku.
>
> Tier classification tightened from ~18% Tier 1 to ~5% Tier 1 (Tier 1 becomes a tiebreaker for genuinely ambiguous decisions rather than a default for unbound/non-critical agents). This further reduces both wall time and Tier 1 cost.

Bump to **v1.6**, add changelog:

> v1.6 — Phase 4b architectural shift: Tier 1 migrated from Ollama (local) to Claude Haiku 4.5 (API). Tighter Tier 1 classification (~5%). Ollama path preserved deprecated for future hybrid optimization.

Commit this design doc update alone before any Phase 4b code.

---

## Part B — Phase 4b implementation

Phase 4b has four interrelated workstreams. Implement in this order:

1. **Tier 1 migration + classification tightening** (foundational — everything else depends on it)
2. **Bonds threshold tweak** (one-line constants, do alongside #1)
3. **Dialogue generation** (builds on actions + Tier 2 calls)
4. **Scenario mode** (wraps existing Progressive runner)

### Goal

End state after Phase 4b: a writer can run a 200-cast Progressive simulation in under 5 minutes that produces narrated story output with dialogue snippets between bound characters in plot-critical moments; OR they can run a Scenario simulation that produces 3-5 narrative variants from the same starting moment for comparison. Bonds now express the full friendship/love/rivalry/enmity gradient instead of all staying weak.

### What unlocks after Phase 4b

- **Sub-5-minute Progressive sims** at 200 cast — usable in a writing session, not a background task
- **Dialogue scenes** for plot-critical moments — the writer sees actual words spoken between bound characters at moments of cooperation, conflict, or betrayal
- **Scenario mode (the "what if?" engine)** — multiple variants from same starting point, with structured comparison
- **Full bond expressiveness** — friendships, loves, kinships, rivalries, enmities, not just "weak" everywhere
- **Phase 5 ready** — all engine substrate complete; remaining work is output experience design

---

## Workstream 1 — Tier 1 migration + classification tightening

### Files to create

**`src/components/DeepSimulation/haikuClient.js`** (~100-140 lines)

Role: Anthropic API client for Tier 1 decisions, replacing Ollama for the Tier 1 path.

Contents:
- Use the existing `callClaude` infrastructure already present in SimPanel/QuickScenario or wherever it lives. If a shared API client doesn't exist, factor one out
- Model: `claude-haiku-4-5-20251001`
- max_tokens: 200 (decision responses are short JSON)
- temperature: 0.5 (some variance, but stable selection)
- Native concurrency: support batching of multiple decision calls via `Promise.all`
- Same JSON output contract as Ollama path: `{"action": "<NAME>", "reason": "<one short clause>"}`
- Defensive JSON parsing with fallback to deterministic

Functions to export:
- `decideViaHaiku(agent, availableActions, world)` → `Promise<{action, reason} | null>`
- `decideBatchViaHaiku(decisions[])` → `Promise<[{action, reason}]>` — concurrent batch for multiple agents in same round
- `HAIKU_MODEL` constant
- `HAIKU_MAX_TOKENS` constant

**Important:** Verify current Haiku 4.5 pricing at start of implementation. Anthropic docs at https://docs.claude.com. If pricing has shifted from prior versions, log the expected per-call cost and report it in the verification stage before running large simulations.

### Files to modify

**`src/components/DeepSimulation/decisionLogic.js`**

Tighten Tier 1 classification to ~5% from ~18%:

Replace the current `classifyTier` logic with this:

```
function classifyTier(agent, availableActions, world):
  // Tier 2 — bound character in plot-critical moment
  if agent.isBound AND (
       hasHighStakesKnowledge(agent) OR
       availableActions.includes('BETRAY') OR
       deterministicScores.topTwoWithinTenPercent
  ):
    return 'tier2'

  // Tier 1 — genuinely ambiguous decision (tiebreaker only)
  if deterministicScores.topTwoWithinTwentyPercent AND
     availableActions.length >= 3 AND
     agent.recentSignificantEvent:
    return 'tier1'

  // Tier 0 — everything else (default)
  return 'tier0'
```

Update Tier 1 routing:
- Replace `decideViaOllama` calls with `decideViaHaiku`
- Implement concurrent batching: collect all Tier 1 decisions for a round, call `decideBatchViaHaiku` once per round, distribute results
- Same fallback path: if Haiku errors, fall back to deterministic Tier 0

Update caps:
- `MAX_TIER1_PER_ROUND` = 30 (tighter than before)
- `MAX_TIER1_PER_SIM` = 400 (new constant)
- `MAX_TIER2_PER_SIM` = 80 (unchanged)

**`src/components/DeepSimulation/SimulationRunner.js`**

- Replace per-agent Tier 1 calls with per-round batch
- Initialize Haiku client once at sim start (no warmup needed unlike Ollama)
- Track `tier1CallsTotal` separately from `tier2CallsTotal` in stats

**`src/components/DeepSimulation/ollamaClient.js`**

- Add deprecation header comment: "DEPRECATED in v1.6 — Tier 1 migrated to Claude Haiku 4.5. Preserved for potential future hybrid optimization (see SIMULATION_ENGINE_DESIGN.md Path C)."
- Do not delete. Do not import elsewhere.

**`src/components/DeepSimulation/deepSimSchema.js`**

- Add `HAIKU_MODEL`, `HAIKU_MAX_TOKENS`, `MAX_TIER1_PER_ROUND` (30), `MAX_TIER1_PER_SIM` (400)
- Keep Ollama constants (for the deprecated path)

---

## Workstream 2 — Bonds threshold tweak

### Files to modify

**`src/components/DeepSimulation/bondsLayer.js`**

Threshold changes:
- friendship promotion: intensity > 0.30 → **> 0.20**
- love/kinship promotion: intensity > 0.50 → **> 0.40**
- rivalry promotion: unchanged (already triggers correctly)

Intensity gain tuning:
- Repeated cooperation (3+ in 10 rounds) between same pair: bump intensity gain from +0.05 to +0.10 per cooperation
- Document the "repeated" check at top of file

This is a small change but materially affects narrative output — the engine will start producing friendships, loves, kinships, not just weak acquaintance.

---

## Workstream 3 — Dialogue generation

### Files to create

**`src/components/DeepSimulation/dialogue.js`** (~180-250 lines)

Role: Generate brief dialogue scenes between bound characters at plot-critical moments.

When dialogue fires:
- An action event of category `cooperation`, `conflict`, `betrayal`, or `dramatic_death` occurs
- AND both participants are bound Bible characters (or one is bound and the other is a recurring NPC with bond intensity > 0.5)
- AND total dialogue count for this simulation is below cap

Cap: `MAX_DIALOGUES_PER_SIM` = 15

Dialogue scoring (which moments deserve dialogue when more candidates exist than budget):
- Betrayal between bonded chars: highest priority
- Conflict between previously-cooperating bonded chars: high
- Cooperation between previously-conflicted chars (reconciliation): high
- Plain conflict / cooperation: medium
- Pick top 15 by score across full simulation

Dialogue generation:
- One Claude API call per dialogue scene
- Model: `claude-sonnet-4-20250514` (Sonnet for dialogue quality)
- max_tokens: 400
- Temperature: 0.8 (dialogue benefits from variety)

Prompt structure:
- Both characters' names, traits, values, current state
- What each knows about the other (their Knowledge entries about the other char)
- What just happened (the action event that triggered dialogue)
- The bond state between them at this moment
- Request: "Generate a brief 4-8 line dialogue scene between these characters in this moment. Honor what each knows and doesn't know — they may speak past each other, lie, or reveal partial truths. Do not narrate. Just dialogue with attribution like: NYRA: 'You knew.' / JOJO: 'I didn't.' Return as JSON: { dialogue: [{ speaker, line }] }"

Functions to export:
- `selectDialogueCandidates(events, agents, dialoguesAlreadyGenerated)` → top events deserving dialogue
- `generateDialogue(event, participants, world)` → `Promise<{ dialogue: [{speaker, line}], cost }>`
- `MAX_DIALOGUES_PER_SIM` constant

Cost: ~$0.01-0.02 per dialogue × 15 = $0.15-0.30 per sim

### Files to modify

**`src/components/DeepSimulation/SimulationRunner.js`**

- After all rounds complete (and before narrative summary), call dialogue selection and generation
- Generate dialogues in parallel via `Promise.all` (15 concurrent is fine for API)
- Add dialogues to simulation result, passed to narrative summary

**`src/components/DeepSimulation/narrativeSummary.js`**

- Include up to top 5 dialogues in the narrative wrapper's input
- Update system prompt: "Some scenes have actual dialogue between characters captured below. When you describe these moments in the chronicle, you may quote a line if it serves the story."

**`src/components/DeepSimulation/DeepSimulation.jsx`**

- Add "Dialogue Scenes" section to results screen, between "Notable Events" and "Final State"
- Each scene rendered as: round number, event category, two character names, then the dialogue lines with speaker tags
- Use serif font (Georgia) matching narrative styling
- Collapsible — expanded by default

**`src/components/DeepSimulation/deepSimSchema.js`**

- Add `DIALOGUE_SCHEMA`: `{ id, round, eventId, participants: [{agentId, name}], lines: [{speaker, line}], category, generationCost }`
- Add to full result schema

---

## Workstream 4 — Scenario mode

### Files to create

**`src/components/DeepSimulation/scenarioRunner.js`** (~150-200 lines)

Role: Orchestrate N parallel or sequential runs of the Progressive engine with different seeds, then aggregate.

Contents:
- Accept config: `{ variantCount: 3-5, baseConfig, mode: 'parallel' | 'sequential' }`
- For each variant, derive a unique seed from the base seed: `variantSeed = hash(baseSeed + variantIndex)`
- Run all variants — parallel if memory permits (cast × variants × 8MB est < 1GB), sequential otherwise
- Each variant produces a full simulation result (saved to its own file via Phase 3.5 persistence)
- After all variants complete, generate comparison data

Comparison data structure:
- Per bound character: which variants they survived in, final state diff
- Per major event category: count divergence (e.g., variant 1 had 3 betrayals, variant 2 had 1)
- Key divergences: events that fired in some variants but not others (high-significance only)

**`src/components/DeepSimulation/scenarioComparison.js`** (~100-150 lines)

Role: Generate comparison narrative across variants via one Claude API call.

Prompt:
- N variant narratives + headlines
- Per-variant bound character outcomes
- Key event divergences
- Request: "These are N parallel variants of the same starting world. Write a brief comparison (2-3 paragraphs) highlighting the most narratively significant divergences. Focus on: which characters had dramatically different fates, which alliances formed in some but not others, which events seemed inevitable across all variants. Return as JSON: { comparison: string, themes: string[] }"

Model: `claude-sonnet-4-20250514`, max_tokens: 800

Cost: ~$0.05 per Scenario run (one extra Claude call)

### Files to modify

**`src/components/DeepSimulation/DeepSimulation.jsx`**

- Add mode selector at sim setup: Progressive (existing) | Scenario (new)
- If Scenario:
  - Show variant count selector (3-5, default 3)
  - Estimated cost: `progressiveSimCost × variantCount + $0.05`
  - Estimated wall time: depending on parallel/sequential, document both
- Results screen for Scenario:
  - Comparison panel at top (the cross-variant Claude summary)
  - Variant tabs below — clicking each tab shows that variant's full results (narrative, dialogues, final state, events)
- Persistence: each variant's full result goes to its own per-sim file via Phase 3.5; the Scenario "wrapper" object (metadata + comparison + variant file refs) goes to a new `deep-sims/<scenarioId>.scenario.json` file

**`src/components/DeepSimulation/deepSimSchema.js`**

- Add `SCENARIO_SCHEMA`: `{ scenarioId, timestamp, baseConfig, variantCount, variantSimIds: [], comparison: {...}, totalCost, totalWallTime }`
- Add to history list schema

**`electron/main.js`**

- IPC: `save-scenario-result`, `load-scenario-result`, `list-scenario-results` — parallel to the per-sim persistence handlers from Phase 3.5

---

## Performance and cost constraints

| Metric | Target | Brief estimate |
|---|---|---|
| Progressive sim wall time @ 200 cast | < 5 min | 2-4 min |
| Progressive sim wall time @ 1000 cast | < 20 min | ~12-18 min |
| Scenario sim @ 3 variants × 200 cast (parallel) | < 12 min | 6-10 min |
| Scenario sim @ 3 variants × 200 cast (sequential) | < 15 min | 9-12 min |
| Progressive cost @ 200 cast | $1.50-2.50 | ~$1.80 |
| Scenario cost @ 3 variants × 200 cast | $5.00-8.00 | ~$5.50 |

**Cost verification checkpoint:** before running the 1000-cast stress test or the Scenario test, run a small 50-cast / 10-round test and log per-call Haiku costs. If real costs are >50% higher than estimates, stop and report before continuing.

---

## Test plan

After implementation, run end-to-end against the Jojo project.

1. **Tier 1 migration verification (small-scale cost check first)**
   - 50 cast × 10 rounds, log Haiku call count and total Haiku cost
   - Calculate per-call average
   - Compare to estimate; if >50% over, stop and report

2. **Wall time target (200 cast × 30 year-rounds)**
   - Time the full run end-to-end
   - Confirm < 5 minutes
   - Report tier distribution (Tier 0 / Tier 1 / Tier 2 counts)

3. **Variance test redux** (the headline test re-run with new action distribution and bonds)
   - Same params, two different seeds
   - Paste both narratives side-by-side
   - Confirm meaningfully different stories
   - Confirm bond promotions now visible (friendships forming, not just weak)

4. **Dialogue verification**
   - Confirm at least 5 dialogues generated in the test sim
   - Paste 3 sample dialogue scenes (real generated text, not placeholder)
   - Confirm dialogues honor character knowledge asymmetry (chars speak past each other or reveal partial truths)

5. **Bond promotion verification**
   - Find a bond that promoted from weak → friendship during the sim
   - Paste the bond's full JSON showing the promotion event in history
   - Confirm at least one love/kinship/rivalry promotion across a longer test (60 rounds)

6. **Scenario mode test**
   - Run 3-variant Scenario at 100 cast × 20 rounds (modest scale to keep test time bounded)
   - Confirm all 3 variants completed and saved as separate files
   - Confirm comparison narrative generated and references specific divergences
   - Paste the comparison output
   - Confirm Scenario record loads correctly when viewed from Past Runs

7. **Stress test**
   - 1000 cast × 30 rounds Progressive
   - Confirm completion under 20 minutes
   - Confirm total cost under $5

8. **Quick Scenario regression**
   - `git diff main -- src/components/SimPanel.jsx` empty

9. **Determinism preserved**
   - Same seed twice, alive/dead/events/edges/bond counts match (LLM noise allowed in narrative text)

---

## Explicitly NOT in Phase 4b

These come in Phase 5:

- Output UI redesign (the "world experience" panels — aerial views, character thread visualizations, butterfly trace visualizations, blind-spot detection, promotion candidate UI)
- Map visualization
- Faction-as-first-class-object refactor
- Real-time progress streaming during sim (currently event log appears post-completion)
- The hybrid Tier 1 architecture (Ollama as fast-path optimization with Haiku fallback)

---

## What to report after Phase 4b

- File diff summary
- Tier 1 cost verification (per-call cost, projected vs actual)
- Wall time for 200-cast Progressive (target: <5 min)
- Variance test: two narratives from different seeds, side-by-side
- Bond promotion: JSON of a promoted bond showing weak→friendship transition
- 3 sample dialogues (full text)
- Scenario test: comparison output + confirmation of variant file structure
- Stress test results
- Quick Scenario regression check
- Total cost breakdown across all tests
- Any deviations from this brief, with reasoning
- Phase 5 readiness assessment

Stop after Phase 4b reports. Phase 5 not started.

---

## Commit discipline

- One commit for v1.6 design doc update before any code
- One commit for Workstream 1 + 2 (Tier 1 migration + bonds threshold) — verifiable independently
- One commit for Workstream 3 (Dialogue) — adds to results, doesn't change tier logic
- One commit for Workstream 4 (Scenario mode) — new feature, can stand alone
- All pushed to `deep-simulation-rebuild`
- Final merge to `main` only after all 5 phases (4b finishes Phase 4) are verified
