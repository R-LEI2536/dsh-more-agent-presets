/**
 * chat-subagent — the two masks and the delegator persona.
 *
 * The preset's invariant: a TOP-LEVEL session may call only the delegation tool
 * `subagent` and the route companion `list_subagent_models`; the delegated
 * subagent may call only the read-only names its declaration lists. Nothing here
 * can be expressed as one standing-scope restriction, and this module exists
 * because of that.
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
 * child's scope to the same standing scope. A standing `allow: ['subagent']`
 * would thus leave the child with one tool too, and a restriction can only
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
 * `run_code` is the PTC mode presentation transport, not a capability: the
 * model-direct call under `ptc` may only name it, while the nested dispatch it
 * performs is resolved through the same restriction-filtered view. The guard
 * therefore always allows it — denying it would leave a PTC-mode session unable
 * to call the tool it delegates with — and it can never be named by `restrict()` at all
 * (`:1111-1112`).
 *
 * (7) `modelSelectionSettings: true` moves both top-level tools into each
 * Agent's OWN scope (`tool-subagent/src/index.ts:608-611`, `:665-681`), where no
 * restriction reaches them: `restrict()` validates against inherited names only
 * (`packages/core/tools/src/index.ts:1194-1197,1114-1118`) and throws on a
 * scope-local one. The top-level mask is therefore an EMPTY allow-list, which
 * hides every inherited row and leaves the own layer alone (`:1204-1208`); the
 * GUARD, not the mask, is what holds the callable surface at those two names. A
 * delegated child joins the same composition and gets the same two
 * registrations in its own scope, so its named mask cannot hide them either —
 * its guard is what refuses both.
 */

import { readFileSync } from 'node:fs'

import { personaTable, pickPersona, sessionModel } from '../shared/model-persona.mjs'

export const name = 'chat-subagent/delegator'

export const inject = ['tools', 'systemPrompt']

/**
 * The tools a top-level session of this preset may CALL: the delegation tool,
 * plus the route companion that `modelSelectionSettings: true` mounts beside it
 * (`tool-subagent/src/index.ts:362`) so the model can discover the routes the
 * Host authorizes. Both are registered in the agent's OWN scope, which is why
 * the mask below cannot name them and the guard is what bounds the surface.
 */
export const DELEGATOR_TOOLS = ['subagent', 'list_subagent_models']

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
  = 'This session is a delegator-only preset: it delegates with `subagent` and can inspect child routes with `list_subagent_models`. Describe the task to `subagent` instead of acting directly.'

/** Reason the model reads when a read-only subagent names a tool it does not have. */
const SUBAGENT_DENIAL
  = 'This delegated subagent is read-only: it cannot run commands, write or edit files, or delegate further. State the limitation in your reply.'

/**
 * The agent's delegation depth, read the way `@deepseek-ai/dsh-subagent` reads it
 * (`packages/subagent/subagent/src/depth.ts:28-36`): the persisted header is the
 * monotone floor and the merge-extensible runtime field may only deepen it,
 * because a resumed child arrives with fresh options and counting it from zero
 * would let it delegate as if it were top-level.
 * @param agent - the created agent.
 * @returns its non-negative depth, zero for a top-level session.
 */
export function depthOf(agent) {
  const header = agent?.session?.header?.delegationDepth
  const runtime = agent?.options?.subagentDepth
  return Math.max(
    typeof header === 'number' && Number.isSafeInteger(header) ? header : 0,
    typeof runtime === 'number' && Number.isSafeInteger(runtime) ? runtime : 0,
  )
}

/**
 * The provider/model a delegated child was created with — the one line the
 * terminal says about a child's route. A child does not choose a route: it
 * INHERITS the parent's, resolved into its creation options
 * (`resolveChildAgentOptions()`, `packages/subagent/subagent/src/child-agent.ts:99-120`,
 * reached from `subagent-in-process-driver/src/index.ts:140`), and this preset
 * turns model selection off, so no call can override it. The model is read
 * through `sessionModel()` for the same reason the persona is: a child's own
 * Session selection wins where one exists, and `agent.options.model` is the
 * fallback rather than the answer.
 * @param ctx - the preset's context, for the optional projection read.
 * @param agent - the delegated child.
 * @returns `provider/model`, or whichever half the harness stated, or `unknown`.
 */
