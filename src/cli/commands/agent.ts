import type { Command } from "commander";
import chalk from "chalk";
import { getContext } from "../program.js";
import {
    InteractiveMode, //交互式终端界面
    createAgentSession, //创建 AI 代理会话的函数
    SessionManager //会话管理器类
} from "@mariozechner/pi-coding-agent";
import { createAuthStorage, createModelRegistry, resolveModel } from "../../agent/model.js";
import { buildSystemPrompt } from "../../agent/runtime.js";

export function registerAgentCommand(program: Command): void {
    program
        .command("agent")
        .description("Start an interactive agent chat session")
        .option("-m, --model <model>", "Override the model to use") //覆盖使用的模型
        .option("-p, --provider <id>", "Provider ID to use") //提供指定提供商ID
        .action(async (opts, cmd) => {
            //具体agent流程
            const ctx = getContext(cmd);
            const config = ctx.config; //从上下文获取配置

            //解析提供商配置
            const providerId = opts.provider ?? config.defaultProvider; //使用选项中的provider或默认
            const providerConfig = config.providers.find((p) => p.id === providerId); //查找相应的配置
            if (!providerConfig) {
                throw new Error(
                    `Provider '${providerId}' not found in config` +
                    `Available:${config.providers.map((p: any) => p.id).join(",")}`,
                );
            }

            //2.从myclaw配置中设置认证和模型
            const authStorage = createAuthStorage(config.providers);
            const modelRegistry = createModelRegistry(authStorage); //创建模型注册表
            const model = resolveModel(providerConfig, modelRegistry, opts.model); //解析模型

            //3.创建AgentSession(pi-coding-agent管理技能、工具等）
            const sessionManager = SessionManager.inMemory(process.cwd());
            const { session, modelFallbackMessage } = await createAgentSession({//智能体对话
                cwd: process.cwd(),
                authStorage,
                modelRegistry,
                model,
                sessionManager,
            });

            //4.设置myclaw系统提示词
            session.agent.setSystemPrompt(buildSystemPrompt(config, providerConfig));

            //5.启动交互模式TUI
            const mode = new InteractiveMode(session, { modelFallbackMessage }); //交互模式实例
            await mode.run();
        });
}