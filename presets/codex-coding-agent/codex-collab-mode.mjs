/**
 * Codex `<collaboration_mode>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/collaboration_mode.rs:127-130`:
 * one developer-role message containing the active collaboration mode's
 * instructions, wrapped in `<collaboration_mode>...</collaboration_mode>`
 * markers. The body is ported from
 * `codex-rs/collaboration-mode-templates/templates/{default,plan}.md`, with
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
 *     body matches the live plan mode (`ctx.planMode.get(agent).active`).
 *   - Re-injects every step even when body is unchanged, mirroring Codex's
 *     durable `user-role`-style input[] replacement semantics; DSH's session
 *     log dedup is the runtime owner's concern, not ours.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-collab-mode'

export const inject = ['systemPrompt', 'planMode', 'agents']

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_BODY = readFileSync(join(here, 'ref/codex-default-mode.md'), 'utf8').trim()
const PLAN_BODY = readFileSync(join(here, 'ref/codex-plan-mode.md'), 'utf8').trim()

export function apply(ctx) {
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision

    const plan = ctx.planMode.get(agent)
    const rawBody = plan.active ? PLAN_BODY : DEFAULT_BODY
    const body = rawBody.replaceAll('request_user_input', 'ask_user_question')
    const text = `<collaboration_mode>\n${body}\n</collaboration_mode>`

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })
}