/**
 * Runnable offline check for the DSH 0.2.1 contract this bundle is built against.
 *
 *   node check-dsh-021-contract.mjs
 *
 * The 0.2.1 upgrade removed three config keys and one prompt variable from the
 * surface this bundle uses. Every removal fails LOUDLY — at load for the config
 * keys, before the first request for the variable — but only on a 0.2.1 host,
 * and a tree that is clean on 0.2.0rc violates all of them silently. This file
 * pins the four rules:
 *
 * 1. `@deepseek-ai/dsh-tool-subagent` no longer accepts `backgroundMode` or
 *    `enableRunInBackground` (dropped from the schema) and THROWS on `persona`
 *    and `toolFilter` (`packages/subagent/tool-subagent/src/index.ts`, `apply()`).
 * 2. `maxDepth` is a non-negative integer or the literal `'provider-managed'`.
 * 3. The `cwd` prompt variable is gone: `agent-loop` registers only `provider`
 *    and `model`, and interpolation is strict, so a live `{{cwd}}` fails prompt
 *    assembly (`packages/core/system-prompt/README.md` §"Contribute a prompt
 *    variable"). The current directory is the required
 *    `working-directory:current` runtime context instead.
 * 4. Every other variable a preset's live text names must have a registrant:
 *    `agent-loop` supplies `provider`/`model`, and each preset's own
 *    `prompt-sections.mjs` registers the rest (`shell_tool`, `platform`,
 *    `os_version`, `today_date`).
 *
 * 5. A durable message a plugin contributes must not use the retired
 *    `kind: 'plugin'` wrapper: `assertV4MessageSources` refuses it at encode
 *    time — "format v4 message requires a producer-owned source kind",
 *    `packages/session/session-format-v3-to-v4/src/message-sources.ts`. A live
 *    producer names itself; the shipped `time-context` and `tmux-context` rows
 *    both write `{ kind: name, form: 'snapshot', sections: [...] }`.
 *
 * Comments are excluded from 3, 4 and 5 on purpose — the upgrade notes name the
 * removed key and the removed variable in prose — while block scalars
 * (`text: |`, `prefix: >`, `section: |`, …) count as live text, because they are
 * rendered into the prompt verbatim.
 *
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const ROOT = new URL('.', import.meta.url)
const read = path => readFileSync(new URL(path, ROOT), 'utf8')

/** A key line that opens a YAML block scalar: its body is live text. */
const BLOCK_KEY = /^\s*(?:text|prefix|suffix|section|description|name):\s*[|>][-+]?\s*$/
/** Any `key:` line, for the row-config surface below. */
const KEY_LINE = /^\s*([A-Za-z][A-Za-z0-9_]*):/
/** Keys DSH 0.2.1 rejects on a `@deepseek-ai/dsh-tool-subagent` row. */
const FORBIDDEN_ROW_KEYS = ['backgroundMode', 'enableRunInBackground', 'persona', 'toolFilter']
/** Variables `@deepseek-ai/dsh-agent-loop` registers globally. */
const BASE_VARIABLES = ['provider', 'model']
/** Removed in 0.2.1: no registrant anywhere. */
const REMOVED_VARIABLES = ['cwd']

/**
 * Split a patch into its live text and its comments. A block-scalar body stays
 * live until a shallower, non-blank line ends the scalar.
 * @param text - one patch file's contents.
 * @returns `live` (everything interpolated or configured) and `comments`.
 */
function classify(text) {
  const live = []
  const comments = []
  let blockIndent
  for (const line of text.split('\n')) {
    const indent = /^\s*/.exec(line)[0].length
    if (line.trim() === '') {
      live.push(line)
      continue
    }
    if (blockIndent !== undefined && indent >= blockIndent) {
      live.push(line)
      continue
    }
    blockIndent = undefined
    if (/^\s*#/.test(line)) {
      comments.push(line)
      continue
    }
    if (BLOCK_KEY.test(line)) blockIndent = indent + 1
    live.push(line)
  }
  return { live: live.join('\n'), comments: comments.join('\n') }
}

/**
 * Every `- id: <name>` row block, with its indentation. A block ends at the next
 * row at the same or a shallower indent (a nested row is also visited).
 * @param text - one patch file's contents.
 * @returns one entry per row: its id, indentation, and the lines that follow it.
 */
