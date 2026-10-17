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
- **已确认的上游缺陷（1.7.4 记录，1.7.3 实测）：两条安装路径写同一个 agent scope。** 终端原文
  `[E] scope Error: tool "list_subagent_models" is already registered in this scope`，调用栈
  `registerListSubagentModels (tool-subagent/src/list-models.ts:87)` ← `install (…/src/index.ts:360-362)` ← inject 回调
  (`…/src/index.ts:676`)。触发条件是当时的 `delegator.mjs` 在 `agent/created` 里装 agent-scope restriction：`restrict()`
  会发 `tools/change`（`packages/core/scope/src/store.ts:226-266`，`notify` 默认 true；而 `guard()` 是 `notify: false`，
  `packages/core/tools/src/index.ts:1136-1142`），官方插件正是在 `tools/change` 上安装到活着的 agent
  （`…/src/index.ts:693-698`），于是同一个 scope 装了两次；第二次重名抛错，`install()` 在 `mount()` 之前中止——已注册的
  lister 与从未注册的 `subagent` 一起留在半路，会话**零工具**。上报上游时的最小修法：重名时跳过或回滚该次安装，而不是让
  `install()` 整体抛出（它把 `registerListSubagentModels()` 放在 `mount()` 之前，且没有 try/finally）。
- **我们的规避方式：这个 preset 一条 restriction 都不装**，强制面改为 standing guard（见 CONTEXT.md 的
  **Delegation guard**），因此创建窗口里本插件零 `tools/change`，上述交错无法再发生。5 个编程 preset 本来就没有这层插件。
- **若在 5 个编程 preset 上复现**：记录并回报上游；必要时删掉这些 preset spawn 行的 `modelSelectionSettings` 键，一行即可
  整体回退（`chat-subagent` 同理，代价是失去路由参数与 `list_subagent_models`）。

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