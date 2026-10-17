# dsh-more-agent-presets

本仓库发布一个 DeepSeek Harness bundle，它的全部产物是可被选中的 Agent preset。

## Language

**Preset declaration**:
名为 `@deepseek-ai/dsh-agent-preset` 的 Loader 行；它的 `config` 命名一个可选 preset 并列出其子插件。
_Avoid_: preset.yml、preset 目录、agent.cordis.yml（已废弃的旧机制）

**Patch layer**:
一个「Loader patch 条目列表」的 YAML 文件，按顺序叠加在 profile 组合之上；本 bundle 通过 `dsh.bundle.patch` 发布八个这样的文件。
_Avoid_: 配置文件、覆盖文件

**Preset plane**:
preset 子行挂载所在的、按 agent 划分的作用域；模型可见的工具行与 agent 的 persona 都归它所有。
_Avoid_: sandbox、namespace

**Host plane**:
profile 级作用域，拥有共享服务（会话、token meter、沙箱策略、模型路由）以及那些「preset 只读取其服务」的行。
_Avoid_: 全局、core

**Zero-tool preset**:
子插件列表中不含任何模型可见工具行的 preset；它的 agent 只能对话，不能产生动作。**继承面**由 preset 层的 tool mask（`ctx.tools.restrict({ allow: [] })`）清空；agent 自身 scope 的注册（如 Team 工具）不受任何 restriction 影响——它们仍会出现在工具目录里，靠同层 `ctx.tools.guard(...)` 拒绝执行兜底。
_Avoid_: minimal preset（那是随 DSH 发布的 `minimal`，它保留了持久 shell）

**Model persona**:
按模型 id 切换 persona 文本的声明；`chat-agent` 用它实现「所选文案即全部系统提示词」。模型 id 取**会话选定**
的那一个（`modelSelection` 投影的 `pending ?? lastUsed`，无投影时回落 `agent.options.model`），不取
agent 创建时的 profile 默认值。表与插件位于 `presets/shared/`（`model-personas.json` +
`model-persona.mjs`），因为**两个聊天 preset 共用**：`chat-agent` 把它当作全部提示词，`chat-subagent`
导入它、再追加自己的派活说明（`presets/chat-subagent/delegation-note.md`，可由 `delegator` 行的
`delegationNote` 覆盖）。patch 的 `model-persona` 行不带 `config`，没有副本可同步；
`presets/chat-agent/model-persona.mjs` 只是兼容 re-export（≤1.6.2 发布过那个路径），指向同一模块实例。
_Avoid_: 静态 persona（固定一句文案的 persona 行）

**Tool mask**:
preset 层小插件以 `ctx.tools.restrict({ allow: [] })` 屏蔽 agent 继承的工具面（全局层 + 祖先 scope）；restriction 按 scope 链生效——preset 的 standing scope 是每个选中 agent 的父 scope，因此只影响该 preset。
_Avoid_: `toolFilter`（那是 `@deepseek-ai/dsh-tool-subagent` 行的配置，只过滤子 agent 的工具）

**Delegator preset**:
顶层会话只被允许调用一个工具（`subagent`）的 preset。它的“只有一个工具”由 per-agent mask 实现，而不是由 `config.plugins` 里缺少工具行实现——被派出去的子 agent 仍需真实工具，而它继承的是同一个 preset。
_Avoid_: one-tool preset（易与 zero-tool preset 混淆）、subagent preset

**Agent-scope mask**:
注册在**每个 agent 自身 scope** 上的 `ctx.tools.restrict(...)` 与 `ctx.tools.guard(...)` 组合。preset 层（standing scope）的 restriction 会连带封住 delegated child，因为子 agent 的 scope 父级就是该 standing scope；所以“只对顶层生效”的屏蔽必须在 agent 创建后逐个安装，并按 delegation depth 分流。**agent 自身的注册比组合活得久**：preset 切换只重排 scope 父链，不会撤销它，所以 mask 必须由 `tools/change` reconcile **双向**维护（装与拆），并在行被卸载、agent 被销毁时显式解除。
_Avoid_: preset 层 restriction（那是 zero-tool preset 的做法）、`toolFilter`

