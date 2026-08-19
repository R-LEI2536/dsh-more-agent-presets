/**
 * DSH runtime information plugin.
 */

import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

export const name = 'dsh-info'

export const inject = ['systemPrompt']

function resolveDshRoot() {
  // Strategy 1: DSH_ROOT environment variable
  if (process.env.DSH_ROOT) {
    return process.env.DSH_ROOT
  }

  // Strategy 2: From entry script path
  if (process.argv[1]) {
    let dir = dirname(process.argv[1])
    while (dir !== '/') {
      if (existsSync(resolve(dir, 'packages', 'boot', 'app-boot'))) {
        return dir
      }
      dir = dirname(dir)
    }
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