export function childRoute(ctx, agent) {
  const provider = agent?.options?.provider
  const model = sessionModel(ctx, agent)
  const halves = [provider, model].filter(half => typeof half === 'string' && half.trim() !== '')
  return halves.length === 0 ? 'unknown' : halves.join('/')
}

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
 * @returns the names actually installed.
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
  if (kept.length > 0) tools.restrict({ allow: kept })
  return kept
}

/**
 * Install the monotonic denial that covers what a restriction cannot: names the
 * agent's OWN layer registers (Team tools on a profile that mounts the agent-team
 * bundle) and any name a model produces that is not in the allowed set.
 * @param tools - the agent's tools service.
 * @param allowed - the names the agent may call.
 * @param reason - the refusal text the model reads.
 * @param warn - sink for the build-without-guard degradation.
 */
export function installGuard(tools, allowed, reason, warn) {
  if (typeof tools.guard !== 'function') {
    // Declared floor is ^0.2.0-rc.1; a build without `guard()` must degrade
    // loudly instead of failing the session's creation (same rule as
    // `presets/chat-agent/no-tools.mjs`).
    warn('this DSH build has no tools.guard(); a tool registered in the agent scope stays callable')
    return
  }
  tools.guard((exec) => {
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
  const subagentAllowed = new Set(subagentTools)
  const delegatorAllowed = new Set(DELEGATOR_TOOLS)
  const handled = new WeakSet()

  const mask = (agent) => {
    // Reserve before registering: `restrict()` notifies `tools/change`, which
    // re-enters the reconciliation below.
    if (handled.has(agent)) return
    handled.add(agent)
    try {
      const tools = agent.ctx.tools
      const depth = depthOf(agent)
      if (depth === 0) {
        // Guard first: every later step is an improvement, and a failure in one
        // of them must not leave the session unmasked.
        installGuard(tools, delegatorAllowed, DELEGATOR_DENIAL, warn)
        // An EMPTY allow-list, never a named one. `modelSelectionSettings: true`
        // makes the row register `subagent` and `list_subagent_models` in the
        // agent's OWN scope (`tool-subagent/src/index.ts:608-611`, `:665-681`),
        // and `restrict()` refuses a scope-local name — its own wording is
        // "unknown names, scope-local names ... fail", because the validation set
        // holds inherited names only (`core/tools/src/index.ts:1194-1197,1114-1118`).
        // A named list would throw on the first name, `installRestriction()` would
        // drop it and install nothing, and the mask would silently stop existing.
        // An empty list needs no name: it hides the whole inherited plane — every
        // row this preset mounts for the child — and leaves the agent's own layer
        // visible (`:1204-1208`), which is the delegation tool plus its companion.
        tools.restrict({ allow: [] })
        // The picked text is the session's ENTIRE prompt (a `complete` section
        // collapses the assembly) and no runtime-context block reaches it —
        // the two knobs `chat-agent` sets for the same reason.
        const systemPrompt = agent.ctx.systemPrompt
        systemPrompt.suppressRuntimeContext()
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
        // agent's own scope disposes this section with it.
        systemPrompt.section(prompt)
        return
      }
      installGuard(tools, subagentAllowed, SUBAGENT_DENIAL, warn)
      installRestriction(tools, subagentTools, warn)
      // Last, so a diagnostic can never sit between the child and its mask.
      info(`subagent ${String(agent?.id)} route ${childRoute(ctx, agent)}`)
    } catch (error) {
      warn(`masking agent ${String(agent?.id)} failed: ${String(error)}`)
    }
  }

  ctx.on('agent/created', ({ agent }) => mask(agent))

  if (presetId === undefined) return

  /** Mask every live agent of this preset that creation never announced to us. */
  const reconcile = () => {
    const agents = ctx.get('agents')
    if (agents === undefined) return
    const presets = ctx.get('agentPresets')
    for (const agent of agents.list()) {
      if (presets?.composedPreset(agent.ctx) === presetId) mask(agent)
    }
  }
  // Covers the blank-session preset switch, a re-mounted plugin revision, and
  // any tool registration that changes what an install would have kept.
  ctx.on('tools/change', reconcile)
  reconcile()
}
