/**
 * subagent-route-log — one `info` line per delegated child, naming its route.
 *
 * A child does not choose a route by itself: it INHERITS the parent's unless the
 * delegation call named one, and with `modelSelectionSettings` on (the five
 * coding presets) a call may name `provider`/`model`/`reasoning_effort` from the
 * Host's authorized list. Either way the terminal otherwise says nothing about
 * which model did the work, and a child that quietly ran on an unexpected route
 * is invisible — that is what this row is for. `chat-subagent` does not mount
 * it: its `delegator` already logs the same line while it masks the child.
 *
 * The two readers below live here rather than in one preset's directory because
 * several presets need the same answer; `presets/chat-subagent/delegator.mjs`
 * imports and re-exports them, so there is still one implementation.
 */

import { sessionModel } from './model-persona.mjs'

export const name = 'subagent-route-log'

/**
 * The agent's delegation depth, read the way `@deepseek-ai/dsh-subagent` reads it
 * (`packages/subagent/subagent/src/depth.ts:28-36`): the persisted header is the
 * monotone floor and the merge-extensible runtime field may only deepen it,
 * because a resumed child arrives with fresh options and counting it from zero
 * would let it delegate as if it were top-level.
 * @param agent - the created agent.
 * @returns its non-negative depth, zero for a top-level session.
 */
export function depthOf(agent) {
  const header = agent?.session?.header?.delegationDepth
  const runtime = agent?.options?.subagentDepth
  return Math.max(
    typeof header === 'number' && Number.isSafeInteger(header) ? header : 0,
    typeof runtime === 'number' && Number.isSafeInteger(runtime) ? runtime : 0,
  )
}

/**
 * The provider/model a delegated child was created with — the one line the
 * terminal says about a child's route. A child's own Session selection wins
 * where one exists, so the model is read through `sessionModel()` and
 * `agent.options.model` is the fallback rather than the answer.
 * @param ctx - the preset's context, for the optional projection read.
 * @param agent - the delegated child.
 * @returns `provider/model`, or whichever half the harness stated, or `unknown`.
 */
export function childRoute(ctx, agent) {
  const provider = agent?.options?.provider
  const model = sessionModel(ctx, agent)
  const halves = [provider, model].filter(half => typeof half === 'string' && half.trim() !== '')
  return halves.length === 0 ? 'unknown' : halves.join('/')
}

/**
 * Log every delegated child that arrives in this preset.
 * @param ctx - the preset's context.
 * @param config - the row's config; `presetId` names the preset in the line.
 */
export function apply(ctx, config) {
  const configured = typeof config?.presetId === 'string' ? config.presetId.trim() : ''
  // `ctx.logger` is a Context PROPERTY, not a provided service: cordis assigns
  // it in the Context constructor, `get()` reads the service store only, and
  // every line sent through `ctx.get('logger')` is dropped.
  if (configured === '') {
    ctx.logger.warn(`${name}: no \`presetId\` configured; the route lines carry no preset name`)
  }
  const prefix = configured === '' ? name : `${configured}/${name}`
  const info = (message) => ctx.logger.info(`${prefix}: ${message}`)
  ctx.on('agent/created', ({ agent }) => {
    // Diagnostics only, and never deduplicated: two children of one session are
    // two events, and the child id is what tells them apart.
    if (depthOf(agent) === 0) return
    info(`subagent ${String(agent?.id)} route ${childRoute(ctx, agent)}`)
  })
}
