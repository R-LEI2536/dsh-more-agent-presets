/**
 * Runnable check for `presets/chat-subagent/delegator.mjs`.
 *
 *   node check-delegator.mjs
 *
 * Both masks must land on the AGENT's own scope, not the preset's standing one:
 * the standing scope is shared with every delegated child (which joins its
 * parent's preset), so a mask registered there would leave the child with one
 * tool too. The top-level mask must also be installed from `tools/change`
 * reconciliation, because switching a blank session's preset in the UI emits
 * no `agent/created`. Losing either half restores the leak this preset exists
 * to avoid: a session that can only delegate, or a worker that can write.
 *
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pickPersona, personaTable } from './presets/shared/model-persona.mjs'
import {
  apply,
  childRoute,
  DELEGATION_NOTE,
  DELEGATOR_TOOLS,
  depthOf,
  installGuard,
  installRestriction,
  normalizeConfig,
  personaText,
  RUN_CODE,
} from './presets/chat-subagent/delegator.mjs'

/** The seven names the declaration ships as the subagent's default. */
const SUBAGENT_TOOLS = ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'job_list']

/** Names a deployment with every row mounted exposes to an agent of this preset. */
const MOUNTED = ['subagent', 'read', 'write', 'edit', 'read_image', 'glob', 'grep', 'todo_write', 'job_output', 'job_list', 'job_kill', 'list_directory']

const ORDERS = { DEPLOYMENT_PERSONA_PREFIX: 100 }

/**
 * A tools service that mirrors the registry's one relevant behaviour:
 * `restrict()` refuses a name the viewing scope cannot inherit, and its
 * disposer removes exactly the restriction it installed.
 */
function fakeTools({ known = MOUNTED, noGuard = false } = {}) {
  const seen = { restrictions: [], guards: [], calls: 0 }
  const tools = {
    restrict(filter) {
      seen.calls++
      const names = [...(filter.allow ?? []), ...(filter.deny ?? [])]
      const unknown = names.filter(name => !known.includes(name))
      if (unknown.length > 0) {
        throw new Error(`tools.restrict() names unknown global tool "${unknown.join('", "')}"`)
      }
      seen.restrictions.push(filter)
      return () => {
        const index = seen.restrictions.indexOf(filter)
        if (index >= 0) seen.restrictions.splice(index, 1)
      }
    },
  }
  if (!noGuard) tools.guard = guard => { seen.guards.push(guard) }
  return { tools, seen }
}

/** One fake agent scope: its own tools + systemPrompt, exactly like `agent.ctx`. */
function fakeScope({ known = MOUNTED, noGuard = false } = {}) {
  const { tools, seen } = fakeTools({ known, noGuard })
  const systemPrompt = {
    suppressed: false,
    sections: [],
    suppressRuntimeContext() { this.suppressed = true },
    section(section) { this.sections.push(section) },
    getSectionOrder(name) { return ORDERS[name] ?? 0 },
  }
  return { tools, systemPrompt, seen }
}

/**
 * A preset-scoped context whose services are reachable through `get()`.
 *
 * The logger is a PROPERTY here, matching cordis: `ctx.logger` is assigned in
 * the Context constructor and is not a provided service, so `get('logger')`
 * returns undefined. A fake that answered `get('logger')` made a plugin logging
 * through it pass this check while printing nothing in a real session.
 */
function fakeHost({ liveAgents = [], presetOf = () => undefined } = {}) {
  const handlers = new Map()
  const warnings = []
  const infos = []
  const ctx = {
    logger: { warn: message => warnings.push(message), info: message => infos.push(message) },
    on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]) },
    get(name) {
      if (name === 'agents') return { list: () => liveAgents }
      if (name === 'agentPresets') return { composedPreset: agentCtx => presetOf(agentCtx) }
      return undefined
    },
  }
  return { ctx, warnings, infos, fire: (event, payload) => (handlers.get(event) ?? []).map(handler => handler(payload)) }
}

/** One agent of a known depth, carrying the scope its mask must land on. */
function fakeAgent({ id = 'agent', runtimeDepth, headerDepth, model = 'gpt-6-luna', provider, scope = fakeScope() } = {}) {
  return {
    id,
    scope,
    options: { model, ...provider === undefined ? {} : { provider }, ...runtimeDepth === undefined ? {} : { subagentDepth: runtimeDepth } },
    session: { header: headerDepth === undefined ? {} : { delegationDepth: headerDepth } },
    ctx: { tools: scope.tools, systemPrompt: scope.systemPrompt },
  }
}

const CONFIG = { presetId: 'chat-subagent', subagentTools: SUBAGENT_TOOLS }

