/**
 * Runnable check for `presets/chat-subagent/delegator.mjs`.
 *
 *   node check-delegator.mjs
 *
 * Enforcement is ONE guard on the preset's STANDING scope. The catalog is
 * narrowed by ONE per-agent `restrict({ allow: [] })` on a depth-0 agent's own
 * scope; both halves are load-bearing:
 *
 * - A restriction must be per AGENT, never preset-plane: a standing one is on a
 *   delegated child's chain too (a child joins its parent's preset), so it would
 *   strip the rows the child works through. This file therefore refuses to serve
 *   `restrict()` on the standing scope: that regression fails here, not live.
 * - A restriction on the ROOT agent's own scope is off the child's chain and
 *   filters only what that scope INHERITS, so the own-layer `subagent` and
 *   `list_subagent_models` stay visible.
 * - `restrict()` notifies `tools/change` where `tools.guard()` does not — which
 *   is how 1.7.3 ended with two installs into one agent scope, a duplicate
 *   `list_subagent_models`, and a session that had no delegation tool at all.
 *   The mask is therefore installed one macrotask after the dispatch, which every
 *   mask test below pins with `await tick()`.
 * - A guard is read from the CALLING agent's chain, so the standing install
 *   covers the root session and every child, and the delegation depth decides
 *   which names pass. That branch is what keeps the child read-only.
 *
 * The persona is also per agent: the root session gets this preset's whole
 * prompt, a child only gets its route logged. Persona and mask must both be
 * lifted when an agent stops composing this preset (an agent-scope registration
 * outlives the composition that asked for it), and the guard must NOT be — it
 * belongs to the standing scope and goes away with the composition.
 *
 * A child's OWN persona is not this plugin's: DSH 0.2.1 rejects a `persona` on
 * the delegation row, so `presets/chat-subagent.patch.yml` carries it as a
 * preset-plane `@deepseek-ai/dsh-persona` row, which reaches the child because
 * the child composes this preset. The declaration is pinned at the end of this
 * file.
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
  DELEGATOR_TOOL,
  DELEGATOR_TOOLS,
  depthOf,
  installGuard,
  normalizeConfig,
  personaText,
  ROUTE_LIST_TOOL,
  ROUTE_POLICY_KEY,
  RUN_CODE,
} from './presets/chat-subagent/delegator.mjs'

/** The seven names the declaration ships as the subagent's default. */
const SUBAGENT_TOOLS = ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'job_list']

const ORDERS = { DEPLOYMENT_PERSONA_PREFIX: 100 }

/**
 * The STANDING tools service. A guard is a callable the registry keeps until its
 * disposer runs; a restriction is never installed here — a preset-plane mask
 * would reach every delegated child of the preset and strip its working rows.
 * @param options - the disposers the owning context collects, and a build flag.
 * @returns the service and what it recorded.
 */
function fakeTools({ effects, noGuard = false } = {}) {
  const seen = { guards: [], restrictCalls: 0 }
  const tools = {
    restrict() {
      seen.restrictCalls++
      throw new Error('the delegator must not restrict the standing scope: that mask would strip every child')
    },
  }
  if (!noGuard) {
    tools.guard = (handler) => {
      seen.guards.push(handler)
      const dispose = () => {
        const index = seen.guards.indexOf(handler)
        if (index >= 0) seen.guards.splice(index, 1)
      }
      // `tools.guard()` installs through `ctx.effect()`, so the context that
      // produced the service owns the disposer: disposing the row — or the
      // standing scope it registered on — removes the guard.
      effects?.push(dispose)
      return dispose
    }
  }
  return { tools, seen }
}

/** One fake agent-scope systemPrompt, exactly the calls `delegator.mjs` makes. */
function fakeSystemPrompt() {
  return {
    suppressed: false,
    sections: [],
    suppressRuntimeContext() {
      this.suppressed = true
      return () => { this.suppressed = false }
    },
    section(section) {
      this.sections.push(section)
      return () => {
        const index = this.sections.indexOf(section)
        if (index >= 0) this.sections.splice(index, 1)
      }
    },
    getSectionOrder(name) { return ORDERS[name] ?? 0 },
  }
}

