# 模型 → 系统提示词表 · 语义

> **状态：已接入 chat-agent。** 文案的唯一真源是 `presets/chat-agent/model-personas.json`：
> 插件 `model-persona.mjs` 在 apply 时自己读它，patch 的 `model-persona` 行**不带 `config`**，
> 因此不存在第二份副本，也没有「两处同步」这回事。本文档只说明**怎么选行**。

用途：需要「按模型名切换系统提示词」的 preset。第一个消费者是 `chat-agent` —— 它的
persona 行开了 `complete: true`，被选中的文本就是该会话的**全部**系统提示词。

改文案：只改 `presets/chat-agent/model-personas.json`（键为 `default` 与各
`personas[].model` / `personas[].text`）；改完需重启或重挂 preset —— bundle 的激活本就是
restart-time。缺文件或 JSON 解析失败会让该行 mount 失败、preset 组合报错，不会静默发空提示词。

## 长文案：`file` 引用

一个模型的提示词太长（多段落）时，别把它塞进 JSON 的一行字符串：正文写成
`presets/chat-agent/ref/<名字>.md`，表里用 `file` 指向它，插件在 apply 时读取并去掉首尾空白：

```json
{ "model": ["gemini"], "file": "ref/gemini.md" }
```

- `file` 与 `text` 同时出现时以 `file` 为准。
- 路径只能落在本插件目录内；`..` 与绝对路径会被拒并抛错。
- 引用缺失同样在 mount 时抛错，不会静默发空提示词。
- 短文案继续用 `text` 内联（4 行以内 JSON 里好读），不必为每行建文件。

## 语义

- **key = 模型 id**：会话为「下一次请求」选定的模型。Web UI 的 agent 是拿 profile 默认模型创建的
  （`agentOptions`），picker 的选择以 `model/selection` 事件进会话，所以 key 取 `modelSelection`
  投影的 `pending ?? lastUsed` —— 也就是 harness 自己在 `selectionFor` 里用的顺序；没有该投影的
  部署（headless / ACP）才回落到 `agent.options.model`。
- 匹配大小写不敏感，且先剥掉 provider 前缀：`gpt-6-luna`、`openai.gpt-6-luna`、
  `global.openai.gpt-6-luna` 命中同一行（取最后一个 `.` 之后的段再比）。
- 先精确命中 key；否则取**最长**的一条「候选模型 id 以其为前缀」的 key —— 所以
  `qwen3-coder` 命中 `qwen`、`deepseek-r1-0528` 命中 `deepseek-r1`。
  要压过宽 key，就写更具体的 key（最长优先）。
- 都没命中 → 落 `default`（通用）。
- 不要写 `deepseek` 这种宽 key：它会把默认的 `deepseek-v4.1-flash` 一起吞掉。