// ── depth ────────────────────────────────────────────────────────────────────

assert.equal(depthOf(fakeAgent({})), 0)
assert.equal(depthOf(fakeAgent({ runtimeDepth: 1 })), 1)
assert.equal(depthOf(fakeAgent({ headerDepth: 1 })), 1)
// The header is the monotone floor: a resumed child arrives with fresh options.
assert.equal(depthOf(fakeAgent({ headerDepth: 2, runtimeDepth: 0 })), 2)
assert.equal(depthOf(fakeAgent({ headerDepth: 0, runtimeDepth: 3 })), 3)

// ── config + persona text ────────────────────────────────────────────────────

const configWarnings = []
assert.deepEqual(normalizeConfig(CONFIG, m => configWarnings.push(m)), CONFIG)
assert.deepEqual(configWarnings, [])
assert.deepEqual(normalizeConfig({ presetId: ' x ', subagentTools: [' read ', 'read', 7, ''] }, m => configWarnings.push(m)),
  { presetId: 'x', subagentTools: ['read'] })
assert.deepEqual(configWarnings, [])
normalizeConfig(undefined, m => configWarnings.push(m))
assert.deepEqual(configWarnings, [
  'no `presetId` configured: a blank session switched to this preset in the UI cannot be masked',
  'no `subagentTools` configured: delegated subagents will get no tool of their own',
])

const table = { default: 'D', personas: [{ model: ['m'], text: 'M' }] }
assert.equal(personaText('m', table), `M\n\n${DELEGATION_NOTE}`)
// An empty table row falls back to the note alone rather than an empty prompt.
assert.equal(personaText('m', { default: '', personas: [] }), DELEGATION_NOTE)
// The table is shared with chat-agent, not copied: a model selected there selects here.
const codex = pickPersona('gpt-6-luna', personaTable())
assert.ok(codex.startsWith('You are Codex'))
assert.ok(personaText('gpt-6-luna', personaTable()).startsWith(codex))

// The delegation half is a FILE, and that file is the source of truth: the
// constant is only its trimmed content, so prompt text stays a document a human
// reviews instead of a string array inside the plugin.
assert.equal(
  DELEGATION_NOTE,
  readFileSync(new URL('./presets/chat-subagent/delegation-note.md', import.meta.url), 'utf8').trim(),
)
// A row may override it, and the override REPLACES the file rather than joining
// it. A blank one must not silently drop the delegation half.
assert.deepEqual(
  normalizeConfig({ ...CONFIG, delegationNote: 'N' }, message => configWarnings.push(message)),
  { ...CONFIG, delegationNote: 'N' },
)
assert.equal(personaText('m', table, 'N'), 'M\n\nN')
assert.deepEqual(
  normalizeConfig({ ...CONFIG, delegationNote: '  ' }, message => configWarnings.push(message)),
  CONFIG,
)
assert.deepEqual(configWarnings.slice(-1), ['`delegationNote` is blank: the shipped delegation-note.md is used instead'])

// ── the top-level mask ───────────────────────────────────────────────────────

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)
  const agent = fakeAgent({ id: 'top' })
  host.fire('agent/created', { agent })

  // The probes were disposed; what remains is the single allow-list.
  assert.deepEqual(agent.scope.seen.restrictions, [{ allow: [...DELEGATOR_TOOLS] }])
  // One probe plus the installed restriction: the mask asked the registry first.
  assert.equal(agent.scope.seen.calls, 2)

  assert.equal(agent.scope.seen.guards.length, 1)
  const guard = agent.scope.seen.guards[0]
  assert.equal(guard({ name: 'subagent' }), undefined)
  // PTC mode's model-direct transport must stay callable; the restriction still
  // bounds what the nested dispatch can bind.
  assert.equal(guard({ name: RUN_CODE }), undefined)
  for (const name of ['read', 'write', 'bash', 'spawn_teammate', 'send_message']) {
    assert.equal(typeof guard({ name }), 'string')
  }
  assert.equal(guard({}), undefined)

  assert.equal(agent.scope.systemPrompt.suppressed, true)
  assert.equal(agent.scope.systemPrompt.sections.length, 1)
  const section = agent.scope.systemPrompt.sections[0]
  assert.equal(section.name, 'deployment:persona-prefix')
  assert.equal(section.complete, true)
  assert.equal(section.order, ORDERS.DEPLOYMENT_PERSONA_PREFIX)
  const text = section.text({ agent })
  assert.ok(text.startsWith(codex))
  assert.ok(text.endsWith(DELEGATION_NOTE))
  assert.deepEqual(host.warnings, [])
  // The route line is about the CHILD; a top-level session adds no log noise.
  assert.deepEqual(host.infos, [])
}