/**
 * A preset-scoped context whose services are reachable through `get()`, plus the
 * standing tools service the guard lands on.
 *
 * The logger is a PROPERTY here, matching cordis: `ctx.logger` is assigned in
 * the Context constructor and is not a provided service, so `get('logger')`
 * returns undefined. A fake that answered `get('logger')` made a plugin logging
 * through it pass this check while printing nothing in a real session.
 */
function fakeHost({ liveAgents = [], presetOf = () => undefined, noGuard = false, noPresets = false, routePolicy } = {}) {
  const handlers = new Map()
  const warnings = []
  const infos = []
  const effects = []
  const { tools, seen } = fakeTools({ effects, noGuard })
  const ctx = {
    logger: { warn: message => warnings.push(message), info: message => infos.push(message) },
    on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]) },
    // Cordis runs the effect body now and disposes its result with the fiber.
    effect(callback) { const dispose = callback(); effects.push(dispose); return dispose },
    get(name) {
      if (name === 'agents') return { list: () => liveAgents }
      if (name === 'agentPresets') return noPresets ? undefined : { composedPreset: agentCtx => presetOf(agentCtx) }
      // The route policy the `modelSelectionSettings` opt-in registers. `undefined`
      // here means this build mounts no such projection at all; a stated value —
      // including `null`, or a function that throws — models a registered unit.
      if (name === 'sessionProjections' && routePolicy !== undefined) {
        return {
          stateOf: (_session, key) => key !== ROUTE_POLICY_KEY
            ? undefined
            : typeof routePolicy === 'function' ? routePolicy() : routePolicy,
        }
      }
      return undefined
    },
    tools,
  }
  return {
    ctx,
    seen,
    warnings,
    infos,
    fire: (event, payload) => (handlers.get(event) ?? []).map(handler => handler(payload)),
    // What disposing the row's fiber does to everything the row installed.
    dispose: () => { for (const dispose of effects.splice(0)) dispose?.() },
  }
}

/**
 * One agent's OWN tools service. The depth-0 catalog mask is the only restriction
 * this plugin installs per agent, so it is legal and recorded here; a per-agent
 * guard is not — the standing guard is the whole enforcement — so `guard()` stays
 * absent and any attempt to install one fails loudly.
 * @returns the service and what it recorded.
 */
function fakeAgentTools() {
  const seen = { guards: [], restrictions: [], restrictCalls: 0 }
  return {
    tools: {
      restrict(filter) {
        seen.restrictCalls++
        seen.restrictions.push(filter)
        return () => {
          const index = seen.restrictions.indexOf(filter)
          if (index >= 0) seen.restrictions.splice(index, 1)
        }
      },
    },
    seen,
  }
}

/** One agent of a known depth, with the per-agent scope nothing here may touch. */
function fakeAgent({ id = 'agent', runtimeDepth, headerDepth, model = 'gpt-6-luna', provider } = {}) {
  const { tools, seen } = fakeAgentTools()
  const systemPrompt = fakeSystemPrompt()
  return {
    id,
    options: { model, ...provider === undefined ? {} : { provider }, ...runtimeDepth === undefined ? {} : { subagentDepth: runtimeDepth } },
    session: { header: headerDepth === undefined ? {} : { delegationDepth: headerDepth } },
    systemPrompt,
    toolsSeen: seen,
    ctx: { tools, systemPrompt },
  }
}

const CONFIG = { presetId: 'chat-subagent', subagentTools: SUBAGENT_TOOLS }

/** The catalog mask is deferred one macrotask on purpose; tests cross it here. */
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

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

// ── the standing guard, and the depth branch that keeps a child read-only ────

