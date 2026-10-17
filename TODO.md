# TODO

Future work tracked here. Items are recorded as discovered; revisit and resolve
or remove them once a decision lands.

## 已知的上游告警（不是本插件缺陷）

开了 `modelSelectionSettings`（5 个编程 preset）之后，子 agent 被销毁时终端会出现下面两行。
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
  - 把名字加进 `delegator` 行的 `config.subagentTools` —— `tools.restrict()` 只接受**当时已注册**
    的名字，名单里写没有挂载的工具会让该 agent 的 mask 降级（该名字被丢弃并警告）；
  - 改 `presets/chat-subagent/delegation-note.md`（顶层会话系统提示词里那一段；`delegator` 行也可以用
    `config.delegationNote` 覆盖它）：它现在写着"子 agent 只读、不能改任何东西、不能跑命令"。不改这一句，
    顶层会以为活干不了而把请求推掉，尽管子 agent 已经能写能跑（README 的覆盖说明里也提了这一条）。
  - 一并要决定的事：子 agent 的审批策略固定为 `never`、沙箱随父会话，因此"可写"意味着它能在父会话
    的沙箱范围内改文件，而任何需要审批的操作会被自动拒绝。想要更细的 per-child 权限，得先有 DSH 侧
    的表达。`job_list` 已经在默认名单里，放开后立刻可用。

## 子 agent 模型选择（5 个编程 preset）

- **模型很少点名不等于开关坏了。** 省略 `provider`/`model`/`reasoning_effort` 就是官方默认（继承父会话）。要让
  「每次派活必须点名」，得逐个 preset 改派活段落的提示词——那是另一个决定，本次刻意不做，先看实际使用情况。
- **继续观察上游 per-Agent 安装路径**（`tool-subagent/src/index.ts:665-683`）。上一轮在 `chat-subagent` 上观察到
  reload 重叠时注册相撞、会话拿不到派活工具；当时同一 preset 还跑着 per-agent mask 插件（`delegator.mjs` 同样监听
  `tools/change`），而这 5 个 preset 没有该插件。若在这 5 个 preset 上复现：记录并回报上游；必要时删掉这几个
  `modelSelectionSettings` 键，一行即可整体回退。

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