import { errorMessage } from './error.ts'

/** match 编译结果；任一项非法即整体拒绝，避免部分条件生效导致误匹配。 */
export type MatchCompileResult =
  | { readonly ok: true; readonly patterns: readonly RegExp[] }
  | { readonly ok: false; readonly reason: string }

/**
 * 把 frontmatter 的 `match` 编译为正则数组。
 *
 * 正则不带 flags，因此 `test` 不保留 lastIndex 状态，可对同一候选反复求值。
 */
export function compileMatch(value: unknown): MatchCompileResult {
  if (!Array.isArray(value)) {
    return { ok: false, reason: 'match 必须是字符串数组' }
  }
  if (value.length === 0) {
    return { ok: false, reason: 'match 不能为空数组' }
  }
  const patterns: RegExp[] = []
  for (const [index, pattern] of value.entries()) {
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      return { ok: false, reason: `match 第 ${index + 1} 项不是非空字符串` }
    }
    try {
      patterns.push(new RegExp(pattern))
    } catch (error) {
      return {
        ok: false,
        reason: `match 第 ${index + 1} 项不是合法正则：${errorMessage(error)}`,
      }
    }
  }
  return { ok: true, patterns }
}

/** 候选为 `model` 与 `provider/model` 两个字符串，任一正则命中任一候选即视为适用。 */
export function matchesCandidates(
  patterns: readonly RegExp[],
  candidates: readonly string[],
): boolean {
  return patterns.some(pattern => candidates.some(candidate => pattern.test(candidate)))
}