{
  const host = fakeHost()
  apply(host.ctx, CONFIG)

  // ONE guard, installed at mount on the standing scope — never per agent, and
  // never from `agent/created`, which is the window 1.7.3 broke in.
  assert.equal(host.seen.guards.length, 1)
  assert.equal(host.seen.restrictCalls, 0)
  const guard = host.seen.guards[0]
  const top = fakeAgent({ id: 'top' })
  const child = fakeAgent({ id: 'child', runtimeDepth: 1 })

  // Root: the tool that acts and the read-only lister, nothing else.
  for (const name of DELEGATOR_TOOLS) assert.equal(guard({ name, agent: top }), undefined)
  assert.equal(guard({ name: RUN_CODE, agent: top }), undefined)
  for (const name of ['read', 'write', 'edit', 'bash', 'spawn_teammate', 'send_message', 'todo_write']) {
    assert.match(guard({ name, agent: top }), /`subagent`/)
  }

  // Child: its declared read-only names plus the lister, and no delegation.
  for (const name of [...SUBAGENT_TOOLS, ROUTE_LIST_TOOL]) assert.equal(guard({ name, agent: child }), undefined)
  assert.equal(guard({ name: RUN_CODE, agent: child }), undefined)
  for (const name of ['write', 'edit', 'bash', DELEGATOR_TOOL, 'spawn_teammate']) {
    assert.match(guard({ name, agent: child }), /read-only/)
  }
  // Depth is monotone, so a grandchild is on the child's branch, not the root's.
  assert.match(guard({ name: DELEGATOR_TOOL, agent: fakeAgent({ id: 'deeper', runtimeDepth: 2 }) }), /read-only/)

  // The registry skips every scope-chain guard for a call that carries no agent,
  // and a malformed call is not this plugin's business either.
  assert.equal(guard({ name: 'write' }), undefined)
  assert.equal(guard({ name: 7, agent: top }), undefined)
  assert.equal(guard({ agent: top }), undefined)
}

// ── the route insurance: a Session WITH a list must name its route ───────────

{
  const routes = [{ provider: 'daseinai', model: 'gpt-6-luna' }]
  const host = fakeHost({ routePolicy: routes })
  apply(host.ctx, CONFIG)
  const guard = host.seen.guards[0]
  const top = fakeAgent({ id: 'top' })
  const child = fakeAgent({ id: 'child', runtimeDepth: 1 })
  const call = args => ({ name: DELEGATOR_TOOL, agent: top, arguments: args })
  const routed = {
    description: 'check the logs',
    prompt: 'Find the failing step.',
    provider: 'daseinai',
    model: 'gpt-6-luna',
  }

  // A named route passes, with or without an effort.
  assert.equal(guard(call(routed)), undefined)
  assert.equal(guard(call({ ...routed, reasoning_effort: 'high' })), undefined)
  // Omission — including half a route or a blank half — is refused, and the
  // reason MUST name the lister: it is the only feedback a model that skipped
  // discovery ever gets.
  for (const args of [
    undefined,
    {},
    { description: 'check the logs', prompt: 'Find the failing step.' },
    { provider: 'daseinai' },
    { model: 'gpt-6-luna' },
    { provider: '', model: 'gpt-6-luna' },
    { provider: 'daseinai', model: '   ' },
  ]) {
    assert.match(guard(call(args)), /list_subagent_models/, `refused: ${JSON.stringify(args)}`)
  }
  // The read-only lister itself is never affected, and a child cannot delegate
  // at all, so the route rule never reaches that branch.
  assert.equal(guard({ name: ROUTE_LIST_TOOL, agent: top }), undefined)
  assert.match(guard({ name: DELEGATOR_TOOL, agent: child, arguments: routed }), /read-only/)
  assert.deepEqual(host.warnings, [])
}

// The insurance is FAIL-OPEN. Without a list — the opt-in off, an empty Host
// setting, a restored Session that recorded no policy, or a build with no
// projection service — omission is the only way to delegate and must stay
// allowed; a failed read must never break the call or the mount.
{
  const top = fakeAgent({ id: 'top' })
  const unnamed = { name: DELEGATOR_TOOL, agent: top, arguments: { description: 'd', prompt: 'p' } }
  for (const routePolicy of [undefined, null, []]) {
    const host = fakeHost(routePolicy === undefined ? {} : { routePolicy })
    apply(host.ctx, CONFIG)
    assert.equal(host.seen.guards[0](unnamed), undefined, `omission stays allowed for ${JSON.stringify(routePolicy)}`)
    assert.deepEqual(host.warnings, [])
  }
  const throwing = fakeHost({ routePolicy: () => { throw new Error('no cell') } })
  apply(throwing.ctx, CONFIG)
  assert.equal(throwing.seen.guards[0](unnamed), undefined)
  assert.ok(throwing.warnings.some(m => m.includes('route policy')), 'a failed policy read is reported')
}

// ── the per-agent persona ────────────────────────────────────────────────────

