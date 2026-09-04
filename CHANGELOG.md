# Changelog

All notable changes to this project are documented in this file.

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