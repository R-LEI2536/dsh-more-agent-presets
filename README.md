# dsh-more-agentpresets

Multiple selectable Agent Presets for DeepSeek Harness.

## Available Presets

### Qwen Code Coding Mode (`qwencode-coding-agent`)

A professional coding assistant emphasizing code standards and project conventions, using iterative workflows and CLI-friendly interaction style.

### Coming Soon

- IFlow Coding Mode (`iflow-coding-agent`) - Coming in future releases

## Install

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-more-agentpresets
```

Restart the Web profile, then select the preset when creating a session.

The plugin installs its managed preset directories under `$DSH_HOME/.agent-presets` (normally `~/.dsh/.agent-presets`). It never overwrites a same-named directory unless that directory carries this package's ownership marker.

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
