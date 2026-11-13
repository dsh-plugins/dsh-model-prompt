import z from '@deepseek-ai/schemastery';
/** 默认提示词根目录：`DSH_AGENTS_HOME` 非空时优先其下的 model-prompts，其次 `~/.agents/model-prompts`。 */
function defaultPromptRoots() {
    const roots = [];
    const agentsHome = process.env.DSH_AGENTS_HOME;
    if (agentsHome !== undefined && agentsHome !== '') {
        roots.push(`${agentsHome}/model-prompts`);
    }
    roots.push('~/.agents/model-prompts');
    return roots;
}
export const Config = z.object({
    enabled: z.boolean().default(true),
    promptRoots: z.array(z.string()).default(defaultPromptRoots()),
    maxBytes: z.number().default(65536),
    announce: z.boolean().default(true),
    watch: z.boolean().default(true),
});
