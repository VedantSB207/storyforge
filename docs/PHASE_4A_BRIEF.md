# Phase 4a Brief — Decisions, Actions, Ollama Routing, Bonds

**Branch:** `deep-simulation-rebuild`
**Prerequisite commit:** `e3fcd4b` (Phase 3.5 — split persistence)
**Design doc:** `docs/SIMULATION_ENGINE_DESIGN.md` (currently v1.4)

---

## Part A — Design doc update (v1.5) before Phase 4a code

Add a new subsection under the existing Phase 4 section explaining the split:

> ### Phase 4 split into 4a and 4b
>
> Phase 4 is the largest phase in the engine and is split for incremental verification:
>
> - **Phase 4a — Decisions, Actions, Ollama, Bonds.** Agents take actions based on needs, knowledge, and traits. Three-tier decision routing (deterministic / Ollama / Claude) controls cost. Bonds layer activates from interactions. Action events feed Phase 3 propagation. Progressive mode only. Dialogue and Scenario mode deferred.
>
> - **Phase 4b — Dialogue, Scenario mode.** Claude-generated dialogue snippets for plot-critical interactions between bound characters. Scenario mode (N variants from the same starting moment, comparison output). Builds on the Phase 4a action and bond infrastructure.

Then bump to **v1.5**, add changelog entry:

> v1.5 — Phase 4 split into 4a and 4b documented. No code changes; planning capture only.

Commit this design doc update before any Phase 4a code.

---

## Part B — Phase 4a implementation: Decisions, Actions, Ollama, Bonds

### Goal

Agents stop just decaying and start *acting*. Each round, every agent decides what to do based on their needs, what they know, who they're bonded to, and their traits. Some decisions are deterministic (mundane), some go to Ollama (procedural NPCs in ambiguous moments), and a few go to Claude (bound characters in plot-critical moments). The actions agents take become events that feed Phase 3's propagation pipeline next round.

### What unlocks after Phase 4a

- **Varied stories per run.** Different simulation seeds produce genuinely different narratives, not variants of "everyone starves uniformly."
- **Real causation chains.** A betrayal in round 5 propagates as a rumor, reaches a third party in round 12, who acts on the rumor in round 13, which becomes its own event. This is what the writer wants.
- **Bonds layer populated.** Phase 3's propagation code already reads `transmitter.relationships` but the layer was empty. Now relationships form, deepen, decay, break.
- **Phase 4b is buildable.** Once actions and bonds exist, dialogue is just a presentation layer over plot-critical action events.

### Architectural principles

**Three-tier decision routing** is the central cost-control mechanism:

- **Tier 0 — Deterministic (free, fast).** Used when a decision is unambiguous: agent is starving and food is nearby → eat. Resolved in JS, no LLM. Should handle ~80% of agent-rounds.
- **Tier 1 — Ollama (free at runtime, slower).** Used for procedural NPCs in ambiguous social or strategic moments where deterministic logic is too crude but the agent isn't plot-critical. Local model on the user's VPS. Should handle ~18%.
- **Tier 2 — Claude (paid, sparing).** Used for bound Bible characters in plot-critical moments (high-stakes decisions, betrayal moments, life-changing realizations). Capped per simulation. Should handle ~2%.

**Action events feed propagation.** When an agent acts, the action becomes an event in the same `events[]` array Phase 3 propagates. So a betrayal in round 5 enters the witness/distortion pipeline in round 6 and may reach a third party with attribution decay in round 12.

**Bonds form from interactions.** Co-witnessing, cooperation, conflict, betrayal — all trigger bond updates between agents. Bonds carry forward into future propagation (information spreads faster between bonded agents) and decision-making (agents prefer to cooperate with high-trust bonds).

**Determinism preserved.** Same seed must still produce same results end-to-end. Ollama and Claude calls must use seeded prompts (or at least consistent prompts) so re-runs are reproducible up to LLM stochasticity.

---

## Files to create

### 1. `src/components/DeepSimulation/actions.js`

**Role:** The action vocabulary — what agents can do.

**Contents:**

Define a fixed set of ~10 core actions. Each action is an object with `name`, `preconditions(agent, world)`, `resolve(agent, world, rng)`, `effects(agent, world)`, `eventCategory`.

Suggested action set:

