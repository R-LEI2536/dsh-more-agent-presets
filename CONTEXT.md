# dsh-more-agent-presets

本仓库发布一个 DeepSeek Harness bundle，它的全部产物是可被选中的 Agent preset。

## Language

**Preset declaration**:
名为 `@deepseek-ai/dsh-agent-preset` 的 Loader 行；它的 `config` 命名一个可选 preset 并列出其子插件。
_Avoid_: preset.yml、preset 目录、agent.cordis.yml（已废弃的旧机制）

**Patch layer**:
一个「Loader patch 条目列表」的 YAML 文件，按顺序叠加在 profile 组合之上；本 bundle 通过 `dsh.bundle.patch` 发布七个这样的文件。
_Avoid_: 配置文件、覆盖文件

**Preset plane**:
preset 子行挂载所在的、按 agent 划分的作用域；模型可见的工具行与 agent 的 persona 都归它所有。
_Avoid_: sandbox、namespace

**Host plane**:
profile 级作用域，拥有共享服务（会话、token meter、沙箱策略、模型路由）以及那些「preset 只读取其服务」的行。
_Avoid_: 全局、core

**Zero-tool preset**:
子插件列表中不含任何模型可见工具行的 preset；它的 agent 只能对话，不能产生动作。目录侧由 preset 层的 tool mask（`ctx.tools.restrict({ allow: [] })`）保证为空；agent 自己 scope 注册的工具（如 Team 工具）按设计不受影响。
_Avoid_: minimal preset（那是随 DSH 发布的 `minimal`，它保留了持久 shell）

**Model persona**:
按模型 id 切换 persona 文本的声明；`chat-agent` 用它实现「所选文案即全部系统提示词」。唯一真源在 `presets/chat-agent/model-personas.md`，patch 内嵌副本需两处同步。
_Avoid_: 静态 persona（固定一句文案的 persona 行）

**Tool mask**:
preset 层小插件以 `ctx.tools.restrict({ allow: [] })` 屏蔽 agent 继承的工具面（全局层 + 祖先 scope）；restriction 按 scope 链生效——preset 的 standing scope 是每个选中 agent 的父 scope，因此只影响该 preset。
_Avoid_: `toolFilter`（那是 `@deepseek-ai/dsh-tool-subagent` 行的配置，只过滤子 agent 的工具）

## Flagged ambiguities

- “preset id” 在本仓库指 `config.id`（如 `chat-agent`），**不是** Loader 行 id（`preset-chat-agent`）。会话日志记录的是前者，因此只有前者被冻结。
- “minimal” 容易被读成「零工具」：`minimal` 是随 DSH 发布的 preset、挂了持久 shell；本仓库里零工具的是 `chat-agent`。
- “model-persona” 不是 persona 行的别名：前者是按模型切换文案的插件行（`model-persona.mjs`），后者是 `@deepseek-ai/dsh-persona` 的静态 `prefix` 行（chat-agent 已不用后者）。

## Example dialogue

> **Dev:** 我想给聊天 preset 加个搜索工具，行吗？
> **Maintainer:** 那就不是 zero-tool preset 了——`config.plugins` 里出现任何一行 `@deepseek-ai/dsh-tool-*` 都会改变它的身份。搜索属于别的 preset。
> **Dev:** 那 `chat-agent` 的 preset id 是 `preset-chat-agent` 吧？
> **Maintainer:** preset id 是 `chat-agent`；`preset-chat-agent` 只是 patch 层里的行 id，用来定位这一行 patch。
> **Dev:** chat-agent 的 persona 文案要改，改哪里？
> **Maintainer:** 先改 `presets/chat-agent/model-personas.md`（唯一真源），再把同一段粘到 `chat-agent.patch.yml` 的 `model-persona` 行 `config`——两处必须同步。
