# Changelog

All notable changes to this project are documented in this file.

## [1.4.1] - 2026-09-16

### Fixed
- `codex-coding-agent`: switching to the Codex preset from the picker silently fell back to the default preset (the selection did not stick). Three issues were causing it; the picker revert and the per-turn `cannot get property "planMode" without inject` crash are all symptoms of the same new agent/pre-step plugin set:
  - `codex-collab-mode.mjs` was reading `ref/codex-default-mode.md` and `ref/codex-plan-mode.md` at module-load time with top-level `readFileSync` calls. If the installed location did not have the `ref/` directory next to the plugin file, the dynamic import threw ENOENT before `apply()` ever ran, the plugin failed to mount, and the preset composition rejected. The read now happens lazily inside `apply()` with an ENOENT fallback to an empty string + a `console.warn`, so the plugin imports cleanly even if the `ref/` files are absent. `ref/` remains the canonical source when present.
  - `codex-permissions.mjs` declared `inject: ['systemPrompt', 'agents']` but used `ctx.sandboxPolicy` and `ctx.approval` (both undeclared). Added `'sandboxPolicy'` and `'approval'` to the `inject` array.
  - `codex-collab-mode.mjs` declared `inject: ['systemPrompt', 'planMode', 'agents']`. `agent.cordis.yml` mounts `@deepseek-ai/dsh-plan-mode` inside the `planning` group with `isolate: { planMode: true }`, which scopes the service to that group's entry-local realm — a consumer outside the group cannot reach it (Cordis skill doc, "The rule that catches people"). Mount-validation rejects the row as "did not activate: waiting for planMode" and the whole preset composition fails. Even after dropping `'planMode'` from `inject`, touching `ctx.planMode` at runtime throws `cannot get property "planMode" without inject` at property-access time, which no try/catch can intercept. So the plugin must never read `ctx.planMode`: it now unconditionally emits the default-mode body on every step. The plan-mode body still lives at `ref/codex-plan-mode.md` (read lazily at apply time) so a future DSH release that exposes `planMode` on the outer ctx can resume the swap by adding `planMode` back to `inject` and reading it. Plan-mode messaging on the model side continues to come from `dsh-plan-mode`'s section under the `planning` group, which renders the same upstream `plan.md` content as a system-prompt section.

## [1.4.0] - 2026-09-15

### Added
- New preset `codex-coding-agent` (Codex 编程模式) — a port of the open-source Codex CLI agent prompt. Two layers of the upstream model context are now reproduced in DSH:
  - **System-prompt instructions (the `instructions` field of Codex's input[])**: 10 sections ported from `codex-rs/models-manager/prompt.md` (Codex's `BASE_INSTRUCTIONS`) and assembled in upstream order — identity and capabilities, the AGENTS.md spec, preamble messages, planning, task execution, validation, ambition vs. precision, progress updates, the final-answer formatting rules, and finally `# Tool Guidelines / ## Shell commands / ## todo_write`. `codex-identity` opens with the personality line `LOCAL_PRAGMATIC_TEMPLATE` from `codex-rs/models-manager/src/model_info.rs:21`, so the rendered prompt matches upstream Codex with `personality=Pragmatic`.
  - **Per-step input[] user-role messages (the messages Codex appends before the user prompt each turn)**: three new DSH `agent/pre-step` plugins inject the upstream `input[]` blocks at the head of every admitted step:
    - `codex-permissions.mjs` → `<permissions instructions>...</permissions instructions>` block, containing the live sandbox policy (`ctx.sandboxPolicy.resolve({ session })`) and approval policy (`ctx.approval.overrideOf(session) ?? ctx.approval.config.policy ?? 'ask'`);
    - `codex-collab-mode.mjs` → `<collaboration_mode>...</collaboration_mode>` block, body swapped between `ref/codex-default-mode.md` (port of `codex-rs/collaboration-mode-templates/templates/default.md`) and `ref/codex-plan-mode.md` (port of `plan.md`) depending on `ctx.planMode.get(agent).active`;
    - `codex-environment.mjs` → `<environment_context>...</environment_context>` block with the live cwd, shell, platform, OS version, and today's date.
  - `codex-permissions.mjs` calls `ctx.systemPrompt.suppressRuntimeContext()` to silence DSH's native `sandbox:policy` and `approval:policy` contexts so the Codex `<permissions instructions>` block is the only model-visible permissions text.