| Action | Preconditions | Effect |
|---|---|---|
| `EAT` | physiological < 50, food available in region | physiological += 30, generates event `agent ate` |
| `REST` | physiological depleted OR stress > 70 | physiological += 15, stress -= 20 |
| `TRAVEL` | safety pressing OR wants to find someone known | move to adjacent region |
| `SEEK_BOND` | belonging < 50, another agent in same region | attempts to form/strengthen bond with chosen target |
| `COOPERATE` | bond exists with target, mutual benefit possible | both agents +trust, +belonging satisfaction |
| `CONFLICT` | enemy bond OR threatened OR resource competition | resolves combat (trait-based RNG), winner takes resource, loser may die or flee |
| `BETRAY` | bond exists with target AND knowledge advantage AND values permit | bond → enmity, +esteem if successful, generates high-significance event |
| `FLEE` | stress > 80 OR perceived threat > capability | move to adjacent region, lose any bonded co-travellers |
| `OBSERVE` | curiosity trait OR purpose drive | passive — just witnesses local events more reliably |
| `COMMUNICATE` | bond with target OR proximity | shares knowledge entry with target (faster propagation) |

**Each action's `resolve` function returns:**
- Success/failure flag
- Effect payload (need changes, position changes, bond changes)
- New event(s) to feed propagation

**Function exports:**
- `ACTIONS` — frozen object, name → action definition
- `availableActions(agent, world)` — returns subset whose preconditions pass
- `resolveAction(agent, action, world, rng)` — applies effects, returns events

**Roughly 200-300 lines.**

### 2. `src/components/DeepSimulation/decisionLogic.js`

**Role:** Per-agent decision scoring and tier routing.

**Contents:**

For each agent each round:

1. **Compute pressure vector** — which need is most pressing right now (lowest satisfaction × weight)
2. **Compute available actions** via `actions.availableActions(agent, world)`
3. **Classify decision tier:**
   - Tier 0 if: pressure on one need is overwhelming AND one obvious action satisfies it AND agent is procedural OR unbound
   - Tier 2 if: agent is bound Bible character AND any of {plot-critical action available, recent high-stakes knowledge entry, pressure conflict between competing values}
   - Tier 1 otherwise
4. **Resolve tier:**
   - Tier 0 → score actions deterministically, pick highest, no LLM
   - Tier 1 → call Ollama with compact prompt, parse choice, fall back to Tier 0 if Ollama unreachable or returns garbage
   - Tier 2 → call Claude with rich prompt including knowledge layer sample, parse choice

**Functions to export:**
- `decideAction(agent, world, rng)` → `{ action, tier, reasoning }`
- `classifyTier(agent, availableActions, world)` → `'tier0' | 'tier1' | 'tier2'`
- `scoreActionsDeterministic(agent, availableActions, world)` → `[{action, score}]`

**Caps:**
- `MAX_TIER1_PER_ROUND` = 50 (Ollama calls per round, prevents flooding the local server)
- `MAX_TIER2_PER_SIM` = 80 (Claude calls per full simulation, controls cost)
- When caps hit, downgrade to next-cheaper tier

**Roughly 250-350 lines.**

### 3. `src/components/DeepSimulation/ollamaClient.js`

**Role:** HTTP client for Ollama with graceful degradation.

**Contents:**

- Read Ollama URL from project config or environment variable. Default: `http://localhost:11434` for dev, but design for it to be configurable (the user runs Ollama on a VPS at a different IP).
- Default model: **`qwen2.5:7b`**. Configurable.
- Health check on initialization — if Ollama doesn't respond within 5s, set a flag `ollamaAvailable = false` for the whole simulation run. Skip all tier 1 calls and downgrade to tier 0.
- Per-request timeout: 10 seconds. If timeout, log and return null (caller falls back to deterministic).
- Don't retry. Don't escalate to Claude. The whole point of tier 1 is "free best-effort" — if it fails, fall back, don't burn money.
- JSON-mode output preferred — prompt the model to return strict JSON like `{"action":"EAT","reason":"hunger pressing"}`. Parse defensively.

**Functions to export:**
- `initOllama(config)` → checks health, returns `{ available, model, url }`
- `decideViaOllama(agent, availableActions, world, model)` → `Promise<{action, reason} | null>`
- `OLLAMA_DEFAULT_MODEL` constant

**Implementation note:** Ollama HTTP must be called from Electron main process to avoid CORS and to keep the URL server-side. Add `query-ollama` IPC handler in `electron/main.js`.

**Roughly 120-180 lines.**

### 4. `src/components/DeepSimulation/bondsLayer.js`

**Role:** Bond formation, intensity dynamics, and decay.

**Contents:**

Bond data model (already in agent schema, now populated):

```
bond: {
  otherId: string,
  type: 'weak' | 'friendship' | 'love' | 'kinship' | 'rivalry' | 'enmity',
  intensity: number, // 0-100
  trust: number,     // -100 to +100
  history: [{ round, eventType, delta }]
}
```

**Bond updates triggered by:**

