/**
 * Runnable check for the Codex world-state block order.
 *
 *   node check-codex-world-state-order.mjs
 *
 * Two layers, because either one alone proves the wrong thing:
 *
 * 1. Unit — `insertWorldState()` places a block by rank no matter what order
 *    the blocks arrive in.
 * 2. Integration — the three real plugins composed through cordis waterfall
 *    semantics (outermost listener first, each appending AFTER `await next()`),
 *    plus a `dsh-agent-instructions` stand-in that splices AGENTS.md after the
 *    claimed messages. Only this layer answers "what does the step's message
 *    list actually look like".
 *
 * Baseline this pins down. Measured on the deployed preset before the change
 * (session-f8d1d89c, turn 1 step 1):
 *
 *   user → runtime-context → codex-environment → codex-collab-mode
 *        → codex-permissions → skill-catalog
 *
 * The contract asserted below is the target — still to be confirmed by a real
 * session; this file only pins the composition the plugins produce:
 *
 *   codex-permissions → codex-collab-mode → codex-environment
 *     → user → runtime-context → AGENTS.md
 *
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { insertWorldState, WORLD_STATE_ORDER } from './presets/codex-coding-agent/world-state-order.mjs'

// The plugins import the host LLM package for its message factories. This repo
// has no node_modules (it ships as a bundle, not a library), so resolve that one
// bare specifier to an in-memory stub. Only the factories the plugins call are
// supplied; a plugin that starts using anything else fails loudly here.
const LLM_STUB = `
export function createUserMessage(input) {
  return { ...input, role: 'user', id: 'stub' }
}
export function createDeveloperMessage(input) {
  return { ...input, role: 'developer', id: 'stub' }
}
`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-llm') {
      return { url: 'data:text/javascript,' + encodeURIComponent(LLM_STUB), shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const permissions = await import('./presets/codex-coding-agent/codex-permissions.mjs')
const collab = await import('./presets/codex-coding-agent/codex-collab-mode.mjs')
const environment = await import('./presets/codex-coding-agent/codex-environment.mjs')

const text = value => [{ type: 'text', text: value }]
const message = (kind, value = kind) => ({ role: 'user', content: text(value), source: { kind } })
const kinds = messages => messages.map(entry => entry.source.kind)

// ---- layer 1: unit ------------------------------------------------------

assert.deepEqual([...WORLD_STATE_ORDER], ['codex-permissions', 'codex-collab-mode', 'codex-environment'])

// Every arrival order converges on the canonical order.
const permutations = [
  ['codex-permissions', 'codex-collab-mode', 'codex-environment'],
  ['codex-environment', 'codex-collab-mode', 'codex-permissions'],
  ['codex-collab-mode', 'codex-permissions', 'codex-environment'],
]
for (const arrival of permutations) {
  let list = []
  for (const kind of arrival) list = insertWorldState(list, message(kind))
  assert.deepEqual(kinds(list), [...WORLD_STATE_ORDER], `arrival ${arrival.join(' > ')}`)
}

// A run stays ahead of everything that is not a world-state block.
let ahead = [message('user', 'hello'), message('runtime-context')]
ahead = insertWorldState(ahead, message('codex-environment'))
ahead = insertWorldState(ahead, message('codex-permissions'))
assert.deepEqual(kinds(ahead), ['codex-permissions', 'codex-environment', 'user', 'runtime-context'])

// An empty list works, and a partial run stays ordered.
assert.deepEqual(kinds(insertWorldState([], message('codex-collab-mode'))), ['codex-collab-mode'])
let partial = [message('codex-permissions')]
partial = insertWorldState(partial, message('codex-collab-mode'))
assert.deepEqual(kinds(partial), ['codex-permissions', 'codex-collab-mode'])

// The helper refuses a message it does not own, instead of silently appending.
assert.throws(() => insertWorldState([], message('codex-unknown')), /not a Codex world-state block/)

// ---- layer 2: integration through waterfall semantics --------------------

/**
 * Compose `agent/pre-step` listeners the way cordis does: outermost first, each
 * receiving a `next` that invokes the next listener, and the built-in behaviour
 * last. The production loop's built-in appends the runtime-context snapshot
 * after the claimed messages (`packages/core/agent-loop/src/agent.ts:276-283`).
 */
