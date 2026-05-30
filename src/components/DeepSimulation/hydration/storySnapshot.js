// Phase 6/6a-i — Story snapshot
//
// The story snapshot is the prose description of "where the story is
// right now." The simulation projects forward from this moment.
//
// Two tiers:
//   - Project-level: stored as `project.storySnapshot`. Edited in Story
//     Bible's new "Story State" section.
//   - Per-simulation: stored on the simulation result (and on the in-
//     flight sim config). Overrides project-level for that one run.

const DEFAULT_HINT = ''

// Get the active snapshot for a simulation. Per-sim wins; falls back to
// project-level; defaults to empty string.
export function getActiveSnapshot(project, simConfig = {}) {
  if (simConfig?.simSnapshotEnabled && simConfig?.simSnapshot != null) {
    return String(simConfig.simSnapshot)
  }
  return String(project?.storySnapshot ?? DEFAULT_HINT)
}

// Whether the writer has chosen a per-simulation override
export function isSimOverride(simConfig) {
  return !!simConfig?.simSnapshotEnabled
}

// Build the snapshot block injected into LLM prompts. Returns null if
// the snapshot is empty so callers can omit cleanly.
export function snapshotForPrompt(project, simConfig) {
  const text = getActiveSnapshot(project, simConfig).trim()
  if (!text) return null
  return text
}
