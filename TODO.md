# TODO

Future work tracked here. Items are recorded as discovered; revisit and resolve
or remove them once a decision lands.

## 已知的上游告警（不是本插件缺陷）

开了 `modelSelectionSettings`（5 个编程 preset + `chat-subagent`）之后，子 agent 被销毁时终端会出现下面两行。
2026-10-17 在 dev_web 上核实：**没有功能影响**，不要把它们当成本插件的 bug。

- `agent-registry agent "<child>": agent/disposed listener threw: TypeError: Cannot read
  properties of undefined (reading 'catch')`
  —— `@deepseek-ai/dsh-tool-subagent` 的 per-Agent 安装路径把 `fiber.dispose().catch(...)`
  链在一起（装好的 `lib/index.js:644`，源码 `src/index.ts:689-691`），而 cordis 的 `dispose()`
  在某些状态下返回 `undefined`（cordis 自己处处写成 `Promise.resolve(this.dispose()).catch(...)`，
  见 `vendor/cordis/src/fiber.ts:306`）。抛错发生在 `scopedInstalls.delete()` **之后**，而注册都落在
  agent 自己的 ctx 上、随它一起销毁，所以没有残留。一个子 agent 可能连打一到两遍（该行有不止一处注册）。
  上报上游时的最小修法：外面套一层 `Promise.resolve(...)`。
- `session-projection-cache … "turn/end write for "<child>" failed (cache stays stale):
  SessionHandleClosedError: session "<child>": flush on a closed handle"`
  —— 短命子会话的句柄先关、节流检查点后写，是该插件自述的 fail-soft 竞态（晚到的 flush 就走这条警告，
  见 `packages/session/session-projection-cache/src/index.ts:345-375`）。实测该子会话的投影缓存文件
  （`~/.dsh/storages/session_projcache/sessions/<child>.json`）仍然完整：title、turnOutline、
  sessionStats、modelSelection 都在，只丢了一次中间写。

## `chat-subagent` preset

- **让 delegated child 可写、可跑命令（当前刻意只读）。** 默认 `subagentTools` 只有
  `read`/`glob`/`grep`/`read_image`/`list_directory`/`todo_write`/`job_list`，所以子 agent 不能跑
  命令、不能跑测试、不能改文件。放开要同时做三件事，缺一不可：
  - 在 `presets/chat-subagent.patch.yml` 里挂上工具行：`tool-bash`（win32 上是 `tool-pwsh`）；
    `write`/`edit` 已经随 `tool-fs` 的 `read` 一起注册，行本身不用改；
  - 把名字加进 `delegator` 行的 `config.subagentTools` —— 这份名单就是 guard 给子 agent 的白名单；没有任何行注册的名字
    只是不在目录里，不会像旧实现那样触发降级或警告（`restrict()` 已不再使用）。真正决定"能不能用"的是**挂没挂那一行**；
  - 改 `presets/chat-subagent/delegation-note.md`（顶层会话系统提示词里那一段；`delegator` 行也可以用
    `config.delegationNote` 覆盖它）：它现在写着"子 agent 只读、不能改任何东西、不能跑命令"。不改这一句，
    顶层会以为活干不了而把请求推掉，尽管子 agent 已经能写能跑（README 的覆盖说明里也提了这一条）。
  - 一并要决定的事：子 agent 的审批策略固定为 `never`、沙箱随父会话，因此"可写"意味着它能在父会话
    的沙箱范围内改文件，而任何需要审批的操作会被自动拒绝。想要更细的 per-child 权限，得先有 DSH 侧
    的表达。`job_list` 已经在默认名单里，放开后立刻可用。

## 子 agent 模型选择（6 个 preset）

- **模型很少点名不等于开关坏了。** 省略 `provider`/`model`/`reasoning_effort` 就是官方默认（继承父会话）。要让
  「每次派活必须点名」，得逐个 preset 改派活段落的提示词——那是另一个决定，本次刻意不做，先看实际使用情况。
