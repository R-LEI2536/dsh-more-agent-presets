/**
 * chat-subagent — the delegation guard and the delegator persona.
 *
 * The preset's invariant: a TOP-LEVEL session's CATALOG holds only the two
 * own-layer delegation names — `subagent`, the one tool that acts, and the
 * read-only `list_subagent_models` the `modelSelectionSettings` opt-in
 * registers. The delegated subagent may call only the read-only names its
 * declaration lists.
 * Enforcement is ONE standing guard (point 6). The catalog is narrowed by one
 * per-agent depth-0 `restrict({ allow: [] })` mask (point 5), which is not
 * enforcement and never reaches a delegated child.
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
 * intended agent instead" (`:1097-1100`). What this plugin installs per agent at
 * `agent/created` is therefore the PERSONA alone (points 3-4); the catalog mask is
 * per-agent too, but it installs one macrotask after the dispatch (point 5) and
 * enforces nothing — the enforcement needs no scope of its own, because a guard is
 * read from the calling agent's chain (point 6).
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
 * (5) The TOP-LEVEL catalog is narrowed by ONE per-agent restriction, and that is
 * the only restriction in this plugin. A preset-plane `restrict({ allow: [] })` is
 * wrong (point 1: a delegated child joins the same standing scope, so it would
 * lose the rows it works through), but a restriction on the ROOT AGENT's own
 * scope is not on the child's chain (point 2) and filters only the surface that
 * scope INHERITS (`packages/core/tools/src/index.ts:1178-1219`): the own-layer
 * `subagent` / `list_subagent_models` stay visible while this preset's rows
 * (`read`, `write`, `edit`, `glob`, `grep`, `todo_*`, `job_*`) disappear from this
 * session's catalog. Two constraints keep it safe. First, it is a CATALOG mask,
 * never enforcement: the standing guard (point 6) is still what refuses calls.
 * Second, `restrict()` notifies `tools/change`
 * (`packages/core/scope/src/store.ts:226-266`; `notify` defaults to true) where
 * `tools.guard()` does not (`packages/core/tools/src/index.ts:1136-1142`), and
 * the official delegation plugin installs into a live Agent on that event
 * (`src/index.ts:693-698`) — the 1.7.3/1.7.5 collision. So the mask is installed
 * ONE MACROTASK LATER (one coalesced `setTimeout`), after the dispatch that
 * reported a switch has settled, and it is lifted both when the agent leaves this
 * preset and when this row unloads. Nothing here installs a restriction inside a
 * dispatch.
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
 * lifts whatever it installed. The depth-0 catalog mask is per-agent too
 * (point 5) and travels the same bidirectional path, except that
 * `agent/disposed` only forgets its map entry: the restriction is registered on
 * the agent's own fiber, so that fiber's disposal owns it. The guard needs none
 * of that: it lives on the standing scope, so a switch disposes it with the
 * composition that installed it.
 *
 * (8) The route insurance: a Session that HAS an authorized route list may not
 * delegate by omission. The official tool treats an omitted `provider`/`model` as
 * "inherit the parent route" (`model-selection.ts:130-133`, "Pure inheritance
 * remains outside this policy"), which is the sane default and the ONLY way to
 * delegate when no list exists — but it also means a model that never calls
 * `list_subagent_models` silently gets a child on the parent's route, which is
 * the behaviour this insurance exists to stop. The guard therefore refuses a
 * depth-0 `subagent` call that carries no route when the Session's durable
 * policy projection (`ROUTE_POLICY_KEY`) holds at least one authorized route.
 * Two properties keep it safe, and both matter more than the rule itself: it
 * adds NO registration, NO listener and NO `tools/change` notification — it only
 * reads the projection inside the guard that was already installed (point 6), so
 * none of the 1.7.3-1.7.6 mount-order/collision failure modes can return — and
 * it fails OPEN: a missing `sessionProjections` service, an unregistered key, or
 * a projection read that throws means "no list", so omission stays allowed and
 * the session degrades to the behaviour it had before this point. The rule is
 * scoped to depth 0 by construction: the child branch does not admit `subagent`
 * at all.
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

/** The names a top-level session of this preset may call (point 6). */
export const DELEGATOR_TOOLS = [DELEGATOR_TOOL, ROUTE_LIST_TOOL]