{
  const live = []
  const host = fakeHost({ liveAgents: live })
  apply(host.ctx, CONFIG)
  const agent = fakeAgent({ id: 'top' })
  live.push(agent)
  host.fire('agent/created', { agent })

  assert.equal(agent.systemPrompt.suppressed, true)
  assert.equal(agent.systemPrompt.sections.length, 1)
  const section = agent.systemPrompt.sections[0]
  assert.equal(section.name, 'deployment:persona-prefix')
  assert.equal(section.complete, true)
  assert.equal(section.order, ORDERS.DEPLOYMENT_PERSONA_PREFIX)
  const text = section.text({ agent })
  assert.ok(text.startsWith(codex))
  assert.ok(text.endsWith(DELEGATION_NOTE))
  assert.deepEqual(host.warnings, [])
  // The route line is about the CHILD; a top-level session adds no log noise.
  assert.deepEqual(host.infos, [])

  // A child must NOT get chat-agent's complete persona or its suppression: it
  // needs its own tool guidance and the delegation-scope context. It gets one
  // diagnostic line instead.
  const worker = fakeAgent({ id: 'worker', runtimeDepth: 1 })
  live.push(worker)
  host.fire('agent/created', { agent: worker })
  assert.equal(worker.systemPrompt.suppressed, false)
  assert.deepEqual(worker.systemPrompt.sections, [])
  assert.deepEqual(host.infos, ['chat-subagent/delegator: subagent worker route gpt-6-luna'])

  // The root's catalog mask lands one macrotask later (the row emits
  // `tools/change` itself), the child gets none, and no per-agent guard lands on
  // either scope.
  assert.equal(agent.toolsSeen.restrictCalls, 0)
  await tick()
  assert.deepEqual(agent.toolsSeen.restrictions, [{ allow: [] }])
  assert.equal(agent.toolsSeen.restrictCalls, 1)
  assert.equal(worker.toolsSeen.restrictCalls, 0)
  assert.deepEqual(agent.toolsSeen.guards, [])
  assert.deepEqual(worker.toolsSeen.guards, [])
  assert.equal(host.seen.guards.length, 1)
  assert.equal(host.seen.restrictCalls, 0)
}

// ── the row's note override ──────────────────────────────────────────────────

{
  const host = fakeHost()
  apply(host.ctx, { ...CONFIG, delegationNote: 'OVERRIDE' })
  const agent = fakeAgent({ id: 'top' })
  host.fire('agent/created', { agent })
  // The override must reach the REGISTERED section, not just `personaText()`.
  const text = agent.systemPrompt.sections[0].text({ agent })
  assert.ok(text.startsWith(codex))
  assert.ok(text.endsWith('OVERRIDE'))
  assert.ok(!text.includes(DELEGATION_NOTE))
  assert.deepEqual(host.warnings, [])
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
  const worker = fakeAgent({ id: 'worker-lite', headerDepth: 1 })
  host.fire('agent/created', { agent: worker })

  // Nothing probes the deployment any more: a DECLARED name is allowed whether or
  // not it is registered — an absent tool is simply not in the catalog — and a
  // name outside every list is refused outright. A missing tool costs that tool
  // and never the delegation.
  const guard = host.seen.guards[0]
  assert.equal(guard({ name: 'read_image', agent: worker }), undefined)
  assert.equal(guard({ name: 'list_directory', agent: worker }), undefined)
  assert.equal(typeof guard({ name: 'bash', agent: worker }), 'string')
  assert.deepEqual(host.warnings, [])
}

// ── a build without tools.guard() ────────────────────────────────────────────

{
  const host = fakeHost({ noGuard: true })
  apply(host.ctx, CONFIG)
  assert.equal(host.seen.restrictCalls, 0)
  assert.ok(host.warnings.some(m => m.includes('no tools.guard()')))
  // The persona still lands: a missing enforcement plane must not cost the
  // session its prompt as well.
  const agent = fakeAgent({ id: 'top-no-guard' })
  host.fire('agent/created', { agent })
  assert.equal(agent.systemPrompt.sections.length, 1)
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
  assert.deepEqual(ours.systemPrompt.sections, [])

  live.push(ours, foreign)
  bound = true
  host.fire('tools/change', {})

  assert.equal(ours.systemPrompt.sections.length, 1)
  assert.equal(ours.systemPrompt.suppressed, true)
  // Another preset's agent is untouched.
  assert.deepEqual(foreign.systemPrompt.sections, [])
  assert.equal(foreign.systemPrompt.suppressed, false)
  // Idempotent: a later change must not stack a second persona.
  host.fire('tools/change', {})
  assert.equal(ours.systemPrompt.sections.length, 1)
  assert.deepEqual(host.infos, [])
  // And the guard was not installed per agent, nor a second time here.
  assert.equal(host.seen.guards.length, 1)
  assert.deepEqual(ours.toolsSeen.guards, [])
  assert.deepEqual(foreign.toolsSeen.guards, [])
}

