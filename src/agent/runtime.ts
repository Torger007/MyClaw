import chalk from "chalk";
import {
    createAgentSession,
    SessionManager,
    type Skill,
} from "@mariozechner/pi-coding-agent";
import { OpenClawConfig, ProviderConfig } from "../config/index.js";
import { createAuthStorage, createModelRegistry, resolveModel } from "./model.js";
import { Session } from "inspector";
import { trim } from "zod";

//定义聊天消息接口
export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

//定义智能体运行时的接口
export interface AgentRuntime {
    //普通聊天
    chat(request: { providerId?: string; message: ChatMessage[] }): Promise<string>;
    //带技能调用的聊天方法
    chatWithSkill(request: {
        providerId?: string;
        message: ChatMessage[];
        skillPrompt: string;
    }): Promise<string>;
}

//运行时选项接口
export interface AgentRuntimeOptions {
    providerId?: string;
    modelOverride?: string; //模型覆盖
    skills?: Skill[]; //技能列表
    skillsPrompt?: string; //技能提示词
}

//创建基于pi-coding-agent的智能体运行时
export async function createAgentRuntime(
    config: OpenClawConfig, //主配置
    options: AgentRuntimeOptions, //可选参数
): Promise<AgentRuntime> {
    //1.从myclaw中设置认证和模型注册表
    const authStorage = createAuthStorage(config.providers);
    const modelRegistry = createModelRegistry(authStorage);

    //2.解析主模型
    //提供的providerId配置或者默认配置
    const providerId = options?.providerId ?? config.defaultProvider;
    //在数组config.providers查找第一个id属性等于providerId的对象，并赋值给providerConfig
    const providerConfig = config.providers.find((p) => p.id === providerId);
    if (!providerConfig) { //配置验证
        throw new Error(
            `Provider '${providerId }' not found in config. ` +
        `Available: ${config.providers.map((p) => p.id).join(",")}`,
        );
    }

    //解析具体模型
    const model = resolveModel(providerConfig, modelRegistry, options?.modelOverride);
    //输出调试消息
    console.log(chalk.dim(`[agent] Using model: ${model.provider}/${model.id}`));

    //创建agent会话
    //使用进程当前工作目录为根目录
    //process.cwd()返回当前 Node.js 进程的工作目录路径
    //创建一个基于内存的会话管理器实例。
    const sessionManager = SessionManager.inMemory(process.cwd());

    //创建智能体会话 ,这里可以添加自定义工具
    const { session } = await createAgentSession({
        cwd: process.cwd(), //当前工作目录
        authStorage, //认证存储
        modelRegistry, //模型注册表
        model,
        sessionManager,
    });

    //4.构建基础系统提示词
    const baseSystemPrompt = buildSystemPrompt(config, providerConfig, options?.skillsPrompt);
    //设置到智能体
    session.agent.setSystemPrompt(baseSystemPrompt);

    //返回运行时的对象
    return {
        //普通聊天实现
        async chat(request): Promise<string> {
            //只提取最新用户消息文本
            const lastMsg = request.message[request.message.length - 1];
            if (!lastMsg || lastMsg.role !== "user") {
                return "(No user message)";
            }

            //调用辅助函数处理消息并提取响应
            return promptAndExtract(session.agent, lastMsg.content);
        },

        //带技能的聊天实现
        async chatWithSkill(request): Promise<string> {
            const lastMsg = request.message[request.message.length - 1];
            if (!lastMsg || lastMsg.role !== "user") {
                return "(No user message)";
            }

            //临时用技能提示词覆盖系统提示词
            session.agent.setSystemPrompt(request.skillPrompt);
            try {
                //使用技能提示词处理消息
                return await promptAndExtract(session.agent, lastMsg.content);
            } finally {
                //无论成功失败都恢复基础提示词
                session.agent.setSystemPrompt(baseSystemPrompt);
            }
        }
    }
}

/**
promptAndExtract的主要作用是：
记录当前消息数量
向agent发送用户消息并等待响应
从新增的助手消息中提取文本内容
将所有提取的文本合并返回，如果没有响应则返回默认文本
 */
