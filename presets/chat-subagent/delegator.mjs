/**
 * chat-subagent — the delegation guard and the delegator persona.
 *
 * The preset's invariant: a TOP-LEVEL session's CATALOG is the whole preset, but
 * `subagent` is the only tool it may CALL that acts — plus the read-only
 * `list_subagent_models` the `modelSelectionSettings` opt-in registers. The
 * delegated subagent may call only the read-only names its declaration lists.
 * Enforcement is ONE standing guard (point 6), and no tool restriction exists at
 * all (point 5).
 *
 * No prompt text is written in this file: the per-model half is
 * `../shared/model-personas.json` and the delegation half is
 * `./delegation-note.md`, both read at mount.
 *
 * (1) A preset's rows mount in the STANDING SCOPE the registry creates for the
 * revision (`@deepseek-ai/dsh-agent-preset-registry`, `activate` → `createScope`
 * + `mountPreset`), and every selecting Agent is parented to that same scope
 * (`bindScopeParent(agentKey, standingKey)`). A restriction registered there
 * therefore reaches every agent of the preset — INCLUDING delegated children,
 * because a child joins its parent's preset rather than a fresh one:
 * `applyChildComposition` calls `agentPresets.composeFrom(childCtx, parent.ctx)`
 * (`packages/subagent/subagent/src/child-agent.ts:200-219`), which parents the
 * child's scope to the same standing scope. A standing `allow: []` would thus
 * leave the child with no tool at all, and a restriction can only
 * narrow — the child's own `toolFilter` cannot widen what an ancestor masked.
 * That rules out a preset-plane RESTRICTION, not a preset-plane GUARD: a guard is
 * read per CALLING agent, so one standing install can refuse a root what it
 * admits a child (point 6).
 *
 * (2) A restriction registered on ONE AGENT's own scope does not reach a
 * delegated child, because the child's scope parent is the standing scope, not
 * the parent Agent's scope (`standingMountFor()` matches the agent's
 * `scopeParentOf` against a mount key — `agent-preset-registry/src/mount.ts:119-127`).
 * `ToolRuntime.view()` reads a scope's own restrictions for the layer it
 * INHERITS and overlays its own registrations unfiltered
 * (`packages/core/tools/src/index.ts:1178-1209`), and `tools.restrict()` refuses
 * an unscoped caller with exactly this instruction: "deny the tool for the
 * intended agent instead" (`:1097-1100`). What this plugin installs per agent, at
 * `agent/created`, is therefore the PERSONA alone (points 3-4); the enforcement
 * needs no scope of its own, because a guard is read from the calling agent's
 * chain (point 6).
 *
 * (3) `agent/created` is awaited by the creation transaction before the Agent is
 * announced (`packages/core/agent/src/index.ts:537-559`), so the persona
 * registered there is in place before the session's first request; a
 * preset-scoped listener receives descendant Agents too (shipped precedent:
 * `dsh-tool-subagent`'s standing `modelSelectionSettings` install path).
 *
 * (4) Creation is not the only way to arrive here. The Web UI can switch a
 * BLANK session's preset, which goes `agentPresets.select` → `recompose` →
 * `mount` + `emit('tools/change')` and emits NO `agent/created`
 * (`agent-preset-registry/src/index.ts:306-334`). `tools/change` reconciliation
 * covers that path, HMR re-mounts, and `agent/created` on resume.
 *
 * (5) There is NO tool restriction in this preset, and that is deliberate. A
 * restriction is the only way to hide a catalog row, but `restrict()` notifies
 * `tools/change` (`packages/core/scope/src/store.ts:226-266`; `notify` defaults
 * to true) where `tools.guard()` explicitly does not
 * (`packages/core/tools/src/index.ts:1136-1142`). That notification is what broke
 * 1.7.3: an agent-scope restriction installed from `agent/created` reached
 * `@deepseek-ai/dsh-tool-subagent`'s reconciler (`src/index.ts:693-698`), which
 * installs into a live Agent on `tools/change`, so one scope got TWO installs;
 * the second threw `tool "list_subagent_models" is already registered in this
 * scope` from `registerListSubagentModels()` (`src/list-models.ts:87`, reached
 * from `install()` at `src/index.ts:360-362`), `install()` aborted before its
 * `mount()`, and the session was left with NO delegation tool at all — observed
 * live on `dev_web`, and the same symptom the previous attempt recorded as "a
 * second live plugin instance registers the same names, the duplicate
 * registration throws, and `mount()` never runs". Nothing in this file emits
 * `tools/change` any more, so that interleaving cannot happen again. The cost is
 * the catalog: the root session SEES the preset's rows (`read`, `write`, `edit`,
 * `glob`, `grep`, `todo_*`, `job_*`) and can call none of them.
 *
 * (6) The guard is the whole enforcement, and it is installed once on this
 * preset's STANDING scope rather than per agent. It is read from the CALLING
 * agent's chain (`guardReason()` walks `chainLayers(exec.agent)`,
 * `packages/core/tools/src/index.ts:1145-1154`), so one standing install covers
 * the root session and every delegated child of this preset, and the delegation
 * depth decides which names pass — root: `subagent` and the lister; child: its
 * declared read-only names and the lister. It also closes the plane no
 * restriction could reach: registrations in an agent's OWN layer are exempt from
 * restrictions, and on a profile that mounts
 * `@deepseek-ai/dsh-experimental-agent-team-profile` those are nine Team tools
 * for every root agent (`roster.tryMembership()` fabricates a lead membership;
 * see `presets/chat-agent/no-tools.mjs` for the measurement). A guard is
 * monkey-proof: it runs after `tools/pre-execute`, so a name the model produces
 * anyway is refused. A call that carries no agent keeps the registry's own
 * behaviour and is left alone.
 *
 * (7) The persona is registered on an AGENT's scope, which outlives the
 * composition that asked for it, so BOTH directions of a preset switch must be
 * reconciled — not only the arriving one. The switch in (4) leaves `agent.ctx`
 * alive: what a previous preset registered there is owned by that agent scope,
 * and disposing the previous revision's standing scope does not reach it.
 * Shipped behaviour before this rule: a session created on `chat-subagent` and
 * then switched to a coding preset kept the delegator's persona and its
 * suppressed runtime context. `reconcile()` therefore LIFTS the persona as soon
 * as `composedPreset(agent.ctx)` stops naming this preset, every install records
 * its disposer for that, `agent/disposed` frees the entry, and disposing this row
 * lifts whatever it installed. The guard needs none of that: it lives on the
 * standing scope, so a switch disposes it with the composition that installed it.
 *
 * `run_code` is the PTC mode presentation transport, not a capability: under
 * `ptc` a model-direct call may ONLY name it — every other name is collapsed and
 * denied BEFORE the policy pipeline, guards included
 * (`packages/core/tools/src/index.ts:1400-1408`) — while the nested dispatch it
 * performs keeps its `parent` and passes the same guards. The guard therefore
 * always allows it: denying it would leave a PTC-mode session unable to call its
 * single tool. It stays invisible in the catalog unless some row sets that mode,
 * and no preset of this bundle does — only the shipped `ptc` preset mounts
 * `@deepseek-ai/dsh-agent-tool-presentation`.
 */