// ── leaving the preset lifts the persona, and NOT the guard ──────────────────
//
// The switch-in case above was the only direction this plugin reconciled, and
// that is the shipped defect: the persona is registered on the AGENT's own
// scope, which outlives the composition that asked for it — disposing the
// previous revision's standing scope does not reach it. A session created on
// `chat-subagent` and then switched to a coding preset kept the delegator's
// prompt. The guard cannot repeat that: it is registered on the STANDING scope,
// so it is disposed with the composition and an agent that leaves the preset is
// simply not on that scope's chain any more.

{
  const agent = fakeAgent({ id: 'leaver' })
  let composed = 'chat-subagent'
  const host = fakeHost({ liveAgents: [agent], presetOf: () => composed })
  apply(host.ctx, CONFIG)
  assert.equal(agent.systemPrompt.sections.length, 1)
  assert.equal(agent.systemPrompt.suppressed, true)
  assert.equal(host.seen.guards.length, 1)

  // The same blank-session switch, now in the direction nothing reconciled.
  composed = 'pair-coding-agent'
  host.fire('tools/change', {})

  assert.deepEqual(agent.systemPrompt.sections, [])
  assert.equal(agent.systemPrompt.suppressed, false)
  assert.equal(host.seen.guards.length, 1)

  // Lifted, not merely forgotten: a session switched back is dressed once more.
  composed = 'chat-subagent'
  host.fire('tools/change', {})
  assert.equal(agent.systemPrompt.sections.length, 1)
  assert.equal(host.seen.guards.length, 1)
  assert.deepEqual(host.warnings, [])
}

// ── the persona is never installed on another preset's session ───────────────

{
  const host = fakeHost({ presetOf: () => 'codex-coding-agent' })
  apply(host.ctx, CONFIG)
  const foreign = fakeAgent({ id: 'foreign-created' })
  host.fire('agent/created', { agent: foreign })
  assert.deepEqual(foreign.systemPrompt.sections, [])
  assert.equal(foreign.systemPrompt.suppressed, false)
  assert.deepEqual(foreign.toolsSeen.guards, [])
}

{
  // A delegated child has not joined its preset yet when `agent/created` fires:
  // `composedPreset()` answers `undefined`, and the install is still ours.
  const host = fakeHost({ presetOf: () => undefined })
  apply(host.ctx, CONFIG)
  const child = fakeAgent({ id: 'pre-join', runtimeDepth: 1 })
  host.fire('agent/created', { agent: child })
  assert.deepEqual(child.systemPrompt.sections, [])
  assert.deepEqual(host.infos, ['chat-subagent/delegator: subagent pre-join route gpt-6-luna'])
}

// ── disposing the row lifts the persona AND the standing guard ───────────────

{
  const agent = fakeAgent({ id: 'remounted' })
  const host = fakeHost({ liveAgents: [agent], presetOf: () => 'chat-subagent' })
  apply(host.ctx, CONFIG)
  assert.equal(agent.systemPrompt.sections.length, 1)
  assert.equal(host.seen.guards.length, 1)
  host.dispose()
  assert.deepEqual(agent.systemPrompt.sections, [])
  assert.equal(agent.systemPrompt.suppressed, false)
  assert.deepEqual(host.seen.guards, [])
}

// ── a disposed agent leaves the map with its persona ─────────────────────────

{
  const agent = fakeAgent({ id: 'gone', runtimeDepth: 1 })
  const live = [agent]
  const host = fakeHost({ liveAgents: live, presetOf: () => 'chat-subagent' })
  apply(host.ctx, CONFIG)
  assert.deepEqual(host.infos, ['chat-subagent/delegator: subagent gone route gpt-6-luna'])

  live.length = 0
  host.fire('agent/disposed', { agent })
  host.fire('tools/change', {})
  // Forgotten, not merely unsubscribed: nothing logs that child again.
  assert.deepEqual(host.infos, ['chat-subagent/delegator: subagent gone route gpt-6-luna'])
  assert.deepEqual(host.warnings, [])
}

