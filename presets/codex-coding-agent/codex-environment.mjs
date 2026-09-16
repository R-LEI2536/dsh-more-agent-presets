/**
 * Codex `<environment_context>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/environment.rs:156-191`:
 * one user-role message with the live cwd, shell, current date, and timezone,
 * wrapped in `<environment_context>...</environment_context>` markers using
 * upstream's structured child-tag XML shape
 * (`codex-rs/core/src/context/world_state/environment_render_tests.rs:83-93`).
 *
 * UPGRADE NOTE: Codex upstream uses `role: 'user'` here, so this plugin is
 * already at parity — no developer-role upgrade needed when DSH expands its
 * role set.
 *
 * Coexistence: DSH already publishes cwd via `systemPrompt.variable('cwd')`
 * (used by `prompt-sections.mjs` for the `{{cwd}}` interpolation), the
 * harness source via the `harness:source` section (order 10000), the Web
 * surface via `app:web-surface` (order 10100), and the time/timezone via the
 * `dsh-time-context` package's own `agent/pre-step` listener. None of those
 * is the model-visible input[] block; this plugin is the only one matching
 * upstream's `<environment_context>` shape.
 *
 * Diff-driven: a module-scope `Map<SessionId, hash>` keyed by
 * `agent.session.id` (stable branded id, see
 * `packages/core/session/src/index.ts:470` and
 * `packages/core/session/src/types.ts:19`) short-circuits injection when
 * cwd / shell / date / timezone are unchanged, mirroring upstream Codex's
 * `WorldStateSection::render_diff` semantics
 * (`codex-rs/core/src/context/world_state/environment.rs:102` and the
 * diff-driven gate in `codex-rs/core/src/session/mod.rs:3810-3884`).
 * `agent/disposed` clears the entry so the map does not leak across sessions.
 */
import { createHash } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-environment'

export const inject = ['agents']

// Module-scope per-session hash store. Keyed by agent.session.id (stable branded
// SessionId; immutable for the lifetime of the Session).
const lastHashBySession = new Map()

function stateHash() {
  const shell = process.platform === 'win32' ? 'pwsh' : 'bash'
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = new Date().toISOString().split('T')[0]
  const cwd = process.cwd()
  return createHash('sha256')
    .update(`${cwd}|${shell}|${date}|${timezone}`)
    .digest('hex')
}

export function apply(ctx) {
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision

    const sessionId = agent.session.id
    const current = stateHash()
    if (lastHashBySession.get(sessionId) === current) return decision
    lastHashBySession.set(sessionId, current)

    const shell = process.platform === 'win32' ? 'pwsh' : 'bash'
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const lines = [
      '<environment_context>',
      `  <cwd>${process.cwd()}</cwd>`,
      `  <shell>${shell}</shell>`,
      `  <current_date>${new Date().toISOString().split('T')[0]}</current_date>`,
      `  <timezone>${timezone}</timezone>`,
      '</environment_context>',
    ]
    const text = lines.join('\n')

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    lastHashBySession.delete(agent.session.id)
  })
}