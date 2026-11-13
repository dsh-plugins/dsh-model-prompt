/** frontmatter 解析结果；失败时携带跳过原因，由调用方写入日志。 */
export type FrontmatterParseResult = {
    readonly ok: true;
    readonly data: unknown;
    readonly body: string;
} | {
    readonly ok: false;
    readonly reason: string;
};
/** priority 解析结果，取值规则与提示词文件格式一致。 */
export type PriorityParseResult = {
    readonly ok: true;
    readonly value: number;
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * 按首行 `---` 与后续第一个 `---` 行切出 frontmatter，并交给 YAML 解析。
 *
 * 只认整行（去掉行尾空白后等于 `---`），因为 markdown 正文中的 `---` 是分隔线而非围栏。
 * 兼容 CRLF 与 UTF-8 BOM：Windows 编辑器会写入这两者，若不做处理会把合法文件判成缺少围栏。
 */
export declare function parseFrontmatter(source: string): FrontmatterParseResult;
/** 读取可选的 priority：缺省为 0，出现则必须是有限数字。 */
export declare function parsePriority(value: unknown): PriorityParseResult;
