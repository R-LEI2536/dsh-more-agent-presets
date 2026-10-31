/**
 * Runnable check for `presets/shared/model-persona.mjs`.
 *
 *   node check-model-persona.mjs
 *
 * The one fact that broke in 1.6.1: the persona must follow the model the
 * SESSION selected, not the profile default the agent was created with. The
 * table is loaded through the plugin's own `personaTable()`, so a missing or
 * malformed `presets/shared/model-personas.json` — the single shipped copy
 * of the table — fails here too, as does a `file` row whose reference escapes
 * the plugin directory. It also pins the two Gemini bodies: each model id
 * matches its own file-backed row, and neither body may carry an XML tag, tool
 * name or component name — the vocabulary the adaptation deleted. And it pins
 * the move to `presets/shared/`: the declaration's row `name` exists on disk,
 * and the pre-1.7.0 specifier (`presets/chat-agent/model-persona.mjs`) is a
 * re-export of this same module instance. Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { pickPersona, personaTable, refText, resolveRefs, sessionModel } from './presets/shared/model-persona.mjs'

const table = personaTable()
/** A context whose `sessionProjections` service serves one `modelSelection` state. */
const ctxWith = state => ({ get: name => name !== 'sessionProjections' || state === undefined ? undefined : { stateOf: () => state } })
/** A live agent; `session` only has to exist for the projection read. */
const agentWith = model => ({ session: {}, options: model === undefined ? {} : { model } })

// A Web UI Session: created with the profile default, model picked before the first send.
const picked = ctxWith({ pending: { provider: 'daseinai', model: 'gpt-6-luna' }, lastUsed: null })
assert.equal(sessionModel(picked, agentWith('deepseek-v4.1-flash')), 'gpt-6-luna')
assert.match(
  pickPersona(sessionModel(picked, agentWith('deepseek-v4.1-flash')), table),
  /^You are Codex, an agent based on GPT-5/,
)

// The same Session after its first request consumed the pick into `lastUsed`.
const consumed = ctxWith({ pending: null, lastUsed: { provider: 'daseinai', model: 'gpt-6-luna' } })
assert.match(
  pickPersona(sessionModel(consumed, agentWith('deepseek-v4.1-flash')), table),
  /^You are Codex, an agent based on GPT-5/,
)

// A dot inside the model's own name is not a provider prefix: `gpt-5.6-luna` is its own alias, and
// a prepended provider path still lands on the same row.
assert.match(pickPersona('gpt-5.6-luna', table), /^You are Codex, an agent based on GPT-5/)
assert.match(pickPersona('global.openai.gpt-6-luna', table), /^You are Codex, an agent based on GPT-5/)

// No projection (headless / ACP): the entry-point model still decides.
assert.match(
  pickPersona(sessionModel(ctxWith(undefined), agentWith('gpt-6-sol')), table),
  /^You are Codex, a coding agent based on GPT-6/,
)

// A dotted point-release (`gpt-6.1-sol`) is NOT a prefix of `gpt-6-sol` (`gpt-6.` vs `gpt-6-`), so it
// is listed as its own alias on the GPT-6 row; without that row it used to fall to `default`.
assert.match(pickPersona('gpt-6.1-sol', table), /^You are Codex, a coding agent based on GPT-6/)
assert.match(pickPersona('daseinai-gpt.gpt-6.1-sol', table), /^You are Codex, a coding agent based on GPT-6/)
assert.notEqual(pickPersona('gpt-6.1-sol', table), table.default)

// An unrelated model, and an assembly with no model at all, fall to `default`.
assert.equal(sessionModel(ctxWith(undefined), agentWith('deepseek-v4.1-flash')), 'deepseek-v4.1-flash')
assert.equal(pickPersona(sessionModel(ctxWith(undefined), agentWith('deepseek-v4.1-flash')), table), table.default)
assert.equal(pickPersona(sessionModel(ctxWith(undefined), agentWith(undefined)), table), table.default)

// A `file` row resolves against the plugin directory; escapes and absolute paths are refused.
const resolved = resolveRefs({ default: 'd', personas: [{ model: ['fake-model'], file: 'model-personas.json' }] })
assert.equal(JSON.parse(resolved.personas[0].text).default, table.default)
assert.equal('file' in resolved.personas[0], false)
assert.equal(pickPersona('fake-model', resolved), resolved.personas[0].text)
assert.throws(() => refText('../package.json'))
assert.throws(() => refText('/etc/hostname'))
assert.throws(() => refText(''))
// The escape guard must reject an OUTSIDE path that exists, not merely a missing
// one: `presets/chat-agent/no-tools.mjs` is real and still outside this dir.
assert.throws(() => refText('../chat-agent/no-tools.mjs'))

// The pre-1.7.0 specifier still resolves, to the SAME module instance — a profile
// override that restated `presets/chat-agent/model-persona.mjs` keeps working, and
// there is still one cached table rather than a second read.
const shim = await import('./presets/chat-agent/model-persona.mjs')
assert.equal(shim.personaTable, personaTable)
assert.equal(shim.pickPersona, pickPersona)
assert.equal(shim.sessionModel, sessionModel)

// The asset the shipped declaration names must exist: after the move to
// `presets/shared/`, a stale row `name` would fail at mount, which is what this pins.
const chatAgentPatch = readFileSync(new URL('./presets/chat-agent.patch.yml', import.meta.url), 'utf8')
const personaRowName = /- id: model-persona\s+name: '([^']+)'/.exec(chatAgentPatch)?.[1]
assert.equal(personaRowName, 'dsh-more-agent-presets/presets/shared/model-persona.mjs')
assert.ok(existsSync(new URL(`./${personaRowName.replace('dsh-more-agent-presets/', '')}`, import.meta.url)))

// The two Gemini bodies: each is one capture's adaptation, matched by its own model id (the
// provider prefix is stripped before matching, so `daseinai.gemini-3.8-flash` hits the same row
// as the bare id).
assert.match(pickPersona('gemini-3.7-flash', table), /^You are Gemini\./)
assert.match(pickPersona('gemini-3.7-flash', table), /RULE 1: CLARIFICATION FIRST/)
assert.match(pickPersona('daseinai.gemini-3.8-flash', table), /^You are Gemini\./)
assert.match(pickPersona('daseinai.gemini-3.8-flash', table), /For straightforward, unambiguous queries/)

// The adaptation policy is a property of EACH body, not a comparison between them: no XML tag,
// tool name or component vocabulary may survive the edit that deleted those sections.
const ADAPTATION_LEFTOVERS = /<\/?[A-Za-z]|image_agent|web_search|web_fetch|google:search|expand_tools|image_generation_tool|web_code_canvas|Basekit|component_library|surface_constraints|lmdx|ElicitationsGroup/
for (const model of ['gemini-3.7-flash', 'gemini-3.8-flash']) {
  assert.doesNotMatch(pickPersona(model, table), ADAPTATION_LEFTOVERS, `${model} body carries an adaptation leftover`)
}

console.log('check-model-persona: ok')
