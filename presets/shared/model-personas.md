# 模型 → 系统提示词表 · 语义

> **状态：已接入 `chat-agent` 与 `chat-subagent`。** 文案的唯一真源是
> `presets/shared/model-personas.json`：插件 `presets/shared/model-persona.mjs` 在 apply 时自己读它，
> patch 的 `model-persona` 行**不带 `config`**，因此不存在第二份副本，也没有「两处同步」这回事。
> 本文档只说明**怎么选行**。

用途：需要「按模型名切换系统提示词」的 preset。两个消费者共用这一份表：`chat-agent` 把它当作
该会话的**全部**系统提示词（`complete: true`），`chat-subagent` 在它后面追加一段派活说明。
`presets/chat-agent/model-persona.mjs` 只是兼容 re-export（≤1.6.2 发布过那个路径），没有第二份实现。

改文案：只改 `presets/shared/model-personas.json`（键为 `default` 与各
`personas[].model` / `personas[].text`）；改完需重启或重挂 preset —— bundle 的激活本就是
restart-time。缺文件或 JSON 解析失败会让该行 mount 失败、preset 组合报错，不会静默发空提示词。

## 长文案：`file` 引用

一个模型的提示词太长（多段落）时，别把它塞进 JSON 的一行字符串：正文写成
`presets/shared/ref/<名字>.md`，表里用 `file` 指向它，插件在 apply 时读取并去掉首尾空白：

```json
{ "model": ["gemini"], "file": "ref/gemini.md" }
```

- `file` 与 `text` 同时出现时以 `file` 为准。
- 路径只能落在本插件目录内；`..` 与绝对路径会被拒并抛错。
- 引用缺失同样在 mount 时抛错，不会静默发空提示词。
- 短文案继续用 `text` 内联（4 行以内 JSON 里好读），不必为每行建文件。

## Gemini 3.7 / 3.8 两份正文

`ref/gemini-3.7-flash.md` 与 `ref/gemini-3.8-flash.md` 是两份**各自独立改编**的正文：同一套改编
思路（删 XML 协议、工具段、组件库、per-surface 默认值；保留声音与排版纪律；把组件意图落成
Markdown 规则）分别作用在各自的捕获上。两者之间没有「公共段落必须同步」的不变量——只有一份
独有的段落（如 `gemini-3.7-flash` 的 `RULE 1/2/3`），以及两份共同出现的段落；改动后者时记得
都看一眼，`check-model-persona.mjs` 会扫出 XML 标签、工具名与组件词的残留。

未改编的原始捕获与改编稿并列放在 `presets/shared/ref/`（`gemini-3.7-flash.raw.md`，随
`files: ["presets"]` 一起发布，供将来重编时比对）。3.8 的原始捕获在首次改编时被就地覆盖，没有
留档。

## 语义

- **key = 模型 id**：会话为「下一次请求」选定的模型。Web UI 的 agent 是拿 profile 默认模型创建的
  （`agentOptions`），picker 的选择以 `model/selection` 事件进会话，所以 key 取 `modelSelection`
  投影的 `pending ?? lastUsed` —— 也就是 harness 自己在 `selectionFor` 里用的顺序；没有该投影的
  部署（headless / ACP）才回落到 `agent.options.model`。
- 匹配大小写不敏感：整个 id 与「每个 `.` 之后的每一段后缀」都算候选键，任一命中即算命中。
  所以 `daseinai.gemini-3.8-flash`、`global.openai.gpt-6-luna`（provider 路径）与 `gpt-6-luna`
  命中同一行；模型名自己带点（`gemini-3.7-flash`、`gpt-5.6-luna`）也不会被切坏。
- 先精确命中 key；否则取**最长**的一条「候选模型 id 以其为前缀」的 key —— 所以
  `qwen3-coder` 命中 `qwen`、`deepseek-r1-0528` 命中 `deepseek-r1`。
  要压过宽 key，就写更具体的 key（最长优先）。
- 都没命中 → 落 `default`（通用）。
- 不要写 `deepseek` 这种宽 key：它会把默认的 `deepseek-v4.1-flash` 一起吞掉。
