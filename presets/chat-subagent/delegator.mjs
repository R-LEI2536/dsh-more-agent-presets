/**
 * chat-subagent — the two masks and the delegator persona.
 *
 * The preset's invariant: a TOP-LEVEL session may call exactly one tool,
 * `subagent`; the delegated subagent may call only the read-only names its
 * declaration lists. Nothing here can be expressed as one standing-scope
 * restriction, and this module exists because of that.
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
 * to call its single tool — and it can never be named by `restrict()` at all
 * (`:1111-1112`).
 */

import { personaTable, pickPersona, sessionModel } from '../shared/model-persona.mjs'

export const name = 'chat-subagent/delegator'

export const inject = ['tools', 'systemPrompt']

/** The only tool a top-level session of this preset may call. */
export const DELEGATOR_TOOLS = ['subagent']

/** PTC mode's model-direct transport (`packages/core/tools/src/ptc.ts:30`). */
export const RUN_CODE = 'run_code'

/**
 * The delegation half of a top-level session's persona, appended verbatim to the
 * per-model text this preset shares with `chat-agent`. It has to say all of this
 * because the picked text is the session's ENTIRE system prompt and the subagent
 * tool is its only capability: nothing else tells the model that the child is
 * blind to the conversation, and nothing else tells it that the child is
 * read-only. The capabilities it names are the SHIPPED default; a declaration
 * that widens `subagentTools` should revise this text with it.
 */
export const DELEGATION_NOTE = [
  'Your only tool is `subagent`. This session cannot read files, run commands, or edit anything by itself, and it must not delegate twice.',
  'When the user wants something read, listed, or investigated in the workspace, call `subagent` once with a complete, self-contained task description, then answer the user from the report it returns. The subagent does not see this conversation, so restate everything it needs: paths, names, and the exact question.',
  'The subagent works read-only: it can read files and images, list directories, and search with glob and grep, but it cannot modify anything, run a command, or reach the web. When a request needs one of those, say so plainly instead of pretending.',
  'When the user only wants to talk, just talk — do not delegate.',
].join('\n\n')

/** Reason the model reads when it names a tool a top-level session does not have. */
const DELEGATOR_DENIAL
  = 'This session is a delegator-only preset: `subagent` is the only tool. Describe the task to it instead of acting directly.'

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
 * A top-level session's whole system prompt: the per-model text from the table
 * `chat-agent` owns, plus the delegation note. One table, one note.
 * @param modelId - the model the session's next request will use.
 * @param table - the parsed table, already resolved by `personaTable()`.
 * @returns the complete prompt text.
 */
export function personaText(modelId, table) {
  const text = pickPersona(modelId, table)
  return text === '' ? DELEGATION_NOTE : `${text}\n\n${DELEGATION_NOTE}`
}

/**
 * Normalize the row's `config`. The declaration is the single source of the
 * subagent list, so this validates and de-duplicates it rather than supplying a
 * default that could silently disagree with the patch.
 * @param config - the row config, possibly absent on a hand-written patch.
 * @param warn - sink for one message per distinct problem.
 * @returns the preset identity and the subagent tool list.
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
  return { presetId, subagentTools }
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
  const warn = (message) => {
    if (warned.has(message)) return
    warned.add(message)
    ctx.get('logger')?.warn(`chat-subagent/delegator: ${message}`)
  }

  const { presetId, subagentTools } = normalizeConfig(config, warn)
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
        installRestriction(tools, DELEGATOR_TOOLS, warn)
        // The picked text is the session's ENTIRE prompt (a `complete` section
        // collapses the assembly) and no runtime-context block reaches it —
        // the two knobs `chat-agent` sets for the same reason.
        const systemPrompt = agent.ctx.systemPrompt
        systemPrompt.suppressRuntimeContext()
        const table = personaTable()
        // A function text is what makes the prompt follow the model the Session
        // selected for its NEXT request, not the one it was created with
        // (`shared/model-persona.mjs` has the measurement).
        const prompt = {
          name: 'deployment:persona-prefix',
          order: systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
          complete: true,
          text: context => personaText(sessionModel(ctx, context?.agent), table),
        }
        // `systemPrompt.section()` registers through the AGENT's context, so the
        // agent's own scope disposes this section with it.
        systemPrompt.section(prompt)
        return
      }
      installGuard(tools, subagentAllowed, SUBAGENT_DENIAL, warn)
      installRestriction(tools, subagentTools, warn)
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
