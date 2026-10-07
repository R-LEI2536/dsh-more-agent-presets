/**
 * chat-agent — model-dependent persona.
 *
 * Replaces the `@deepseek-ai/dsh-persona` row for this preset. The persona
 * text is picked per session from the model-persona table, and it is the
 * COMPLETE system prompt: `complete: true` makes the picked text the sole
 * section of the assembly (`SystemPrompt.assemble()` collapses `sections` to
 * the single complete section), and `suppressRuntimeContext()` keeps the
 * `Current runtime context` user-role snapshot and every `context()` block out
 * — the same two knobs the persona row set (`complete: true` +
 * `includeRuntimeContext: false`) become the two calls below.
 *
 * Why a plugin and not a persona-row config? The persona plugin's `prefix` is
 * a plain string (`packages/preset/persona/src/index.ts:50`), but a
 * `systemPrompt.section()` text may be a function of the assembly context
 * (`packages/core/system-prompt/src/index.ts:66`), and `@deepseek-ai/dsh-agent`
 * augments `AssembleContext` with the calling `agent`
 * (`packages/core/agent/src/runtime-types.ts:18-21`, filled by
 * `dispatch.ts assembleContextFor`), so the function can read the Session the
 * assembly is for and return the row for that model.
 *
 * WHICH model id: not `agent.options.model` alone. A Web UI Session is created
 * with the profile's DEFAULT model (`agentOptions: this.agentOptions()`,
 * `packages/api/session-controller/src/agent.ts:497-500`) and the picker's
 * choice reaches it later as a `model/selection` event (`commands.ts:151-176`
 * `selectModel` -> `selectForNextRequest`); the model the next request will
 * actually use is `pending ?? lastUsed` of the Session's `modelSelection`
 * projection (`agent.ts:286-310` `selectionFor`). Reading the agent option only
 * gave every Web UI session the generic `default` row no matter what the picker
 * showed (fixed in 1.6.1), so `sessionModel()` reads the projection first and
 * falls back to `agent.options.model` — which IS the entry-point model where
 * nothing is projected (headless `bundle/headless/src/index.ts:332-340`, ACP
 * `acp/src/model-control.ts:44-59`) and for any profile-default session.
 *
 * Table of contents (the verbatim source is `presets/chat-agent/model-personas.md`; the
 * `config` of this row is its machine-readable copy — keep the two in sync):
 *
 *   - key = the Session's selected model id (`sessionModel()`), matched
 *     case-insensitively after stripping the provider prefix (the segment after
 *     the last `.`);
 *   - exact alias match first; otherwise the LONGEST alias that is a prefix of
 *     the key (`qwen3-coder` hits `qwen`, `deepseek-r1-0528` hits
 *     `deepseek-r1`); otherwise the `default` entry. A bare `deepseek` alias
 *     would swallow `deepseek-v4.1-flash` — the source document forbids it.
 *
 * Text is used verbatim; `\n` inside the double-quoted YAML scalars of the
 * config is a real newline (YAML double-quoted escape).
 */

export const name = 'chat-agent/model-persona'

export const inject = ['systemPrompt']

/**
 * The model id the Session's NEXT request will use, from the harness's own
 * sources: the Session-local selection the Web session controller installs
 * (`pending` before the first request, `lastUsed` after it), then the model the
 * entry point stated on the agent options.
 * @param ctx - the preset's context, for the optional `sessionProjections` read.
 * @param agent - the agent this assembly is for; absent on diagnostics.
 * @returns the model id, or undefined when nothing states one.
 */
export function sessionModel(ctx, agent) {
  const session = agent?.session
  const state = session === undefined
    ? undefined
    : ctx.get('sessionProjections')?.stateOf(session, 'modelSelection')
  return (state?.pending ?? state?.lastUsed)?.model ?? agent?.options?.model
}

/** Pick the persona text for one model id from the verbatim table. */
export function pickPersona(modelId, table) {
  const key = modelId ? String(modelId).split('.').pop().trim().toLowerCase() : ''
  const aliases = []
  for (const row of table?.personas ?? []) {
    if (row === null || typeof row !== 'object' || !Array.isArray(row.model) || typeof row.text !== 'string') continue
    for (const raw of row.model) {
      const alias = String(raw).trim().toLowerCase()
      if (alias === '') continue
      if (alias === key) return row.text
      aliases.push({ alias, text: row.text })
    }
  }
  let best
  for (const { alias, text } of aliases) {
    if (key.startsWith(alias) && (best === undefined || alias.length > best.alias.length)) best = { alias, text }
  }
  return best ? best.text : (typeof table?.default === 'string' ? table.default : '')
}

export function apply(ctx, config) {
  ctx.systemPrompt.suppressRuntimeContext()
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'deployment:persona-prefix',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    complete: true,
    text: context => pickPersona(sessionModel(ctx, context?.agent), config),
  }), 'chat-agent/model-persona.section()')
}