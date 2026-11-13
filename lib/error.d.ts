/** 统一的错误消息读取，避免各层各写一遍 `instanceof Error` 判断。 */
export declare function errorMessage(error: unknown): string;
