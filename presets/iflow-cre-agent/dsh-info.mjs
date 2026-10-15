/**
 * DSH runtime information plugin.
 *
 * Locating the checkout happens in `apply()`, i.e. at MOUNT, and the preset
 * registry awaits every child row while it activates (`register()` ->
 * `activate()` -> `mountPreset()` -> `auditRows()`,
 * `packages/preset/agent-preset-registry/src/index.ts:80-118`,
 * `:188-212`). Anything slow or non-terminating here does not fail a row — it
 * stalls DSH startup, before any preset is even selected. The walk below is
 * therefore bounded by the filesystem root, not by a POSIX root literal.
 */

import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

export const name = 'dsh-info'

export const inject = ['systemPrompt']

/** Checkout marker: the directory whose presence identifies the DSH source root. */
const MARKER = ['packages', 'boot', 'app-boot']

/**
 * Walk up from `start` to the checkout root, stopping at the filesystem root.
 *
 * Termination is `dirname(dir) === dir`, NOT a comparison against the POSIX
 * root literal `'/'`: the POSIX root is only one of the roots this runs on. On
 * Windows `dirname('C:\\')` is `'C:\\'`, and a non-absolute cursor fixes at
 * `'.'`, so the literal comparison never became true and the walk spun forever
 * on the event loop — `mountPreset()` awaited it, and `dsh` never finished
 * starting. Reached from v1.3.3 through v1.6.1.
 * @param start - directory to begin the search at.
 * @param dirnameOf - the platform's `dirname`. Injected so the Windows rule can
 *   be replayed on Linux through `node:path`'s `win32` implementation.
 * @returns the ancestor holding the marker, or undefined when none does.
 */
export function dshRootAbove(start, dirnameOf = dirname) {
  let dir = start
  for (;;) {
    if (existsSync(resolve(dir, ...MARKER))) return dir
    const parent = dirnameOf(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function resolveDshRoot() {
  // Strategy 1: DSH_ROOT environment variable
  if (process.env.DSH_ROOT) {
    return process.env.DSH_ROOT
  }

  // Strategy 2: From entry script path
  if (process.argv[1]) {
    return dshRootAbove(dirname(process.argv[1])) ?? 'UNKNOWN'
  }

  return 'UNKNOWN'
}

export function apply(ctx) {
  const sourceRoot = resolveDshRoot()

  ctx.systemPrompt.section({
    name: 'dsh:context',
    order: 81,
    text: () => {
      const webServer = ctx.get('webServer')
      const webuiUrl = webServer ? `http://127.0.0.1:${webServer.port}` : undefined
      
      return [
        `The DeepSeek Harness implementation checkout is at ${sourceRoot}. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.`,
        `You are interacting with the user through the DeepSeek Harness Web GUI at ${webuiUrl ?? 'UNKNOWN'}. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. The browser provides no implicit DOM, route, or screenshot context. The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while \`pnpm run dev:web\` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. Starting another server does not update this GUI. The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.`,
      ].join('\n\n')
    },
  })
}


