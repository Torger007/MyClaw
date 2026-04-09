import { Channel } from "diagnostics_channel";
import { z } from "zod";

//Provider Schema:LLM供应商配置
export const ProviderConfigSchema = z.object({
    id: z.string().describe("Unique provider identifier"),
    type: z.enum(["anthropic", "openai", "openrouter"]).describe("LLM provider type"),
    apiKey: z.string().optional().describe("API key(or use env var)"),
    apiKeyEnv: z.string().optional().describe("Environment variable name for API key"),
    baseUrl: z.string().optional().describe("Custom API base URL (for OpenRouter, etc.)"),
    model: z.string().describe("Model name to use"),
    maxTokens: z.number().default(4096).describe("Max tokens per response"),
    temperature: z.number().default(0.7).describe("Sampling temperature"),
    systemPrompt: z.string().optional().describe("System prompt for the agent"),
});
//这是 Zod 最强大的特性之一：从模式推导出 TypeScript 类型
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

//Channel Schema 通道配置
export const ChannelConfigSchema = z.object({
    id: z.string().describe("Unique channel identifier"),
    type: z.enum(["terminal", "feishu", "telegram"]).describe("channel type"),
    enabled: z.boolean().default(true).describe("Whether the channel is active"),
    //feishu - specific
    appId: z.string().optional().describe("Feishu App ID"),
    appIdEnv: z.string().optional().describe("Env var for Feishu App ID"),
    appSecret: z.string().optional().describe("Feishu App Secret"),
    appSecretEnv: z.string().optional().describe("Env Var for Feishu App Secret"),
    //telegram - specific
    botToken: z.string().optional().describe("Telegram Bot Token"),
    botTokenEnv: z.string().optional().describe("Env var for Telegram Bot Token"),
    allowedChatIds: z.array(z.number()).optional().describe("Allowed Telegram chat IDs (whitelist)"),
    //common
    greeting: z.string().optional().describe("greeting message on connect"),
});
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

//路由规则配置
//路由规则决定了来自不同通道的消息应该交给哪个 Provider 处理。
export const RouteRuleSchema = z.object({
    channel: z.string().describe("Channel ID pattern(* for all)"),
    agent: z.string().default("default").describe("Agent/provider ID to route to"),
});
export type RouteRule = z.infer<typeof RouteRuleSchema>;

//PluginConfigSchema：插件配置
export const PluginConfigSchema = z.object({
    id: z.string().describe("Plugin identifier"),
    enabled: z.boolean().default(true),
    config: z.record(z.string(), z.unknown()).optional().describe("Plugin-specific config"),
});
export type PluginConfig = z.infer<typeof PluginConfigSchema>;

//顶层 OpenClawConfigSchema
//所有子 Schema 最终汇聚到顶层配置 Schema 中：
export const OpenClawConfigSchema = z.object({
    //网关设置
    gateway: z
        .object({
            host: z.string().default("127.0.0.1"),
            port: z.number().default(18789),
            token: z.string().optional().describe("Gateway auth token"),
            tokenEnv: z.string().optional().describe("Env var for gateway token"),
        }),

    //LLM提供商
    providers: z.array(ProviderConfigSchema).min(1).describe("At least one LLM provider"),

    //默认提供商 ID
    defaultProvider: z.string().describe("ID of the default provider"),

    //通道列表
    channels: z.array(ChannelConfigSchema).default([]).describe("Messaging channels"),

    //路由规则
    routing: z.array(RouteRuleSchema).default([{ channel: "*", agent: "defalut" }]),

    //插件列表
    plugins: z.array(PluginConfigSchema).default([]),

    //agent设置
    agent: z
        .object({
            name: z.string().default("MyClaw"),
            maxHistoryMessages: z.number().default(50),
            toolApproval: z.boolean().default(true).describe("Requrie approval for tool execution")
        }),
});
export type OpenClawConfig = z.infer<typeof OpenClawConfigSchema>;

//默认配置
export function createDefaultConfig(): OpenClawConfig {
    return {
        gateway: {
            host: "127.0.0.1",
            port: 18789,
        },
        providers: [
            {
                id: "default",
                type: "openrouter",
                apiKeyEnv: "OPENROUTER_API_KEY",
                model: "stepfun/step-3.5-flash:free",
                maxTokens: 4096,
                temperature: 0.7,
            },
        ],
        defaultProvider: "default",
        channels: [
            {
                id: "terminal",
                type: "terminal",
                enabled: true,
                greeting: "Hello! I'm MyClaw, your AI assistant. Type /help for commands.",
            },
        ],
        routing: [{ channel: "*", agent: "default" }],
        plugins: [],
        agent: {
            name: "MyClaw",
            maxHistoryMessages: 50,
            toolApproval: true,
        },
    };
}