import { readFileSync } from 'node:fs'

import { personaTable, pickPersona, sessionModel } from '../shared/model-persona.mjs'
// The two route readers live in `presets/shared/`: the five coding presets log
// the same line through `subagent-route-log.mjs`, so there is one implementation.
import { childRoute, depthOf } from '../shared/subagent-route-log.mjs'

export const name = 'chat-subagent/delegator'

export const inject = ['tools', 'systemPrompt']

/** The one tool a top-level session of this preset may call to ACT. */
export const DELEGATOR_TOOL = 'subagent'

/**
 * Read-only route discovery, registered by the `modelSelectionSettings` opt-in
 * (`@deepseek-ai/dsh-tool-subagent` `src/list-models.ts`). It changes nothing —
 * it reports the routes this Session may name — so a top-level session may call
 * it too, and the delegation call is where a route is chosen.
 */
export const ROUTE_LIST_TOOL = 'list_subagent_models'

/** The names a top-level session of this preset may call (point 8). */
export const DELEGATOR_TOOLS = [DELEGATOR_TOOL, ROUTE_LIST_TOOL]

/** PTC mode's model-direct transport (`packages/core/tools/src/ptc.ts:30`). */
export const RUN_CODE = 'run_code'

/**
 * The delegation half of a top-level session's persona, appended verbatim to the
 * per-model text this preset shares with `chat-agent`. It is prompt text, so it
 * lives in `delegation-note.md` — a document, not a string literal — and is read
 * once here, when the row mounts: a missing or unreadable file must break the
 * preset loudly, never leave the session with a silent empty half. That file IS
 * the prompt, verbatim: no heading, no comment, nothing that is not meant for
 * the model. The picked text is the session's ENTIRE system prompt and the
 * subagent tool is its only capability, so the note has to say all of this:
 * nothing else tells the model that the child is blind to the conversation, and
 * nothing else tells it that the child is read-only. The capabilities it names
 * are the SHIPPED default; a declaration that widens `subagentTools` must revise
 * this file with it, or override the note from the row's `delegationNote`.
 */
