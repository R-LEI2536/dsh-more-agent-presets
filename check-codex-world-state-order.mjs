/**
 * Runnable check for the Codex world-state block order.
 *
 *   node check-codex-world-state-order.mjs
 *
 * WHAT THIS FILE PROVES (and what it does not):
 *
 * 1. Unit — `orderPrePromptRun()` / `insertWorldState()` put the preset's three
 *    world-state blocks and the loop's runtime-context placeholder in Codex
 *    order no matter what order they arrive in, without moving or dropping any
 *    message they do not own.
 * 2. Integration — the three REAL plugins composed through cordis waterfall
 *    semantics (outermost listener first, each appending AFTER `await next()`),
 *    surrounded by STUBS for the packages that own the neighbouring messages:
 *    the loop built-in, `dsh-agent-instructions`, `dsh-tool-skill` and
 *    `dsh-time-context`. Those stubs model each package's append shape as read
 *    in source; they are not the packages themselves.
 *
 * NOT covered here: the real packages' own skip conditions, request admission
 * (the loop re-appends the freshly rendered runtime-context snapshot at this
 * position — `packages/core/agent-loop/src/agent.ts:425-440`, review only), and
 * a live deployment's session log. The session-log baseline of the pre-change
 * order is the user-provided trajectory capture; this file does not re-derive
 * it.
 *
 * Baseline this pins down. Measured on the deployed preset before the change
 * (session-f8d1d89c, turn 1 step 1):
 *
 *   user → runtime-context → codex-environment → codex-collab-mode
 *        → codex-permissions → skill-catalog
 *
 * Target, confirmed against upstream Codex (e6de6a2), turn 1: world state is
 * recorded BEFORE the prompt (`codex-rs/core/src/session/turn.rs:302` vs
 * `:388`). Its `<environment_context>` is a user-role fragment and carries the
 * working directory (`codex-rs/core/src/context/world_state/environment.rs:210`),
 * and AGENTS.md is user-role too, merged before it
 * (`.../agents_md.rs:40-42`, `.../context_manager/updates.rs:21-49`). DSH renders
 * the cwd through the required `Current runtime context` snapshot instead, so
 * that snapshot joins the same run:
 *
 *   codex-permissions → codex-collab-mode → codex-environment
 *     → runtime-context → user
 *
 * This mirrors Codex's TURN-START recording point only. Codex records a
 * mid-step world-state diff AFTER the pending input (`turn.rs:487` then `:555`);
 * the preset always places its run before the claimed messages.
 *
 * AGENTS.md (`dsh-agent-instructions`) currently lands after the claimed batch,
 * i.e. after the prompt; Codex puts it before the prompt. Whether listener
 * ordering could hoist it is NOT verified, so this file does not assert it is
 * immovable. The skill catalog has its own digest/resend semantics, and roles
 * differ (DSH user-role blocks vs Codex developer-role permissions/collaboration
 * mode). Withdrawal (A→B→A leaving stale fragments) is pinned as today's
 * behaviour only; implementing a `replace` is a separate decision.
 *
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import {
  insertWorldState, orderPrePromptRun, WORLD_STATE_ORDER,
} from './presets/codex-coding-agent/world-state-order.mjs'

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

// The run stays ahead of the required runtime-context placeholder, which stays
// ahead of the claimed user input.
let ahead = [message('user', 'hello'), message('runtime-context')]
ahead = insertWorldState(ahead, message('codex-environment'))
ahead = insertWorldState(ahead, message('codex-permissions'))
assert.deepEqual(kinds(ahead), [
  'codex-permissions', 'codex-environment', 'runtime-context', 'user',
])

// The no-injection path (world state unchanged) still normalizes the order.
assert.deepEqual(
  kinds(orderPrePromptRun([message('user', 'hello'), message('runtime-context')])),
  ['runtime-context', 'user'],
)
assert.deepEqual(
  kinds(orderPrePromptRun([
    message('codex-environment'), message('runtime-context'),
    message('codex-permissions'), message('user', 'hello'),
  ])),
  ['codex-permissions', 'codex-environment', 'runtime-context', 'user'],
)

// Messages the helper does not own (AGENTS.md, skill catalog, time context) are
// never moved relative to each other, and the placeholder keeps its identity so
// admission can substitute the fresh snapshot in place.
const foreign = [
  message('agent-instructions', '<AGENTS.md>'),
  message('skill-catalog', '<system-reminder>'),
  message('time-context', '<current_time>'),
]
const runtimeContext = message('runtime-context', 'Current runtime context.')
const mixed = orderPrePromptRun([message('user', 'hello'), ...foreign, runtimeContext])
assert.deepEqual(kinds(mixed), [
  'runtime-context', 'user', ...foreign.map(entry => entry.source.kind),
])
assert.equal(mixed[0], runtimeContext, 'the placeholder object is preserved')

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
 * last. The production loop's built-in appends the runtime-context placeholder
 * after the claimed messages (`packages/core/agent-loop/src/agent.ts:274-283`).
 */
function compose({ plugins, claimed, sessionId, runtimeContext, outer = [] }) {
  const builtin = () => Promise.resolve({
    kind: 'enter',
    messages: runtimeContext === undefined ? [...claimed] : [...claimed, runtimeContext],
  })
  const listeners = [...outer, ...plugins.map(plugin => plugin.listener)]
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
    sandboxPolicy: { resolve: () => ({ mode: sandboxMode }) },
    approval: { overrideOf: () => undefined, config: { policy: 'ask' } },
  }
  plugin.apply(ctx)
}

// The stub sandbox mode is mutable so layer 3 can walk A→B→A.
let sandboxMode = 'workspace-write'