// ── the row's note override ──────────────────────────────────────────────────

{
  const host = fakeHost()
  apply(host.ctx, { ...CONFIG, delegationNote: 'OVERRIDE' })
  const agent = fakeAgent({ id: 'top' })
  host.fire('agent/created', { agent })
  // The override must reach the REGISTERED section, not just `personaText()`.
  const text = agent.scope.systemPrompt.sections[0].text({ agent })
  assert.ok(text.startsWith(codex))
  assert.ok(text.endsWith('OVERRIDE'))
  assert.ok(!text.includes(DELEGATION_NOTE))
  assert.deepEqual(host.warnings, [])
}

// ── the subagent mask ────────────────────────────────────────────────────────

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)
  const worker = fakeAgent({ id: 'worker', runtimeDepth: 1 })
  host.fire('agent/created', { agent: worker })

  assert.deepEqual(worker.scope.seen.restrictions, [{ allow: [...SUBAGENT_TOOLS] }])
  // Seven probes plus the installed restriction.
  assert.equal(worker.scope.seen.calls, SUBAGENT_TOOLS.length + 1)
  const guard = worker.scope.seen.guards[0]
  assert.equal(guard({ name: 'read' }), undefined)
  assert.equal(guard({ name: RUN_CODE }), undefined)
  for (const name of ['write', 'edit', 'bash', 'subagent', 'spawn_teammate']) {
    assert.equal(typeof guard({ name }), 'string')
  }
  // The child must NOT get chat-agent's complete persona or its suppression:
  // it needs its own tool guidance and the delegation-scope context.
  assert.equal(worker.scope.systemPrompt.suppressed, false)
  assert.deepEqual(worker.scope.systemPrompt.sections, [])
  // The debug line: one child, one route, read from the options it was created
  // with. This child states no provider, so the line is the model alone.
  assert.deepEqual(host.infos, ['chat-subagent/delegator: subagent worker route gpt-6-luna'])
}

// ── the child's route line ───────────────────────────────────────────────────

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)
  const worker = fakeAgent({ id: 'worker-routed', headerDepth: 1, provider: 'opencode-chat', model: 'deepseek-v4.1-flash' })
  host.fire('agent/created', { agent: worker })
  assert.deepEqual(host.infos, [
    'chat-subagent/delegator: subagent worker-routed route opencode-chat/deepseek-v4.1-flash',
  ])

  // Half a route is worth printing, and the line must not invent the other half.
  assert.equal(childRoute(host.ctx, fakeAgent({ model: 'gpt-6-luna' })), 'gpt-6-luna')
  assert.equal(childRoute(host.ctx, fakeAgent({ provider: 'alpha', model: '' })), 'alpha')
  assert.equal(childRoute(host.ctx, fakeAgent({ model: '', provider: '  ' })), 'unknown')
  // An absent agent is a diagnostic call, not a crash.
  assert.equal(childRoute(host.ctx, undefined), 'unknown')
}

// ── a deployment that lacks the two profile-dependent names ──────────────────

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)
  const known = MOUNTED.filter(name => name !== 'read_image' && name !== 'list_directory')
  const worker = fakeAgent({ id: 'worker-lite', headerDepth: 1, scope: fakeScope({ known }) })
  host.fire('agent/created', { agent: worker })

  assert.deepEqual(worker.scope.seen.restrictions, [{ allow: SUBAGENT_TOOLS.filter(name => known.includes(name)) }])
  assert.equal(host.warnings.filter(m => m.includes('not registered')).length, 2)
  assert.ok(host.warnings.some(m => m.includes('"read_image"')))
  assert.ok(host.warnings.some(m => m.includes('"list_directory"')))
  // A warning is emitted once per name, however many agents arrive.
  host.fire('agent/created', { agent: fakeAgent({ id: 'worker-lite-2', headerDepth: 1, scope: fakeScope({ known }) }) })
  assert.equal(host.warnings.filter(m => m.includes('not registered')).length, 2)
}

// ── every name missing, and a build without tools.guard() ────────────────────

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)
  const worker = fakeAgent({ id: 'worker-none', headerDepth: 1, scope: fakeScope({ known: [] }) })
  host.fire('agent/created', { agent: worker })
  // No restriction at all: the guard is the only bound left. It judges by the
  // DECLARED list, so a name that is missing here reads as allowed and then
  // fails to resolve, while a name outside the list is refused outright.
  assert.deepEqual(worker.scope.seen.restrictions, [])
  assert.equal(worker.scope.seen.guards[0]({ name: 'read' }), undefined)
  assert.equal(typeof worker.scope.seen.guards[0]({ name: 'write' }), 'string')
}

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)
  const agent = fakeAgent({ id: 'top-no-guard', scope: fakeScope({ noGuard: true }) })
  host.fire('agent/created', { agent })
  assert.deepEqual(agent.scope.seen.restrictions, [{ allow: [...DELEGATOR_TOOLS] }])
  assert.ok(host.warnings.some(m => m.includes('no tools.guard()')))
}

