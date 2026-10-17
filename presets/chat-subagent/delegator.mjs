/**
 * chat-subagent — the two masks and the delegator persona.
 *
 * The preset's invariant: a TOP-LEVEL session may call exactly one tool that
 * ACTS, `subagent` — plus the read-only `list_subagent_models` that the
 * `modelSelectionSettings` opt-in registers (point 8). The delegated subagent
 * may call only the read-only names its declaration lists. Nothing here can be
 * expressed as one standing-scope restriction, and this module exists because
 * of that.
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
 *
 * (2) A restriction registered on ONE AGENT's own scope does not reach a
 * delegated child, because the child's scope parent is the standing scope, not
 * the parent Agent's scope (`standingMountFor()` matches the agent's
 * `scopeParentOf` against a mount key — `agent-preset-registry/src/mount.ts:119-127`).
 * `ToolRuntime.view()` reads a scope's own restrictions for the layer it
 * INHERITS and overlays its own registrations unfiltered
 * (`packages/core/tools/src/index.ts:1178-1209`), and `tools.restrict()` refuses
 * an unscoped caller with exactly this instruction: "deny the tool for the
 * intended agent instead" (`:1097-1100`). So the top-level mask is installed
 * per agent, at `agent/created`, and children stay unmasked by it.
 *
 * (3) `agent/created` is awaited by the creation transaction before the Agent is
 * announced (`packages/core/agent/src/index.ts:537-559`), so a mask registered
 * there is in place before the session's first request; a preset-scoped listener
 * receives descendant Agents too (shipped precedent: `dsh-tool-subagent`'s
 * standing `modelSelectionSettings` install path).
 *
 * (4) Creation is not the only way to arrive here. The Web UI can switch a
 * BLANK session's preset, which goes `agentPresets.select` → `recompose` →
 * `mount` + `emit('tools/change')` and emits NO `agent/created`
 * (`agent-preset-registry/src/index.ts:306-334`). `tools/change` reconciliation
 * covers that path, HMR re-mounts, and `agent/created` on resume.
 *
 * (5) `tools.restrict()` validates every name against the tools that agent can
 * inherit AT THAT MOMENT and throws on an unknown one (`:1114-1118`). The
 * subagent list deliberately contains two names this bundle does not own —
 * `read_image` (registered only while an attachment store is mounted,
 * `packages/fs/tool-fs/src/index.ts:67-72`) and `list_directory` (a third-party
 * profile row) — so `installRestriction()` probes each name with a throwaway
 * restriction, drops what the deployment does not have, and warns once per
 * name. A missing tool must cost that tool, never the delegation.
 *
 * (6) The guard closes the plane no restriction can reach: registrations in an
 * agent's OWN layer are exempt from its restrictions, and on a profile that
 * mounts `@deepseek-ai/dsh-experimental-agent-team-profile` those are nine Team
 * tools for every root agent (`roster.tryMembership()` fabricates a lead
 * membership; see `presets/chat-agent/no-tools.mjs` for the measurement). A
 * guard is monkey-proof: it runs after `tools/pre-execute` over the calling
 * agent's scope chain, so a name the model produces anyway is refused.
 *
 * (7) A mask registered on an AGENT's scope outlives the composition that asked
 * for it, so BOTH directions of a preset switch must be reconciled — not only
 * the arriving one. The switch in (4) leaves `agent.ctx` alive: what a previous
 * preset registered there is owned by that agent scope, and disposing the
 * previous revision's standing scope does not reach it. Shipped behaviour before
 * this rule: a session created on `chat-subagent` and then switched to a coding
 * preset kept the delegation guard, so the coding session answered
 * `list_subagent_models` with the delegator's refusal. `reconcile()` therefore
 * LIFTS the mask as soon as `composedPreset(agent.ctx)` stops naming this preset,
 * every install records its disposer for that, `agent/disposed` frees the entry,
 * and disposing this row lifts whatever it installed.
 *
 * (8) The two names the opt-in adds — `subagent` and `list_subagent_models` —
 * are registered in each Agent's OWN layer, not on this preset's standing plane
 * (`@deepseek-ai/dsh-tool-subagent` `src/index.ts:665-704`: the install runs
 * from the `agent/created` listener and, in its own words, "installs the sampled
 * tool definition in each Agent's own scope"). `restrict()` accepts only names a
 * scope can INHERIT (`packages/core/tools/src/index.ts:1194-1201`), so a NAMED
 * allow-list can no longer express the top-level mask: under the opt-in path
 * `restrict({ allow: ['subagent'] })` throws `names unknown global tool
 * "subagent"`, the probe drops the name, and the whole inherited surface would
 * stay in the catalog. The mask is therefore decided from the registry at
 * runtime — the probe in `installRestriction()` answers whether the delegation
 * tool is INHERITED (a `dsh-tool-subagent` older than the opt-in, where the
 * named list is right) or scope-local (the opt-in path, where the inherited
 * surface is sealed with `restrict({ allow: [] })` instead). Own-layer
 * registrations survive an empty allow-list by design (`:1202-1208`), so both
 * names stay visible and the guard is what refuses every other call.
 *
 * `run_code` is the PTC mode presentation transport, not a capability: the
 * model-direct call under `ptc` may only name it, while the nested dispatch it
 * performs is resolved through the same restriction-filtered view. The guard
 * therefore always allows it — denying it would leave a PTC-mode session unable
 * to call its single tool — and it can never be named by `restrict()` at all
 * (`:1111-1112`).
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
 * Install one agent's tool mask, dropping the names this deployment does not
 * have. `restrict()` answers "is this name inheritable by this agent right now?"
 * only by throwing, and the registry exposes no reader for that set, so each
 * name is probed with a throwaway allow-restriction that is disposed
 * immediately. What survives is installed as ONE `allow` list — an allow-list
 * excludes tools registered later, where a deny list would admit them
 * (`docs/subsystems/tools.md`).
 * @param tools - the agent's tools service, the scope the restriction lands on.
 * @param names - the names the agent is meant to keep.
 * @param warn - sink for one message per missing name.
 * @returns the names actually installed, and the disposer that lifts the list
 *   (`undefined` when the deployment has none of the names).
 */
