/**
 * 条件式 Git 提示段插件
 *
 * 仅当会话工作目录处于 git 仓库内时，向 system prompt 注入 Git 提交规范。
 * 检测结果按 cwd 缓存，避免每次组装 prompt 都启动子进程。
 *
 * config:
 *   - order: number  该 section 在 prompt 中的排序（缺省 85）
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'git-aware-prompt'

export const inject = ['systemPrompt']

const GIT_BLOCK = `# Git Repository
- The current working (project) directory is being managed by a git repository.
- When asked to commit changes or prepare a commit, always start by gathering information using shell commands:
  - \`git status\` to distinguish the requested changes from pre-existing work.
  - \`git diff HEAD\` to review all changes (including unstaged changes) to tracked files in work tree since last commit.
    - \`git diff --staged\` to review only staged changes when a partial commit makes sense or was requested by the user.
  - \`git log -n 3\` to review recent commit messages and match their style (verbosity, formatting, signature line, etc.)
- Stage only paths that belong to the requested change. Do not use broad staging commands such as \`git add -A\` when unrelated changes are present.
- Combine shell commands whenever possible to save time/steps, e.g. \`git status && git diff HEAD && git log -n 3\`.
- Always propose a draft commit message. Never just ask the user to give you the full commit message.
- Prefer commit messages that are clear, concise, and focused more on "why" and less on "what".
- Keep the user informed and request clarification or confirmation where the active interaction mode allows it; otherwise report any blocker.
- After each commit, confirm that it was successful by running \`git status\`.
- If a commit fails, never attempt to work around the issues without being asked to do so.
- Never push changes to a remote repository without being asked explicitly by the user.

## Git as Source of Truth
- Git history, recent changes, or who-changed-what — \`git log\` / \`git blame\` are authoritative. Do NOT rely on memory or assumption when you need to know what changed. Always run the command.
- If asked about *recent* or *current* state of the codebase, prefer \`git log\` or reading the code over any cached assumption. A memory or snapshot is frozen in time.
- Debugging solutions or fix recipes — the fix is in the code; the commit message has the context.`



/** cwd → 是否处于 git 仓库内的缓存 */
const gitCache = new Map()

/**
 * 判断一个目录是否处于 git 工作树内。
 * 优先用 `git rev-parse --is-inside-work-tree`（权威，兼容子目录、.git 文件、
 * worktree）；git 命令缺失时回退检查该目录是否存在 .git 条目。
 */
function isGitRepo(cwd) {
  if (gitCache.has(cwd)) return gitCache.get(cwd)
  let result = false
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    result = out.trim() === 'true'
  } catch {
    try {
      result = existsSync(join(cwd, '.git'))
    } catch {
      result = false
    }
  }
  gitCache.set(cwd, result)
  return result
}

export function apply(ctx, config = {}) {
  const order = typeof config.order === 'number' ? config.order : 85
  ctx.systemPrompt.section({
    name: 'git-repository',
    order,
    text: (context) => {
      const cwd = context.agent?.session?.header?.cwd
      if (!cwd) return ''
      return isGitRepo(cwd) ? GIT_BLOCK : ''
    },
  })
}