// ── the depth-0 catalog mask: install, lift, dispose ─────────────────────────
//
// The mask is `restrict({ allow: [] })` on a ROOT agent's own scope: it filters
// only the surface that scope inherits, so the own-layer `subagent` and
// `list_subagent_models` stay. A delegated child is parented to the standing
// scope, not to the root Agent's scope, so it is never masked. Installing a
// restriction notifies `tools/change`, hence the one-macrotask delay.

{
  const root = fakeAgent({ id: 'root-masked' })
  const child = fakeAgent({ id: 'child-unmasked', runtimeDepth: 1 })
  const live = [root, child]
  let composed = 'chat-subagent'
  const host = fakeHost({ liveAgents: live, presetOf: () => composed })
  // An agent that arrived before this plugin mounted — a resume or an HMR
  // revision — is reconciled by the initial call, not by `agent/created`.
  apply(host.ctx, CONFIG)
  await tick()
  assert.deepEqual(root.toolsSeen.restrictions, [{ allow: [] }])
  assert.equal(root.toolsSeen.restrictCalls, 1)
  assert.equal(child.toolsSeen.restrictCalls, 0)
  assert.deepEqual(host.warnings, [])

  // Idempotent: the mask's own `tools/change` re-enters reconcile; the deferred
  // flush must find it already installed instead of stacking another.
  host.fire('tools/change', {})
  await tick()
  assert.equal(root.toolsSeen.restrictCalls, 1)
  assert.deepEqual(root.toolsSeen.restrictions, [{ allow: [] }])

  // Leaving this preset lifts the mask; coming back installs it again.
  composed = 'pair-coding-agent'
  host.fire('tools/change', {})
  await tick()
  assert.deepEqual(root.toolsSeen.restrictions, [])
  composed = 'chat-subagent'
  host.fire('tools/change', {})
  await tick()
  assert.deepEqual(root.toolsSeen.restrictions, [{ allow: [] }])

  // Disposing the row (HMR, a removed patch) lifts the mask it installed, and
  // nothing queued puts it back.
  host.dispose()
  assert.deepEqual(root.toolsSeen.restrictions, [])
  await tick()
  assert.deepEqual(root.toolsSeen.restrictions, [])
  assert.equal(child.toolsSeen.restrictCalls, 0)
}

// ── a disposed agent is forgotten, never re-masked ──────────────────────────

{
  const root = fakeAgent({ id: 'root-gone' })
  const live = [root]
  const host = fakeHost({ liveAgents: live, presetOf: () => 'chat-subagent' })
  apply(host.ctx, CONFIG)
  await tick()
  assert.equal(root.toolsSeen.restrictCalls, 1)

  live.length = 0
  host.fire('agent/disposed', { agent: root })
  host.fire('tools/change', {})
  await tick()
  // The agent's own fiber owns the restriction; the plugin only forgets it and
  // never touches the disposing scope.
  assert.equal(root.toolsSeen.restrictCalls, 1)
  assert.deepEqual(host.warnings, [])
}

// ── no mask without a preset identity or a preset registry ──────────────────

{
  // `presetId` unset: the plugin must not guess whose catalog it may narrow.
  const unconfigured = fakeAgent({ id: 'root-noid' })
  const host = fakeHost({ liveAgents: [unconfigured] })
  apply(host.ctx, { subagentTools: SUBAGENT_TOOLS })
  host.fire('agent/created', { agent: unconfigured })
  await tick()
  assert.equal(unconfigured.toolsSeen.restrictCalls, 0)
  assert.ok(host.warnings.some(m => m.includes('no `presetId` configured')))

  // No `agentPresets` service: `belongs()` cannot answer, so no mask either.
  const bare = fakeAgent({ id: 'root-no-registry' })
  const bared = fakeHost({ liveAgents: [bare], noPresets: true })
  apply(bared.ctx, CONFIG)
  bared.fire('agent/created', { agent: bare })
  await tick()
  assert.equal(bare.toolsSeen.restrictCalls, 0)
  assert.deepEqual(bared.warnings, [])
}

