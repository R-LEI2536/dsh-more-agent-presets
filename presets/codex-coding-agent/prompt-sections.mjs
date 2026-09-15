/**
 * 可配置的 prompt sections 插件，支持动态内容生成
 * 
 * 功能：
 *   - 根据平台自动替换 {{shell_tool}} 为 'bash' 或 'pwsh'
 *   - 自动注入平台、操作系统版本、当前日期等环境信息
 */
import os from 'node:os'

export const name = 'prompt-sections'
export const inject = ['systemPrompt']

/**
 * @param {object} ctx - Cordis context
 * @param {object} config - 配置对象
 * @param {Array<{name: string, order: number, text: string}>} config.sections - section 列表
 */
export function apply(ctx, config) {
  // 注册 {{shell_tool}} prompt 变量：由 harness 渲染时严格插值解析。
  // 即使某 section 以原文 {{shell_tool}} 注册（例如旧挂载快照），
  // 渲染也不会报 "unknown prompt variable"，而是得到本平台 shell 工具名。
  ctx.systemPrompt.variable('shell_tool', () => process.platform === 'win32' ? 'pwsh' : 'bash')

  // 注册环境信息变量
  ctx.systemPrompt.variable('platform', () => {
    const platform = process.platform
    // 转换为更友好的名称
    const platformNames = {
      'darwin': 'macOS',
      'win32': 'Windows',
      'linux': 'Linux',
    }
    return platformNames[platform] || platform
  })

  ctx.systemPrompt.variable('os_version', () => {
    try {
      // 优先使用简洁的 release 版本号（如 "7.1.8-1-cachyos", "22.6.0"）
      const release = os.release()
      return release
    } catch {
      return os.release()
    }
  })

  ctx.systemPrompt.variable('today_date', () => {
    const now = new Date()
    // 使用 ISO 格式 YYYY-MM-DD，或可根据需要本地化
    return now.toISOString().split('T')[0]
  })

  // 确定当前平台的 shell 工具名称
  const shellTool = process.platform === 'win32' ? 'pwsh' : 'bash'
  
  for (const section of config.sections ?? []) {
    if (!section.name || typeof section.order !== 'number' || !section.text) {
      ctx.logger.warn('prompt-sections: invalid section config, skipping:', section)
      continue
    }
    
    // 手动替换 {{shell_tool}} 为实际的工具名称
    const processedText = section.text.replaceAll('{{shell_tool}}', shellTool)
    
    ctx.systemPrompt.section({
      name: section.name,
      order: section.order,
      text: processedText,
    })
  }
}