- **Co-witnessing same event** in same region → `bondDelta(+2, +1)` for both agents (weak bond formation)
- **Cooperation** action between agents → `bondDelta(+5, +5)` both
- **Conflict** action → `bondDelta(-10, -15)` for loser toward winner; `bondDelta(-5, -10)` winner toward loser
- **Betrayal** action → bond becomes `'enmity'`, trust drops to -80, intensity stays high (intense relationships, just hostile)
- **Death of bonded agent** witnessed → grief event, generates emotional disturbance for survivor (stress +20)
- **Time decay** — passive: weak bonds with no interaction in 5 rounds drop intensity by 1/round

**Bond type promotion:**

- Weak + intensity > 30 + repeated cooperation → friendship
- Friendship + values aligned + repeated mutual high-trust → love OR kinship (depending on traits)
- Friendship + repeated conflict → rivalry
- Any + betrayal → enmity (overrides previous type)

**Functions to export:**
- `initBonds(agent)` → empty bonds map
- `updateBondFromEvent(agent, event, world)` → modifies agent's bonds in place
- `decayBonds(agent, currentRound)` → applies time decay
- `getBondedAgents(agent, minIntensity)` → returns agent IDs

**Bonds are NOT propagated through Knowledge.** The bond exists in the agent's own state; Knowledge is about facts in the world. An agent always knows their own bonds, even if those bonds are wrong about the other party (asymmetric: A loves B, B feels nothing — both states valid).

**Roughly 180-250 lines.**

---

## Files to modify

### `src/components/DeepSimulation/SimulationRunner.js`

Round structure becomes:

1. **Age + deplete needs** (Phase 1-2, unchanged)
2. **Decide actions** — for each living agent, call `decideAction` (Phase 4a, NEW)
3. **Resolve actions** — apply each action's effect; collect resulting events (Phase 4a, NEW)
4. **Mortality check** (Phase 1-2, unchanged)
5. **Compute witnesses** for ALL events including action events (Phase 3)
6. **Propagate** information (Phase 3)
7. **Update bonds** from action events (Phase 4a, NEW)
8. **Decay bonds** for inactive relationships (Phase 4a, NEW)

Pre-round init:
- Call `initOllama` once at simulation start; pass result through
- Initialize Tier 2 (Claude) call counter to 0

Per-round:
- Pass `tier1CallsThisRound = 0`, `tier2CallsTotal` counters into `decideAction`
- Track per-round and total LLM call counts in butterflyStats-equivalent struct

### `src/components/DeepSimulation/propagation.js`