/** PTC mode's model-direct transport (`packages/core/tools/src/ptc.ts:30`). */
export const RUN_CODE = 'run_code'

/**
 * The projection key carrying a Session's authorized child routes
 * (`@deepseek-ai/dsh-tool-subagent` `src/model-selection-state.ts:36-51`). That
 * plugin registers the unit unconditionally and stores the exact route list once
 * one is recorded; `null` means NO list — the opt-in is off, the Host list is
 * empty, or a restored Session recorded no policy. The route insurance (point 8)
 * reads it from the calling agent's Session at call time: the guard must not
 * demand a named route from a Session that has none to name.
 */
export const ROUTE_POLICY_KEY = 'subagentModelSelectionPolicy'

/**
 * Whether a delegation call named an explicit route: `provider` and `model` both
 * present as non-empty strings. The tool's own schema owns every other shape.
 * @param args - the call's parsed arguments, as the registry materialized them.
 * @returns whether the call carries the route the insurance demands (point 8).
 */
export function namedRoute(args) {
  return typeof args?.provider === 'string' && args.provider.trim() !== ''
    && typeof args?.model === 'string' && args.model.trim() !== ''
}

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

/**
 * Reason the model reads when a Session that HAS an authorized route list
 * delegates without naming one (point 8). The refusal is the only feedback a
 * model that skipped `list_subagent_models` gets, so it has to name the lister
 * and the two parameters to supply.
 */
