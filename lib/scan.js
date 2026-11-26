import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { errorMessage } from "./error.js";
import { compileMatch } from "./match.js";
import { parseFrontmatter, parsePriority } from "./frontmatter.js";
/** 展开 `~/` 前缀并去重，避免同一目录被扫描两次导致正文重复拼接。 */
export function resolveRoots(roots, home = os.homedir()) {
    const resolved = [];
    for (const root of roots) {
        const expanded = root.startsWith('~/') ? path.join(home, root.slice(2)) : root;
        if (!resolved.includes(expanded))
            resolved.push(expanded);
    }
    return resolved;
}
/** 扫描全部提示词根目录，返回一次性构建的完整快照。 */
export async function scanPromptRoots(roots, maxBytes, warn) {
    const entries = new Map();
    for (const root of roots) {
        await scanRoot(root, maxBytes, warn, entries);
    }
    return { entries: [...entries.values()] };
}
async function scanRoot(root, maxBytes, warn, entries) {
    let dirents;
    try {
        dirents = await readdir(root, { recursive: true, withFileTypes: true });
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
    for (const dirent of dirents) {
        if (dirent.isDirectory() || !dirent.name.endsWith('.md')) {
            continue;
        }
        const fullPath = path.join(dirent.parentPath, dirent.name);
        const relativePath = toRelativePath(root, fullPath);
        if (entries.has(relativePath) || isUnderHiddenDirectory(relativePath)) {
            continue;
        }
        const entry = await readEntry(fullPath, relativePath, maxBytes, warn);
        if (entry !== undefined) {
            entries.set(relativePath, entry);
        }
    }
}
/** 统计、读取并校验单个文件；任何不合格都记录原因后跳过。 */
async function readEntry(fullPath, relativePath, maxBytes, warn) {
    let stats;
    try {
        stats = await stat(fullPath);
    }
    catch (error) {
        warn(`model-prompt：无法读取 ${fullPath}（${errorMessage(error)}），已跳过`);
        return undefined;
    }
    if (!stats.isFile()) {
        warn(`model-prompt：${fullPath} 不是普通文件，已跳过`);
        return undefined;
    }
    if (stats.size > maxBytes) {
        warn(`model-prompt：${fullPath} 为 ${stats.size} 字节，超过 maxBytes=${maxBytes}，已跳过`);
        return undefined;
    }
    let source;
    try {
        source = await readFile(fullPath, 'utf8');
    }
    catch (error) {
        warn(`model-prompt：读取 ${fullPath} 失败（${errorMessage(error)}），已跳过`);
        return undefined;
    }
    const frontmatter = parseFrontmatter(source);
    if (!frontmatter.ok) {
        warn(`model-prompt：${fullPath}：${frontmatter.reason}，已跳过`);
        return undefined;
    }
    const data = frontmatter.data;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        warn(`model-prompt：${fullPath}：frontmatter 不是 YAML 映射，已跳过`);
        return undefined;
    }
    const record = data;
    const match = compileMatch(record.match);
    if (!match.ok) {
        warn(`model-prompt：${fullPath}：${match.reason}，已跳过`);
        return undefined;
    }
    const priority = parsePriority(record.priority);
    if (!priority.ok) {
        warn(`model-prompt：${fullPath}：${priority.reason}，已跳过`);
        return undefined;
    }
    const body = frontmatter.body.trim();
    if (body === '') {
        warn(`model-prompt：${fullPath}：正文为空，已跳过`);
        return undefined;
    }
    return { relativePath, patterns: match.patterns, priority: priority.value, body };
}
function toRelativePath(root, fullPath) {
    return path.relative(root, fullPath).split(path.sep).join('/');
}
/** 点目录整棵跳过；点文件不受影响。 */
function isUnderHiddenDirectory(relativePath) {
    const segments = relativePath.split('/');
    return segments.slice(0, -1).some(segment => segment.startsWith('.'));
}
