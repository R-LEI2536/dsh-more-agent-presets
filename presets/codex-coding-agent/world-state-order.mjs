/**
 * Canonical order for the three Codex world-state blocks and the step's
 * pre-prompt run.
 *
 * SCOPE — this helper places exactly four messages: the three blocks this
 * preset owns, plus the loop's required `runtime-context` placeholder. It does
 * NOT reproduce Codex's whole request; AGENTS.md, the skill catalog and time
 * context belong to other packages and keep their own positions (see
 * "Not reproduced" below).
 *
 * What Codex records, turn 1 of a fresh session (e6de6a2):
 *   - `Session::run_turn` records the initial world state BEFORE the input
 *     (`codex-rs/core/src/session/turn.rs:302`,
 *     `record_context_updates_and_set_reference_context_item`), then the user
 *     input (`:388`), then the skills/plugin injections (`:429-436`).
 *   - Sections are added in this order
 *     (`codex-rs/core/src/session/world_state.rs:220-311`): model instructions
 *     → AGENTS.md (user-role, `context/world_state/agents_md.rs:40-42`) →
 *     host_skills (developer, shifted in before Permissions,
 *     `context/world_state/mod.rs:491-497`) → Permissions →
 *     CollaborationMode → PersistentMode → Environments (user-role,
 *     `context/world_state/environment.rs:210`).
 *   - Developer-role fragments merge into one message; user-role fragments
 *     (AGENTS.md, then `<environment_context>`) merge into one message after
 *     it (`context_manager/updates.rs:21-49`, `session/mod.rs:4888-4921`).
 *
 *   So turn 1 is: [developer: model instructions + host_skills + permissions +
 *   collaboration mode + …] → [user: AGENTS.md + environment_context] →
 *   prompt → skills/plugin injections. Codex carries the working directory
 *   inside `<environment_context>`, which is why DSH's required
 *   `Current runtime context` snapshot belongs in the same run.
 *
 * LATER STEPS ARE NOT TURN 1. Only diffs are recorded after the first turn:
 * the turn-start diff still precedes the input (`turn.rs:302` runs before
 * `:388`), but a mid-step diff is recorded AFTER the pending input
 * (`turn.rs:487` claims it, `:555` records the diff). "Context before the
 * prompt" is a turn-start property; this preset always places its run before
 * the step's claimed messages, i.e. it mirrors the turn-start point and does
 * not model the mid-step diff case.
 *
 * NOT REPRODUCED by this preset (other packages own these positions):
 *   - AGENTS.md: in the current composition `dsh-agent-instructions` splices it
 *     after the claimed batch
 *     (`packages/context/agent-instructions/src/index.ts:355-358`), i.e. after
 *     the prompt; Codex has it before the prompt. Whether listener ordering
 *     could hoist it earlier is NOT verified — do not read this as "cannot be
 *     moved".
 *   - Skill catalog: `dsh-tool-skill` appends its `<system-reminder>` after every
 *     downstream listener; it also has its own digest/resend semantics, so its
 *     position is not a pure ordering question.
 *   - Roles: these DSH blocks are user-role messages; Codex uses developer role
 *     for permissions and collaboration mode.
 *   - Withdrawal: the hash short-circuit re-sends a changed block and never
 *     retracts the old one, so A→B→A leaves stale fragments in history. That is
 *     a separate behaviour decision, not part of this ordering helper.
 *
 * DSH dispatch does NOT preserve the block order by itself. `agent/pre-step`
 * is a waterfall dispatched outermost-first (`vendor/cordis/src/events.ts:224-243`)
 * and every world-state plugin appends after `await next()`, so the FIRST
 * registered listener writes LAST. Registering permissions → collab →
 * environment therefore appends environment → collab → permissions, the exact
 * reverse, and the loop's built-in appends the runtime-context placeholder
 * after the claimed messages (`packages/core/agent-loop/src/agent.ts:274-283`),
 * i.e. after the prompt.
 *
 * Measured baseline before this helper (session-f8d1d89c, turn 1 step 1):
 *
 *   user → runtime-context → codex-environment → codex-collab-mode
 *        → codex-permissions → skill-catalog
 *
 * Why moving the placeholder is enough: at request admission the loop walks
 * `decision.messages` in order and appends the FRESHLY rendered snapshot where
 * the placeholder sits (`agent.ts:425-440`), so the moved position is what the
 * model sees; a snapshot produced only at admission time still lands at the end
 * (`:438-440`).
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