const ROUTE_REQUIRED_DENIAL
  = 'This session delegates only on an explicit route: call `list_subagent_models` for the routes it may name, then pass `provider` and `model` (plus `reasoning_effort` when you want one) to `subagent`. A delegation call without both is refused.'

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

  /**
   * The authorized routes one calling agent's Session may name, or `undefined`
   * when that Session has NO list (point 8): the opt-in is off, the Host list is
   * empty, a restored Session recorded no policy, or this build serves no
   * `sessionProjections`. Read per CALL, because the official plugin records the
   * policy at install/creation time and a restore can end with none — a cached
   * read taken when this row mounted would be wrong in both directions. This
   * function is the whole of what the insurance adds to the call path: it
   * registers nothing and notifies nothing.
   * @param agent - the agent whose delegation call is being decided.
   * @returns the route list, or nothing when omission must stay allowed.
   */
  const routePolicyOf = (agent) => {
    const projections = ctx.get('sessionProjections')
    const session = agent?.session
    if (projections === undefined || session === undefined) return undefined
    let policy
    try {
      policy = projections.stateOf(session, ROUTE_POLICY_KEY)
    } catch (error) {
      // Fail OPEN, never closed: an unreadable policy must leave the session able
      // to delegate the way it could before this insurance existed.
      warn(`reading the route policy of agent ${String(agent?.id)} failed: ${String(error)}`)
      return undefined
    }
    return Array.isArray(policy) && policy.length > 0 ? policy : undefined
  }

  // ONE guard for the whole preset, on the standing scope (point 6): a guard is
  // read from the CALLING agent's chain, so the delegation depth is what decides.
  // Installing it here — never from `agent/created` — is also what keeps this
  // plugin out of the creation window that broke 1.7.3 (point 5).
  installGuard(ctx.tools, (exec, called) => {
    const agent = exec?.agent
    if (agent === undefined) return undefined
    if (depthOf(agent) !== 0) {
      return subagentAllowed.has(called) ? undefined : SUBAGENT_DENIAL
    }
    if (!delegatorAllowed.has(called)) return DELEGATOR_DENIAL
    // Point 8: with a list to choose from, the delegation names its route. The
    // lister itself is never affected, and a Session without a list keeps the
    // official omit-to-inherit path.
    if (called !== DELEGATOR_TOOL || routePolicyOf(agent) === undefined) return undefined
    return namedRoute(exec?.arguments) ? undefined : ROUTE_REQUIRED_DENIAL
  }, warn)

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
   * registration happens here — the guard is standing (point 6) and the catalog
   * mask is installed separately, one macrotask later (point 5).
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

  /** agent → the disposer of the depth-0 catalog mask this plugin installed. */
  const masks = new Map()
  /** Set when this row is disposed, so a queued mask flush cannot reinstall. */
  let disposed = false
  /** The single queued catalog-mask flush, coalescing every notification. */
  let maskTask

  /**
   * Hide this preset's inherited tool rows from ONE top-level session's catalog.
   * `restrict({ allow: [] })` filters only the surface a scope INHERITS
   * (`packages/core/tools/src/index.ts:1178-1219`), so the own-layer `subagent`
   * and `list_subagent_models` stay visible. It is a catalog mask, not
   * enforcement (point 5), and a delegated child never inherits it (point 2).
   * @param agent - the depth-0 agent to mask.
   */
  const installMask = (agent) => {
    if (masks.has(agent)) return
    const tools = agent.ctx?.tools
    if (typeof tools?.restrict !== 'function') {
      warn(`agent ${String(agent?.id)} has no tools.restrict(); its catalog keeps this preset's rows`)
      return
    }
    try {
      masks.set(agent, tools.restrict({ allow: [] }))
    } catch (error) {
      warn(`masking agent ${String(agent?.id)} failed: ${String(error)}`)
    }
  }

  /**
   * Lift one agent's catalog mask.
   * @param agent - the agent whose mask must go.
   */
  const liftMask = (agent) => {
    const dispose = masks.get(agent)
    if (dispose === undefined) return
    masks.delete(agent)
    try {
      dispose()
    } catch (error) {
      warn(`lifting the catalog mask of agent ${String(agent?.id)} failed: ${String(error)}`)
    }
  }

  /**
   * Reconcile every live agent's mask in one pass. Runs as its own macrotask:
   * `restrict()` notifies `tools/change`, so installing inside the dispatch that
   * reported a switch would re-enter the official per-Agent install (point 5).
   */
  const flushMasks = () => {
    maskTask = undefined
    if (disposed) return
    const agents = ctx.get('agents')
    const presets = ctx.get('agentPresets')
    if (agents === undefined || presets === undefined) return
    for (const agent of agents.list()) {
      if (belongs(agent) && depthOf(agent) === 0) installMask(agent)
      else liftMask(agent)
    }
  }

  /** Coalesce mask work into one macrotask; never inside the current dispatch. */
  const scheduleMasks = () => {
    if (disposed || presetId === undefined || maskTask !== undefined) return
    maskTask = setTimeout(flushMasks, 0)
  }

  ctx.on('agent/created', ({ agent }) => {
    if (!belongs(agent)) return
    installPersona(agent)
    scheduleMasks()
  })
  // A disposed agent needs no persona, and must not stay in either map.
  ctx.on('agent/disposed', ({ agent }) => {
    liftPersona(agent)
    // The restriction is registered on the agent's own fiber, so that fiber's
    // disposal removes it. Forget the entry without emitting `tools/change` in
    // the disposal window.
    masks.delete(agent)
  })
  // Disposing THIS row (HMR, a re-mounted revision, a removed patch) lifts what
  // it installed, so no agent keeps a persona or a catalog mask no live plugin
  // owns. The guard disposes itself with the standing scope it was installed on.
  ctx.effect(() => () => {
    disposed = true
    if (maskTask !== undefined) {
      clearTimeout(maskTask)
      maskTask = undefined
    }
    for (const agent of [...personas.keys()]) liftPersona(agent)
    for (const agent of [...masks.keys()]) liftMask(agent)
  })

  if (presetId === undefined) return

  /**
   * Dress every live agent of this preset that creation never announced to us,
   * LIFT the persona this plugin left on an agent that stopped composing it, and
   * re-reconcile the depth-0 catalog masks (deferred, see point 5).
   */
  const reconcile = () => {
    const agents = ctx.get('agents')
    const presets = ctx.get('agentPresets')
    if (agents === undefined || presets === undefined) return
    for (const agent of agents.list()) {
      if (belongs(agent)) installPersona(agent)
      else liftPersona(agent)
    }
    scheduleMasks()
  }
  // Covers the blank-session preset switch — in BOTH directions — a re-mounted
  // plugin revision, and any tool registration that changes what an install
  // would have kept.
  ctx.on('tools/change', reconcile)
  reconcile()
}
