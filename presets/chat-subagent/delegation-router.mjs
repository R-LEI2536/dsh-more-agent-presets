/**
 * chat-subagent — the delegation tool row, resolved at runtime.
 *
 * The row this preset used to declare statically was
 * `@deepseek-ai/dsh-tool-subagent` with the official per-agent model-selection
 * flag on, which
 * moves both top-level tools into each Agent's OWN scope via per-agent
 * injection fibers (`tool-subagent/src/index.ts:665-683`). That path crashes on
 * overlapping plugin reloads — the per-agent registration state is keyed by
 * plugin instance, so a second live instance registers the same names on one
 * agent scope, the duplicate registration throws, and `mount()` never runs —
 * leaving sessions with NO delegation tool at all (CHANGELOG has the live
 * incident). This router replaces that row with a choice made at mount time:
 *
 * - `dsh-plugin-subagent-director` installed in the profile: mount it. Its
 *   `subagent` tool carries per-call `provider` / `model` / `reasoningEffort`
 *   args (camelCase), resolves call args > plugin default > inherit the parent,
 *   and constrains explicit routes to the Host
 *   `subagent-model-selection.allowedModels` list (an unauthorized explicit
 *   route errors with the available list; unauthorized defaults fall back to
 *   inheritance). One default role carries the child persona — the director
 *   has no row-level persona field — and no model binding, so delegations
 *   without explicit routes still inherit the parent.
 * - not installed: mount the official `@deepseek-ai/dsh-tool-subagent` WITHOUT
 *   the official per-agent model-selection flag. Single registration path, no
 *   per-agent fibers, and the child inherits the parent session's route — the
 *   preset degrades cleanly instead of failing.
 *
 * In BOTH branches the tool registers on THIS preset's standing plane (either
 * plugin's row fiber owns the registration), so `subagent` is an inherited,
 * restrictable name and the named allow-list in `delegator.mjs` applies
 * unchanged. Exactly one of the two plugins is mounted; the shared tool name
 * `subagent` makes them interchangeable for the mask and the guard.
 */

export const name = 'chat-subagent/delegation-router'

export const inject = []

/**
 * The child's persona, previously the row-level `persona` of the official
 * tool-subagent row. It shadows the deployment persona for children; the
 * read-only wording is the single source both branches share.
 */
const CHILD_PERSONA = `You are a delegated read-only subagent of a chat session. Work only through the tools
in your catalog, keep the investigation tight, and answer with a concise report the
delegating agent can act on: what you checked, what you found, and anything you could
not determine. You cannot modify files, run commands, or delegate further.`

/**
 * The one row config both branches accept; every field exists in either
 * schema (the director calls the transport `subagentProvider`, the official
 * package calls it `provider`, so that one key is spelled per branch below).
 */
const ROW_CONFIG = {
  toolName: 'subagent',
  backgroundMode: 'one-shot',
  enableRunInBackground: false,
  maxDepth: 1,
}

/** The official `@deepseek-ai/dsh-tool-subagent` fallback, model selection off. */
const OFFICIAL_CONFIG = { ...ROW_CONFIG, provider: 'spawn', persona: CHILD_PERSONA }

/** `dsh-plugin-subagent-director` with one persona-carrying default role. */
const DIRECTOR_CONFIG = {
  ...ROW_CONFIG,
  subagentProvider: 'spawn',
  roles: {
    'chat-subagent-child': {
      displayName: 'Chat child',
      description: 'The delegated read-only child of the chat-subagent preset.',
      persona: CHILD_PERSONA,
    },
  },
  defaultRole: 'chat-subagent-child',
}

/**
 * One plugin body out of an imported module namespace. The loader accepts a
 * function or an `{ apply }` object; npm packages may carry either directly or
 * behind a default export, so prefer `default` and fall back to the namespace
 * (mirrors the loader's own `unwrapExports`).
 * @param mod - the imported module namespace.
 * @returns a plugin body cordis can start, or undefined when neither shape fits.
 */
function unwrapPlugin(mod) {
  for (const candidate of [mod?.default, mod]) {
    if (typeof candidate === 'function') return candidate
    if (candidate !== undefined && candidate !== null && typeof candidate.apply === 'function') {
      return candidate
    }
  }
  return undefined
}

/**
 * Mount exactly one delegation tool implementation on this row's scope.
 * `ctx.plugin()` starts the imported plugin under this row's fiber: it
 * disposes with the row, and its config is validated by that plugin's own
 * schema — an invalid choice fails this row loudly instead of half-mounting.
 * The fallback branch accepts a missing `dsh-plugin-subagent-director` (that
 * is the documented degrade path); any OTHER import failure still mounts the
 * official tool but says so, and a branch config that fails the mounted
 * plugin's schema rejects this row loudly.
 * @param ctx - this row's preset context.
 */
export async function apply(ctx) {
  const label = 'chat-subagent/delegation-router'
  let flavor
  try {
    const mod = await import('dsh-plugin-subagent-director')
    await ctx.plugin(unwrapPlugin(mod), DIRECTOR_CONFIG)
    flavor = 'subagent-director: the `subagent` tool carries per-call provider/model/reasoningEffort, constrained to the authorized routes'
  } catch (error) {
    const reason = error?.code === 'ERR_MODULE_NOT_FOUND'
      ? 'not installed in this profile — the child inherits the parent session model'
      : `import failed (${String(error)}) — falling back to the official tool anyway`
    const mod = await import('@deepseek-ai/dsh-tool-subagent')
    await ctx.plugin(unwrapPlugin(mod), OFFICIAL_CONFIG)
    flavor = `official dsh-tool-subagent (dsh-plugin-subagent-director ${reason})`
  }
  ctx.logger.info(`${label}: delegation branch — ${flavor}`)
}
