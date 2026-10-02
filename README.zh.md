# dsh-more-agent-presets

[English](README.md)

多个可选择的 DeepSeek Harness Agent Presets 集合。

这些 preset 针对 DeepSeek Harness (DSH) 做了适配。

## 使用场景

本插件特别适用于以下场景：

**非 DeepSeek 或老旧模型：**
- 改善未针对 DSH 进行专门适配的模型的性能
- 增强缺乏 DSH 特定适配的旧模型

**个人偏好：**
- 部分用户可能更喜欢交互式、讨论型的编程辅助，而非独立完成任务的方式

**为什么有帮助：**
- DSH 的默认提示针对 DeepSeek 模型进行了优化
- 非 DeepSeek 或老旧模型使用默认提示时可能无法发挥最佳性能
- 这些 preset 提供了适合不同模型的替代交互模式

## 可用 Presets

### Qwen Code 编程模式 (`qwencode-coding-agent`)

注重代码规范与项目约定的专业编程助手，采用迭代式工作流和 CLI 友好的交互风格。

### IFlow 编程模式 (`iflow-coding-agent`)

具备动态环境感知、自动 Git 上下文注入和结构化任务工作流的交互式 CLI 编程助手。特性包括自动检测的平台信息、安全优先的权限处理，以及优化的 CLI 交互风格。

### IFlow 创造模式 (`iflow-cre-agent`)

用于创建自定义 Agent preset 的增强模式。具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。

**功能特性：**
- DSH 上下文信息（Web UI URL、源码路径）
- Git 仓库感知
- 自定义提示段落
- Cordis 插件开发和组合编辑技能

**当前限制：**
⚠️ Cordis Tool (`@deepseek-ai/dsh-tool-cordis`) 因上游问题暂不可用。动态 Cordis 插件创建功能需等待上游修复后可用。

### 协作编程模式 (`pair-coding-agent`)

与用户结对工作的编程助手：每一步先与用户对齐方向，对非平凡的改动先讨论再动手，等待用户确认，而不是独自把任务推到完成。

### Codex 编程模式 (`codex-coding-agent`)

移植开源 Codex CLI 的 agent 提示词：每次工具调用前先说明要做什么、先读代码再动手、自主把任务推进到完成，并沿用 Codex 的规划、验证与最终答复格式规范。工具名已映射到本 harness 的工具（`apply_patch` → `edit`/`write`，`update_plan` → `todo_write`，`request_user_input` → `ask_user_question`），Codex 的计划模式协议通过 `exit_plan_mode` 保留。Codex 的三块 `input[]`——`<permissions instructions>`、`<collaboration_mode>`、`<environment_context>`——通过三个 DSH `agent/pre-step` 插件（`codex-permissions.mjs`、`codex-collab-mode.mjs`、`codex-environment.mjs`）作为 user-role 消息注入到每步准入输入的头部，沙箱/审批策略和 cwd/platform/shell/日期实时从 DSH 运行时解析。与这里其他 preset 不同，它保留的是 Codex 的自主推进姿态，而非先讨论后动手。

## 设计理念

这些 preset 在用户交互和规划方式上与 DSH 默认 prompt 有所不同：

**交互风格：**

- DSH 默认：倾向于独立完成任务，减少与用户交互
- Qwen/IFlow/Pair：倾向与用户讨论，保持沟通

**Plan Mode：**

- DSH 默认：静态审批流程——AI 输出完整计划文档，等待用户审批
- Qwen/IFlow/Pair：动态结对流程——AI 与用户多轮交互，逐步完善计划

## 已知限制

**Preset 显示名称不跟随 Web UI 语言切换。** 本插件提供的每个 preset，其 `name` 与 `description` 都从声明行（declaration）读取，并由 Web UI 原样渲染，与界面语言无关。只有 DeepSeek Harness 自带的四个内置 preset（`standard`、`ptc`、`minimal`、`cordis`）走 Harness 的 i18n 系统；社区插件提供的 preset（包括本插件内的所有 preset）都做不到。因此在 Web UI 把语言从中文切到英文时，这些 preset 的显示文案仍是中文。

这是 Harness 读取 preset metadata 的方式带来的限制，不是本插件的问题。截至目前，DSH 没有给插件暴露注册本地化字符串的入口。

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 及以上**。本版本是声明式 preset bundle（0.1.7 之前的 `.agent-presets` 目录安装器已不存在）。0.1.7-rc.x 宿主会通过 peer 兼容门整包跳过本插件，请先升级宿主。

## 安装

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-more-agent-presets
```

重启 Web profile，然后在创建会话时选择 preset。

本插件是一个**声明式 preset bundle**：安装后通过 `dsh.bundle.patch` 向 profile 注入 5 行 `@deepseek-ai/dsh-agent-preset` 声明（每个 preset 一个声明，位于 `presets/<id>.patch.yml`）。声明行由 `@deepseek-ai/dsh-agent-preset-registry` 注册，自动出现在 preset 选择器里。插件不向用户目录写入任何内容——不做任何文件拷贝。

## 行为说明

**声明式 preset（DSH 0.1.7+）：**
- 每个 preset 是一行声明在 bundle patch 中的 `@deepseek-ai/dsh-agent-preset`；`config.plugins` 持有子插件行（工具、提示段、带 `isolate` realm 的组，以及以包子路径 `dsh-more-agent-presets/presets/<id>/` 引用的本插件内嵌 `.mjs` 插件）。
- preset `id`（`codex-coding-agent`、`iflow-coding-agent`、`iflow-cre-agent`、`pair-coding-agent`、`qwencode-coding-agent`）与旧版本一致，已有会话的选择不会失效。
- registry 为在线会话保留声明对应的组合；修改声明只影响之后创建的 Agent。

**从 ≤1.4.x 迁移：**
- ≤1.4.4 版本会把 preset 目录拷贝到 `$DSH_HOME/.agent-presets`（通常是 `~/.dsh/.agent-presets`）并写入 `.dsh-preset-owner.json` 标记。DSH 0.1.7 不再读取该目录，本插件也不再写入。
- 升级后，旧拷贝目录是无用残留。如需清净可直接手动删除：
  ```bash
  rm -rf ~/.dsh/.agent-presets
  ```
  （只针对你自己的 `~/.dsh/.agent-presets`；在新机制下不存在其他插件或用户手写 preset 放在那里的情况——preset 现在都是 profile patch 声明。）

## 卸载

```bash
dsh plugin --profile web remove dsh-more-agent-presets
```

卸载 bundle 会移除它的 patch 层，5 行 preset 声明随之从 profile 消失；安装在 profile node_modules 下的 preset `plugins` 资源随包移除。0.1.7+ 无需清理 `~/.dsh/.agent-presets`（若从 ≤1.4.x 迁移，参见上方「行为说明」）。

## 许可证

MIT。部分 preset 组合源自其他开源项目。

## 贡献

欢迎贡献！欢迎提交 issue 和 pull request。
