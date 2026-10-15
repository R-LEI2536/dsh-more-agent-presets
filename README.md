# dsh-more-agent-presets

[中文文档](README.zh.md)

Multiple selectable Agent Presets for DeepSeek Harness.

The presets are adapted for DeepSeek Harness (DSH).

## Benefits

This plugin is particularly useful for:

**Non-DeepSeek or Older Models:**
- Improves performance for models that haven't been specifically adapted for DSH
- Enhances older models that lack DSH-specific adaptations

**Personal Preference:**
- Some users may prefer more interactive, discussion-based coding assistance over independent work

**Why It Helps:**
- DSH's default prompts are optimized for DeepSeek models
- Non-DeepSeek or older models may not perform optimally with default prompts
- These presets provide alternative interaction patterns suitable for different models

## Available Presets

### Qwen Code Coding Mode (`qwencode-coding-agent`)

A professional coding assistant emphasizing code standards and project conventions, using iterative workflows and CLI-friendly interaction style.

### IFlow Coding Mode (`iflow-coding-agent`)

An interactive CLI agent with dynamic environment awareness, automatic Git context injection, and structured task workflows. Features auto-detected platform information, security-first permissions handling, and CLI-optimized communication style.

### IFlow Creation Mode (`iflow-cre-agent`)

An enhanced mode for creating custom Agent presets. Includes all standard capabilities plus runtime inspection, plugin experimentation, and preset authoring guidance.

**Features:**
- DSH context information (Web UI URL, source root)
- Git repository awareness
- Custom prompt sections
- Skills for Cordis plugin development and composition editing

**Current Limitation:**
⚠️ Cordis Tool (`@deepseek-ai/dsh-tool-cordis`) is currently unavailable due to upstream issues. Dynamic Cordis plugin creation will be available after upstream fixes.

### Pair Coding Mode (`pair-coding-agent`)

A coding assistant that works alongside the user as a pair programmer: aligns direction before each move, discusses before non-trivial edits, and waits for confirmation rather than driving the task to completion on its own. 

### Codex Coding Mode (`codex-coding-agent`)

A port of the open-source Codex CLI agent prompt: it states what it is about to do before each tool call, reads the codebase before editing, and drives the task to completion on its own, following Codex's planning, validation, and final-answer formatting rules. Tool names are mapped to this harness's tools (`apply_patch` → `edit`/`write`, `update_plan` → `todo_write`, `request_user_input` → `ask_user_question`), and Codex's plan-mode protocol is preserved through `exit_plan_mode`. The three Codex `input[]` blocks — `<permissions instructions>`, `<collaboration_mode>`, and `<environment_context>` — are injected as user-role messages at the head of every admitted step via three DSH `agent/pre-step` plugins (`codex-permissions.mjs`, `codex-collab-mode.mjs`, `codex-environment.mjs`), with the live sandbox / approval policy and cwd / platform / shell / date resolved from the DSH runtime. Unlike the other presets here, this one keeps Codex's autonomous posture rather than a discussion-first one.

### General Chat Mode (`chat-agent`)

A pure-conversation assistant: it mounts no tool row, masks every **inherited** tool through a preset-plane `ctx.tools.restrict({ allow: [] })`, and refuses execution of anything registered in the agent's **own** scope through a `ctx.tools.guard(...)` — so it cannot act: no reading or writing files, no commands, no web search, no spawning a teammate. Two boundaries are deliberate and documented (`presets/chat-agent/no-tools.mjs` has the mechanism with source pointers). First, a preset-plane restriction covers the inherited surface only — the global layer plus every ancestor scope — while an agent's own registrations are exempt; a profile that mounts such a plugin, e.g. `@deepseek-ai/dsh-experimental-agent-team-profile` (whose nine Team tools go into `agent.ctx` for every root agent), therefore still **lists** them in that session's tool catalog, and the guard is what makes their call return a refusal instead of running. Second, that refusal is not the `unknown tool` a filtered tool produces. **The system prompt switches with the current model** (Default / Codex GPT-5 · GPT-6 / Qwen / DeepSeek-R1 / Gemini 3.7 · 3.8 texts; the verbatim table lives in `presets/shared/model-personas.json`), and the picked text is the session's **entire** prompt. Automatic (context pressure / overflow) compaction and the human `/compact` command stay on, because a chat session is long by nature. Use it when you want a conversation partner rather than an agent that acts on your machine.

### General Chat Mode with Delegation (`chat-subagent`)