// ── mask failures degrade loudly, never break the mount ─────────────────────

{
  // A registry without `restrict()`: the persona still lands and the session
  // keeps the whole catalog rather than failing to mount.
  const noRestrict = fakeAgent({ id: 'root-no-restrict' })
  noRestrict.ctx.tools = {}
  const noRestrictHost = fakeHost({ liveAgents: [noRestrict], presetOf: () => 'chat-subagent' })
  apply(noRestrictHost.ctx, CONFIG)
  await tick()
  assert.ok(noRestrictHost.warnings.some(m => m.includes('no tools.restrict()')))
  assert.equal(noRestrict.systemPrompt.sections.length, 1)

  // A `restrict()` that throws is reported, not rethrown out of the flush.
  const thrower = fakeAgent({ id: 'root-throws' })
  thrower.ctx.tools = { restrict() { throw new Error('scope closed') } }
  const throwerHost = fakeHost({ liveAgents: [thrower], presetOf: () => 'chat-subagent' })
  apply(throwerHost.ctx, CONFIG)
  await tick()
  assert.ok(throwerHost.warnings.some(m => m.includes('masking agent root-throws failed')))
}

// ── the helper stays honest when called directly ─────────────────────────────

{
  const { tools, seen } = fakeTools()
  const warnings = []
  const decide = (exec, called) => called === 'read' ? undefined : 'no'
  const disposeGuard = installGuard(tools, decide, m => warnings.push(m))
  assert.equal(seen.guards[0]({ name: 'read' }), undefined)
  assert.equal(seen.guards[0]({ name: 'write' }), 'no')
  // PTC mode's model-direct transport is not the decision's business.
  assert.equal(seen.guards[0]({ name: RUN_CODE }), undefined)
  assert.equal(seen.guards[0]({ name: 5 }), undefined)
  disposeGuard()
  assert.deepEqual(seen.guards, [])
  // A registry without `guard()` degrades loudly instead of failing the mount.
  assert.equal(installGuard({}, decide, m => warnings.push(m)), undefined)
  assert.match(warnings.at(-1), /no tools\.guard\(\)/)
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
// DSH 0.2.1 dropped `backgroundMode`/`enableRunInBackground` from
// `@deepseek-ai/dsh-tool-subagent`'s schema and makes `apply()` THROW on
// `persona`/`toolFilter`, so a row carrying one fails the whole preset. Match
// only row lines — this file's own header names all four in prose.
assert.doesNotMatch(patch, /^\s+backgroundMode:/m)
assert.doesNotMatch(patch, /^\s+enableRunInBackground:/m)
assert.doesNotMatch(patch, /^\s+toolFilter:/m)
assert.doesNotMatch(patch, /^\s+persona:/m)
assert.ok(patch.includes('maxDepth: 1'))
// The child's persona moved off the delegation row onto a preset-plane
// `@deepseek-ai/dsh-persona` row, which is what reaches a child because a child
// composes THIS preset. Both halves are pinned: the row must exist, and no
// `agentPreset` may appear (selecting another preset would take the child off
// this preset's guard and read-only rows).
assert.equal(
  patch.match(/^[ \t]+- id: subagent-persona\n[ \t]+name: '@deepseek-ai\/dsh-persona'\n/gm)?.length,
  1,
)
assert.doesNotMatch(patch, /^\s+agentPreset:/m, 'a delegated child must keep joining this preset')
// The opt-in is what gives the root session a model to name and a lister to read
// it from; without it the guard's allow-list is right but the capability is gone.
// The header comment mentions the key too, so the count is pinned to the row.
assert.equal(patch.match(/^\s+modelSelectionSettings: true$/gm)?.length, 1)
// A row that omits a `.required()` Config key fails to mount, and ONE failed row
// marks the whole preset broken — observed live as
// `tool-todo (@deepseek-ai/dsh-tool-todo): invalid config: $.allowParallelInProgress
// missing required value`. `@deepseek-ai/dsh-tool-todo` has exactly one such key.
assert.match(
  patch,
  /- id: tool-todo\n(?:\s*#.*\n)*\s+name: '@deepseek-ai\/dsh-tool-todo'\n(?:\s*#.*\n)*\s+config:\n\s+allowParallelInProgress: (?:true|false)\n/,
)

console.log('check-delegator: ok')