function compose({ plugins, claimed, sessionId, runtimeContext, agentsInstructions }) {
  const builtin = () => Promise.resolve({
    kind: 'enter',
    messages: runtimeContext === undefined ? [...claimed] : [...claimed, runtimeContext],
  })
  const listeners = [
    ...agentsInstructions === undefined ? [] : [agentsInstructions],
    ...plugins.map(plugin => plugin.listener),
  ]
  const dispatch = index => async () => {
    const listener = listeners[index]
    if (listener === undefined) return builtin()
    const payload = {
      agent: { session: { id: sessionId, header: { cwd: '/tmp/check' } } },
      messages: claimed,
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }
    return listener(payload, dispatch(index + 1))
  }
  return dispatch(0)()
}

/**
 * Mount one plugin against a stub context and keep the `agent/pre-step` listener
 * it registers. The stub answers only what these three plugins read.
 */
function mount(plugin, listener) {
  const ctx = {
    on: (event, handler) => { if (event === 'agent/pre-step') listener(handler) },
    get: () => undefined,
    systemPrompt: { suppressRuntimeContext() {} },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    approval: { overrideOf: () => undefined, config: { policy: 'ask' } },
  }
  plugin.apply(ctx)
}

const registered = []
for (const plugin of [permissions, collab, environment]) {
  mount(plugin, handler => registered.push({ name: plugin.name, listener: handler }))
}
assert.deepEqual(registered.map(entry => entry.name), [...WORLD_STATE_ORDER],
  'a plugin name is the source.kind the helper ranks')

// `dsh-agent-instructions` inserts its context right after the claimed batch
// (`packages/context/agent-instructions/src/index.ts:355-358`).
const agentsInstructions = async ({ messages }, next) => {
  const decision = await next()
  const lastClaimed = decision.messages.findLastIndex(entry => messages.includes(entry))
  return {
    ...decision,
    messages: decision.messages.toSpliced(lastClaimed + 1, 0, message('agent-instructions', '<AGENTS.md>')),
  }
}

// First step: the blocks arrive in reverse and must come out in canonical order,
// ahead of the direct prompt.
//
// AGENTS.md lands before the runtime-context snapshot, not after it: the loop's
// built-in appends the snapshot AFTER the claimed batch, while
// `dsh-agent-instructions` is the outer listener and splices at
// `lastClaimedIndex + 1`, i.e. still inside the claimed batch's tail. That is
// derived from the composition below, not yet observed in a real session — the
// repository used for the baseline capture had no AGENTS.md.
const first = await compose({
  plugins: registered,
  claimed: [message('user', 'Run bash: echo hi')],
  sessionId: 'check-first',
  runtimeContext: message('runtime-context', 'Current runtime context.'),
  agentsInstructions,
})
assert.deepEqual(kinds(first.messages), [
  'codex-permissions',
  'codex-collab-mode',
  'codex-environment',
  'user',
  'agent-instructions',
  'runtime-context',
])

// Every block keeps its role, its source shape, and its body.
for (const entry of first.messages.slice(0, 3)) {
  assert.equal(entry.role, 'user')
  assert.equal(entry.source.form, 'snapshot')
  assert.equal(entry.source.sections.length, 1)
  assert.ok(entry.content[0].text.startsWith('<'))
}

// A later step with no fresh user input still gets all three blocks, in order,
// ahead of the runtime-context snapshot alone.
const continuation = await compose({
  plugins: registered,
  claimed: [],
  sessionId: 'check-continuation',
  runtimeContext: message('runtime-context', 'Current runtime context.'),
})
assert.deepEqual(kinds(continuation.messages), [...WORLD_STATE_ORDER, 'runtime-context'])

console.log('check-codex-world-state-order: ok')
