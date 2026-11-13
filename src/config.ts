import z from '@deepseek-ai/schemastery'

/** 默认提示词根目录：`DSH_AGENTS_HOME` 非空时优先其下的 model-prompts，其次 `~/.agents/model-prompts`。 */
function defaultPromptRoots(): string[] {
  const roots: string[] = []
  const agentsHome = process.env.DSH_AGENTS_HOME
  if (agentsHome !== undefined && agentsHome !== '') {
    roots.push(`${agentsHome}/model-prompts`)
  }
  roots.push('~/.agents/model-prompts')
  return roots
}

export interface Config {
  /** 置 false 时插件不注册任何资源。 */
  enabled: boolean
  /** 提示词根目录，仅展开开头的 `~/`。 */
  promptRoots: string[]
  /** 单个提示词文件的字节上限，含 frontmatter。 */
  maxBytes: number
  /** 是否在注入文本前附带"仅适用于当前模型"的声明头。 */
  announce: boolean
  /** 是否监听目录变化并热更新。 */
  watch: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  promptRoots: z.array(z.string()).default(defaultPromptRoots()),
  maxBytes: z.number().default(65536),
  announce: z.boolean().default(true),
  watch: z.boolean().default(true),
})