export const DELEGATION_NOTE = readFileSync(new URL('./delegation-note.md', import.meta.url), 'utf8').trim()

/** Reason the model reads when it names a tool a top-level session does not have. */
const DELEGATOR_DENIAL
  = 'This session is a delegator-only preset: `subagent` is the only tool that acts, and `list_subagent_models` only inspects the routes it may name. Describe the task to `subagent` instead of acting directly.'

/** Reason the model reads when a read-only subagent names a tool it does not have. */
const SUBAGENT_DENIAL
  = 'This delegated subagent is read-only: it cannot run commands, write or edit files, or delegate further. State the limitation in your reply.'

// Re-exported for the callers that have always imported the route readers from
// this file (`check-delegator.mjs`); the implementation is the shared module.
export { childRoute, depthOf }

/**
 * A top-level session's whole system prompt: the per-model text from the table
 * `chat-agent` owns, plus the delegation note. One table, one note.
 * @param modelId - the model the session's next request will use.
 * @param table - the parsed table, already resolved by `personaTable()`.
 * @param note - the delegation half: the shipped file, or the row's override.
 * @returns the complete prompt text.
 */
export function personaText(modelId, table, note = DELEGATION_NOTE) {
  const text = pickPersona(modelId, table)
  return text === '' ? note : `${text}\n\n${note}`
}

/**
 * Normalize the row's `config`. The declaration is the single source of the
 * subagent list, so this validates and de-duplicates it rather than supplying a
 * default that could silently disagree with the patch; `delegationNote` is the
 * other way round — an optional override of the shipped note FILE, omitted
 * unless a declaration really states one (so the file stays the default, and a
 * row keeps reading as "which tools" plus at most one prompt sentence).
 * @param config - the row config, possibly absent on a hand-written patch.
 * @param warn - sink for one message per distinct problem.
 * @returns the preset identity, the subagent tool list, and the note override.
 */
export function normalizeConfig(config, warn) {
  const rawId = config?.presetId
  const presetId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId.trim() : undefined
  if (presetId === undefined) {
    warn('no `presetId` configured: a blank session switched to this preset in the UI cannot be masked')
  }
  const raw = config?.subagentTools
  if (!Array.isArray(raw) || raw.length === 0) {
    warn('no `subagentTools` configured: delegated subagents will get no tool of their own')
  }
  const subagentTools = []
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== 'string') continue
    const tool = entry.trim()
    if (tool === '' || subagentTools.includes(tool)) continue
    subagentTools.push(tool)
  }
  const rawNote = config?.delegationNote
  let delegationNote
  if (rawNote !== undefined) {
    if (typeof rawNote === 'string' && rawNote.trim() !== '') delegationNote = rawNote
    else warn('`delegationNote` is blank: the shipped delegation-note.md is used instead')
  }
  return { presetId, subagentTools, ...delegationNote === undefined ? {} : { delegationNote } }
}

/**
 * Install the monotonic denial that decides what a calling agent may call. It is
 * installed on the preset's standing scope (point 6), so `decide` sees every call
 * any agent of this preset makes and answers with the refusal text, or
 * `undefined` to allow.
 * @param tools - the tools service of the scope the guard lands on.
 * @param decide - `(exec, called) => string | undefined`: the reason, or nothing.
 * @param warn - sink for the build-without-guard degradation.
 * @returns the guard's disposer, or `undefined` on a build without `guard()`.
 */
