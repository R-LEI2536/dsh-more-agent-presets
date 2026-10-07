/**
 * Runnable check for `presets/chat-agent/no-tools.mjs`.
 *
 *   node check-no-tools.mjs
 *
 * Both planes must be masked: the inherited surface by a restriction, and the
 * agent's OWN registrations (the Team tools — see the module header) by a guard
 * that refuses execution. Losing either one silently restores the 1.6.1 leak.
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { apply } from './presets/chat-agent/no-tools.mjs'

/** A context whose tools service records what the plugin registers. */
function fakeCtx({ withGuard = true } = {}) {
  const seen = { restrictions: [], guards: [], warnings: [] }
  const tools = { restrict: filter => { seen.restrictions.push(filter) } }
  if (withGuard) tools.guard = fn => { seen.guards.push(fn) }
  return {
    seen,
    ctx: {
      tools,
      get: name => name === 'logger' ? { warn: message => { seen.warnings.push(message) } } : undefined,
    },
  }
}

const current = fakeCtx()
apply(current.ctx)
// Plane 1: an empty allow-list, so later-registered inherited tools are excluded too.
assert.deepEqual(current.seen.restrictions, [{ allow: [] }])
// Plane 2: exactly one guard, and its string return denies any execution.
assert.equal(current.seen.guards.length, 1)
const reason = current.seen.guards[0]({ agent: {} })
assert.equal(typeof reason, 'string')
assert.ok(reason.length > 0)
assert.deepEqual(current.seen.warnings, [])

// A build without `tools.guard()` (declared floor is `^0.2.0-rc.1`) must warn,
// not throw, and must still mask the inherited plane.
const legacy = fakeCtx({ withGuard: false })
apply(legacy.ctx)
assert.deepEqual(legacy.seen.restrictions, [{ allow: [] }])
assert.equal(legacy.seen.warnings.length, 1)

console.log('check-no-tools: ok')