const registered = []
for (const plugin of [permissions, collab, environment]) {
  mount(plugin, handler => registered.push({ name: plugin.name, listener: handler }))
}
assert.deepEqual(registered.map(entry => entry.name), [...WORLD_STATE_ORDER],
  'a plugin name is the source.kind the helper ranks')

// Outer packages, modelled by their append shape only (register order, skip
// conditions and bodies are the packages' own business):
// - `dsh-agent-instructions` splices AGENTS.md right after the claimed batch
//   (`packages/context/agent-instructions/src/index.ts:355-358`).
const agentInstructions = async ({ messages }, next) => {
  const decision = await next()
  const lastClaimed = decision.messages.findLastIndex(entry => messages.includes(entry))
  return {
    ...decision,
    messages: decision.messages.toSpliced(lastClaimed + 1, 0, message('agent-instructions', '<AGENTS.md>')),
  }
}
// - `dsh-tool-skill` appends the initial catalog after every downstream listener
//   (`packages/skill/tool-skill/src/index.ts:215-252`).
const skillCatalog = async (_payload, next) => {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  return { ...decision, messages: [...decision.messages, message('skill-catalog', '<system-reminder>')] }
}
// - `dsh-time-context` is a PREPENDED listener (global, so outermost) that
//   appends its snapshot last (`packages/context/time-context/src/index.ts:185-224`).
const timeContext = async (_payload, next) => {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  return { ...decision, messages: [...decision.messages, message('time-context', '<current_time>')] }
}

// First step: the blocks arrive in reverse and must come out in canonical order,
// the runtime-context placeholder next, then the direct prompt. The outer
// messages keep their own positions after the prompt — the preset neither moves
// nor drops them.
const runtimeContextMessage = message('runtime-context', 'Current runtime context.')
const first = await compose({
  plugins: registered,
  claimed: [message('user', 'Run bash: echo hi')],
  sessionId: 'check-first',
  runtimeContext: runtimeContextMessage,
  outer: [timeContext, skillCatalog, agentInstructions],
})
assert.deepEqual(kinds(first.messages), [
  'codex-permissions',
  'codex-collab-mode',
  'codex-environment',
  'runtime-context',
  'user',
  'agent-instructions',
  'skill-catalog',
  'time-context',
])
assert.equal(first.messages[3], runtimeContextMessage,
  'the placeholder is the loop-owned message, untouched by the plugins')
for (const kind of new Set(kinds(first.messages))) {
  assert.equal(kinds(first.messages).filter(entry => entry === kind).length, 1, `${kind} appears once`)
}

// Every block keeps its role, its source shape, and its body.
for (const entry of first.messages.slice(0, 3)) {
  assert.equal(entry.role, 'user')
  assert.equal(entry.source.form, 'snapshot')
  assert.equal(entry.source.sections.length, 1)
  assert.ok(entry.content[0].text.startsWith('<'))
}

// A later step with no fresh user input still gets all three blocks, in order,
// ahead of the runtime-context snapshot alone. The outer packages can skip their
// own append on such steps, so they are not composed here.
const continuation = await compose({
  plugins: registered,
  claimed: [],
  sessionId: 'check-continuation',
  runtimeContext: message('runtime-context', 'Current runtime context.'),
})
assert.deepEqual(kinds(continuation.messages), [...WORLD_STATE_ORDER, 'runtime-context'])

// A later turn whose world state did not change injects no block (the
// per-session hash short-circuits), but the ordering still has to keep the
// runtime-context placeholder ahead of the prompt.
const steady = await compose({
  plugins: registered,
  claimed: [message('user', 'second prompt')],
  sessionId: 'check-first',
  runtimeContext: message('runtime-context', 'Current runtime context.'),
})
assert.deepEqual(kinds(steady.messages), ['runtime-context', 'user'])

// ---- layer 3: pinned today's behaviour, not a promise --------------------
//
// World-state withdrawal. The per-session hash short-circuit re-sends a changed
// block and never retracts the old one: on A→B→A the step lists show the block
// three times, and every copy stays in history, so the model keeps seeing the
// stale fragments between changes. Implementing a `replace` (surface replacement
// of the previous block) is a SEPARATE decision with its own risk assessment;
// this block only pins today's append-only behaviour so a future change is a
// deliberate test change.
const withdrawalSessionId = 'check-withdrawal'
sandboxMode = 'workspace-write'
const stateA = await compose({
  plugins: registered,
  claimed: [message('user', 'A')],
  sessionId: withdrawalSessionId,
  runtimeContext: message('runtime-context', 'Current runtime context.'),
})
sandboxMode = 'read-only'
const stateB = await compose({
  plugins: registered,
  claimed: [message('user', 'B')],
  sessionId: withdrawalSessionId,
  runtimeContext: message('runtime-context', 'Current runtime context.'),
})
sandboxMode = 'workspace-write'
const stateA2 = await compose({
  plugins: registered,
  claimed: [message('user', 'A again')],
  sessionId: withdrawalSessionId,
  runtimeContext: message('runtime-context', 'Current runtime context.'),
})
sandboxMode = 'workspace-write'
assert.deepEqual(kinds(stateA.messages), [
  'codex-permissions', 'codex-collab-mode', 'codex-environment', 'runtime-context', 'user',
])
// Only the changed block re-sends; the unchanged ones stay out.
assert.deepEqual(kinds(stateB.messages), ['codex-permissions', 'runtime-context', 'user'])
assert.deepEqual(kinds(stateA2.messages), ['codex-permissions', 'runtime-context', 'user'])
assert.equal(
  stateA2.messages[0].content[0].text.includes('Read only'), false,
  'the re-sent A block carries A again, not B: nothing is replaced or corrected',
)

console.log('check-codex-world-state-order: ok')