export function installGuard(tools, decide, warn) {
  if (typeof tools.guard !== 'function') {
    // Declared floor is ^0.2.0-rc.1; a build without `guard()` must degrade
    // loudly instead of failing the preset's mount (same rule as
    // `presets/chat-agent/no-tools.mjs`).
    warn('this DSH build has no tools.guard(); this preset cannot refuse a call it does not allow')
    return undefined
  }
  return tools.guard((exec) => {
    const called = exec?.name
    if (typeof called !== 'string') return undefined
    // `run_code` is the PTC presentation transport, not a capability (header):
    // under `ptc` it is the ONLY name a model-direct call may use.
    if (called === RUN_CODE) return undefined
    return decide(exec, called)
  })
}

/**
 * Read the row config, install the delegation guard for this preset, and dress
 * every agent that arrives in it.
 * @param ctx - the preset's standing context.
 * @param config - the `delegator` row's config.
 */
export function apply(ctx, config) {
  const warned = new Set()
  // `ctx.logger` is a Context PROPERTY, not a provided service: cordis assigns
  // it in the Context constructor (`vendor/cordis/src/context.ts:81`) and
  // `get()` reads the service store only (`reflect.ts:233-243`), so
  // `ctx.get('logger')` is `undefined` and every line sent through it was
  // silently dropped.
  const warn = (message) => {
    if (warned.has(message)) return
    warned.add(message)
    ctx.logger.warn(`chat-subagent/delegator: ${message}`)
  }
  // Diagnostics only, and never deduplicated: two children of one session are
  // two events, and the child id is what tells them apart.
  const info = (message) => ctx.logger.info(`chat-subagent/delegator: ${message}`)

  const { presetId, subagentTools, delegationNote } = normalizeConfig(config, warn)
  // The child is a member of this preset's composition too, so it also sees the
  // two own-layer names; the guard must agree with its catalog. `subagent` is
  // refused — `maxDepth: 1` is the recursion budget — and the read-only route
  // lister is allowed, because it changes nothing.
  const subagentAllowed = new Set([...subagentTools, ROUTE_LIST_TOOL])
  const delegatorAllowed = new Set(DELEGATOR_TOOLS)

  // ONE guard for the whole preset, on the standing scope (point 6): a guard is
  // read from the CALLING agent's chain, so the delegation depth is what decides.
  // Installing it here — never from `agent/created` — is also what keeps this
  // plugin out of the creation window that broke 1.7.3 (point 5).
  installGuard(ctx.tools, (exec, called) => {
    const agent = exec?.agent
    if (agent === undefined) return undefined
    return depthOf(agent) === 0
      ? delegatorAllowed.has(called) ? undefined : DELEGATOR_DENIAL
      : subagentAllowed.has(called) ? undefined : SUBAGENT_DENIAL
  }, warn)

  // TEMPORARY diagnostic for the live `dev_web` double install (TODO.md): a new
  // chat-subagent session prints `[E] scope Error: tool "list_subagent_models" is
  // already registered in this scope` and ends up with no `subagent` at all.
  // This plugin registers no tool and no restriction (point 5), so the next
  // question is what the official per-Agent resolver sees: how many Agents one
  // session announces and which preset each resolves to. One line per event,
  // removed with the fix.
  const described = (agent) => {
    const presets = ctx.get('agentPresets')
    const composed = presets === undefined ? 'unknown' : String(presets.composedPreset(agent.ctx))
    return `id=${String(agent?.id)} depth=${depthOf(agent)} preset=${composed}`
  }
  ctx.on('agent/created', ({ agent }) => info(`agent/created ${described(agent)}`))
  ctx.on('tools/change', () => {
    const agents = ctx.get('agents')
    if (agents === undefined) return
    info(`tools/change agents=[${agents.list().map(agent => described(agent)).join(' | ')}]`)
  })

  /** Agents whose persona this plugin already installed. */
  const dressed = new WeakSet()
  /** agent → the disposers that undo the persona this plugin installed on it. */
  const personas = new Map()

  /**
   * Whether an agent composes this preset right now. An agent that joined no
   * preset resolves to `undefined` — a delegated child before its join, a
   * deployment composing no roster — and is treated as ours, because installing
   * the persona is what this plugin exists for and `reconcile()` lifts a wrong
   * guess. Only a composition that names a DIFFERENT preset is refused, which is
   * what keeps this plugin's persona off a session it does not own.
   * @param agent - the agent to classify.
   * @returns whether this preset owns the agent's composition.
   */
  const belongs = (agent) => {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) return true
    const composed = presets.composedPreset(agent.ctx)
    return composed === undefined || composed === presetId
  }

  /**
   * Lift the persona one agent carries. What this plugin registers it registers
   * on the agent's OWN scope, which outlives the composition that asked for it
   * (header point 7), so every install has to be undoable and every installer has
   * to record how.
   * @param agent - the agent whose persona must go.
   * @param disposers - what to dispose; defaults to what `installPersona()` recorded.
   */
  const liftPersona = (agent, disposers = personas.get(agent)) => {
    dressed.delete(agent)
    personas.delete(agent)
    for (const dispose of disposers ?? []) {
      try {
        dispose()
      } catch (error) {
        warn(`lifting the persona of agent ${String(agent?.id)} failed: ${String(error)}`)
      }
    }
  }

  /**
   * Give one agent what only it may carry: the root session gets this preset's
   * whole prompt, a delegated child only gets its route logged. No tool
   * registration happens here — the guard is standing (point 6) and there is no
   * restriction to install (point 5).
   * @param agent - the agent to dress.
   */
  const installPersona = (agent) => {
    // Reserve before registering: `tools/change` reconciles below and must not
    // re-enter this install while it is half done.
    if (dressed.has(agent)) return
    dressed.add(agent)
    /** Every install that can be undone, in install order. */
    const disposers = []
    const track = (disposer) => {
      if (typeof disposer === 'function') disposers.push(disposer)
    }
    try {
      if (depthOf(agent) === 0) {
        // The picked text is the session's ENTIRE prompt (a `complete` section
        // collapses the assembly) and no runtime-context block reaches it —
        // the two knobs `chat-agent` sets for the same reason.
        const systemPrompt = agent.ctx.systemPrompt
        track(systemPrompt.suppressRuntimeContext())
        const table = personaTable()
        const note = delegationNote ?? DELEGATION_NOTE
        // A function text is what makes the prompt follow the model the Session
        // selected for its NEXT request, not the one it was created with
        // (`shared/model-persona.mjs` has the measurement).
        const prompt = {
          name: 'deployment:persona-prefix',
          order: systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
          complete: true,
          text: context => personaText(sessionModel(ctx, context?.agent), table, note),
        }
        // `systemPrompt.section()` registers through the AGENT's context, so the
        // agent's own scope disposes this section with it — and `liftPersona()`
        // also disposes it earlier, the moment the agent leaves this preset.
        track(systemPrompt.section(prompt))
      } else {
        // A child's read-only branch is the standing guard's (point 6); what it
        // needs from this plugin is the one diagnostic naming its route.
        info(`subagent ${String(agent?.id)} route ${childRoute(ctx, agent)}`)
      }
      personas.set(agent, disposers)
    } catch (error) {
      warn(`dressing agent ${String(agent?.id)} failed: ${String(error)}`)
      // Half a persona is worse than none: undo what did land.
      liftPersona(agent, disposers)
    }
  }

  ctx.on('agent/created', ({ agent }) => {
    if (belongs(agent)) installPersona(agent)
  })
  // A disposed agent needs no persona, and must not stay in the map.
  ctx.on('agent/disposed', ({ agent }) => liftPersona(agent))
  // Disposing THIS row (HMR, a re-mounted revision, a removed patch) lifts what
  // it installed, so no agent keeps a persona no live plugin owns. The guard
  // disposes itself with the standing scope it was installed on.
  ctx.effect(() => () => { for (const agent of [...personas.keys()]) liftPersona(agent) })

  if (presetId === undefined) return

  /**
   * Dress every live agent of this preset that creation never announced to us,
   * and LIFT the persona this plugin left on an agent that stopped composing it.
   */
  const reconcile = () => {
    const agents = ctx.get('agents')
    const presets = ctx.get('agentPresets')
    if (agents === undefined || presets === undefined) return
    for (const agent of agents.list()) {
      if (belongs(agent)) installPersona(agent)
      else liftPersona(agent)
    }
  }
  // Covers the blank-session preset switch — in BOTH directions — a re-mounted
  // plugin revision, and any tool registration that changes what an install
  // would have kept.
  ctx.on('tools/change', reconcile)
  reconcile()
}
