import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
import type { Config as PluginConfig } from './config.ts';
export { Config };
/** 插件名必须与 package.json 的 name 完全一致，注册表查询与日志都依赖它。 */
export declare const name = "dsh-model-prompt";
/** 严格注入检查要求列出 apply 内访问的全部服务。 */
export declare const inject: string[];
export declare function apply(ctx: Context, config: PluginConfig): Promise<void>;