async function promptAndExtract(agent: any, userText: string): Promise<string> {
    //用于记录发送用户消息前的消息数量
    const beforeCount = agent.state.message.length;//获取agent.state.messages.length的值（当前消息数组长度）
    await agent.prompt(userText); //发送用户消息给agent，等待await异步完成
    await agent.waitForIdle(); //等待agent变为空闲状态
    const allMessage = agent.state.message; //获取当前所有的消息数组
    const newMessage = allMessage.slice(beforeCount); //获取新添加的消息
    //初始化textParts，用于存储提取的文本片段
    const textParts: string[] = [];
    for (const msg of newMessage) {
        if (msg.role !== "assistant") continue;
        extractText(msg.content, textParts);
    }
    return textParts.join("\n") || "(No response)";

}

//extractText函数作用是从pi-agent-core消息内容中提取文本
function extractText(content: unknown, out: string[]): void {
    if (typeof content === "string") {
        if (content.trim()) out.push(content);//如果content.trim()不为空字符串,则填入数组
        return; //结束函数执行
    }
    if (!Array.isArray(content)) return; //如果不是数组，直接返回，不执行后面代码
    for (const block of content) {//遍历content所有元素
        if (typeof block === "string") {
            if (block.trim()) out.push(block);
        } else if (block && typeof block === "object") {
            //仅提取"text"类型的块，跳过"thinking"、"tool_use"等类型
            const b = block as { type?: string; text?: string };//使用断言as将block转换为具有可选属性type和text对象
            /**
             (同时满足)
             b.type等于字符串"text"
             b.text的类型是字符串
             b.text.trim()不为空字符串
             */
            if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
                out.push(b.text);
            }
        }
    }
    
}

//构建默认系统提示词函数
export function buildSystemPrompt(
    config: OpenClawConfig,
    providerConfig: ProviderConfig,
    skillsPrompt?: string,
): string {
    //从配置中获取机器人名称，如果不存在则使用默认值 "MyClaw"
    //?.是可选链操作符，防止agent为null或undefined时报错
    const botName = config.agent?.name ?? "MyClaw";
    //初始化常量lines
    const lines = [
        `You are a personal assistant running inside ${botName}.`,
        "",
        "## Tool Call Style",
        //不详细说明常规、低风险的工具调用
        "Default: do not narrate routine, low-risk tool calls (just call the tool).",
        //仅在有助于理解时详细说明：多步骤工作、复杂问题、敏感操作（如删除）或用户明确要求时
        "Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
        //保持说明简短且信息密集；避免重复明显步骤
        "Keep narration brief and value-dense; avoid repeating obvious steps.",
        //使用通俗语言进行说明，除非在技术场景中
        "Use plain human language for narration unless in a technical context.",
        "",
        "## Safety", //安全规则
        //无独立目标规则：不追求自我保护、复制、资源获取或权力寻求；避免超出用户请求的长期计划
        "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
        //优先考虑安全和人类监督而非任务完成；冲突时暂停询问；遵守停止/暂停/审计请求，绝不绕过保护措施
        "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
        //不操纵或说服任何人扩展访问或禁用保护；除非明确请求，否则不复制自身或更改系统提示、安全规则、工具策略
        "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
        "",
        "## Guidelines",//指导规则
        //列表项：使用用户的语言回应
        "- Respond in the user's language",
        "- Be helpful, accurate, and concise",
        //列表项：请求模糊时询问澄清
        "- Ask for clarification when the request is ambiguous",
    ];

    //技能部分，与OpenClaw的buildSkillsSection对齐
    //如果skillsPrompt存在，则调用其trim()方法去除首尾空格,如果不在则undefined
    const trimmedSkills = skillsPrompt?.trim();
    if (trimmedSkills) {
        //向lines数组推入新元素
        lines.push(
            "",
            "## Skills",
            //回复前：扫描可用技能及其描述
            "Before replying: scan available skills and their descriptions.",
            //如果恰好一个技能适用，遵循其指令
            "- If exactly one skill clearly applies: follow its instructions.",
            //如果多个适用，选择最具体的
            "- If multiple could apply: choose the most specific one.",
            //如果都不适用，继续进行常规协助
            "- If none clearly apply: proceed with normal assistance.",
            "",
            trimmedSkills
        );
    }
    if (providerConfig.systemPrompt?.trim()) {
        lines.push("", "## Custom Instructions", providerConfig.systemPrompt.trim());
    }
    //用换行符\n连接lines数组所有元素形成的字符串
    return lines.join("\n");
}



