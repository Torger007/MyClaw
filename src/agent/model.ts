import type { Api, Model } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ProviderConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import { resolve } from "path/posix";
import { register } from "module";
import { Mode } from "fs";

//provider type to pi-ai Api type，提供者类型字符串映射为具体的 API 类型
function resolveApiType(providerType: string): Api {
    switch (providerType) {
        case "anthropic":
            return "anthropic-messages";
        case "openai":
            return "openai-completions"; //openai的API
        case "openrouter":
            return "openai-completions";
        default:
            return "openai-completions";
    }
}

//provider type to pi-ai provider id
function resolveProviderId(providerType: string): string {
    switch (providerType) {
        case "anthropic":
            return "anthropic";
        case "openai":
            return "openai";
        case "openrouter":
            return "openrouter";
        default:
            return providerType;
    }
}

//创建模型注册表
//创建 AuthStorage：将 MyClaw 配置中的 API Key 注入
export function createAuthStorage(providers: ProviderConfig[]): AuthStorage {
    const authStorage = AuthStorage.inMemory();
    for (const provider of providers) {
        const apiKey = resolveSecret(provider.apiKey, provider.apiKeyEnv);
        if (apiKey) {
            authStorage.setRuntimeApiKey(resolveProviderId(provider.type), apiKey);
        }
    }
    return authStorage;
}



//用于模型查找
export function createModelRegistry(authStorage: AuthStorage): ModelRegistry {
    //用 authStorage实例化 ModelRegistry
    //ModelRegistry实例，用于管理可用的 AI 模型
    ////authStorage- 上一步创建的 API 密钥存储
    return new ModelRegistry(authStorage);
}

//模型解析逻辑
export function resolveModel(
    providerConfig: ProviderConfig, //供应商配置
    modelRegistry: ModelRegistry, //模型注册表
    modelOverride?: string,   //可选：模型覆盖
): Model<Api> {
    const modelId = modelOverride ?? providerConfig.model; //优先使用覆盖模型
    const providerId = resolveProviderId(providerConfig.type);
    // 尝试从 pi-ai 内置目录查找模型
    const registered = modelRegistry.find(providerId, modelId);
    if (registered) {
        //返回注册表中的模型配置，但用配置中的 baseUrl覆盖
        //扩展运算符：{ ...registered }创建新的对象副本
        return {
            ...registered,
            baseUrl: providerConfig.baseUrl ?? registered.baseUrl, //优先使用提供的配置
            maxTokens: providerConfig.maxTokens ?? registered.maxTokens,
        } as Model<Api>;
    }
    //回退，手动构建model对象
    const baseUrl =
        providerConfig.baseUrl ??
        (providerConfig.type === "openrouter"
            ? "https://openrouter.ai/api/v1"
            : undefined);

    return {
        id: modelId,
        name: modelId,
        api: resolveApiType(providerConfig.type),
        provider: providerId,
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, //成本统计对象，用于记录AI模型调用的各项开销
        maxTokens: providerConfig.maxTokens ?? 4096,
    } as Model<Api>;
}