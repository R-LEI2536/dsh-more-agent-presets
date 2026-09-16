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

**Preset 显示名称不跟随 Web UI 语言切换。** 本插件提供的每个 preset，其 `name` 与 `description` 都从各自目录下的 `preset.yml` 读取，并由 Web UI 原样渲染，与界面语言无关。只有 DeepSeek Harness 自带的四个内置 preset（`standard`、`code`、`minimal`、`cordis`）走 Harness 的 i18n 系统；社区插件提供的 preset（包括本插件内的所有 preset）都做不到。因此在 Web UI 把语言从中文切到英文时，这些 preset 的显示文案仍是中文。

这是 Harness 读取 preset metadata 的方式带来的限制，不是本插件的问题。截至目前，DSH 没有给插件暴露注册本地化字符串的入口。

## 安装

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-more-agent-presets
```

重启 Web profile，然后在创建会话时选择 preset。

该插件将管理的 preset 目录安装到 `$DSH_HOME/.agent-presets`（通常是 `~/.dsh/.agent-presets`）。详细的安装行为请参见下方的[安装行为](#安装行为)部分。

## 安装行为

插件实现了以下安装逻辑：

**动态发现：**
- 自动扫描 `presets/` 目录发现可用的 preset
- 无需手动更新 preset 列表

**版本更新：**
- 对比版本号判断是否需要更新 preset
- 插件版本变化时自动重新安装 preset
- 版本相同则跳过安装（避免不必要的覆盖）

**归属管理：**
- 每个已安装的 preset 包含 `.dsh-preset-owner.json` 标记文件
- 记录管理该 preset 的包名和版本
- 确保安全清理并避免与其他插件冲突

**自动清理：**
- 删除不再由本插件提供的 preset
- 仅删除归属于本插件的 preset（尊重其他插件和用户自建的 preset）

**安全保障：**
- ✅ 不会覆盖其他插件安装的 preset
- ✅ 不会删除用户自建的 preset（无归属标记）
- ✅ 仅管理由本插件安装的 preset

## 卸载

```bash
# 移除插件包
dsh plugin --profile web remove dsh-more-agent-presets

# 可选：删除已安装的 preset 目录
rm -rf ~/.dsh/.agent-presets/qwencode-coding-agent
```

**注意：**
- 卸载插件不会自动删除已安装的 preset 目录
- 带有归属标记（`.dsh-preset-owner.json`）的 preset 目录在重新安装插件后会被重新管理
- 如需彻底删除，请手动删除相应的 preset 目录

## 许可证

MIT。部分 preset 组合源自其他开源项目。

## 贡献

欢迎贡献！欢迎提交 issue 和 pull request。
