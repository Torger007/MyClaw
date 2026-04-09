export { OpenClawConfigSchema, createDefaultConfig } from "./schema.js";
export type { OpenClawConfig, ProviderConfig, ChannelConfig } from "./schema.js";
export {
    loadConfig,
    writeConfig,
    getStateDir,
    getConfigPath,
    resolveSecret,
    ensureStateDir,
    loadConfigSnapshot,
} from "./loader.js";

//这是 TypeScript 项目中常见的"barrel export"模式
//——把模块内部的多个文件统一通过 index.ts 对外暴露。
//外部代码只需 import { loadConfig } from "../../config/index.js" 即可。