export function installRestriction(tools, names, warn) {
  const kept = []
  for (const name of names) {
    try {
      const probe = tools.restrict({ allow: [name] })
      // The probe's restriction must not survive the question it answered.
      probe?.()
      kept.push(name)
    } catch {
      warn(`tool "${name}" is not registered in this deployment; it is left out of the mask`)
    }
  }
  return { kept, dispose: kept.length > 0 ? tools.restrict({ allow: kept }) : undefined }
}

/**
 * Seal the INHERITED surface when the delegation tool is not on it. The mask
 * cannot name that tool — under `modelSelectionSettings` it is registered in the
 * Agent's own layer, which no restriction reaches and none needs to (point 8) —
 * so an empty allow-list hides every inherited row (`presets/chat-agent/no-tools.mjs`
 * is the same one line) and the guard refuses whatever a model produces anyway.
 * @param tools - the agent's tools service, the scope the restriction lands on.
 * @param warn - sink for a registry without `restrict()`.
 * @returns the restriction's disposer, or `undefined` when it could not install.
 */
export function installInheritedSeal(tools, warn) {
  try {
    return tools.restrict({ allow: [] })
  } catch (error) {
    warn(`sealing the inherited tool surface failed: ${String(error)}`)
    return undefined
  }
}

/**
 * Install the monotonic denial that covers what a restriction cannot: names the
 * agent's OWN layer registers (Team tools on a profile that mounts the agent-team
 * bundle) and any name a model produces that is not in the allowed set.
 * @param tools - the agent's tools service.
 * @param allowed - the names the agent may call.
 * @param reason - the refusal text the model reads.
 * @param warn - sink for the build-without-guard degradation.
 * @returns the guard's disposer, or `undefined` on a build without `guard()`.
 */
export function installGuard(tools, allowed, reason, warn) {
  if (typeof tools.guard !== 'function') {
    // Declared floor is ^0.2.0-rc.1; a build without `guard()` must degrade
    // loudly instead of failing the session's creation (same rule as
    // `presets/chat-agent/no-tools.mjs`).
    warn('this DSH build has no tools.guard(); a tool registered in the agent scope stays callable')
    return undefined
  }
  return tools.guard((exec) => {
    const called = exec?.name
    if (typeof called !== 'string') return undefined
    if (called === RUN_CODE || allowed.has(called)) return undefined
    return reason
  })
}

