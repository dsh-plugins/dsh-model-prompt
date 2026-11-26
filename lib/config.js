import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    enabled: z.boolean().default(true),
    promptRoots: z.union([z.array(z.string()), z.const(null)]).default(null),
    maxBytes: z.number().default(65536),
    announce: z.boolean().default(true),
    watch: z.boolean().default(true),
});
