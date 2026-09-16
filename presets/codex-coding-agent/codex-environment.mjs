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
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-environment'

export const inject = ['agents']

export function apply(ctx) {
  ctx.on('agent/pre-step', async (_args, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision

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
}