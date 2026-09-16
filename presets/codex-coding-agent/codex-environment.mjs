/**
 * Codex `<environment_context>` block — DSH `agent/pre-step` plugin.
 *
 * Mirrors upstream `codex-rs/core/src/context/world_state/environment.rs:156-191`:
 * one user-role message with the live cwd, shell, platform, OS version, and
 * today's date, wrapped in `<environment_context>...</environment_context>`
 * markers.
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
import os from 'node:os'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'codex-environment'

export const inject = ['agents']

const PLATFORM_NAMES = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

export function apply(ctx) {
  ctx.on('agent/pre-step', async (_args, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision

    const platform = PLATFORM_NAMES[process.platform] ?? process.platform
    const shell = process.platform === 'win32' ? 'pwsh' : 'bash'
    const text = [
      '<environment_context>',
      `  cwd: ${process.cwd()}`,
      `  shell: ${shell}`,
      `  platform: ${platform}`,
      `  os_version: ${os.release()}`,
      `  today_date: ${new Date().toISOString().split('T')[0]}`,
      '</environment_context>',
    ].join('\n')

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  })
}