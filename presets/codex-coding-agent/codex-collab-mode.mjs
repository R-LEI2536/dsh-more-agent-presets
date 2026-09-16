/**
 * Codex `<collaboration_mode>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/collaboration_mode.rs:127-130`:
 * one developer-role message containing the active collaboration mode's
 * instructions, wrapped in `<collaboration_mode>...</collaboration_mode>`
 * markers. The body is ported from
 * `codex-rs/collaboration-mode-templates/templates/default.md`, with
 * tool-name substitutions: `request_user_input` → `ask_user_question`,
 * `<proposed_plan>` → `exit_plan_mode`, `update_plan` → `todo_write`.
 *
 * UPGRADE NOTE: Codex upstream uses `role: 'developer'` for this block. DSH
 * currently only supports `role: 'system' | 'user' | 'assistant'` (see
 * `packages/llm/llm/src/message.ts:131-135`). When DSH gains `developer`
 * support, swap `createUserMessage` for a developer-role factory and re-test.
 *
 * Behavior:
 *   - Each step appends one user-role `<collaboration_mode>` message whose
 *     body is the port of upstream
 *     `codex-rs/collaboration-mode-templates/templates/default.md`. The
 *     plan-mode counterpart is rendered separately by `dsh-plan-mode`'s
 *     section under the `planning` group, so the model sees consistent
 *     plan-mode messaging whether it arrives as a system-prompt section or
 *     as this input[] block.
 *   - Re-injects every step even when body is unchanged, mirroring Codex's
 *     durable input[] replacement semantics; DSH's session log dedup is the
 *     runtime owner's concern, not ours.
 *
 * Plan-mode source: `ctx.planMode` is intentionally NOT touched. The
 * `planning` group (`agent.cordis.yml`) isolates `planMode: true` to its
 * own entry-local realm, so a consumer outside that group cannot reach
 * `planMode` (see the Cordis skill doc, "The rule that catches people").
 * DSH throws `cannot get property "planMode" without inject` if the
 * property is accessed without being declared in `inject`, and there is no
 * try/catch around the property access — so the plugin must simply never
 * touch it. The plan-mode body lives at `ref/codex-plan-mode.md` so it
 * stays available for a future DSH release that exposes `planMode` on the
 * outer ctx (at which point this plugin can resume the body swap by
 * adding `planMode` back to `inject` and reading it).
 *
 * Body loading: the `default` and `plan` bodies are read lazily inside
 * `apply()` from `ref/codex-default-mode.md` and `ref/codex-plan-mode.md`,
 * with an ENOENT fallback to an empty string. Reading at apply time rather
 * than at module load keeps the plugin importable even if the `ref/` files
 * are missing from the installed location. The `ref/` files remain the
 * canonical source; the empty fallback lets the plugin mount so the rest
 * of the preset still composes, and the warning makes the missing files
 * visible.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-collab-mode'

export const inject = ['agents']

const here = dirname(fileURLToPath(import.meta.url))

let cached = null
function loadBodies() {
  if (cached !== null) return cached
  function read(filename) {
    try {
      return readFileSync(join(here, 'ref', filename), 'utf8').trim()
    } catch (error) {
      if (error?.code === 'ENOENT') {
        console.warn(`[codex-collab-mode] ref/${filename} not found at ${join(here, 'ref', filename)}; emitting empty body`)
        return ''
      }
      throw error
    }
  }
  cached = { default: read('codex-default-mode.md'), plan: read('codex-plan-mode.md') }
  return cached
}

export function apply(ctx) {
  const bodies = loadBodies()

  ctx.on('agent/pre-step', async ({ agent: _agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision

    const body = bodies.default.replaceAll('request_user_input', 'ask_user_question')
    const text = `<collaboration_mode>\n${body}\n</collaboration_mode>`

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })
}