function rows(text) {
  const lines = text.split('\n')
  const out = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^(\s*)- id: (\S+)\s*$/.exec(lines[index])
    if (header === null) continue
    const indent = header[1].length
    let end = lines.length
    for (let next = index + 1; next < lines.length; next += 1) {
      const sibling = /^(\s*)- id: \S+\s*$/.exec(lines[next])
      if (sibling !== null && sibling[1].length <= indent) {
        end = next
        break
      }
    }
    out.push({ id: header[2], indent, lines: lines.slice(index + 1, end) })
  }
  return out
}

/**
 * The keys one row block carries, ignoring comments and the row's own header.
 * @param row - a {@link rows} entry.
 * @returns the key names in the block, in order.
 */
function rowKeys(row) {
  const found = []
  for (const line of row.lines) {
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    const indent = /^\s*/.exec(line)[0].length
    const key = KEY_LINE.exec(line)
    if (key === null || indent <= row.indent) continue
    found.push(key[1])
  }
  return found
}

const manifest = JSON.parse(read('./package.json'))
const patches = manifest.dsh?.bundle?.patch
assert.ok(Array.isArray(patches) && patches.length > 0, 'package.json must declare dsh.bundle.patch')

// The bundle's own compatibility gate reads `engines.dsh` first and ignores the
// DSH peers once it exists; both must name a range that admits 0.2.1-rc.2.
assert.equal(manifest.engines?.dsh, '^0.2.1-rc.1', 'engines.dsh must state the 0.2.1 floor')
assert.ok(
  !JSON.stringify(manifest).includes('0.2.0-rc'),
  'no manifest range may stay on the 0.2.0-rc line',
)

for (const spec of patches) {
  const path = spec.startsWith('./') ? spec : `./${spec}`
  const label = path.replace(/^\.\//, '')
  const text = read(path)
  const { live } = classify(text)

  for (const row of rows(text)) {
    if (!row.id.startsWith('tool-subagent')) continue
    const keys = rowKeys(row)
    for (const forbidden of FORBIDDEN_ROW_KEYS) {
      assert.ok(
        !keys.includes(forbidden),
        `${label}: row \`${row.id}\` carries \`${forbidden}\`, which @deepseek-ai/dsh-tool-subagent rejects in 0.2.1`,
      )
    }
    const maxDepth = /^\s+maxDepth:\s*(\S+)\s*$/m.exec(row.lines.join('\n'))?.[1]
    if (maxDepth !== undefined) {
      assert.ok(
        maxDepth === 'provider-managed' || /^\d+$/.test(maxDepth),
        `${label}: row \`${row.id}\` has maxDepth \`${maxDepth}\`; 0.2.1 allows a non-negative integer or 'provider-managed'`,
      )
    }
  }

  // 3 + 4: every variable in live text needs a registrant.
  const declared = new Set(BASE_VARIABLES)
  const preset = label.replace(/^presets\//, '').replace(/\.patch\.yml$/, '')
  const own = `./presets/${preset}/prompt-sections.mjs`
  if (existsSync(new URL(own, ROOT))) {
    for (const match of read(own).matchAll(/variable\('([a-z][a-z0-9_]*)'/g)) declared.add(match[1])
  }
  const used = new Set([...live.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map(match => match[1]))
  for (const name of used) {
    assert.ok(
      !REMOVED_VARIABLES.includes(name),
      `${label}: live text uses {{${name}}}, which 0.2.1 no longer registers (the working-directory context carries it now)`,
    )
    assert.ok(
      declared.has(name),
      `${label}: live text uses {{${name}}} with no registrant (known: ${[...declared].sort().join(', ')})`,
    )
  }

  assert.doesNotMatch(live, /dsh-invariants|\/invariant['"]/, `${label}: the invariant runtime is gone in 0.2.x`)
  assert.ok(
    !/^\s*mode:\s*both\s*$/m.test(live),
    `${label}: \`mode: both\` is rejected (native | ptc only)`,
  )
}

// 5: no shipped plugin may contribute a durable message behind the retired
// `plugin` kind. Only code lines count, so prose that names the wrapper is fine.
function shippedModules(dir) {
  const out = []
  for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    const path = `${dir}${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== 'ref') out.push(...shippedModules(`${path}/`))
    } else if (/\.m?js$/.test(entry.name)) out.push(path)
  }
  return out
}

for (const path of [...shippedModules('./presets/'), './index.mjs']) {
  const label = path.replace(/^\.\//, '')
  read(path).split('\n').forEach((line, index) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return
    assert.ok(
      !/kind:\s*'plugin'/.test(line),
      `${label}:${index + 1}: a durable message source may not use the retired \`kind: 'plugin'\` wrapper; name the producer instead (0.2.1 refuses it at encode time)`,
    )
  })
}

console.log('check-dsh-021-contract: ok')
