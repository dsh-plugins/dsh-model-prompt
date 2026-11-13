import { parse as parseYaml } from 'yaml';
import { errorMessage } from "./error.js";
/** frontmatter 起始与闭合行的规范形式。 */
const FENCE = '---';
/**
 * 按首行 `---` 与后续第一个 `---` 行切出 frontmatter，并交给 YAML 解析。
 *
 * 只认整行（去掉行尾空白后等于 `---`），因为 markdown 正文中的 `---` 是分隔线而非围栏。
 * 兼容 CRLF 与 UTF-8 BOM：Windows 编辑器会写入这两者，若不做处理会把合法文件判成缺少围栏。
 */
export function parseFrontmatter(source) {
    const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    const lines = text.split('\n');
    if (normalizeFenceLine(lines[0]) !== FENCE) {
        return { ok: false, reason: '缺少首行 --- 起始的 frontmatter' };
    }
    let closeIndex = -1;
    for (let index = 1; index < lines.length; index += 1) {
        if (normalizeFenceLine(lines[index]) === FENCE) {
            closeIndex = index;
            break;
        }
    }
    if (closeIndex === -1) {
        return { ok: false, reason: 'frontmatter 缺少闭合的 --- 行' };
    }
    // 按 '\n' 分行后 CRLF 文件的行尾仍留着 \r，YAML 遇到流式序列末尾的 \r 会直接报错，
    // 因此在交给解析器前统一去掉行尾回车。
    const yamlText = lines.slice(1, closeIndex).map(stripCarriageReturn).join('\n');
    let data;
    try {
        data = parseYaml(yamlText);
    }
    catch (error) {
        return { ok: false, reason: `frontmatter 不是合法 YAML：${errorMessage(error)}` };
    }
    return { ok: true, data, body: lines.slice(closeIndex + 1).map(stripCarriageReturn).join('\n') };
}
function stripCarriageReturn(line) {
    return line.endsWith('\r') ? line.slice(0, -1) : line;
}
/** 读取可选的 priority：缺省为 0，出现则必须是有限数字。 */
export function parsePriority(value) {
    if (value === undefined)
        return { ok: true, value: 0 };
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: 'priority 必须是有限数字' };
    }
    return { ok: true, value };
}
function normalizeFenceLine(line) {
    return (line ?? '').replace(/\r$/, '').trim();
}
