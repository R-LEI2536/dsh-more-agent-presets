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
preset 层小插件以 `ctx.tools.restrict({ allow: [] })` 屏蔽 agent 继承的工具面（全局层 + 祖先 scope）；restriction 按 scope 链生效——preset 的 standing scope 是每个选中 agent 的父 scope，因此只影响该 preset。restriction 只管**继承**面：agent **自身层**注册的工具不受任何 restriction 约束（`view()` 跳过 own 层，再把它无条件叠加进可见集），own 层只能由 guard 在调用时拦。
_Avoid_: `toolFilter`（那是 `@deepseek-ai/dsh-tool-subagent` 行的配置，只过滤子 agent 的工具）

**Delegator preset**:
顶层会话**只被允许调用一个能动手的工具**（`subagent`）的 preset；开了 **Subagent model selection** 之后另有只读的 `list_subagent_models`，所以不变量读作「只有一个**能动手**的工具」。不变量说的是**能调用**，不是**目录里只有它**：本 preset 的 `config.plugins` 必须挂真实的工具行（被派出去的子 agent 要用这些行），所以这些行同样列在顶层会话的目录里，由 **Delegation guard** 在调用时全部拒绝。
_Avoid_: one-tool preset（易与 zero-tool preset 混淆）、subagent preset

**Delegation guard**:
`chat-subagent` 强制面的全名：装在 preset **standing scope** 上的一条 `ctx.tools.guard(...)`，按**调用方** agent 的 delegation depth 分流——depth 0 只放行 `subagent` 与 `list_subagent_models`（外加 PTC 表现层的 `run_code`），更深的 agent 只放行 **Subagent tool list** 与那个 lister。guard 与 restriction 有两条关键差别：guard 从**调用方**的 scope 链读取（`guardReason()` 走 `chainLayers(exec.agent)`），所以一条 standing 安装同时覆盖顶层会话与所有子 agent；而且 `guard()` 以 `notify: false` 安装，**不发 `tools/change`**，`restrict()` 则会发。后者不是风格问题：官方派活插件正是在 `tools/change` 上安装到活着的 agent 上，从 `agent/created` 装 restriction 会让同一个 scope 装两次，第二次重名抛错、`mount()` 不执行，会话一个派活工具都不剩（1.7.3 实测）。只有 persona（`deployment:persona-prefix` 段 + `suppressRuntimeContext()`）仍按 agent 安装，因为只有顶层会话该拿到它；agent 自身的注册比组合活得久，所以那份 persona 必须由 `tools/change` reconcile **双向**维护（装与拆），并在行卸载、agent 销毁时显式解除——guard 不需要，它随 standing scope 一起消失。
_Avoid_: per-agent restriction（曾用过，已删除）、`restrict({ allow: [] })`（那是 zero-tool preset 的做法）、`toolFilter`（只过滤子 agent）

**Subagent tool list**:
声明里 `subagentTools` 给出的、被派出去的子 agent 可调用的工具名白名单；**Delegation guard** 的 depth 分支照它放行。名字不再逐个探测（`restrict()` 已不使用）：没有任何行注册的名字只是不在目录里，缺失一项不会影响派活。
_Avoid_: 工具池、`toolFilter`

**Delegated child**:
被 `subagent` 工具创建、执行任务的子 agent：它带着自己的 delegation depth 加入父会话的同一个 preset，因此继承 preset 的工具行，并落在 **Delegation guard** 的子分支上（只放行 **Subagent tool list**）；顶层会话的 persona 与 runtime-context suppression 不会装到它身上。
_Avoid_: worker（内部叫法，不是产品术语）

**Subagent model selection**:
委派行 `@deepseek-ai/dsh-tool-subagent` 的 `modelSelectionSettings` opt-in（默认 `false`）。开启后顶层 Agent 用
`list_subagent_models` 查 Host 授权名单，并在派活时点名 `provider`/`model`/`reasoning_effort`；三个都省略就继承父会话模型。
名单由 Host 的设置行 `@deepseek-ai/dsh-tool-subagent/model-selection-settings` 提供；缺这一行会让开了 opt-in 的 preset
整块挂载失败，而开关只是关着时行为退回继承、不报错。开启后工具从 preset 平面挪进**每个 agent 自身层**，`restrict()` 由此
再也点不到它——这也是 `chat-subagent` 完全不用 restriction、只用 **Delegation guard** 的原因之一。本 bundle 的 5 个编程 preset 与
`chat-subagent` 都开启；后者因此多一个只读的 `list_subagent_models`，**Delegator preset** 的不变量随之读作「只有一个能
动手的工具」。
落脚点由终端那一行报出：`<presetId>/subagent-route-log: subagent <id> route <provider>/<model>`（5 个编程 preset 挂
`presets/shared/subagent-route-log.mjs`；`chat-subagent` 由自己的 `delegator` 打同一行）。
_Avoid_: 子模型、子 agent 默认模型（都不指这条 opt-in 与它的授权名单）

## Flagged ambiguities

- “preset id” 在本仓库指 `config.id`（如 `chat-agent`），**不是** Loader 行 id（`preset-chat-agent`）。会话日志记录的是前者，因此只有前者被冻结。
- “minimal” 容易被读成「零工具」：`minimal` 是随 DSH 发布的 preset、挂了持久 shell；本仓库里零工具的是 `chat-agent`。
- “model-persona” 不是 persona 行的别名：前者是按模型切换文案的插件行（`model-persona.mjs`），后者是 `@deepseek-ai/dsh-persona` 的静态 `prefix` 行（chat-agent 已不用后者）。
- “只有一个工具”说的永远是**顶层会话能调用**的工具（`chat-subagent`：`subagent` + 只读的 `list_subagent_models`），**不是它目录里列出的工具**——本 preset 的目录就是它挂载的全部行，多出来的行由 **Delegation guard** 在调用时拒绝；delegated child 看到的是同一批行，放行的是 **Subagent tool list**。

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
> **Maintainer:** 不算，它是 **Delegator preset**：顶层会话只**能调用**一个能动手的工具（另有只读的 `list_subagent_models`），靠 **Delegation guard**
> 在 preset 的 standing scope 上按调用方 agent 的 depth 分流；preset 层的 restriction 会把 delegated child 一起封住，
> 派活就没有意义了，所以这个 preset 一条 restriction 都不装。子 agent 能用什么，看 **Subagent tool list**。
> **Dev:** 那给子 agent 加 `bash` 是改名单就行吗？
> **Maintainer:** 还要在声明里挂上 `tool-bash` 那一行——名单只能写本 preset 真正注册过的名字。
