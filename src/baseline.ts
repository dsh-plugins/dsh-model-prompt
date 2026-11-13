import { createHash } from 'node:crypto'
import type { SessionLike } from './host.ts'

/**
 * 注入全文的稳定摘要。
 *
 * 会话日志只记录 digest 而不是全文：日志按「每次模型或文件变化 × 注入体积」
 * 增长，而基线比较只需要一个能判断「是否还是同一份贡献」的标识。
 * @param contribution - 本次注入系统提示词的完整文本。
 * @returns 十六进制摘要。
 */
export function contributionDigest(contribution: string): string {
  return createHash('sha256').update(contribution).digest('hex')
}

/**
 * 从会话表面恢复本插件上次贡献的摘要。
 *
 * 进程重启、会话恢复或插件重载后内存基线不复存在；若不恢复，会把同一份
 * 摘要重复写进历史。只在内存基线缺失时调用，因此这里从表面向后遍历是
 * 一次性开销，不是每步成本。
 * @param session - 目标会话。
 * @returns 上次贡献的摘要，或表面没有本插件记录时的 undefined。
 */
export function recoverBaselineDigest(session: SessionLike): string | undefined {
  const nodes = session.surface.nodes
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const seq = nodes[index]
    if (seq === undefined) continue
    const event = session.eventAt(seq)
    if (event?.type !== 'user/message') continue
    const message = event.data as { source?: { kind?: unknown; digest?: unknown } } | undefined
    if (message?.source?.kind !== 'model-prompt') continue
    const digest = message.source.digest
    if (typeof digest === 'string') return digest
  }
  return undefined
}
