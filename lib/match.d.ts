/** match 编译结果；任一项非法即整体拒绝，避免部分条件生效导致误匹配。 */
export type MatchCompileResult = {
    readonly ok: true;
    readonly patterns: readonly RegExp[];
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * 把 frontmatter 的 `match` 编译为正则数组。
 *
 * 正则不带 flags，因此 `test` 不保留 lastIndex 状态，可对同一候选反复求值。
 */
export declare function compileMatch(value: unknown): MatchCompileResult;
/** 候选为 `model` 与 `provider/model` 两个字符串，任一正则命中任一候选即视为适用。 */
export declare function matchesCandidates(patterns: readonly RegExp[], candidates: readonly string[]): boolean;