/**
 * Read the row config and mask every agent that arrives in this preset.
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
  const handled = new WeakSet()
  /** agent → the disposers that lift the mask this plugin installed on it. */
  const masks = new Map()

  /**
   * Whether an agent composes this preset right now. An agent that joined no
   * preset resolves to `undefined` — a delegated child before its join, a
   * deployment composing no roster — and is treated as ours, because masking is
   * what this plugin exists for and `reconcile()` lifts a wrong guess. Only a
   * composition that names a DIFFERENT preset is refused, which is what keeps a
   * mask off a session this preset does not own.
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
   * Lift the mask one agent carries. What this plugin registers it registers on
   * the agent's OWN scope, which outlives the composition that asked for it
   * (header point 7), so every install has to be undoable and every installer
   * has to record how.
   * @param agent - the agent whose mask must go.
   * @param disposers - what to dispose; defaults to what `mask()` recorded.
   */
  const lift = (agent, disposers = masks.get(agent)) => {
    handled.delete(agent)
    masks.delete(agent)
    for (const dispose of disposers ?? []) {
      try {
        dispose()
      } catch (error) {
        warn(`lifting the mask of agent ${String(agent?.id)} failed: ${String(error)}`)
      }
    }
  }

  const mask = (agent) => {
    // Reserve before registering: `restrict()` notifies `tools/change`, which
    // re-enters the reconciliation below.
    if (handled.has(agent)) return
    handled.add(agent)
    /** Every install that can be undone, in install order. */
    const disposers = []
    const install = (disposer) => {
      if (typeof disposer === 'function') disposers.push(disposer)
    }
    try {
      const tools = agent.ctx.tools
      const depth = depthOf(agent)
      if (depth === 0) {
        // Guard first: every later step is an improvement, and a failure in one
        // of them must not leave the session unmasked.
        install(installGuard(tools, delegatorAllowed, DELEGATOR_DENIAL, warn))
        // Which restriction this mask needs depends on where the delegation tool
        // was registered, and only the registry knows: the probe is silent here
        // because "not inheritable" is the EXPECTED answer under the opt-in
        // (point 8), not a deployment defect.
        const probe = installRestriction(tools, [DELEGATOR_TOOL], () => {})
        if (probe.kept.length > 0) {
          // The tool is on the standing plane, so this build's
          // `dsh-tool-subagent` predates the opt-in and the named list is right.
          warn('`subagent` is registered on this preset\'s standing plane, so this DSH build does not implement `modelSelectionSettings`: delegating works, but a call cannot name the child\'s model')
          install(probe.dispose)
        } else {
          // Opt-in path: the names are scope-local, so seal the inherited surface.
          install(installInheritedSeal(tools, warn))
        }
        // The picked text is the session's ENTIRE prompt (a `complete` section
        // collapses the assembly) and no runtime-context block reaches it —
        // the two knobs `chat-agent` sets for the same reason.
        const systemPrompt = agent.ctx.systemPrompt
        install(systemPrompt.suppressRuntimeContext())
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
        // agent's own scope disposes this section with it — and `lift()` also
        // disposes it earlier, the moment the agent leaves this preset.
        install(systemPrompt.section(prompt))
      } else {
        install(installGuard(tools, subagentAllowed, SUBAGENT_DENIAL, warn))
        install(installRestriction(tools, subagentTools, warn).dispose)
        // Last, so a diagnostic can never sit between the child and its mask.
        info(`subagent ${String(agent?.id)} route ${childRoute(ctx, agent)}`)
      }
      masks.set(agent, disposers)
    } catch (error) {
      warn(`masking agent ${String(agent?.id)} failed: ${String(error)}`)
      // Half a mask is worse than none: undo what did land.
      lift(agent, disposers)
    }
  }

  ctx.on('agent/created', ({ agent }) => {
    if (belongs(agent)) mask(agent)
  })
  // A disposed agent needs no mask, and must not stay in the map.
  ctx.on('agent/disposed', ({ agent }) => lift(agent))
  // Disposing THIS row (HMR, a re-mounted revision, a removed patch) lifts what
  // it installed, so no agent keeps a mask no live plugin owns.
  ctx.effect(() => () => { for (const agent of [...masks.keys()]) lift(agent) })

  if (presetId === undefined) return

  /**
   * Mask every live agent of this preset that creation never announced to us,
   * and LIFT the mask this plugin left on an agent that stopped composing it.
   */
  const reconcile = () => {
    const agents = ctx.get('agents')
    const presets = ctx.get('agentPresets')
    if (agents === undefined || presets === undefined) return
    for (const agent of agents.list()) {
      if (belongs(agent)) mask(agent)
      else lift(agent)
    }
  }
  // Covers the blank-session preset switch — in BOTH directions — a re-mounted
  // plugin revision, and any tool registration that changes what an install
  // would have kept.
  ctx.on('tools/change', reconcile)
  reconcile()
}
