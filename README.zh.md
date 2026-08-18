# dsh-more-agentpresets

多个可选择的 DeepSeek Harness Agent Presets 集合。

## 可用 Presets

### Qwen Code 编程模式 (`qwencode-coding-agent`)

注重代码规范与项目约定的专业编程助手，采用迭代式工作流和 CLI 友好的交互风格。

### 即将推出

- IFlow 编程模式 (`iflow-coding-agent`) - 即将添加

## 安装

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-more-agentpresets
```

重启 Web profile，然后在创建会话时选择 preset。

该插件将管理的 preset 目录安装到 `$DSH_HOME/.agent-presets`（通常是 `~/.dsh/.agent-presets`）。除非该目录携带本包的 ownership marker，否则不会覆盖同名目录。

## 卸载

```bash
# 移除插件包
dsh plugin --profile web remove dsh-more-agentpresets

# 可选：删除已安装的 preset 目录
rm -rf ~/.dsh/.agent-presets/qwencode-coding-agent
```

**注意：** 卸载插件包不会自动删除已安装的 preset 目录。如果不再需要，请手动删除。

## 许可证

MIT。部分 preset 组合源自其他开源项目。
