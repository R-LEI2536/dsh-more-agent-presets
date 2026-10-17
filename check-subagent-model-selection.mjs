/**
 * Runnable check for the presets' subagent model-selection opt-in.
 *
 *   node check-subagent-model-selection.mjs
 *
 * `@deepseek-ai/dsh-tool-subagent` reads `modelSelectionSettings` from its row
 * config (default `false`, `src/index.ts:109`). With it off the tool schema has
 * no `provider`/`model`/`reasoning_effort` parameters and the child always
 * inherits the parent session's route (`install(ctx, undefined)`, `:608-611`);
 * with it on the Host's `subagent-model-selection` setting supplies the
 * authorized list and the session also gains `list_subagent_models`. The five
 * coding presets opt in, and so does `chat-subagent` — its catalog then holds
 * two entries, one acting tool and one read-only lister, and `delegator.mjs`
 * decides its mask from where the tool registered (point 8). `chat-agent` has no
 * tool row at all.
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

/**
 * The presets whose spawn delegation row opts into Host model selection AND
 * mounts a fork row that must stay off the opt-in.
 */
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

// chat-subagent: in, for the same capability. Its catalog holds two entries —
// `subagent` acts, `list_subagent_models` only reports the authorized routes —
// so its "exactly one tool" invariant reads "exactly one tool that ACTS". It
// mounts no fork row, so only the spawn opt-in applies here.
const chatSubagent = read('chat-subagent')
const chatSpawn = configOf(chatSubagent, 'tool-subagent')
assert.match(chatSpawn, /^\s+provider: spawn$/m, 'chat-subagent: the delegation row must keep the spawn transport')
assert.match(chatSpawn, /^\s+toolName: subagent$/m, 'chat-subagent: the delegation row must keep the `subagent` name')
assert.match(
  chatSpawn,
  /^\s+modelSelectionSettings: true$/m,
  'chat-subagent: the delegation row must opt into Host subagent model selection',
)
assert.equal(
  [...chatSubagent.matchAll(/^\s+modelSelectionSettings: true$/gm)].length,
  1,
  'chat-subagent: exactly one row opts in',
)
assert.doesNotMatch(chatSubagent, /- id: tool-subagent-fork/, 'chat-subagent mounts no fork row')

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
