# Changelog

All notable changes to this project are documented in this file.

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