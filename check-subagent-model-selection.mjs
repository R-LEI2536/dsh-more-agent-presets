/**
 * Runnable check for the presets' subagent model-selection opt-in.
 *
 *   node check-subagent-model-selection.mjs
 *
 * `@deepseek-ai/dsh-tool-subagent` reads `modelSelection` from its row config
 * (default `false`, `src/index.ts:83-87`). With it off the tool schema has no
 * `provider`/`model`/`reasoning_effort` parameters and the child always
 * inherits the parent session's route; with it on the Host's
 * `subagent-model-selection` setting supplies the authorized list. Discovery is
 * a separate switch: `modelDiscovery: true` on ONE delegation instance per tool
 * scope registers the read-only `list_subagent_models` (`src/index.ts:196`), and
 * a second owner in the same scope collides on the tool name. The five coding
 * presets opt into both, and so does `chat-subagent` — its catalog then holds
 * two entries, one acting tool and one read-only lister, and `delegator.mjs`
 * decides its mask from the inherited names (delegator point 5). `chat-agent`
 * has no tool row at all.
 *
 * The Host row is no longer a mount dependency on 0.2.2: the opt-in mounts
 * without `@deepseek-ai/dsh-tool-subagent/model-selection-settings` and limits
 * explicit selection to the parent route instead. Both READMEs must still name
 * that row, because it is what grants the wider authorized list.
 *
 * `chat-subagent` is also pinned to keep its delegation row INSIDE a
 * `cordis:group`: 0.2.2 removed the per-Agent install that made that position
 * load-bearing during a preset switch, but the grouping is still the shape the
 * five coding presets mount and moving it back buys nothing.
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

/** Assert one row opts into BOTH halves of the 0.2.2 model-selection surface. */
const assertOptedIn = (patch, spawn, label) => {
  assert.match(spawn, /^\s+modelSelection: true$/m, `${label}: the spawn row must enable child route fields`)
  assert.match(
    spawn,
    /^\s+modelDiscovery: true$/m,
    `${label}: the spawn row must own discovery (the read-only list_subagent_models)`,
  )
  // Exactly one opt-in per file: a second one would mean the fork row or a
  // provider-managed row grew a capability neither is supposed to have, and a
  // second discovery owner in one scope collides on the tool name.
  assert.equal(
    [...patch.matchAll(/^\s+modelSelection: true$/gm)].length,
    1,
    `${label}: exactly one row opts in`,
  )
  assert.equal(
    [...patch.matchAll(/^\s+modelDiscovery: true$/gm)].length,
    1,
    `${label}: exactly one row owns discovery`,
  )
}

for (const id of OPTED_IN) {
  const patch = read(id)
  const spawn = configOf(patch, 'tool-subagent')
  assert.match(spawn, /^\s+provider: spawn$/m, `${id}: the delegation row must keep the spawn transport`)
  assert.match(spawn, /^\s+toolName: subagent$/m, `${id}: the delegation row must keep the \`subagent\` name`)
  assertOptedIn(patch, spawn, id)
  // A fork child continues the parent conversation on the parent's route — the
  // official standard preset leaves selection off there, and so do we.
  const fork = configOf(patch, 'tool-subagent-fork')
  assert.doesNotMatch(fork, /^\s+modelSelection:/m, `${id}: the fork row stays off selection`)
  assert.doesNotMatch(fork, /^\s+modelDiscovery:/m, `${id}: the fork row must not own discovery`)
}

// chat-subagent: in, for the same capability. Its catalog holds two entries —
// `subagent` acts, `list_subagent_models` only reports the authorized routes —
// so its "exactly one tool" invariant reads "exactly one tool that ACTS". It
// mounts no fork row, so only the spawn opt-in applies here.
const chatSubagent = read('chat-subagent')
const chatSpawn = configOf(chatSubagent, 'tool-subagent')
assert.match(chatSpawn, /^\s+provider: spawn$/m, 'chat-subagent: the delegation row must keep the spawn transport')
assert.match(chatSpawn, /^\s+toolName: subagent$/m, 'chat-subagent: the delegation row must keep the `subagent` name')
assertOptedIn(chatSubagent, chatSpawn, 'chat-subagent')
assert.doesNotMatch(chatSubagent, /- id: tool-subagent-fork/, 'chat-subagent mounts no fork row')

// The delegation row must be a CHILD of a `cordis:group`, never a top-level
// row. 0.2.2-rc.1 removed the per-Agent install that made this load-bearing
// (one registration per preset scope now), but the shape stays pinned: it is
// what the five coding presets mount, and moving it buys nothing.
const indentationOf = rowId => new RegExp(`^([ \\t]*)- id: ${rowId}$`, 'm').exec(chatSubagent)?.[1].length
const delegatorIndent = indentationOf('delegator')
const delegationIndent = indentationOf('tool-subagent')
assert.equal(typeof delegatorIndent, 'number', 'chat-subagent: the delegator row must stay in the declaration')
assert.equal(typeof delegationIndent, 'number', 'chat-subagent: the delegation row must stay in the declaration')
assert.ok(
  delegationIndent > delegatorIndent,
  'chat-subagent: the delegation row must be nested inside a group, not top-level',
)
assert.match(
  chatSubagent,
  /- id: delegation\n[ \t]+name: cordis:group\n[ \t]+group: true\n[ \t]+isolate:\n[ \t]+workflowEngine: true\n[ \t]+config:\n(?:[ \t]+#.*\n)*[ \t]+- id: tool-subagent\n/,
  'chat-subagent: the `delegation` group must be the row carrier',
)

// chat-agent: the zero-tool preset must not grow a delegation row.
const chatAgent = read('chat-agent')
assert.doesNotMatch(chatAgent, /^\s+- id: tool-subagent$/m, 'chat-agent mounts no delegation row')

// The Host row still supplies the authorized list, so both READMEs document it
// by naming the plugin's subpath. On 0.2.2 its absence no longer breaks the
// mount, but it is what widens explicit selection beyond the parent route.
for (const readme of ['README.md', 'README.zh.md']) {
  const text = readFileSync(new URL(`./${readme}`, import.meta.url), 'utf8')
  assert.match(
    text,
    /@deepseek-ai\/dsh-tool-subagent\/model-selection-settings/,
    `${readme} must document the Host dependency`,
  )
}

console.log('check-subagent-model-selection: ok')
