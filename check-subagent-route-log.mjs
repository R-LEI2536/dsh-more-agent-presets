/**
 * Runnable check for `presets/shared/subagent-route-log.mjs`.
 *
 *   node check-subagent-route-log.mjs
 *
 * The terminal used to say nothing about which model a delegated child ran on:
 * a child's route is either named by the delegation call (`provider`/`model`
 * from the Host's authorized list, the opt-in the coding presets carry) or
 * inherited from the parent session, and no other component reports it. The five
 * coding presets mount this row; `chat-subagent` does not, because its
 * `delegator` prints the same line while it masks the child.
 *
 * Not in `files`, so this check ships nowhere.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  apply,
  childRoute,
  depthOf,
} from './presets/shared/subagent-route-log.mjs'
import {
  childRoute as childRouteViaDelegator,
  depthOf as depthOfViaDelegator,
} from './presets/chat-subagent/delegator.mjs'

/** The presets that mount the row, and the module path the row must name. */
const MOUNTED_BY = [
  'qwencode-coding-agent',
  'iflow-coding-agent',
  'iflow-cre-agent',
  'pair-coding-agent',
  'codex-coding-agent',
]
const MODULE = 'dsh-more-agent-presets/presets/shared/subagent-route-log.mjs'

/** One context with the three things this module uses. */
function fakeCtx({ projection } = {}) {
  const infos = []
  const warnings = []
  const handlers = new Map()
  return {
    infos,
    warnings,
    ctx: {
      logger: { info: message => infos.push(message), warn: message => warnings.push(message) },
      on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]) },
      get(name) { return name === 'sessionProjections' ? projection : undefined },
    },
    fire: (event, payload) => (handlers.get(event) ?? []).map(handler => handler(payload)),
  }
}

/** One agent of a known depth, carrying what a route is read from. */
function fakeAgent({ id = 'child', depth = 1, provider, model } = {}) {
  return {
    id,
    options: {
      ...provider === undefined ? {} : { provider },
      ...model === undefined ? {} : { model },
      ...depth === 0 ? {} : { subagentDepth: depth },
    },
    session: { header: {} },
  }
}

// ── one implementation, shared with the delegator ────────────────────────────

assert.equal(childRouteViaDelegator, childRoute, 'the delegator re-exports this exact function')
assert.equal(depthOfViaDelegator, depthOf, 'the delegator re-exports this exact function')

// ── depth ────────────────────────────────────────────────────────────────────

assert.equal(depthOf(fakeAgent({ depth: 0 })), 0)
assert.equal(depthOf(fakeAgent({ depth: 1 })), 1)
assert.equal(depthOf(fakeAgent({ depth: 3 })), 3)
// The persisted header is the monotone floor, exactly as the harness reads it.
assert.equal(depthOf({ options: { subagentDepth: 0 }, session: { header: { delegationDepth: 2 } } }), 2)

// ── the route readers ────────────────────────────────────────────────────────

const plain = fakeCtx()
assert.equal(childRoute(plain.ctx, fakeAgent({ provider: 'opencode-chat', model: 'deepseek-v4.1-flash' })),
  'opencode-chat/deepseek-v4.1-flash')
// Whichever half the harness stated, and never an invented one.
assert.equal(childRoute(plain.ctx, fakeAgent({ model: 'deepseek-v4.1-flash' })), 'deepseek-v4.1-flash')
assert.equal(childRoute(plain.ctx, fakeAgent({ provider: 'opencode-chat' })), 'opencode-chat')
assert.equal(childRoute(plain.ctx, fakeAgent({})), 'unknown')
assert.equal(childRoute(plain.ctx, undefined), 'unknown')
// A Session-level selection outranks the options the child was created with,
// because that is the model its NEXT request will actually use.
const projected = fakeCtx({ projection: { stateOf: () => ({ lastUsed: { provider: 'p', model: 'chosen-by-session' } }) } })
assert.equal(childRoute(projected.ctx, fakeAgent({ provider: 'p', model: 'created-with' })), 'p/chosen-by-session')

// ── one line per delegated child ─────────────────────────────────────────────

{
  const host = fakeCtx()
  apply(host.ctx, { presetId: 'pair-coding-agent' })
  host.fire('agent/created', { agent: fakeAgent({ id: 'top', depth: 0 }) })
  // A top-level session is not a delegation: no line.
  assert.deepEqual(host.infos, [])

  host.fire('agent/created', { agent: fakeAgent({ id: 'child-1', provider: 'opencode-chat', model: 'deepseek-v4.1-flash' }) })
  host.fire('agent/created', { agent: fakeAgent({ id: 'grandchild', depth: 2, provider: 'daseinai', model: 'gpt-5.6-luna' }) })
  assert.deepEqual(host.infos, [
    'pair-coding-agent/subagent-route-log: subagent child-1 route opencode-chat/deepseek-v4.1-flash',
    'pair-coding-agent/subagent-route-log: subagent grandchild route daseinai/gpt-5.6-luna',
  ])
  assert.deepEqual(host.warnings, [])
}

// A row without `presetId` still logs, and says so once rather than silently.
{
  const host = fakeCtx()
  apply(host.ctx, {})
  host.fire('agent/created', { agent: fakeAgent({ id: 'child-2', model: 'm' }) })
  assert.deepEqual(host.infos, ['subagent-route-log: subagent child-2 route m'])
  assert.deepEqual(host.warnings, [
    'subagent-route-log: no `presetId` configured; the route lines carry no preset name',
  ])
}

// ── the five presets mount the row, and name themselves in it ────────────────

const row = id => new RegExp(
  `- id: subagent-route-log\\n\\s+name: '${MODULE.replaceAll('/', '\\/')}'\\n\\s+config:\\n\\s+presetId: ${id}\\n`,
)
assert.ok(existsSync(new URL(`./${MODULE.replace('dsh-more-agent-presets/', '')}`, import.meta.url)))

for (const id of MOUNTED_BY) {
  const patch = readFileSync(new URL(`./presets/${id}.patch.yml`, import.meta.url), 'utf8')
  const declared = /^\s{8}id: (\S+)$/m.exec(patch)?.[1]
  assert.equal(declared, id)
  assert.match(patch, row(id), `${id}: the row must name this preset, or the line cannot be traced to it`)
  assert.equal([...patch.matchAll(/- id: subagent-route-log\n/g)].length, 1, `${id}: exactly one row`)
}

// `chat-subagent` logs the same line from its delegator, so a second row would
// duplicate every child; `chat-agent` has no delegation at all.
assert.doesNotMatch(readFileSync(new URL('./presets/chat-subagent.patch.yml', import.meta.url), 'utf8'),
  /subagent-route-log/, 'chat-subagent logs from its delegator instead')
assert.doesNotMatch(readFileSync(new URL('./presets/chat-agent.patch.yml', import.meta.url), 'utf8'),
  /^\s+- id: subagent-route-log$/m, 'chat-agent delegates nothing')

console.log('check-subagent-route-log: ok')