// ── reconciliation covers the blank-session preset switch ────────────────────

{
  const ours = fakeAgent({ id: 'ours' })
  const foreign = fakeAgent({ id: 'foreign' })
  const live = []
  let bound = false
  const host = fakeHost({
    liveAgents: live,
    // `composedPreset()` answers with the standing preset each agent joined;
    // `ours` joins this one only after the switch this block simulates.
    presetOf: agentCtx => agentCtx === ours.ctx && bound ? 'chat-subagent' : 'standard',
  })
  apply(host.ctx, CONFIG)
  // Nothing live yet: neither agent has been announced to the plugin.
  assert.deepEqual(ours.scope.seen.restrictions, [])

  live.push(ours, foreign)
  bound = true
  host.fire('tools/change', {})

  assert.deepEqual(ours.scope.seen.restrictions, [{ allow: [...DELEGATOR_TOOLS] }])
  assert.equal(ours.scope.seen.guards.length, 1)
  assert.equal(ours.scope.systemPrompt.sections.length, 1)
  // Another preset's agent is untouched.
  assert.deepEqual(foreign.scope.seen.restrictions, [])
  assert.deepEqual(foreign.scope.seen.guards, [])
  assert.deepEqual(foreign.scope.systemPrompt.sections, [])
  // Idempotent: a later change must not stack a second mask.
  host.fire('tools/change', {})
  assert.deepEqual(ours.scope.seen.restrictions, [{ allow: [...DELEGATOR_TOOLS] }])
  assert.equal(ours.scope.seen.guards.length, 1)
  assert.equal(ours.scope.systemPrompt.sections.length, 1)
  // Recomposed twice, the route line did not fire: `ours` is a top-level
  // session, and a second pass over a child logs nothing again either.
  assert.deepEqual(host.infos, [])
}

// ── the helpers stay honest when called directly ─────────────────────────────

{
  const scope = fakeScope({ known: ['read', 'write'] })
  const warnings = []
  assert.deepEqual(installRestriction(scope.tools, ['read', 'gone', 'write'], m => warnings.push(m)), ['read', 'write'])
  assert.deepEqual(scope.seen.restrictions, [{ allow: ['read', 'write'] }])
  assert.equal(warnings.length, 1)
  installGuard(scope.tools, new Set(['read']), 'no', m => warnings.push(m))
  assert.equal(scope.seen.guards[0]({ name: 'write' }), 'no')
  assert.equal(scope.seen.guards[0]({ name: 'read' }), undefined)
}

// ── the declaration is the single source of the list ─────────────────────────

const patch = readFileSync(new URL('./presets/chat-subagent.patch.yml', import.meta.url), 'utf8')
const declaredId = /^\s{8}id: (\S+)$/m.exec(patch)?.[1]
const configuredId = /^\s+presetId: (\S+)$/m.exec(patch)?.[1]
// `presetId` is what tells the plugin which live agents are its own during
// reconciliation; a mismatch silently disables that path, so it is pinned here.
assert.equal(declaredId, 'chat-subagent')
assert.equal(configuredId, declaredId)
const toolsBlock = /^\s+subagentTools:\n((?:\s+- \S+\n)+)/m.exec(patch)?.[1] ?? ''
assert.deepEqual([...toolsBlock.matchAll(/^\s+- (\S+)$/gm)].map(match => match[1]), SUBAGENT_TOOLS)
assert.ok(patch.includes('provider: spawn'))
assert.ok(patch.includes('enableRunInBackground: false'))
assert.ok(patch.includes('maxDepth: 1'))
// A row that omits a `.required()` Config key fails to mount, and ONE failed row
// marks the whole preset broken — observed live as
// `tool-todo (@deepseek-ai/dsh-tool-todo): invalid config: $.allowParallelInProgress
// missing required value`. `@deepseek-ai/dsh-tool-todo` has exactly one such key.
assert.match(
  patch,
  /- id: tool-todo\n(?:\s*#.*\n)*\s+name: '@deepseek-ai\/dsh-tool-todo'\n(?:\s*#.*\n)*\s+config:\n\s+allowParallelInProgress: (?:true|false)\n/,
)

console.log('check-delegator: ok')
