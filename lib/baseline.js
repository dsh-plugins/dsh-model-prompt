import { createHash } from 'node:crypto';
/**
 * 注入全文的稳定摘要。
 *
 * 会话日志只记录 digest 而不是全文：日志按「每次模型或文件变化 × 注入体积」
 * 增长，而基线比较只需要一个能判断「是否还是同一份贡献」的标识。
 * @param contribution - 本次注入系统提示词的完整文本。
 * @returns 十六进制摘要。
 */
export function contributionDigest(contribution) {
    return createHash('sha256').update(contribution).digest('hex');
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
export function recoverBaselineDigest(session) {
    const nodes = session.surface.nodes;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const seq = nodes[index];
        if (seq === undefined)
            continue;
        const event = session.eventAt(seq);
        if (event?.type !== 'user/message')
            continue;
        const message = event.data;
        if (message?.source?.kind !== 'model-prompt')
            continue;
        const digest = message.source.digest;
        if (typeof digest === 'string')
            return digest;
    }
    return undefined;
}
/**
 * 判断会话当前生效的系统提示词是否已经包含本次贡献。
 *
 * 只比较摘要无法发现"头部被别的状态覆盖过"的情况：插件卸载期间宿主会用
 * 不含本插件段落的文本重写头部，而日志里旧摘要仍在，摘要比较会误判为
 * 未变化，注入就此丢失。因此在内存基线缺失时对照真实文本核验一次。
 * @param session - 目标会话。
 * @param contribution - 本次应注入的完整文本。
 * @returns 生效的系统消息已包含该文本时为 true；contribution 为空串时恒为 true。
 */
export function sessionShowsContribution(session, contribution) {
    if (contribution === '')
        return true;
    const nodes = session.surface.nodes;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const seq = nodes[index];
        if (seq === undefined)
            continue;
        const event = session.eventAt(seq);
        if (event?.type !== 'system/message')
            continue;
        const message = event.data;
        const blocks = message?.message?.content ?? [];
        const text = blocks.map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('');
        // 空文本是休眠节点，不承载提示词；继续向前找真正生效的那条。
        if (text === '')
            continue;
        return text.includes(contribution);
    }
    return false;
}