### Changed (deliberate deviations from the upstream text)
- Tool names mapped to this harness's tools: `apply_patch` → `edit`/`write`, `update_plan` → `todo_write`, `rg`/`rg --files` → `grep`/`glob`, the shell → the `{{shell_tool}}` tool, `request_user_input` → `ask_user_question`, `<proposed_plan>` → `exit_plan_mode`.
- Codex-only sentences dropped: the never/untrusted/on-request approval paragraph (this harness's approval model differs from Codex's).
- DSH-only paragraphs with no upstream counterpart are shadowed by `suppress-harness-info.mjs` (harness identity / source / web-surface). The `Tokens prefixed with @…` file-reference note from `dsh-file-reference-local` is NOT suppressed — instead the Codex body sections are reordered into the 700-709 band so they render BEFORE it. Each mounted DSH tool still emits its own `tool:<name>` prompt section — that prose is left intact, matching the other coding presets in this plugin; the preset header comment explains why.
- Plan mode: upstream's `<proposed_plan>` block protocol rewritten to the `exit_plan_mode` contract; "Plan Mode until a developer message ends it" rewritten to "until `exit_plan_mode` succeeds or the user switches the session mode"; upstream's claim that the plan tool errors inside plan mode dropped (this harness does not reject `todo_write` in plan mode). The safeguards the `standard` preset carries (tool-catalog stability across modes, "do not use todo_write here", the review-channel-unavailable path, "exit_plan_mode must be the only and final call") are not repeated, except where upstream states the same rule.
- `tool-todo` uses `allowParallelInProgress: false` because upstream `update_plan` keeps exactly one step `in_progress` — unlike the other presets in this plugin, which allow parallel active todos.
- Codex's personality variants (friendly / pragmatic) and its multi-agent guidance are kept as commented candidate sections rather than active prompt text.

### Known limitations (DSH platform constraints)
- **Input[] role degradation**: upstream Codex uses `role: 'developer'` for the `<permissions instructions>` and `<collaboration_mode>` blocks. DSH currently only supports `role: 'system' | 'user' | 'assistant'` (see `packages/llm/llm/src/message.ts:131-135`), so `codex-permissions.mjs` and `codex-collab-mode.mjs` degrade to `user`-role. Each of the three new `.mjs` files carries an `UPGRADE NOTE` at the top of its source explaining the migration: swap `createUserMessage` for a developer-role factory when DSH adds one. `codex-environment.mjs` is already at parity (upstream `<environment_context>` is `user`-role).
- **No DSH wrapper**: unlike the DSH-native `systemPrompt.context()` path (which forces a `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.` prefix and a flat join), the `agent/pre-step` listener approach injects the three Codex blocks as raw `user/message` events with verbatim `<permissions instructions>`, `<collaboration_mode>`, and `<environment_context>` markers — no wrapper, no nesting.
- **DSH sandbox/approval not double-rendered**: `codex-permissions.mjs` calls `ctx.systemPrompt.suppressRuntimeContext()` to silence the DSH-native `sandbox:policy` and `approval:policy` contexts. This is an all-or-nothing suppressor, but only `ctx.systemPrompt.context()` registrations fall to it; harness sections (`harness:source`, `app:web-surface`, persona suffix) and the `time-context` package's `agent/pre-step` listener are unaffected.

### Fixed
- Initial-review fidelity pass against the upstream text:
  - the AGENTS.md spec paragraph uses upstream's wording ("contents of the AGENTS.md file at the root of the repo and any directories from the CWD up to the root… included with the developer message") instead of a rephrased DSH-equivalent;
  - all 10 Codex body sections live in the 700-709 band and follow upstream `prompt.md` order, so the BASE_INSTRUCTIONS content ends with `# Tool Guidelines / ## Shell commands / ## todo_write` (where upstream puts it at lines 258-275);
  - `codex-identity` opens with the "You are a deeply pragmatic, effective software engineer." line so it matches the upstream `instructions` field rendered with `personality=Pragmatic` on a `gpt-5.2-codex` model — i.e. substituting `LOCAL_PRAGMATIC_TEMPLATE` from `codex-rs/models-manager/src/model_info.rs:21` into the `{{ personality }}` placeholder, between `DEFAULT_PERSONALITY_HEADER` (replaced by the persona row) and `BASE_INSTRUCTIONS` (`prompt.md`). Drop that line to match the friendly default; uncomment the `codex-personality` candidate below for the full multi-section personality template from `codex-rs/core/templates/personalities/`.
