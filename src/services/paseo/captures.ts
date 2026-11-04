import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'

export type PaseoCapture = { group: string; expression: string; token: string }

export function discoverPaseoCaptures(pattern: string, flags: string) {
  if (!pattern.trim()) throw new Error('A pattern is required.')
  if (pattern.length > 4000) throw new Error('Keep the pattern under 4,000 characters.')
  const ast = new RegExpParser({ ecmaVersion: 2025 }).parsePattern(pattern, 0, pattern.length, {
    unicode: flags.includes('u'),
  })
  const groups: Omit<PaseoCapture, 'token'>[] = []
  visitRegExpAST(ast, {
    onCapturingGroupEnter(node) {
      groups.push({ group: node.name ?? String(groups.length + 1), expression: node.raw })
    },
  })
  if (groups.length > 30) throw new Error('Use no more than 30 capture groups.')
  // Check support in the webview too, without executing the pattern.
  new RegExp(pattern, flags)
  return groups
}

export function reconcilePaseoCaptures(groups: Omit<PaseoCapture, 'token'>[], previous: PaseoCapture[]) {
  return groups.map(group => ({
    ...group,
    token:
      previous.find(
        saved =>
          saved.group === group.group &&
          (!/^\d+$/.test(group.group) || !saved.expression || saved.expression === group.expression),
      )?.token ?? '',
  }))
}