A chat assistant whose whole capability is **one tool**: `subagent`. Nothing in the declaration masks the top-level session — a per-agent mask (`presets/chat-subagent/delegator.mjs`) installs itself at `agent/created` and again from `tools/change` reconciliation, registering `ctx.tools.restrict({ allow: ['subagent'] })` **on the agent's own scope** plus the same `ctx.tools.guard(...)` refusal `chat-agent` uses. The session therefore lists exactly one tool and cannot act directly; it calls `subagent` once and answers the user from the report. (The one boundary that survives is the own-plane Team-tool residual noted below.) The single call is foreground (`enableRunInBackground: false` removes the background parameter from the schema entirely) on the `spawn` provider, with `maxDepth: 1` stating the recursion budget.

**The delegated subagent is what actually works, and it works read-only.** The mask cannot be a preset-plane restriction, and that is the whole point of the plugin: a delegated child **joins its parent's preset**, so a standing mask would leave the child with one tool too and the delegation would accomplish nothing; a restriction can only narrow, so the child's own `toolFilter` could not undo it. The agent-scope mask is what keeps the child unmasked, and the child is then bounded by the declaration's `subagentTools` list — by default `read`, `glob`, `grep`, `read_image`, `list_directory`, `todo_write`, `job_list`. There is no `bash`, `write`, or `edit`: the subagent investigates and reports, and cannot run commands, run tests, or change files (`TODO.md` tracks the writable follow-up). Two of those names are deployment-dependent — `read_image` exists only while an attachment store is mounted, and `list_directory` comes from a third-party profile plugin — so the plugin probes every name and drops the ones this deployment does not have, with one warning per name, instead of failing every delegation.

**The system prompt switches with the current model.** It is the shared table (`presets/shared/model-personas.json`, read through `presets/shared/model-persona.mjs`, which `chat-agent` mounts as its own prompt) plus a delegation note, and together they are the session's **entire** prompt. Automatic (pressure / overflow) compaction, the human `/compact` command, and tool-result pruning stay on: the child greps repositories, so its tool results need pruning even though the top-level session produces none.

**Changing the subagent's tool list** means overriding the declaration by its Loader row id in a profile patch. `config` is replaced wholesale, so every row must be restated, and only names this preset's own rows actually register can be listed — `tools.restrict()` refuses an unknown name:

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml (abridged: restate every row)
- id: preset-chat-subagent
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: chat-subagent
    order: 16
    name: "通用聊天模式 · 可派活"
    description: "只调用 subagent 一个工具：把任务交给只读子 agent 去查、去读，自己专注对话。"
    plugins:
      - id: delegator
        name: 'dsh-more-agent-presets/presets/chat-subagent/delegator.mjs'
        config:
          presetId: chat-subagent
          subagentTools: [read, glob, grep, todo_write]
      # …every remaining row of the shipped declaration, unchanged…
```

Widening that list does not rewrite the delegation note: it lives in `presets/chat-subagent/delegator.mjs` and describes the shipped read-only default, so revise it there when the child's abilities change. (The note is not a second copy of the list — it names no tool — but it does state what the subagent cannot do.)

One boundary is inherited from `chat-agent` and stays: a profile that mounts the agent-team bundle still **lists** its nine Team tools for the top-level session, because an agent's own registrations are exempt from any restriction; the guard is what makes their call return a refusal instead of running. And `job_list` is inert for the subagent — it cannot start a job — but it is part of the default list so that the writable follow-up needs no second edit.

## Design Philosophy

These presets differ from the default DSH prompt in their approach to user interaction and planning:

**Interaction Style:**

- Default DSH: Works independently with minimal user interaction
- Qwen/IFlow/Pair: Actively discusses with users, maintaining communication throughout

**Plan Mode:**

- Default DSH: Static approval process — AI produces a complete plan document, then waits for user approval
- Qwen/IFlow/Pair: Dynamic collaboration — AI iterates with the user through multiple rounds, refining the plan step by step

## Known Limitations

**Preset display text does not follow the Web UI locale.** The `name` and `description` for every preset shipped by this plugin are read from each preset's declaration and rendered verbatim by the Web UI, regardless of which UI language is selected. Only the presets shipped with DeepSeek Harness itself (`standard`, `ptc`, `minimal`, `cordis`) are localized through the harness's i18n system; community-shipped presets, including every preset in this plugin, are not. Switching the Web UI from Chinese to English will leave these presets' display text in Chinese.

This is a limitation of how the harness consumes preset metadata, not of this plugin. As of this writing the harness exposes no mechanism for plugins to register localized strings for their own presets.

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or newer**. This release is a declarative preset bundle (the pre-0.1.7 `.agent-presets` directory installer no longer exists). A host on 0.1.7-rc.x skips the whole bundle through the peer compatibility gate, so update the host first.

## Install

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-more-agent-presets
```

