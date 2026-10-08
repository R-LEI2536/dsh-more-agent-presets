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
 * The verbatim text is `presets/chat-agent/model-personas.json`, which
 * `personaTable()` reads at apply time; this row carries no `config`, so there
 * is no second copy to keep in sync. A row may name a Markdown body instead of
 * inlining its text (`{ "model": [...], "file": "ref/gemini.md" }`), which
 * `resolveRefs()` reads from this directory at load:
 *
 *   - key = the Session's selected model id (`sessionModel()`), lower-cased and
 *     matched as written AND as every suffix after a `.` — a provider path may
 *     be prepended (`daseinai.gemini-3.8-flash`) while the model's own name may
 *     contain a dot (`gemini-3.7-flash`), so one split rule cannot cover both;
 *   - exact alias match first; otherwise the LONGEST alias that is a prefix of
 *     the key (`qwen3-coder` hits `qwen`, `deepseek-r1-0528` hits
 *     `deepseek-r1`); otherwise the `default` entry. A bare `deepseek` alias
 *     would swallow `deepseek-v4.1-flash` — the source document forbids it.
 *
 * Text is used verbatim; `\n` inside a JSON string is a real newline.
 */

import { readFileSync } from 'node:fs'

export const name = 'chat-agent/model-persona'

export const inject = ['systemPrompt']

/** This plugin's directory: the base every `file` reference resolves against. */
const DIR_URL = new URL('./', import.meta.url)

/** The single copy of the model→text table, beside this plugin. */
const TABLE_URL = new URL('./model-personas.json', import.meta.url)

let cachedTable

/**
 * Read one `file` reference to its text, resolved against this plugin's
 * directory. Absolute paths and `..` escapes are refused, so the table cannot
 * point at anything outside the preset; the text is trimmed, because the file
 * is the whole system prompt and a trailing newline is not part of it.
 * @param ref - a relative path, e.g. `ref/gemini.md`.
 * @returns the referenced file's trimmed text.
 */
export function refText(ref) {
  const url = new URL(ref, import.meta.url)
  if (ref === '' || !url.href.startsWith(DIR_URL.href)) {
    throw new Error(`model-persona: file must be a relative path inside ${DIR_URL.pathname}: ${JSON.stringify(ref)}`)
  }
  return readFileSync(url, 'utf8').trim()
}

/**
 * Resolve every `file` row of a raw table into its `text`, in place.
 *
 * A row may carry its text inline (`text`) or as a path to a Markdown body
 * (`file`, which wins) — a long multi-paragraph prompt is unreadable as a
 * `\n`-escaped JSON string. Resolving here, once, keeps `pickPersona()` a pure
 * function over `text` strings and keeps a broken reference a MOUNT failure
 * rather than a per-request throw inside the section's `text` function.
 * @param table - the parsed `{ default, personas[] }` table.
 * @returns the same table, with every `file` row replaced by its `text`.
 */
export function resolveRefs(table) {
  for (const row of table?.personas ?? []) {
    if (row === null || typeof row !== 'object' || typeof row.file !== 'string') continue
    row.text = refText(row.file)
    delete row.file
  }
  return table
}

/**
 * The model→text table, read once from `model-personas.json` and cached, with
 * every `file` row resolved to its text.
 *
 * Read at apply time, not at import time: the lesson `codex-collab-mode.mjs`
 * records is that a missing data file must not make the plugin un-importable.
 * Unlike that plugin there is NO fallback here — the picked text IS the whole
 * system prompt for a chat session, so a missing or malformed table (or a
 * dangling `file` reference) has no honest substitute. Throwing lets the row
 * fail to mount and the preset composition report it, instead of silently
 * sending an empty prompt.
 * @returns the parsed `{ default, personas[] }` table.
 */
export function personaTable() {
  if (cachedTable === undefined) cachedTable = resolveRefs(JSON.parse(readFileSync(TABLE_URL, 'utf8')))
  return cachedTable
}

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

/**
 * Every way one model id can be written: as given, plus each suffix after a `.`. A deployment may
 * prepend a provider path (`daseinai.gemini-3.8-flash`) while the model's own name may contain a
 * dot too (`gemini-3.7-flash`), so no single split rule covers both.
 * @param modelId - the Session's selected model id, or undefined.
 * @returns the lower-cased candidate keys, longest first (empty when no id is known).
 */
function modelKeys(modelId) {
  const full = modelId ? String(modelId).trim().toLowerCase() : ''
  if (full === '') return []
  const parts = full.split('.')
  return parts.map((_, index) => parts.slice(index).join('.'))
}

/** Pick the persona text for one model id from the resolved table (every row carries `text`). */
export function pickPersona(modelId, table) {
  const keys = modelKeys(modelId)
  const aliases = []
  for (const row of table?.personas ?? []) {
    if (row === null || typeof row !== 'object' || !Array.isArray(row.model) || typeof row.text !== 'string') continue
    for (const raw of row.model) {
      const alias = String(raw).trim().toLowerCase()
      if (alias === '') continue
      if (keys.includes(alias)) return row.text
      aliases.push({ alias, text: row.text })
    }
  }
  let best
  for (const { alias, text } of aliases) {
    if (keys.some(entry => entry.startsWith(alias)) && (best === undefined || alias.length > best.alias.length)) best = { alias, text }
  }
  return best ? best.text : (typeof table?.default === 'string' ? table.default : '')
}

export function apply(ctx) {
  const table = personaTable()
  ctx.systemPrompt.suppressRuntimeContext()
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'deployment:persona-prefix',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    complete: true,
    text: context => pickPersona(sessionModel(ctx, context?.agent), table),
  }), 'chat-agent/model-persona.section()')
}