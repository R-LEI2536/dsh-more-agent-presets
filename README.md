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

## Design Philosophy

These presets differ from the default DSH prompt in their approach to user interaction and planning:

**Interaction Style:**

- Default DSH: Works independently with minimal user interaction
- Qwen/IFlow: Actively discusses with users, maintaining communication throughout

**Plan Mode:**

- Default DSH: Static approval process — AI produces a complete plan document, then waits for user approval
- Qwen/IFlow: Dynamic collaboration — AI iterates with the user through multiple rounds, refining the plan step by step

## Install

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-more-agent-presets
```

Restart the Web profile, then select the preset when creating a session.

The plugin installs its managed preset directories under `$DSH_HOME/.agent-presets` (normally `~/.dsh/.agent-presets`). For detailed installation behavior, see the [Installation Behavior](#installation-behavior) section below.

## Installation Behavior

The plugin implements the following installation logic:

**Dynamic Discovery:**
- Automatically scans the `presets/` directory to discover available presets
- No need to manually update preset lists

**Version-Based Updates:**
- Compares version numbers to determine if presets need updating
- Reinstalls presets when the plugin version changes
- Skips installation if versions match (avoids unnecessary overwrites)

**Ownership Management:**
- Each installed preset includes a `.dsh-preset-owner.json` marker file
- Records the managing package name and version
- Ensures safe cleanup and prevents conflicts with other plugins

**Automatic Cleanup:**
- Removes presets that are no longer provided by the plugin
- Only deletes presets owned by this plugin (respects other plugins and user-created presets)

**Safety Guarantees:**
- ✅ Never overwrites presets from other plugins
- ✅ Never deletes user-created presets without ownership markers
- ✅ Only manages presets it has installed

## Remove

```bash
# Remove the plugin package
dsh plugin --profile web remove dsh-more-agent-presets

# Optionally, remove the installed presets
rm -rf ~/.dsh/.agent-presets/qwencode-coding-agent
```

**Note:** 
- Removing the plugin does not automatically delete the installed preset directories
- Preset directories with ownership markers (`.dsh-preset-owner.json`) can be re-managed if you reinstall the plugin
- To completely remove presets, manually delete them as shown above

## License

MIT. Some preset compositions are derived from other open source projects (see NOTICE.md).

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests.