- Add the new action event categories to `PROPAGATABLE_CATEGORIES`. Suggested propagatable: `'death', 'need_critical', 'betrayal', 'conflict', 'cooperation', 'birth', 'travel'`. Keep `'aging'`, `'eat'`, `'rest'`, `'observe'` non-propagatable (mundane personal milestones that don't generate gossip).
- Bonded gossip: when computing gossip targets, agents with high-intensity bonds to the witness should receive the rumor at higher confidence than mere adjacents. Bond intensity > 50 → confidence multiplier 0.85 instead of the default 0.7.

### `src/components/DeepSimulation/deepSimSchema.js`

- Add `BOND_SCHEMA`, `ACTION_SCHEMA`, `DECISION_SCHEMA`
- Add constants: `MAX_TIER1_PER_ROUND` (50), `MAX_TIER2_PER_SIM` (80), `OLLAMA_DEFAULT_MODEL` (`'qwen2.5:7b'`), `OLLAMA_TIMEOUT_MS` (10000), `BOND_DECAY_THRESHOLD_ROUNDS` (5)
- Extend agent schema's `relationships` field documentation to reference `BOND_SCHEMA`

### `src/components/DeepSimulation/AgentFactory.js`

- Initialize empty `bonds: {}` map on each agent
- Initialize `actionHistory: []` for tracking what an agent has done

### `src/components/DeepSimulation/narrativeSummary.js`

- Update system prompt to mention actions and relationships:
  > "Agents took actions during this simulation — they ate, rested, traveled, formed bonds, fought, betrayed, allied. Some characters formed deep relationships; some broke them. Use these dynamics in your chronicle. When a bound character had significant interactions, name the other party. When betrayals or alliances happened among bound characters, lean into them."
- In the user payload, include:
  - Top 5 most-significant events (sort by category weight: betrayal > death > conflict > cooperation > others)
  - Bond summary for bound characters: who they're bonded to and at what intensity at end of simulation
  - Top 3 dramatic action chains (where one action led to another within 3 rounds)

### `electron/main.js`

- Add IPC handler `query-ollama` that takes `{url, model, prompt, timeout}` and returns `{response, error}`
- Use Node's `fetch` with AbortController for timeout
- Never throw — always return error in result envelope

### `electron/preload.js`

- Expose `queryOllama` on `window.electronAPI`

### `docs/SIMULATION_ENGINE_DESIGN.md`

- After Phase 4a code lands, bump to v1.6 with Phase 4a completion notes and changelog

---

## Performance and cost constraints

- **Test scale:** 200 cast × 30 rounds (default), then 1000 cast × 30 rounds (stress)
- **Tier 0** (deterministic) is free and fast — should handle ~80% of agent-rounds
- **Tier 1** (Ollama) is free at runtime but slow per call — capped at 50/round
- **Tier 2** (Claude) capped at 80 per full simulation
- **Cost projection:**
  - Phase 3 baseline: ~$0.15 per fresh sim
  - Phase 4a Tier 2: 80 calls × ~$0.005 = ~$0.40
  - Phase 4a total: ~$0.55-0.70 per fresh sim, well under $2 ceiling
- **Wall time estimate:** 200 cast × 30 rounds with ~1500 Ollama calls at 1s each = ~25min. May need to parallelize Ollama calls within a round to keep this reasonable. Allowed: batch up to 10 concurrent Ollama requests per round.

If Ollama unavailable, all tier 1 → tier 0 (deterministic), wall time drops dramatically, simulation still completes.

---

## Test plan

After implementation, run end-to-end against the Jojo project at 200 cast × 30 year-rounds.

Capture and report:

1. **Action distribution** — count each action type across the full simulation. Show that EAT, REST, TRAVEL aren't the only things happening (i.e., COOPERATE, CONFLICT, BETRAY, SEEK_BOND must show non-zero counts).
2. **Tier distribution** — count of decisions resolved at Tier 0 / Tier 1 / Tier 2. Verify the rough 80/18/2 split.
3. **Sample bond network** — for one bound Bible character (e.g., Jojo), paste their final bonds map showing who they bonded with, intensity, trust, and bond type. Compare to how Phase 3's empty bonds layer looked.
4. **Sample dramatic chain** — find one action chain where Action A in round X caused Knowledge update Y, which led to Action Z in round W. Trace it through. This is the proof of real causation.
5. **Variance test** (THE CRITICAL TEST) — run the SAME simulation parameters TWICE with DIFFERENT seeds. Paste both narrative outputs. They should describe genuinely different stories, not minor variations of the same outcome. If both narratives still read as "everyone uniformly starved," Phase 4a hasn't done its job.
6. **Determinism test** — run the same parameters TWICE with the SAME seed. Results should be byte-identical (modulo LLM temperature noise). Show that agent count, event count, butterfly edges, and final state all match.
7. **Ollama health** — confirm Ollama was reached, count of tier 1 calls actually made vs downgraded, sample of one tier 1 prompt and response.
8. **Cost** — total tokens and dollars across taxonomy + Tier 2 decisions + narrative.
9. **Quick Scenario regression check** — confirm `git diff main -- src/components/SimPanel.jsx` is empty.
10. **1000-cast stress** — confirm completion, no crashes, total cost still under $1.50.

Capture the **variance test narratives side-by-side** in the report. That's the headline proof Phase 4a delivered.

---

## Explicitly NOT in Phase 4a

These come in Phase 4b or Phase 5; do not start them:

- Dialogue generation (Phase 4b)
- Scenario mode (Phase 4b)
- Output UI redesign (Phase 5)
- The "world experience" panels (Phase 5)
- Map visualization (Phase 5)
- Promotion candidate UI (Phase 5)
- Dialogue tone tuning (Phase 4b)
- Faction-as-first-class-object (Phase 5+)
- Ollama model fine-tuning or custom prompts beyond decisions (Phase 4b+)

---

## What to report after Phase 4a

- File diff summary (lines added/removed per file)
- Action distribution (counts per action type)
- Tier distribution (Tier 0 / 1 / 2 counts)
- Sample bond map (real data, real bound character)
- Sample dramatic chain (action → knowledge → action)
- **Variance test: two narratives from same params, different seeds (paste both)**
- Determinism test: identical results from same seed
- Ollama call count, sample prompt+response
- Total tokens and cost
- Quick Scenario regression check
- 1000-cast stress test results
- Any deviations from this brief, with reasoning
- Any concerns about Phase 4b readiness

Stop after Phase 4a reports. Do not start Phase 4b.

---

## Commit discipline

- One commit for the v1.5 design doc update before any code
- One commit for Phase 4a implementation when end-to-end test passes (including variance test)
- Both pushed to `deep-simulation-rebuild`
- Final merge to `main` only happens after all 5 phases are verified
