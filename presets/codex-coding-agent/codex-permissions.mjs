/**
 * Codex `<permissions instructions>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/permissions.rs:175-191`:
 * one developer-role message containing the live sandbox policy + approval
 * policy, wrapped in `<permissions instructions>...</permissions instructions>`
 * markers.
 *
 * UPGRADE NOTE: Codex upstream uses `role: 'developer'` for this block. DSH
 * currently only supports `role: 'system' | 'user' | 'assistant'` (see
 * `packages/llm/llm/src/message.ts:131-135`). When DSH gains `developer`
 * support, swap `createUserMessage` for a developer-role factory and re-test.
 *
 * Behavior:
 *   - `ctx.systemPrompt.suppressRuntimeContext()` removes the DSH-native
 *     `sandbox:policy` and `approval:policy` contexts so they do not also
 *     render under DSH's `Current runtime context...` wrapper. The suppressor
 *     is all-or-nothing, but `harness:source`, `app:web-surface`, and the
 *     persona suffix are sections (different assembly path) and the
 *     `time-context` package uses an `agent/pre-step` listener rather than
 *     `systemPrompt.context`, so they are unaffected.
 *   - Each step appends one user-role `<permissions instructions>` message
 *     to the admitted input.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-permissions'

export const inject = ['systemPrompt', 'sandboxPolicy', 'approval', 'agents']

/** Mirrored from `packages/interaction/user-approval/src/index.ts:66-68`. */
const NEVER_SENTENCE = 'Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).'
const ASK_SENTENCE = 'Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.'

export function apply(ctx) {
  ctx.systemPrompt.suppressRuntimeContext()

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const session = agent.session
    if (session === undefined) return decision

    const sandbox = ctx.sandboxPolicy.resolve({ session })
    const sandboxText = renderSandbox(sandbox)
    if (sandboxText === null) return decision

    const overridePolicy = ctx.approval.overrideOf(session)
    const policy = overridePolicy ?? ctx.approval.config.policy ?? 'ask'
    const approvalText = policy === 'never' ? NEVER_SENTENCE : ASK_SENTENCE

    const body = [sandboxText, approvalText].filter((t) => t.length > 0).join('\n\n')
    const text = `<permissions instructions>\n${body}\n</permissions instructions>`

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })
}

/** Mirrors `packages/sandbox/sandbox-policy/src/index.ts:41-55` (private). */
function renderSandbox(policy) {
  switch (policy.mode) {
    case 'read-only':
      return 'Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.'
    case 'workspace-write':
      return `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(policy.workspaceRoot)}. Some platform temporary areas may also be writable.`
    case 'danger-full-access':
      return 'Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.'
    /* v8 ignore next -- SandboxMode is a typed same-process closed union */
    default:
      throw new Error(`codex-permissions: unreachable sandbox mode: ${String(policy.mode)}`)
  }
}