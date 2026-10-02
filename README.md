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

The plugin is a **declarative preset bundle**: installing it adds five `@deepseek-ai/dsh-agent-preset` declaration rows to the profile through `dsh.bundle.patch` (one per preset, in `presets/<id>.patch.yml`). The declaration rows are registered with `@deepseek-ai/dsh-agent-preset-registry` and appear in the preset picker automatically. The plugin writes nothing to the user directory — no files are copied anywhere.

## Behavior Notes

**Declarative presets (DSH 0.1.7+):**
- Each preset is a `@deepseek-ai/dsh-agent-preset` row declared in a bundle patch; `config.plugins` holds the child plugin rows (tools, prompt sections, groups with `isolate` realms, and the plugin's inline `.mjs` plugins referenced as package subpath exports under `dsh-more-agent-presets/presets/<id>/`).
- Preset `id` values (`codex-coding-agent`, `iflow-coding-agent`, `iflow-cre-agent`, `pair-coding-agent`, `qwencode-coding-agent`) are unchanged from previous releases, so existing session selections keep working.
- The registry retains each declaration's composition for live sessions; editing a declaration affects subsequently created Agents.

**Multi-file patch, the bundle's own row, and the root entry artifact:**
- `dsh.bundle.patch` is an **ordered list** (`cordis.patch.yml` plus one `presets/<id>.patch.yml` per preset) — the array form DSH core supports. A host composes all six layers and, because this is a bundle, activation happens on the next start, not on hot mount.
- `cordis.patch.yml` declares the bundle's **own** loader row (`id`/`name`: `dsh-more-agent-presets`), and `index.mjs` is the no-op plugin behind it. That row is what makes the bundle visible in the running composition, and it is the shape every bundle uses for itself (`dshmarket` inserts `dsh-market` / `dshmarket`; `@deepseek-ai/dsh-web-app` inserts `web-runtime` / `@deepseek-ai/dsh-web-app`). Without it, `dshmarket`'s liveness check (`liveIncludes`) has nothing to match — the five preset rows are named `@deepseek-ai/dsh-agent-preset` — and the plugin manager reports *"已安装，重启后生效"* on every page load, restart or not, while the presets keep working.
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

Removing the bundle removes its patch layer, so the five preset declarations disappear from the profile. The preset `plugins` assets installed under the profile's node_modules are removed with the package. No `~/.dsh/.agent-presets` cleanup is needed on 0.1.7+ (see Behavior Notes if you are migrating from ≤1.4.x).

## License

MIT. Some preset compositions are derived from other open source projects (see NOTICE.md).

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests.
