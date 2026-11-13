import type { PromptSnapshot } from './prompt.ts';
/** 日志出口；扫描层不直接依赖 ctx，便于把跳过原因交回插件层统一记录。 */
export type Warn = (message: string) => void;
/** 展开 `~/` 前缀并去重，避免同一目录被扫描两次导致正文重复拼接。 */
export declare function resolveRoots(roots: readonly string[], home?: string): string[];
/** 扫描全部提示词根目录，返回一次性构建的完整快照。 */
export declare function scanPromptRoots(roots: readonly string[], maxBytes: number, warn: Warn): Promise<PromptSnapshot>;