- **已确认的上游缺陷：切换 preset 时，新 preset 的 per-Agent 安装可能跑在旧 preset 的拆除之前。**
  2026-10-17 在 dev_web（DSH 检出，1.7.4→1.7.5 实测）用临时 `info` 诊断（打印每个 agent 的 preset 及其目录里
  `subagent`/`list_subagent_models` 是否可解析，测完已删）定案：
  - 触发条件是**给活着的会话切换 preset**：新 web 会话先以默认 `standard` 组合创建，随后才切到用户选的 preset
    （日志里同一个 agent id 从 `preset=standard` 变成 `preset=<目标>`）。
  - 开了 `modelSelectionSettings` 的 preset 会把 `list_subagent_models`（**全局名**）注册进**每个 agent 自己的 scope**。
  - 切换时若"新安装"排在"旧拆除"之前，就撞名：`[E] scope Error: tool "list_subagent_models" is already registered in
    this scope`（`registerListSubagentModels` `list-models.ts:87` ← `install` ← `agent.ctx.inject` 回调
    `tool-subagent/src/index.ts:676`）；`install()` 在 `mount()` 之前中止，随后旧 fiber 拆完，把该 scope 里剩下的也一并
    带走 → 会话里 `subagent`、`list_subagent_models` 全无。
  - 失败会被记住：`scopedInstalls`（`WeakMap<Agent, fiber>`）在 `inject` 返回后立刻登记，即使那次安装已经抛错，之后的
    `tools/change` 也不会重试（`installScoped` 命中 `existing !== undefined` 就直接返回），所以一次撞名 = 该 agent 永久没有派活工具。
  - 同轮实测对照（差别只在 dispatch 里的先后）：
    - `standard → pair-coding-agent`：`subagent=false lister=true` → `lister=false`（旧拆除完）→ `lister=true` →
      `subagent=true` ✅
    - `standard → iflow-coding-agent`：同样 ✅，且成功派出子 agent
    - `standard → chat-subagent`：`subagent=true lister=true` → `[E]` → 旧拆除 → `subagent=false lister=false` ❌
  - **为什么只有 chat-subagent 每次都输：已定案（2026-10-18 实测）。** 判别项是**行的位置**，不是 `delegator` 行（临时删掉
    `delegator` 后仍丢）。切换时各 preset 的 `tool-subagent` 实例按**挂载顺序**收到同一个 `tools/change`；`chat-subagent`
    的委派行原来是**顶层行**，而顶层行比 `cordis:group` 的子行挂得早，于是它的监听器排第 2，比 `standard`（第 3）还早——
    “装”先于“删”，必撞。实测名次：`chat-subagent` 2、`standard` 3、`ptc` 4、`cordis` 5、codex 6、iflow 7、iflow-cre 8、
    pair 9、qwencode 10；判据是“incoming 名次 < outgoing 名次则坏”。
  - **这不是本插件的缺陷：纯 DSH 自带 preset 也坏。** 实测 `cordis → standard`、`cordis → ptc`、`pair-coding-agent →
    standard` 都丢工具，报同样的 duplicate 错。
  - **1.7.6 的绕法（已实测）：** 把 `tool-subagent` 行包进 `cordis:group`（与 coding preset 同形），名次从 2 移到最后一个；
    `standard → chat-subagent`、`ptc → chat-subagent` 都变成保留，切换后 schema 仍带 `provider`/`model`/`reasoning_effort`，
    preset 不 broken。代价：反向切换（空白会话改选到更早名次的 preset，如 `chat-subagent → standard`）会丢**目标** preset
    的工具，开新会话即可。行位置由 `check-subagent-model-selection.mjs` 钉死，不要移回顶层。
  - 上游真修法（未提交，最终解）：安装失败时不要登记 fiber，让紧随其后的 `tools/change`（旧 fiber 拆除时必然会发）触发重试；
    顺带把同函数 `removeScoped` 里的 `void fiber.dispose().catch(...)` 包成 `Promise.resolve(...)`（见上方已知告警）。
- **我们的强制面不是这个缺陷的原因。** 这个 preset 一条 restriction 都不装、创建窗口里本插件零 `tools/change`（强制面是
  standing guard），上面这条是官方 per-Agent 安装自己的顺序问题，与我们的注册无关；1.7.6 之前误判为“无法规避”，现在用
  行位置规避（上游修好后可还原为顶层行）。5 个编程 preset 只是恰好在该轮 dispatch 里“拆在前、装在後”而没撞上。
- **可选的整体回退**：删掉 6 个 preset spawn 行的 `modelSelectionSettings` 键（各一行）即可让所有 preset 都不会撞名，
  代价是失去路由参数与 `list_subagent_models`；`chat-subagent` 因此暂时不可用，是否回退由使用方决定。

## `codex-coding-agent` preset

- **Plan-mode prompt location is still wrong and needs adjustment.**
  - Current state: `presets/codex-coding-agent/codex-collab-mode.mjs`
    always emits the default-mode body via the `<collaboration_mode>` block,
    because `ctx.planMode` is unreachable from outside the `planning`
    group's isolate realm (see CHANGELOG 1.4.1 "planMode isolate-realm
    conflict"). The plan-mode body lives in `ref/codex-plan-mode.md` but is
    not currently served through this plugin.
  - Today, plan-mode content reaches the model only via `dsh-plan-mode`'s
    system-prompt section (under the `planning` group), which is a
    structural deviation from upstream Codex where `<collaboration_mode>`
    is a developer-role world-state block that swaps its full body per
    step via `WorldStateSection::render_diff`.
  - Open decision: implement the v1.4.4 plan proposed in
    `daily/2026-09-16/codex-permissions-plugin-architecture.md` —
    read plan state via
    `ctx.sessionProjections.stateOf(agent.session, 'plan')` from the
    host-level service (sidesteps isolate-realm), and swap the
    `<collaboration_mode>` body per admitted step (default ↔ plan).
    Diff-driven hash tracking already in place.
  - Side effects to revisit when this lands: DSH `dsh-plan-mode`'s
    `plan:policy` system-prompt section will coexist with the
    `<collaboration_mode>` user-role block in plan mode; the two will
    overlap in content, so confirm no functional conflict and decide
    whether `plan:policy` should be suppressed when plan mode is active.
  - Reference: `daily/2026-09-15/codex-preset-dsh.md` (Compatibility Blocks
    Reconsidered — DSH Has a `context()` API for input[] User-Role),
    `daily/2026-09-16/codex-permissions-plugin-architecture.md`
    (`<collaboration_mode>` Body Fix — Proposed (v1.4.4) section).