# Changelog

All notable changes to this project are documented in this file.

## [1.3.0] - 2026-08-25

### Added
- New preset `pair-coding-agent` (协作编程模式) — a coding assistant that works alongside the user as a pair programmer. This preset is the ongoing iteration target for prompt refinements in this plugin; `iflow-coding-agent` and `qwencode-coding-agent` are frozen and will not receive further updates.

### Changed (instruction-echo mitigation)
Three prompt rules in `pair-coding-agent/agent.cordis.yml` were rewritten to positive framing to avoid instruction echo — the tendency of "do not X" rules to prime the model toward X by repeatedly naming the unwanted behavior:
- **User-rejection rule**: now reads "respond with the motivation, ask why, wait for the next instruction" instead of "do not silently retry / push back / propose workaround".
- **Prefer Dedicated Tools**: now reads "pick the dedicated tool when one fits" instead of "do NOT use the shell tool when a dedicated tool is provided".
- **Reserve shell tool**: now reads "reach for shell when the task genuinely needs it" instead of "reserve shell exclusively / fallback only when absolutely necessary".

The persona was also changed from `iFLOW Edo Tensei` to `DeepSeek Harness` to remove an upstream-named identity that no longer matched the harness this plugin ships against.