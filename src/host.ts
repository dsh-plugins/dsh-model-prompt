/**
 * 宿主契约的本地声明。
 *
 * `@deepseek-ai/dsh-*` 内部包未随当前 DSH 发布到公共 npm，因此不从它们导入类型，
 * 而是按运行时行为在 `@deepseek-ai/cordis` 上做声明合并。这里只声明本插件用到的部分。
 *
 * 文件必须保留下面这行类型导入：缺少导入语句时本文件会被当成全局脚本，
 * 其中的 `declare module` 退化为环境模块声明并遮蔽真实包类型，`ctx.effect` 等方法随之丢失。
 */

import type {} from '@deepseek-ai/cordis'

/** 一次系统提示词装配的上下文（宿主在每步请求前构造）。 */
export interface AssembleContext {
  /** 触发本次装配的会话；诊断性装配时为 undefined。 */
  readonly agent?: AgentLike
  /** 作用域，实际为 agent 自身。 */
  readonly scope?: unknown
  /** 本步骤的模型选择；非 agent 步骤时为 undefined。 */
  readonly modelSelection?: ModelSelection
}

/** 当前步骤使用的模型。 */
export interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** 会话句柄；本插件把它当作稳定对象用作 WeakMap 键，并读取其表面节点。 */
export interface AgentLike {
  readonly session: SessionLike
}

/** 一条已持久化的会话事件，本插件只读取类型与数据。 */
export interface SessionEventLike {
  readonly type: string
  readonly data: unknown
}

/** 会话表面：请求实际发送的消息序列。 */
export interface SessionSurface {
  /** 当前表面上保留的事件序号，按模型可见顺序排列。 */
  readonly nodes: readonly number[]
}

/** 会话；仅暴露恢复注入基线所需的最小读接口。 */
export interface SessionLike {
  readonly surface: SessionSurface
  /** 按序号读取单个事件；序号不在日志中时返回 undefined。 */
  eventAt(seq: number): SessionEventLike | undefined
}

/** 一个系统提示词段落。 */
export interface PromptSection {
  readonly name: string
  readonly order: number
  /** 每次装配时求值；返回空串时由宿主丢弃该段。 */
  readonly text: string | ((context: AssembleContext) => string)
  /** 正文可能包含 `{{`，必须关闭插值，否则装配会抛错。 */
  readonly interpolate?: boolean
  readonly complete?: boolean
}

export interface SystemPromptService {
  section(section: PromptSection): () => void
}

export type PreStepDecision =
  | { readonly kind: 'reject' }
  | {
    readonly kind: 'enter'
    readonly messages: readonly unknown[]
    /** 置 true 使宿主把本步作为新请求系列起点，即以新文本替换头部系统节点。 */
    readonly startsRequestSeries?: true
  }

export interface PreStepPayload {
  readonly agent: AgentLike
  readonly messages: readonly unknown[]
  readonly turn: number
  readonly step: number
  readonly signal: AbortSignal
  readonly modelSelection: ModelSelection
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** DSH CLI 启动时提供的活动配置档及其 DSH 根目录。 */
    readonly profileContext: { readonly dir: string; readonly home: string }
    readonly systemPrompt: SystemPromptService
  }

  interface Events {
    'agent/pre-step'(
      payload: PreStepPayload,
      next: () => Promise<PreStepDecision>,
    ): Promise<PreStepDecision>
  }
}