**Subagent tool list**:
声明里 `subagentTools` 给出的、被派出去的子 agent 可用的工具名白名单；只有本 preset 自己挂载的行才能出现在里面。名字在 `restrict()` 时按「当下已注册」校验，因此名单里的部署依赖项（`read_image` 需要附件存储、`list_directory` 来自第三方 profile 插件）在缺失时被丢掉并各警告一次，而不是让每次派活失败。
_Avoid_: 工具池、`toolFilter`

**Delegated child**:
被 `subagent` 工具创建、执行任务的子 agent：它带着自己的 delegation depth 加入父会话的同一个 preset，因此既继承 preset 的工具行，又不受父会话那份 agent-scope mask 的影响。
_Avoid_: worker（内部叫法，不是产品术语）

**Subagent model selection**:
委派行 `@deepseek-ai/dsh-tool-subagent` 的 `modelSelectionSettings` opt-in（默认 `false`）。开启后顶层 Agent 用
`list_subagent_models` 查 Host 授权名单，并在派活时点名 `provider`/`model`/`reasoning_effort`；三个都省略就继承父会话模型。
名单由 Host 的设置行 `@deepseek-ai/dsh-tool-subagent/model-selection-settings` 提供；缺这一行会让开了 opt-in 的 preset
整块挂载失败，而开关只是关着时行为退回继承、不报错。本 bundle 的 5 个编程 preset 开启；`chat-subagent` 关闭，因为它会多出
`list_subagent_models`，破坏 **Delegator preset** 的「顶层只有一个工具」。
_Avoid_: 子模型、子 agent 默认模型（都不指这条 opt-in 与它的授权名单）

## Flagged ambiguities

- “preset id” 在本仓库指 `config.id`（如 `chat-agent`），**不是** Loader 行 id（`preset-chat-agent`）。会话日志记录的是前者，因此只有前者被冻结。
- “minimal” 容易被读成「零工具」：`minimal` 是随 DSH 发布的 preset、挂了持久 shell；本仓库里零工具的是 `chat-agent`。
- “model-persona” 不是 persona 行的别名：前者是按模型切换文案的插件行（`model-persona.mjs`），后者是 `@deepseek-ai/dsh-persona` 的静态 `prefix` 行（chat-agent 已不用后者）。
- “只有一个工具”说的永远是**顶层会话**的工具目录（`chat-subagent`）；delegated child 看到的是 **Subagent tool list** 与它实际注册量的交集，两者不是同一个面。

## Example dialogue

> **Dev:** 我想给聊天 preset 加个搜索工具，行吗？
> **Maintainer:** 那就不是 zero-tool preset 了——`config.plugins` 里出现任何一行 `@deepseek-ai/dsh-tool-*` 都会改变它的身份。搜索属于别的 preset。
> **Dev:** 那 `chat-agent` 的 preset id 是 `preset-chat-agent` 吧？
> **Maintainer:** preset id 是 `chat-agent`；`preset-chat-agent` 只是 patch 层里的行 id，用来定位这一行 patch。
> **Dev:** chat-agent 的 persona 文案要改，改哪里？
> **Maintainer:** 改 `presets/shared/model-personas.json` 一处即可——插件（`presets/shared/model-persona.mjs`）
> 运行时直接读它，patch 里没有副本；`model-personas.md` 只讲怎么选行。注意它会**同时**改到
> `chat-subagent`，因为两个聊天 preset 共用这份表。
> **Dev:** 那“可派活”的 `chat-subagent` 也算 zero-tool preset 吗？
> **Maintainer:** 不算，它是 **Delegator preset**：顶层会话只有一个工具，靠 **Agent-scope mask**
> 装在每个 agent 自己的 scope 上；preset 层那套 restriction 会把 delegated child 一起封住，
> 派活就没有意义了。子 agent 能用什么，看 **Subagent tool list**。
> **Dev:** 那给子 agent 加 `bash` 是改名单就行吗？
> **Maintainer:** 还要在声明里挂上 `tool-bash` 那一行——名单只能写本 preset 真正注册过的名字。
