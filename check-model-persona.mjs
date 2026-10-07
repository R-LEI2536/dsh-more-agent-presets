/**
 * Runnable check for `presets/chat-agent/model-persona.mjs`.
 *
 *   node check-model-persona.mjs
 *
 * The one fact that broke in 1.6.1: the persona must follow the model the
 * SESSION selected, not the profile default the agent was created with. The
 * table is read out of the shipped `presets/chat-agent.patch.yml` config, so a
 * table / model-id drift fails here too. Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pickPersona, sessionModel } from './presets/chat-agent/model-persona.mjs'

/** The `model-persona` row's `config` flow mapping, brace-matched and parsed as JSON. */
function tableFromPatch() {
  const patch = readFileSync(new URL('./presets/chat-agent.patch.yml', import.meta.url), 'utf8')
  const afterConfig = patch.indexOf('{', patch.indexOf('config:', patch.indexOf('id: model-persona')))
  let depth = 0
  for (let i = afterConfig; i < patch.length; i += 1) {
    if (patch[i] === '{') depth += 1
    else if (patch[i] === '}' && --depth === 0) return JSON.parse(patch.slice(afterConfig, i + 1))
  }
  throw new Error('model-persona config block not found in presets/chat-agent.patch.yml')
}

const table = tableFromPatch()
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

console.log('check-model-persona: ok')