Restart the Web profile, then select the preset when creating a session.

The plugin is a **declarative preset bundle**: installing it adds seven `@deepseek-ai/dsh-agent-preset` declaration rows to the profile through `dsh.bundle.patch` (one per preset, in `presets/<id>.patch.yml`). The declaration rows are registered with `@deepseek-ai/dsh-agent-preset-registry` and appear in the preset picker automatically. The plugin writes nothing to the user directory — no files are copied anywhere.

## Behavior Notes

**Declarative presets (DSH 0.1.7+):**
- Each preset is a `@deepseek-ai/dsh-agent-preset` row declared in a bundle patch; `config.plugins` holds the child plugin rows (tools, prompt sections, groups with `isolate` realms, and the plugin's inline `.mjs` plugins referenced as package subpath exports under `dsh-more-agent-presets/presets/<id>/`, with assets shared by more than one preset under `dsh-more-agent-presets/presets/shared/`).
- Preset `id` values (`chat-agent`, `chat-subagent`, `codex-coding-agent`, `iflow-coding-agent`, `iflow-cre-agent`, `pair-coding-agent`, `qwencode-coding-agent`) are unchanged from previous releases, so existing session selections keep working. `chat-subagent` is the one row this bundle adds, and it is a new preset rather than a change to `chat-agent`.
- The registry retains each declaration's composition for live sessions; editing a declaration affects subsequently created Agents.

**Multi-file patch, the bundle's own row, and the root entry artifact:**
- `dsh.bundle.patch` is an **ordered list** (`cordis.patch.yml` plus one `presets/<id>.patch.yml` per preset) — the array form DSH core supports. A host composes all eight layers and, because this is a bundle, activation happens on the next start, not on hot mount.
- `cordis.patch.yml` declares the bundle's **own** loader row (`id`/`name`: `dsh-more-agent-presets`), and `index.mjs` is the no-op plugin behind it. That row is what makes the bundle visible in the running composition, and it is the shape every bundle uses for itself (`dshmarket` inserts `dsh-market` / `dshmarket`; `@deepseek-ai/dsh-web-app` inserts `web-runtime` / `@deepseek-ai/dsh-web-app`). Without it, `dshmarket`'s liveness check (`liveIncludes`) has nothing to match — the seven preset rows are named `@deepseek-ai/dsh-agent-preset` — and the plugin manager reports *"已安装，重启后生效"* on every page load, restart or not, while the presets keep working.
- Some third-party tooling only understands the string form of `dsh.bundle.patch`, and judges an installed build by its declared root entry artifact. `index.mjs` — declared through `main` and `exports["."]` and shipped via `files` — exists so that check sees a real artifact and so the row above has a plugin behind it.
- **Do not remove the self row, `index.mjs`, `main`, or `exports["."]`.** Without them the plugin manager reports the plugin as broken (*"已安装，校验未通过 / the declared entry artifact is missing"*), refuses to install or update it (*"updated build has no loadable entry"*), or shows it as permanently pending a restart — even though DSH itself loads the bundle correctly.

**Migration from ≤1.4.x:**
- Versions ≤1.4.4 copied preset directories into `$DSH_HOME/.agent-presets` (normally `~/.dsh/.agent-presets`) with a `.dsh-preset-owner.json` marker. DSH 0.1.7 no longer reads that directory, and this plugin no longer writes it.
- After upgrading, the old copied directories are inert leftovers. Remove them manually if you want a clean slate:
  ```bash
  rm -rf ~/.dsh/.agent-presets
  ```
  (Only your own `~/.dsh/.agent-presets`; nothing from another plugin or hand-authored presets should live there in the new mechanism, since presets are profile patches now.)

## Remove

```bash
dsh plugin --profile web remove dsh-more-agent-presets
```

Removing the bundle removes its patch layer, so the seven preset declarations disappear from the profile. The preset `plugins` assets installed under the profile's node_modules are removed with the package. No `~/.dsh/.agent-presets` cleanup is needed on 0.1.7+ (see Behavior Notes if you are migrating from ≤1.4.x).

## License

MIT. Some preset compositions are derived from other open source projects (see NOTICE.md).

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests.
