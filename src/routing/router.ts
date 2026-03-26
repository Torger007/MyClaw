import type { OpenClawConfig } from "../config/index.js";
import type { AgentRuntime } from "../agent/runtime.js";
import type { SkillEntry } from "../skills/workspace.js";
import { resolveSkillCommand, getSkillPrompt } from "../skills/workspace.js";

//RouteRequest接口，路由的输入
export interface RouterRequest {
    channelId: string;
    sessionId: string;
    text: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
}

//Router接口：路由器的契约
//是一种规定和规范，规定了任何路由器实现必须遵守的行为准则
/**
 * 作用：
解耦：频道（Channel）不需要知道具体如何路由消息，只需要知道有 router.route() 这个方法可以
统一接口：无论是飞书、Telegram 还是其他频道，都用同样的方式调用路由
可替换性：可以轻松替换不同的 Router 实现，而不需要修改频道代码
 */
export interface Router {
    route(request: RouterRequest): Promise<string>;
}

export interface RouterOptions {
    skills?: SkillEntry[];
}

export function createRouter(
    config: OpenClawConfig,
    agent: AgentRuntime,  //agent运行实例，负责与AI模型交互的核心对象
    options?: RouterOptions
): Router {
    const rules = config.routing; //从配置对象中获取routing数组
    /**
     * 通常是
     * rules = [
  { channel: "feishu-company", agent: "gpt4" },
  { channel: "telegram-support", agent: "claude" },
  { channel: "*", agent: "default" }
     ]
     */
    const skill = options?.skills ?? []; //options?.skills：可选链操作符，如果 options 存在则取 skills 属性，否则返回 undefined

    //返回Router对象
    return {
        async route(request: RouterRequest): Promise<string> {
            //首先检测Skill命令
            if (request.text.startsWith("/")) {
                const resolved = resolveSkillCommand(request.text, skill);

                if (resolved) {
                    //确定发送给 AI 的用户消息
                    //如果有参数（resolved.args 非空），使用参数作为用户消息
                    //如果没有参数，使用原始文本 /help => "/help"
                    const userText = resolved.args || request.text;

                    const skillPrompt = getSkillPrompt(resolved.entry.skill);

                    //查找路由规则
                    const rule =
                        //精确匹配channelId：消息来自 feishu-executive 频道，查找 channel: "feishu-executive" 的规则
                        rules.find((r) => r.channel === request.channelId) ??
                        //通配符匹配，如果精确匹配失败，使用默认规则
                        rules.find((r) => r.channel === "*");

                    //确定使用AI提供商
                    //有匹配的规则（rule）（if rule.agent === "default" 则default ，否则rule.agent ）
                    //没有匹配规则（rule）就默认提供商
                    const providerId = rule
                        ? (rule.agent === "default" ? config.defaultProvider : rule.agent)
                        : config.defaultProvider;

                    //调用带skill的agent方法
                    return agent.chatWithSkill({
                        providerId,
                        skillPrompt,
                        message: [
                            ...request.history,
                            { role: "user", content: userText },
                        ],
                    });
                }
            }

            //查找路由规则（普通场景）
            const rule =
                rules.find((r) => r.channel === request.channelId) ??
                rules.find((r) => r.channel === "*");

            if (!rule) {
                throw new Error(
                     `No routing rule found for channel '${request.channelId}'`
                );
            }

            const providerId = rule.agent === "default"
                ? config.defaultProvider
                : rule.agent;

            //验证provider配置存在
            const provider = config.providers.find((p) => p.id === providerId);
            if (!provider) {
                throw new Error(`Provider '${providerId}' not found in config`);
            }

            return agent.chat({
                providerId: provider.id,
                message: [
                    ...request.history, //...是展开运算符，用于将数组的每个元素展开，然后再追加一条新消息
                    {role: "user", content: request.text},
                ],
            });
        }
    }
}

