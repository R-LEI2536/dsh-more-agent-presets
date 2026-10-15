/**
 * Runnable check for `presets/iflow-cre-agent/dsh-info.mjs`.
 *
 *   node check-dsh-info-root.mjs
 *
 * The Windows hang is why this file exists: the checkout walk stopped on the
 * literal `'/'`, which a Windows path never equals, and the loop ran forever on
 * the event loop while the preset registry was awaiting the row at DSH startup
 * (`dsh` installed on Windows, boot never completed; shipped v1.3.3–v1.6.1).
 * The Linux machine that fixes it cannot spawn a Windows `dirname`, but Node
 * ships `path.win32` as ordinary JS, so the walk's termination rule is replayed
 * here under Windows path semantics — and a relative entry path, the same trap
 * on any platform, is replayed with `path.posix`.
 *
 * Not in `files`, so it never ships.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { apply, dshRootAbove, resolveDshRoot } from './presets/iflow-cre-agent/dsh-info.mjs'

// 1. A Windows entry path must terminate. `win32.dirname` fixes at `'C:\\'`,
//    which is not `'/'`, so the old guard never became true — this call hung
//    the whole process instead of returning.
assert.equal(dshRootAbove('C:\\Users\\hive\\AppData\\Local\\pnpm\\dsh\\bin\\dsh.mjs', win32.dirname), undefined)
assert.equal(dshRootAbove('D:\\tools\\dsh\\bin\\dsh.mjs', win32.dirname), undefined)
//    A relative entry path is the same trap on every platform: `dirname('.')`
//    is `'.'`, never `'/'`.
assert.equal(dshRootAbove('bin/dsh.mjs', posix.dirname), undefined)

// 2. Bounded: the walk visits each ancestor once and stops at the fixpoint.
//    An unbounded walk never reaches this assertion.
let calls = 0
const counting = (path) => { calls += 1; return win32.dirname(path) }
assert.equal(dshRootAbove('C:\\a\\b\\c', counting), undefined)
assert.equal(calls, 4, 'C:\\a\\b\\c -> C:\\a\\b -> C:\\a -> C:\\ -> fixpoint')

// 3. The found branch, on a real tree: the search starts below the marker and
//    returns the ancestor that holds it.
const root = mkdtempSync(join(tmpdir(), 'dsh-info-root-'))
try {
  mkdirSync(join(root, 'packages', 'boot', 'app-boot'), { recursive: true })
  const nested = join(root, 'src', 'deep')
  mkdirSync(nested, { recursive: true })
  assert.equal(dshRootAbove(nested), root)
  assert.equal(dshRootAbove(join(root, 'packages')), root)
} finally {
  rmSync(root, { recursive: true, force: true })
}

// 4. `resolveDshRoot()` keeps its two strategies: DSH_ROOT wins, and the
//    argv[1] walk falls back to UNKNOWN instead of looping.
const previous = process.env.DSH_ROOT
try {
  process.env.DSH_ROOT = '/opt/dsh'
  assert.equal(resolveDshRoot(), '/opt/dsh')
  delete process.env.DSH_ROOT
  assert.equal(typeof resolveDshRoot(), 'string')
} finally {
  if (previous === undefined) delete process.env.DSH_ROOT
  else process.env.DSH_ROOT = previous
}

// 5. The mount path itself: `apply()` is what the registry awaits, so the search
//    must complete and the row must still register the section it always did.
let section
apply({ get: () => undefined, systemPrompt: { section: (value) => { section = value } } })
assert.equal(section.name, 'dsh:context')
assert.match(section.text(), /DeepSeek Harness implementation checkout is at /)

// 6. The shape of the defect itself: the walk must not compare a directory to
//    the POSIX root literal. Comment-free wording aside, `'/'` is not a root
//    test on Windows, and a reintroduction would hang rather than fail.
const source = readFileSync(new URL('./presets/iflow-cre-agent/dsh-info.mjs', import.meta.url), 'utf8')
assert.doesNotMatch(source, /[=!]==\s*['"]\/['"]/, "the walk stops at `dirname(dir) === dir`, never at '/'")

console.log('check-dsh-info-root: ok')
