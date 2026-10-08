# TODO

Future work tracked here. Items are recorded as discovered; revisit and resolve
or remove them once a decision lands.

## `codex-coding-agent` preset

- **Plan-mode prompt location is still wrong and needs adjustment.**
  - Current state: `presets/codex-coding-agent/codex-collab-mode.mjs`
    always emits the default-mode body via the `<collaboration_mode>` block,
    because `ctx.planMode` is unreachable from outside the `planning`
    group's isolate realm (see CHANGELOG 1.4.1 "planMode isolate-realm
    conflict"). The plan-mode body lives in `ref/codex-plan-mode.md` but is
    not currently served through this plugin.
  - Today, plan-mode content reaches the model only via `dsh-plan-mode`'s
    system-prompt section (under the `planning` group), which is a
    structural deviation from upstream Codex where `<collaboration_mode>`
    is a developer-role world-state block that swaps its full body per
    step via `WorldStateSection::render_diff`.
  - Open decision: implement the v1.4.4 plan proposed in
    `daily/2026-09-16/codex-permissions-plugin-architecture.md` —
    read plan state via
    `ctx.sessionProjections.stateOf(agent.session, 'plan')` from the
    host-level service (sidesteps isolate-realm), and swap the
    `<collaboration_mode>` body per admitted step (default ↔ plan).
    Diff-driven hash tracking already in place.
  - Side effects to revisit when this lands: DSH `dsh-plan-mode`'s
    `plan:policy` system-prompt section will coexist with the
    `<collaboration_mode>` user-role block in plan mode; the two will
    overlap in content, so confirm no functional conflict and decide
    whether `plan:policy` should be suppressed when plan mode is active.
  - Reference: `daily/2026-09-15/codex-preset-dsh.md` (Compatibility Blocks
    Reconsidered — DSH Has a `context()` API for input[] User-Role),
    `daily/2026-09-16/codex-permissions-plugin-architecture.md`
    (`<collaboration_mode>` Body Fix — Proposed (v1.4.4) section).