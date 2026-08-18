# dsh-more-agentpresets

[中文文档](README.zh.md)

Multiple selectable Agent Presets for DeepSeek Harness.

The presets are adapted for DeepSeek Harness (DSH).

## Available Presets

### Qwen Code Coding Mode (`qwencode-coding-agent`)

A professional coding assistant emphasizing code standards and project conventions, using iterative workflows and CLI-friendly interaction style.

### Coming Soon

- IFlow Coding Mode (`iflow-coding-agent`) - Coming in future releases

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
dsh plugin --profile web add github:R-LEI2536/dsh-more-agentpresets
```

Restart the Web profile, then select the preset when creating a session.

The plugin installs its managed preset directories under `$DSH_HOME/.agent-presets` (normally `~/.dsh/.agent-presets`).

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
# Remove the package
dsh plugin --profile web remove dsh-more-agentpresets

# Optionally, remove the installed presets
rm -rf ~/.dsh/.agent-presets/qwencode-coding-agent
```

**Note:** Removing the package does not automatically delete the installed preset directories. You need to manually remove them if you no longer need them.

## License

MIT. Some preset compositions are derived from other open source projects (see NOTICE.md).

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests.
