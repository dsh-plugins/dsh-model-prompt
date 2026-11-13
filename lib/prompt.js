import { matchesCandidates } from "./match.js";
/** priority 小者先拼接；同优先级按相对路径升序。 */
export function compareEntries(left, right) {
    if (left.priority !== right.priority)
        return left.priority - right.priority;
    if (left.relativePath === right.relativePath)
        return 0;
    return left.relativePath < right.relativePath ? -1 : 1;
}
/** 选出适用于当前模型的文件，并按拼接顺序返回。 */
export function selectEntries(snapshot, selection) {
    const candidates = [selection.model, `${selection.provider}/${selection.model}`];
    return snapshot.entries
        .filter(entry => matchesCandidates(entry.patterns, candidates))
        .sort(compareEntries);
}
/** 注入文本的固定声明头；模型切换后旧段落仍留在历史里，需要显式作废。 */
export function formatAnnouncement(selection) {
    const target = `${selection.provider}/${selection.model}`;
    return `以下为当前模型 ${target} 的专用指导。若当前模型不是 ${target}，请忽略本段；`
        + '历史记录中其他模型的专用指导同样不适用于当前模型。';
}
/**
 * 渲染当前模型应注入的完整文本。
 *
 * 无模型选择或无匹配文件时返回空串，由宿主丢弃空段。
 */
export function renderPrompt(snapshot, selection, announce) {
    if (selection === undefined)
        return '';
    const entries = selectEntries(snapshot, selection);
    if (entries.length === 0)
        return '';
    const body = entries.map(entry => entry.body).join('\n\n');
    if (!announce)
        return body;
    return `${formatAnnouncement(selection)}\n\n${body}`;
}
/**
 * 构造注入摘要：正文写进系统提示词，这份摘要只让界面与模型都知道
 * 「当前模型确实有一份专用指导、来自哪些文件」。
 *
 * 「上下文注入」列表只渲染 user/developer 消息，系统提示词段落不会出现在那里，
 * 因此需要一条独立消息承担可见性，不重复正文内容。
 * @param snapshot - 当前快照。
 * @param selection - 本步骤的模型选择。
 * @returns 摘要，或匹配为空时的 undefined。
 */
export function promptNotice(snapshot, selection) {
    const entries = selectEntries(snapshot, selection);
    if (entries.length === 0)
        return undefined;
    const files = entries.map(entry => entry.relativePath);
    return {
        files,
        text: `当前模型 ${selection.provider}/${selection.model} 的专用指导已注入系统提示词，来源：${files.join('、')}。`,
    };
}
