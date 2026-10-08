/**
 * Runnable check for `presets/chat-agent/model-persona.mjs`.
 *
 *   node check-model-persona.mjs
 *
 * The one fact that broke in 1.6.1: the persona must follow the model the
 * SESSION selected, not the profile default the agent was created with. The
 * table is loaded through the plugin's own `personaTable()`, so a missing or
 * malformed `presets/chat-agent/model-personas.json` — the single shipped copy
 * of the table — fails here too, as does a `file` row whose reference escapes
 * the plugin directory. Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { pickPersona, personaTable, refText, resolveRefs, sessionModel } from './presets/chat-agent/model-persona.mjs'

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

// No projection (headless / ACP): the entry-point model still decides.
assert.match(
  pickPersona(sessionModel(ctxWith(undefined), agentWith('gpt-6-sol')), table),
  /^You are Codex, a coding agent based on GPT-6/,
)

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

console.log('check-model-persona: ok')
