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
    order: 210,
    text: () => {
      const webServer = ctx.get('webServer')
      const webuiUrl = webServer ? `http://127.0.0.1:${webServer.port}` : undefined
      return [
        '# DSH Context',
        `- Web UI URL: ${webuiUrl ?? 'UNKNOWN'}`,
        `- Source root: ${sourceRoot}`,
      ].join('\n')
    },
  })
}
