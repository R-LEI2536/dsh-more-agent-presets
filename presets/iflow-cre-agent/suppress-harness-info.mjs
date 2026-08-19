/**
 * Suppress harness identity, source, and web surface sections
 * by registering empty sections that shadow the global ones.
 */

export const name = 'suppress-harness-info'

export const inject = ['systemPrompt']

export function apply(ctx) {
  // Shadow harness:identity with empty text
  ctx.systemPrompt.section({
    name: 'harness:identity',
    order: -100,
    text: '',
  })

  // Shadow harness:source with empty text
  ctx.systemPrompt.section({
    name: 'harness:source',
    order: 81,
  })

  // Shadow app:web-surface with empty text
  ctx.systemPrompt.section({
    name: 'app:web-surface',
    order: 82,
  })
}
