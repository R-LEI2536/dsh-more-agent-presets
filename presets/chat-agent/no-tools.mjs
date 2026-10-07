/**
 * chat-agent — hide every tool this preset's agents can reach.
 *
 * TWO calls, because the tool registry has two planes and only one of them is
 * filterable from a preset.
 *
 * (1) `ctx.tools.restrict({ allow: [] })` — the INHERITED surface. A row inside
 * a preset's `config.plugins` mounts in the STANDING SCOPE the preset registry
 * creates for the revision (`@deepseek-ai/dsh-agent-preset-registry`, `activate`
 * → `createScope` + `mountPreset`), and every Agent selecting the preset is
 * parented to that same scope (`bindScopeParent(agentKey, standingKey)`). A
 * restriction registered here sits on each selecting Agent's OWN scope chain,
 * and `ToolRuntime.view()` intersects the restrictions of every layer on the
 * chain (`packages/core/tools/src/index.ts:1198-1200`) — an ancestor's
 * restriction reaches every scope nested inside it (`tests/scoped.spec.ts`
 * "lets an ancestor's restriction reach every scope nested inside it"). Other
 * presets keep the full host surface.
 *
 * `allow: []` rather than a `deny` list, deliberately:
 *
 *  - it needs no knowledge of which tools another bundle happens to mount
 *    (the host-plane rows on a profile — a directory lister, a memory search,
 *    `cordis_inspect_*`, `plugin_manager` — are not owned by this bundle);
 *  - an allow-list also excludes tools registered AFTER this call, where a
 *    deny-list admits every later unlisted inherited tool
 *    (`docs/subsystems/tools.md`: "A deny-only filter admits later unlisted
 *    inherited tools, while an allow-list excludes them").
 *
 * (2) `ctx.tools.guard(...)` — the Agent's OWN registrations, which no
 * restriction can reach, from any scope. `view()` builds the inherited map by
 * SKIPPING the own layer (`packages/core/tools/src/index.ts:1187-1191`) and
 * then overlays that layer's registrations without filtering them
 * (`:1202-1209`); its doc comment states the rule plainly — "A restriction
 * filters what a scope inherits … and never what its OWN layer registers"
 * (`:1163-1174`). The exemption exists so a delegated child keeps the
 * structured-output tool it answers through. The shipped case is Team tools:
 * `tool-agent-team` registers them into `agent.ctx`
 * (`packages/experimental/tool-agent-team/src/index.ts:164-167`) — and not only
 * for an actual member, because `roster.tryMembership()` fabricates a lead
 * membership for ANY ordinary root agent
 * (`packages/experimental/agent-team/src/roster.ts:107,115`). So on a profile
 * that mounts `@deepseek-ai/dsh-experimental-agent-team-profile` every chat
 * session's agent is a one-man Team holding all nine Team tools. Measured live
 * in 1.6.1: a `chat-agent` session on the `web` profile reported
 * `toolsTokens 1209` with `agentTeam.members: []`, and its trajectory Tools tab
 * listed exactly those nine tools.
 *
 * The guard closes that plane at EXECUTION: a monotonic denial is evaluated for
 * the calling agent's whole scope chain after `tools/pre-execute`
 * (`docs/subsystems/tools.md` "guard"; installed build
 * `@deepseek-ai/dsh-tools@0.2.0-rc.2` `lib/index.js:2915-2936`, global then
 * `chainLayers(exec.agent)`), so a name the model produces anyway is refused
 * instead of run.
 *
 * RESIDUAL, deliberate and documented in README / CONTEXT.md / CHANGELOG 1.6.1:
 * the guard hides nothing. An agent-own tool still appears in the request's tool
 * catalog and in the Tools tab, and its call returns this refusal rather than
 * the `unknown tool` an actually-filtered tool produces. Hiding the catalog too
 * needs an own-sealing restriction in DSH — `ToolRestriction` is `allow`/`deny`
 * over inherited global names only (`docs/subsystems/tools.md:163-178`) — which
 * this bundle cannot ship on its own.
 *
 * Plane 1 alone keeps the original invariant: a filtered-away tool is absent
 * from the prompt AND refuses execution, indistinguishably from a nonexistent
 * one, because one registry view feeds presentation, lookup, and execution.
 * `restrict({ allow: [] })` is legal in DSH 0.2.0 (only `{}` is rejected as a
 * no-op); if upstream later rejects an empty allow-list, switch to an explicit
 * `deny` list.
 */

export const name = 'chat-agent/no-tools'

export const inject = ['tools']

/** Reason the model reads when it names a tool the agent scope still registers. */
const NO_TOOLS_REASON = 'This session is a conversation-only preset: no tool is available. Answer in text.'

export function apply(ctx) {
  // Plane 1 — the inherited surface (global layer plus every ancestor scope).
  // The disposer is owned by the preset's standing scope: disposing the
  // revision lifts the mask with it.
  ctx.tools.restrict({ allow: [] })

  // Plane 2 — the agent's own registrations, which the restriction above cannot
  // reach (see the header). Optional API: the declared floor is
  // `^0.2.0-rc.1`, so a build without `guard()` must degrade loudly rather than
  // fail the preset composition.
  if (typeof ctx.tools.guard !== 'function') {
    ctx.get('logger')?.warn(
      'chat-agent/no-tools: this DSH build has no tools.guard(); a tool registered in the agent scope stays callable (see CHANGELOG 1.6.1)',
    )
    return
  }
  ctx.tools.guard(() => NO_TOOLS_REASON)
}
