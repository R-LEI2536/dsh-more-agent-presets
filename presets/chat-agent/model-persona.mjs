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
 * `dispatch.ts assembleContextFor`), so the function reads
 * `context.agent.options.model` and returns the row for that model.
 *
 * Table of contents (the verbatim source is `presets/chat-agent/model-personas.md`; the
 * `config` of this row is its machine-readable copy — keep the two in sync):
 *
 *   - key = model id (`agent.options.model`), matched case-insensitively after
 *     stripping the provider prefix (the segment after the last `.`);
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
    text: context => pickPersona(context?.agent?.options?.model, config),
  }), 'chat-agent/model-persona.section()')
}