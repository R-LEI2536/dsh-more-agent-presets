/**
 * Codex `<permissions instructions>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/permissions.rs:175-191`:
 * one developer-role message containing the live sandbox policy + approval
 * policy, wrapped in `<permissions instructions>...</permissions instructions>`
 * markers. Body format mirrors upstream's terse shape: a short sandbox-state
 * sentence on the first line, followed by an approval-policy sentence
 * (`codex-rs/core/src/context/world_state/permissions__tests__snapshots.snap:8-12,23-27`).
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
 *   - Diff-driven: a module-scope `Map<SessionId, hash>` keyed by
 *     `agent.session.id` short-circuits injection when sandbox mode / approval
 *     policy / override are unchanged, mirroring upstream Codex's
 *     `WorldStateSection::render_diff` semantics
 *     (`codex-rs/core/src/context/world_state/permissions.rs:88` and the
 *     diff-driven gate in `codex-rs/core/src/session/mod.rs:3810-3884`).
 *     `agent/disposed` clears the entry so the map does not leak across sessions.
 */
import { createHash } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-permissions'

export const inject = ['systemPrompt', 'sandboxPolicy', 'approval', 'agents']

/** Mirrored from `packages/interaction/user-approval/src/index.ts:66-68`. */
const ASK_SENTENCE = 'Ask for approval.'
const NEVER_SENTENCE = 'Approval policy is currently never. Do not provide the `sandbox_permissions` for any reason, commands will be rejected.'

// Module-scope per-session hash store. Keyed by agent.session.id (stable branded
// SessionId; immutable for the lifetime of the Session).
const lastHashBySession = new Map()

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

    const current = createHash('sha256')
      .update(`${sandbox.mode}|${policy}|${overridePolicy ?? ''}`)
      .digest('hex')
    if (lastHashBySession.get(session.id) === current) return decision
    lastHashBySession.set(session.id, current)

    const approvalText = policy === 'never' ? NEVER_SENTENCE : ASK_SENTENCE
    const text = `<permissions instructions>\n${sandboxText}\n${approvalText}\n</permissions instructions>`

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    if (agent.session !== undefined) lastHashBySession.delete(agent.session.id)
  })
}

/** Mirrors the shape of `packages/sandbox/sandbox-policy/src/index.ts:41-55` (private). */
function renderSandbox(policy) {
  switch (policy.mode) {
    case 'read-only':
      return 'Read only.'
    case 'workspace-write':
      return 'Workspace write.'
    case 'danger-full-access':
      return 'Danger full access.'
    /* v8 ignore next -- SandboxMode is a typed same-process closed union */
    default:
      throw new Error(`codex-permissions: unreachable sandbox mode: ${String(policy.mode)}`)
  }
}