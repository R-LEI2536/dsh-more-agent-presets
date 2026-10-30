/**
 * Canonical order for the three Codex world-state blocks.
 *
 * Upstream Codex registers world state in a fixed order and renders each change
 * as a separate message:
 *   Permissions → CollaborationMode → Environments
 * (`codex-rs/core/src/session/world_state.rs:77`).
 *
 * DSH dispatch does NOT preserve that order by itself. `agent/pre-step` is a
 * waterfall dispatched outermost-first (`vendor/cordis/src/events.ts:224-243`)
 * and every world-state plugin appends after `await next()`, so the FIRST
 * registered listener writes LAST. Registering permissions → collab →
 * environment therefore produces environment → collab → permissions, the exact
 * reverse. Measured baseline (session-f8d1d89c, turn 1 step 1):
 *
 *   user → runtime-context → codex-environment → codex-collab-mode
 *        → codex-permissions → skill-catalog
 *
 * {@link insertWorldState} makes the resulting array independent of arrival
 * order: each block is placed at its canonical rank, and the whole run stays
 * ahead of the step's user input.
 */

/**
 * Message `source.kind` values of the Codex world-state blocks, in the order
 * upstream Codex renders them. The values are the plugins' own `name`
 * exports, which are also the `source.kind` each plugin stamps on its message.
 */
export const WORLD_STATE_ORDER = Object.freeze([
  'codex-permissions',
  'codex-collab-mode',
  'codex-environment',
])

/** Rank of a world-state `source.kind`, or -1 for any other message. */
function rankOf(message) {
  const kind = message?.source?.kind
  const rank = WORLD_STATE_ORDER.indexOf(kind)
  return rank
}

/**
 * Insert one world-state message at its canonical position.
 *
 * The insert point is the first message that is either not a world-state block
 * at all, or a world-state block of a HIGHER rank. That keeps the run ordered
 * regardless of which plugin runs first, and keeps the whole run before the
 * step's user input when the input is already in the list.
 *
 * @param messages - the decision's message list; not mutated.
 * @param message - the world-state message to insert; its `source.kind` must be
 *   in {@link WORLD_STATE_ORDER}.
 * @returns a new array with `message` at its canonical position.
 */
export function insertWorldState(messages, message) {
  const rank = rankOf(message)
  if (rank === -1) {
    throw new Error(
      `insertWorldState: "${String(message?.source?.kind)}" is not a Codex world-state block`,
    )
  }
  const at = messages.findIndex((existing) => {
    const existingRank = rankOf(existing)
    return existingRank === -1 || existingRank > rank
  })
  return at === -1
    ? [...messages, message]
    : messages.toSpliced(at, 0, message)
}
