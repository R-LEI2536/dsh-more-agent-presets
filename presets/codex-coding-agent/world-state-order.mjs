/**
 * Canonical order for the three Codex world-state blocks and the step's
 * pre-prompt run.
 *
 * Upstream Codex registers world state in a fixed order and renders it into
 * history BEFORE the turn's user input:
 *
 *   - `Session::run_turn` records the initial world state first
 *     (`codex-rs/core/src/session/turn.rs:302`,
 *     `record_context_updates_and_set_reference_context_item`), then the user
 *     input (`:388`), then the skills/plugin injections (`:429-436`).
 *   - Sections render in registration order
 *     (`codex-rs/core/src/context/world_state/mod.rs:535`): model instructions
 *     → AGENTS.md → Permissions → CollaborationMode → PersistentMode →
 *     Environments (`codex-rs/core/src/session/world_state.rs:220-311`).
 *   - Developer-role fragments merge into one message; the user-role
 *     `<environment_context>` is a separate message after them
 *     (`codex-rs/core/src/context/world_state/environment.rs:210`,
 *     `codex-rs/core/src/context_manager/updates.rs:21-49`).
 *
 * So the pre-prompt run is Permissions → CollaborationMode → Environments,
 * followed by the prompt. Codex carries the working directory inside
 * `<environment_context>`, which is why DSH's own required
 * `Current runtime context` snapshot (its working-directory carrier) belongs in
 * that same run instead of after the prompt.
 *
 * DSH dispatch does NOT preserve that order by itself. `agent/pre-step` is a
 * waterfall dispatched outermost-first (`vendor/cordis/src/events.ts:224-243`)
 * and every world-state plugin appends after `await next()`, so the FIRST
 * registered listener writes LAST. Registering permissions → collab →
 * environment therefore appends environment → collab → permissions, the exact
 * reverse, and the loop's built-in appends the runtime-context snapshot after
 * the claimed messages (`packages/core/agent-loop/src/agent.ts:274-283`), i.e.
 * after the prompt.
 *
 * Measured baseline before this helper (session-f8d1d89c, turn 1 step 1):
 *
 *   user → runtime-context → codex-environment → codex-collab-mode
 *        → codex-permissions → skill-catalog
 *
 * {@link insertWorldState} / {@link orderPrePromptRun} make the resulting array
 * independent of arrival order: the whole world-state run, then the
 * runtime-context snapshot, then the claimed user input.
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

/** `source.kind` of the loop-owned snapshot that carries DSH's working directory. */
const RUNTIME_CONTEXT_KIND = 'runtime-context'

/** Rank of a world-state `source.kind`, or -1 for any other message. */
function rankOf(message) {
  const kind = message?.source?.kind
  const rank = WORLD_STATE_ORDER.indexOf(kind)
  return rank
}

/**
 * Put one step's messages in Codex order, whatever order they arrived in:
 * the world-state run (rank order), then the loop's runtime-context snapshot,
 * then the claimed messages (user input and steering) in their original order.
 *
 * @param messages - the decision's message list; not mutated.
 * @returns a new array in the canonical order.
 */
export function orderPrePromptRun(messages) {
  const blocks = []
  const snapshots = []
  const claimed = []
  for (const message of messages) {
    if (rankOf(message) !== -1) blocks.push(message)
    else if (message?.source?.kind === RUNTIME_CONTEXT_KIND) snapshots.push(message)
    else claimed.push(message)
  }
  // Array#sort is stable: duplicate ranks (which the per-session hash guards
  // make impossible) keep their arrival order.
  blocks.sort((left, right) => rankOf(left) - rankOf(right))
  return [...blocks, ...snapshots, ...claimed]
}

/**
 * Insert one world-state message at its canonical position.
 *
 * @param messages - the decision's message list; not mutated.
 * @param message - the world-state message to insert; its `source.kind` must be
 *   in {@link WORLD_STATE_ORDER}.
 * @returns a new array with `message` in the canonical run.
 */
export function insertWorldState(messages, message) {
  if (rankOf(message) === -1) {
    throw new Error(
      `insertWorldState: "${String(message?.source?.kind)}" is not a Codex world-state block`,
    )
  }
  return orderPrePromptRun([...messages, message])
}