- Second-pass fidelity pass against upstream Codex `input[]`:
  - `<permissions instructions>`, `<collaboration_mode>`, and `<environment_context>` are now real user-role `user/message` events at the head of every admitted step, replacing the earlier "compatibility block as system-prompt section" approach (which left all three under DSH's `Current runtime context...` wrapper and split sandbox+approval across two contexts);
  - the plan-mode body is extracted to `ref/codex-plan-mode.md` so `codex-collab-mode.mjs` and the `planning` group section share a single source of truth;
  - DSH's `sandbox:policy` and `approval:policy` runtime contexts are suppressed so the Codex `<permissions instructions>` block is the only permissions text the model sees.

## [1.3.4] - 2026-09-12

### Changed
- `pair-coding-agent/agent.cordis.yml`: add three step-by-step code style preferences ("write code in explicit ordered steps", "keep the code understandable line by line", "follow framework and project conventions first"), and move the existing math/code-execution and system-reminder rules above the security guidance so they apply before any code-writing step. No change to the rendered persona text or section ordering from 1.3.0/1.3.3.

## [1.3.3] - 2026-09-11

### Fixed
- All four presets (`pair-coding-agent`, `iflow-coding-agent`, `qwencode-coding-agent`, `iflow-cre-agent`): rename the `@deepseek-ai/dsh-persona` config field `text:` → `prefix:` to satisfy the schema introduced in DSH 0.1.5-rc.1, where `prefix` is required and `text` is no longer recognised. Without the rename, schemastery fails the required-field check on preset mount and the preset refuses to load. No semantic change to the rendered persona text; section ordering and freeze rules from 1.3.0/1.3.2 are unchanged.

## [1.3.2] - 2026-09-04

### Fixed
- `iflow-cre-agent`: bump prompt section orders out of DSH's tool band (1000–2900) to fix prompt section ordering under DSH 0.1.2.rc1. Identity / harness / task / tool-usage-policy sections now render at 980–999 (after `FILE_REFERENCE` 900), and content rules / env-info now render at 3000–3011 (after `TOOL_REPORT` 2900). This is the same fix 1.3.1 applied to `iflow-coding-agent` and `qwencode-coding-agent`; the `cordis`-flavored preset was missed at the time and now follows the same bands.

## [1.3.1] - 2026-09-03

### Fixed
- `pair-coding-agent`, `iflow-coding-agent`, `qwencode-coding-agent`: bump preset section orders out of DSH's tool band (1000–2900) to fix prompt section ordering under DSH 0.1.2.rc1. Identity / task / tool-usage-policy sections now render at 980–999 (after `FILE_REFERENCE` 900), and content rules / git-aware-prompt now render at 3000–3011 (after `TOOL_REPORT` 2900). The freeze declared in 1.3.0 applies to new features; this is a bug fix applied to the two presets that share the same DSH dependency.

## [1.3.0] - 2026-08-25

### Added
- New preset `pair-coding-agent` (协作编程模式) — a coding assistant that works alongside the user as a pair programmer. This preset is the ongoing iteration target for prompt refinements in this plugin; `iflow-coding-agent` and `qwencode-coding-agent` are frozen and will not receive further updates.

### Changed (instruction-echo mitigation)
Three prompt rules in `pair-coding-agent/agent.cordis.yml` were rewritten to positive framing to avoid instruction echo — the tendency of "do not X" rules to prime the model toward X by repeatedly naming the unwanted behavior:
- **User-rejection rule**: now reads "respond with the motivation, ask why, wait for the next instruction" instead of "do not silently retry / push back / propose workaround".
- **Prefer Dedicated Tools**: now reads "pick the dedicated tool when one fits" instead of "do NOT use the shell tool when a dedicated tool is provided".
- **Reserve shell tool**: now reads "reach for shell when the task genuinely needs it" instead of "reserve shell exclusively / fallback only when absolutely necessary".

The persona was also changed from `iFLOW Edo Tensei` to `DeepSeek Harness` to remove an upstream-named identity that no longer matched the harness this plugin ships against.