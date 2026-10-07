/**
 * chat-agent — hide every tool this preset's agents inherit.
 *
 * A row inside a preset's `config.plugins` mounts in the STANDING SCOPE the
 * preset registry creates for the revision
 * (`@deepseek-ai/dsh-agent-preset-registry`, `activate` → `createScope` +
 * `mountPreset`), and every Agent selecting the preset is parented to that same
 * scope (`bindScopeParent(agentKey, standingKey)`). A restriction registered
 * here sits on each selecting Agent's OWN scope chain, and `ToolRuntime.view()`
 * intersects the restrictions of every layer on the chain
 * (`packages/core/tools/src/index.ts:1200`) — an ancestor's restriction reaches
 * every scope nested inside it (`tests/scoped.spec.ts` "lets an ancestor's
 * restriction reach every scope nested inside it"). Other presets keep the full
 * host surface.
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
 * Only the INHERITED surface is masked: the deployment-global layer plus every
 * ancestor scope. A scope's own registrations are never filtered by its own
 * restriction (the exemption exists so a delegated child keeps the tools it
 * answers through). The shipped case is Team tools: `tool-agent-team` registers
 * them in `agent.ctx`, and only for an Agent that is a team member. A plain
 * chat session has no such registration, so its catalog is truly empty.
 *
 * A filtered-away tool is absent from the prompt AND refuses execution,
 * indistinguishably from a nonexistent one, because one registry view feeds
 * presentation, lookup, and execution.
 *
 * `restrict({ allow: [] })` is legal in DSH 0.2.0 (only `{}` is rejected as a
 * no-op); if upstream later rejects an empty allow-list, switch to an explicit
 * `deny` list.
 */

export const name = 'chat-agent/no-tools'

export const inject = ['tools']

export function apply(ctx) {
  // The disposer is owned by the preset's standing scope: disposing the
  // revision lifts the mask with it. Nothing else in this preset registers a
  // tool, so the agent's tool surface really is empty.
  ctx.tools.restrict({ allow: [] })
}