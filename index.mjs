import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-more-agentpresets-installer'

const PACKAGE_NAME = 'dsh-more-agentpresets'
const PACKAGE_VERSION = '1.1.0'
const sourceRoot = fileURLToPath(new URL('./presets/', import.meta.url))

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function readOwner(target) {
  try {
    return JSON.parse(await readFile(join(target, '.dsh-preset-owner.json'), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR' || error instanceof SyntaxError) return undefined
    throw error
  }
}

async function getCurrentPresets() {
  if (!await exists(sourceRoot)) return []
  const entries = await readdir(sourceRoot, { withFileTypes: true })
  return entries.filter(e => e.isDirectory()).map(e => e.name)
}

async function installPreset(id) {
  const source = join(sourceRoot, id)
  const target = join(dshHome(), '.agent-presets', id)
  const owner = await readOwner(target)

  if (await exists(target)) {
    if (owner?.package === PACKAGE_NAME) {
      // 已由本包安装，检查版本
      if (owner?.version === PACKAGE_VERSION) {
        console.info(`[${PACKAGE_NAME}] preset "${id}" already up-to-date (v${PACKAGE_VERSION}), skipping`)
        return
      } else {
        console.info(`[${PACKAGE_NAME}] updating preset "${id}" from v${owner.version} to v${PACKAGE_VERSION}`)
      }
    } else {
      // 不是本包管理的，跳过并警告
      console.warn(`[${PACKAGE_NAME}] skipped preset "${id}": ${target} already exists and is not managed by this plugin`)
      return
    }
  }

  const temporary = `${target}.installing-${process.pid}`
  await mkdir(dirname(target), { recursive: true })
  await rm(temporary, { recursive: true, force: true })
  await cp(source, temporary, { recursive: true })
  await writeFile(join(temporary, '.dsh-preset-owner.json'), `${JSON.stringify({
    package: PACKAGE_NAME,
    version: PACKAGE_VERSION,
  }, null, 2)}\n`, 'utf8')
  await rm(target, { recursive: true, force: true })
  await rename(temporary, target)
  console.info(`[${PACKAGE_NAME}] installed preset "${id}" at ${target}`)
}

async function cleanupObsoletePresets(currentIds) {
  const targetDir = join(dshHome(), '.agent-presets')
  if (!await exists(targetDir)) return
  
  const entries = await readdir(targetDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    
    const presetPath = join(targetDir, entry.name)
    const owner = await readOwner(presetPath)
    
    if (owner?.package === PACKAGE_NAME && !currentIds.includes(entry.name)) {
      await rm(presetPath, { recursive: true })
      console.info(`[${PACKAGE_NAME}] removed obsolete preset "${entry.name}"`)
    }
  }
}

export async function apply() {
  const currentIds = await getCurrentPresets()
  
  for (const id of currentIds) {
    await installPreset(id)
  }
  
  await cleanupObsoletePresets(currentIds)
}
