/**
 * Codex `<collaboration_mode>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/collaboration_mode.rs:127-130`:
 * one developer-role message carrying the FULL BODY of the active
 * collaboration mode, wrapped in `<collaboration_mode>...</collaboration_mode>`
 * markers. The block is registered as a separate developer message in the
 * world-state push order (`codex-rs/core/src/session/world_state.rs:77`):
 * `ModelInstructions → Personality → ... → Permissions → CollaborationMode →
 * Environments → ...`, i.e. it sits after `<permissions instructions>` and
 * before `<environment_context>` in the admitted input[].
 *
 * The default-mode body is ported from
 * `codex-rs/collaboration-mode-templates/templates/default.md`, with one
 * tool-name substitution: `request_user_input` → `ask_user_question`.
 *
 * UPGRADE NOTE: Codex upstream uses `role: 'developer'` for this block. DSH
 * currently only supports `role: 'system' | 'user' | 'assistant'` (see
 * `packages/llm/llm/src/message.ts:131-135`). When DSH gains `developer`
 * support, swap `createUserMessage` for a developer-role factory and re-test.
 *
 * Behavior:
 *   - Each step appends one user-role `<collaboration_mode>...</collaboration_mode>`
 *     message with the default-mode body. The body is always the default
 *     because `ctx.planMode` is unreachable from outside the `planning`
 *     group's isolate realm (see CHANGELOG 1.4.1 "planMode isolate-realm
 *     conflict"). When plan mode is active, the model still sees plan-mode
 *     messaging via `dsh-plan-mode`'s section under the `planning` group,
 *     which renders the same upstream `plan.md` content as a system-prompt
 *     section.
 *   - Re-injects every step even when the body is unchanged, mirroring
 *     Codex's durable input[] replacement semantics; DSH's session log
 *     dedup is the runtime owner's concern, not ours.
 *
 * Body loading: the default body is read lazily inside `apply()` from
 * `ref/codex-default-mode.md`, with an ENOENT fallback to an empty string.
 * Reading at apply time rather than at module load keeps the plugin
 * importable even if the `ref/` file is missing from the installed
 * location. The `ref/` file remains the canonical source; the empty
 * fallback lets the plugin mount so the rest of the preset still
 * composes, and the warning makes the missing file visible.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-collab-mode'

export const inject = ['agents']

const here = dirname(fileURLToPath(import.meta.url))

let cachedBody = null
function loadBody() {
  if (cachedBody !== null) return cachedBody
  try {
    cachedBody = readFileSync(join(here, 'ref', 'codex-default-mode.md'), 'utf8').trim()
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn(`[codex-collab-mode] ref/codex-default-mode.md not found at ${join(here, 'ref', 'codex-default-mode.md')}; emitting empty body`)
      cachedBody = ''
    } else {
      throw error
    }
  }
  return cachedBody
}

export function apply(ctx) {
  const body = loadBody().replaceAll('request_user_input', 'ask_user_question')
  const text = `<collaboration_mode>\n${body}\n</collaboration_mode>`

  ctx.on('agent/pre-step', async (_args, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })
}