/**
 * Runnable check for the five coding presets' subagent model-selection opt-in.
 *
 *   node check-subagent-model-selection.mjs
 *
 * `@deepseek-ai/dsh-tool-subagent` reads `modelSelectionSettings` from its row
 * config (default `false`, `src/index.ts:109`). With it off the tool schema has
 * no `provider`/`model`/`reasoning_effort` parameters and the child always
 * inherits the parent session's route (`install(ctx, undefined)`, `:608-611`);
 * with it on the Host's `subagent-model-selection` setting supplies the
 * authorized list and the session also gains `list_subagent_models`. The five
 * coding presets opt in; `chat-subagent` deliberately does not, because the
 * shared discovery tool would break its "exactly one tool" invariant, and
 * `chat-agent` has no tool row at all.
 *
 * The opt-in is also a Host dependency: the row throws when the
 * `@deepseek-ai/dsh-tool-subagent/model-selection-settings` row is absent, and
 * ONE failed row marks the whole preset broken. Both READMEs must keep naming
 * that plugin, which is the second half of this check.
 *
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** The presets whose spawn delegation row opts into Host model selection. */
const OPTED_IN = [
  'qwencode-coding-agent',
  'iflow-coding-agent',
  'iflow-cre-agent',
  'pair-coding-agent',
  'codex-coding-agent',
]

const SUBAGENT = '@deepseek-ai/dsh-tool-subagent'

/** The row's `config:` block: its comment and `key: value` lines only. */
const configOf = (patch, rowId) => {
  const block = new RegExp(
    `- id: ${rowId}\\n\\s+name: '${SUBAGENT.replaceAll('/', '\\/')}'\\n\\s+config:\\n((?:\\s+#.*\\n|\\s+\\S+:.*\\n)*)`,
  ).exec(patch)
  assert.ok(block, `no \`${rowId}\` row for ${SUBAGENT}`)
  return block[1]
}

const read = id => readFileSync(new URL(`./presets/${id}.patch.yml`, import.meta.url), 'utf8')

for (const id of OPTED_IN) {
  const patch = read(id)
  const spawn = configOf(patch, 'tool-subagent')
  assert.match(spawn, /^\s+provider: spawn$/m, `${id}: the delegation row must keep the spawn transport`)
  assert.match(spawn, /^\s+toolName: subagent$/m, `${id}: the delegation row must keep the \`subagent\` name`)
  assert.match(
    spawn,
    /^\s+modelSelectionSettings: true$/m,
    `${id}: the spawn row must opt into Host subagent model selection`,
  )
  // Exactly one opt-in per file: a second one would mean the fork row or a
  // provider-managed row grew a capability neither is supposed to have.
  assert.equal(
    [...patch.matchAll(/^\s+modelSelectionSettings: true$/gm)].length,
    1,
    `${id}: exactly one row opts in`,
  )
  // A fork child continues the parent conversation on the parent's route — the
  // official standard preset leaves it off there, and so do we.
  assert.doesNotMatch(configOf(patch, 'tool-subagent-fork'), /modelSelectionSettings/, `${id}: the fork row stays off`)
}

// chat-subagent: off by design. Prose may name the key (the header explains why
// it is off), so the assertion is about the config key only.
const chatSubagent = read('chat-subagent')
assert.doesNotMatch(chatSubagent, /^\s+modelSelectionSettings:/m, 'chat-subagent keeps its one-tool invariant')

// chat-agent: the zero-tool preset must not grow a delegation row.
const chatAgent = read('chat-agent')
assert.doesNotMatch(chatAgent, /^\s+- id: tool-subagent$/m, 'chat-agent mounts no delegation row')

// The opt-in is only mountable where the Host mounts its settings row; both
// READMEs document that dependency by naming the plugin's subpath.
for (const readme of ['README.md', 'README.zh.md']) {
  const text = readFileSync(new URL(`./${readme}`, import.meta.url), 'utf8')
  assert.match(
    text,
    /@deepseek-ai\/dsh-tool-subagent\/model-selection-settings/,
    `${readme} must document the Host dependency`,
  )
}

console.log('check-subagent-model-selection: ok')
