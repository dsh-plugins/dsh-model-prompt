import { randomUUID } from 'node:crypto'
import chokidar from 'chokidar'
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import type { Config as PluginConfig } from './config.ts'
import { contributionDigest, recoverBaselineDigest } from './baseline.ts'
import { errorMessage } from './error.ts'
import type { ModelSelection } from './host.ts'
import { promptNotice, renderPrompt } from './prompt.ts'
import type { PromptNotice, PromptSnapshot } from './prompt.ts'
import { resolveRoots, scanPromptRoots } from './scan.ts'

export { Config }

/** 插件名必须与 package.json 的 name 完全一致，注册表查询与日志都依赖它。 */
export const name = '@dsh-plugin/dsh-model-prompt'

/** 严格注入检查要求列出 apply 内访问的全部服务。 */
export const inject = ['systemPrompt']

/** 目录事件去抖窗口，避免一次保存触发多轮扫描。 */
const RESCAN_DEBOUNCE_MS = 150

const WATCH_EVENTS = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const

const EMPTY_SNAPSHOT: PromptSnapshot = { entries: [] }

export async function apply(ctx: Context, config: PluginConfig): Promise<void> {
  if (!config.enabled) {
    ctx.logger.info('model-prompt：enabled 为 false，未注册系统提示词段与目录监听')
    return
  }
  const warn = (message: string) => ctx.logger.warn(message)
  const roots = resolveRoots(config.promptRoots)

  let snapshot: PromptSnapshot
  try {
    snapshot = await scanPromptRoots(roots, config.maxBytes, warn)
  } catch (error) {
    // 目录不可读时仍加载插件：保留空快照，后续 watcher 重扫成功后自动补上。
    warn(`model-prompt：首次扫描提示词目录失败，暂按空快照运行：${errorMessage(error)}`)
    snapshot = EMPTY_SNAPSHOT
  }

  const getSnapshot = () => snapshot
  const render = (selection: ModelSelection | undefined) =>
    renderPrompt(getSnapshot(), selection, config.announce)
  /** 每会话上次贡献的摘要；用于判断系统提示词头部是否需要替换。 */
  const previousBySession = new WeakMap<object, string>()

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'model-prompts',
    order: 100,
    interpolate: false,
    text: context => render(context.modelSelection),
  }), 'model-prompt:section')

  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const contribution = render(payload.modelSelection)
    const current = contributionDigest(contribution)
    // 只在内存基线缺失（重启、恢复会话、插件重载）时遍历会话表面。
    const previous = previousBySession.get(payload.agent.session)
      ?? recoverBaselineDigest(payload.agent.session) ?? ''
    previousBySession.set(payload.agent.session, current)
    if (current === previous) return decision
    const notice = promptNotice(getSnapshot(), payload.modelSelection)
    return {
      ...decision,
      // 「上下文注入」列表只渲染 user/developer 消息，系统提示词段落不会出现在那里；
      // 补一条摘要消息让界面能核对注入结果，正文仍只写进系统提示词，不重复占 token 预算。
      ...notice === undefined ? {} : { messages: [...decision.messages, noticeMessage(notice, payload.modelSelection, current)] },
      startsRequestSeries: true as const,
    }
  }), 'model-prompt:pre-step')

  if (!config.watch) {
    ctx.logger.info('model-prompt：watch 为 false，提示词文件变更需重启 DSH 生效')
    return
  }

  ctx.effect(() => {
    let timer: NodeJS.Timeout | undefined
    let disposed = false
    // 去抖只合并调度，不取消已在飞的扫描；迟到的旧扫描不得覆盖新快照。
    let scanGeneration = 0
    const watcher = chokidar.watch(roots, {
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    })
    const rescan = () => {
      timer = undefined
      const generation = ++scanGeneration
      scanPromptRoots(roots, config.maxBytes, warn).then((next) => {
        if (disposed || generation !== scanGeneration) return
        // 构建完成后整体替换，读侧永远看到自洽的快照。
        snapshot = next
      }, (error: unknown) => {
        if (disposed || generation !== scanGeneration) return
        warn(`model-prompt：重扫提示词目录失败，继续使用旧快照：${errorMessage(error)}`)
      })
    }
    const schedule = () => {
      if (disposed) return
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(rescan, RESCAN_DEBOUNCE_MS)
    }
    for (const event of WATCH_EVENTS) watcher.on(event, schedule)
    watcher.on('error', (error: unknown) => {
      ctx.logger.warn(`model-prompt：提示词目录监听出错：${errorMessage(error)}`)
    })
    return async () => {
      disposed = true
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      await watcher.close()
    }
  }, 'model-prompt:watch')
}

/**
 * 构造一条携带注入摘要的 user 消息。
 *
 * `source.kind` 是本插件自有取值：界面按未识别的来源类型展示其标签，
 * 展开后显示摘要正文，从而与系统提示词里的真实注入互相印证。
 * `source.digest` 保存本次注入的摘要而不是全文：日志按「变化次数 × 注入体积」
 * 增长，而基线比较只需要一个能判断是否同一份贡献的标识。
 * @param notice - 已渲染的摘要。
 * @param selection - 生成该摘要时的模型选择。
 * @param digest - 本次注入系统提示词全文的摘要。
 * @returns 可直接进入 surface 的 user 消息。
 */
function noticeMessage(
  notice: PromptNotice,
  selection: ModelSelection,
  digest: string,
): {
  id: string
  role: 'user'
  content: { type: 'text'; text: string }[]
  source: { kind: string; provider: string; model: string; files: string[]; digest: string; form: string; summary: string }
} {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: notice.text }],
    source: {
      kind: 'model-prompt',
      form: 'notice',
      provider: selection.provider,
      model: selection.model,
      files: [...notice.files],
      digest,
      summary: notice.text,
    },
  }
}
