# Notices

This package contains multiple agent presets derived from various sources.

## Qwencode Preset

The `qwencode-coding-agent` preset is derived from the Qwencode project and has been modified to integrate with DeepSeek Harness.

**Original Source:** Qwencode  
**Original License:** Apache 2.0 License  
**Modifications:** Copyright (c) 2025 R-LEI2536 (adapted for DeepSeek Harness)

The original Qwencode code is licensed under the Apache License, Version 2.0.  
You may obtain a copy of the License at:  
https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

### Modifications Made

The following modifications have been made to adapt the preset for DeepSeek Harness:
- Integration with DeepSeek Harness plugin system
- Adapted to DSH preset structure and configuration format
- Additional prompt sections and tools specific to DSH

## Codex Preset

The `codex-coding-agent` preset is derived from the OpenAI Codex project and has been modified to integrate with DeepSeek Harness.

**Original Source:** OpenAI Codex (openai/codex)
**Original License:** Apache 2.0 License
**Modifications:** Copyright (c) 2025 R-LEI2536 (adapted for DeepSeek Harness)

The original Codex code is licensed under the Apache License, Version 2.0.  
You may obtain a copy of the License at:  
https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

### Modifications Made

The prompt text is ported from three upstream files: `codex-rs/models-manager/prompt.md` (the `BASE_INSTRUCTIONS` constant), `codex-rs/collaboration-mode-templates/templates/plan.md`, and `codex-rs/collaboration-mode-templates/templates/default.md`.

The following modifications have been made to adapt the preset for DeepSeek Harness:
- Tool names mapped to the DeepSeek Harness toolset (`apply_patch` → `edit`/`write`, `update_plan` → `todo_write`, `rg`/`rg --files` → `grep`/`glob`, the shell → the harness shell tool)
- Codex-only environment sentences removed (the never/untrusted/on-request approval paragraph, and the `<collaboration_mode>` / `<proposed_plan>` delivery mechanics)
- Three compatibility sections added: harness-specific AGENTS.md wording, a policy-agnostic "Sandbox and approvals" section, and an environment-fact section
- Integration with the DeepSeek Harness preset structure and configuration format

See CHANGELOG.md for the complete list of changes.

## Future Presets

Additional presets may be added in future versions. Each preset will retain its original license and attribution.

## License

This package as a whole is distributed under the MIT License.

The original Qwencode code retains its Apache 2.0 License.  
The modifications made by R-LEI2536 are licensed under MIT License.
