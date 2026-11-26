import z from '@deepseek-ai/schemastery';
export interface Config {
    /** 置 false 时插件不注册任何资源。 */
    enabled: boolean;
    /** 提示词根目录，按优先级排列。省略时使用当前配置档和 DSH 根目录推导默认值。 */
    promptRoots?: string[] | null;
    /** 单个提示词文件的字节上限，含 frontmatter。 */
    maxBytes: number;
    /** 是否在注入文本前附带"仅适用于当前模型"的声明头。 */
    announce: boolean;
    /** 是否监听目录变化并热更新。 */
    watch: boolean;
}
export declare const Config: z<Config>;
