import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import chalk from "chalk";
import type { OpenClawConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js"; //解析密钥函数
import { SessionManager } from "./session.js";
import { createAgentRuntime } from "../agent/runtime.js";
import { createRouter } from "../routing/router.js";
import { createChannelManager } from "../channels/manager.js";  // 创建通道管理器
import type { SkillEntry } from "../skills/workspace.js";  // 技能条目类型
import type {
    ChatMessage,
    GatewayMessage,  // 网关消息类型
    GatewayResponse, // 网关响应类型
} from "./protocol.js";  // 协议定义

//第一步 接收配置参数
export interface GatewayOptions {
    config: OpenClawConfig; //完整Openclaw配置对象
    host: string;  //监听地址：如”127.0.0.1“
    port: number;  //监听端口：如18789
    verbose: boolean; //是否输出调试日志
    skills?: SkillEntry[]; //技能列表
    skillsPrompt?: string;
}

//整个网关的入口函数
export async function startGatewayServer(opts: GatewayOptions): Promise<void> {
    //解构选项
    const { config, host, port, verbose, skills, skillsPrompt } = opts;
    const startTime = Date.now() //记录启动时间

    //初始化子系统
    const sessions = new SessionManager(config.agent.maxHistoryMessages); //会话管理器
    const agent = await createAgentRuntime(config, {
        skills: skills?.map((s) => s.skill),
        skillsPrompt,
    });
    const router = createRouter(config, agent, { skills }); //创建路由器

    //创建http服务器（用于健康检查）
    //参数是一个回调函数，每当有HTTP请求到达时就会调用
    //req(request)：请求对象，包含客户端请求的所有信息
    //res (response)：响应对象，用于向客户端返回数据
    //返回一个http.server实例
    const httpServer = http.createServer((req, res) => {
        //检查健康端点
        if (req.url === "/health") {
            //200 HTTP状态码，表示成功
            //{ "Content-Type": "application/json" } 响应头对象，告诉客户端返回的是JSON数据
            res.writeHead(200, { "content-type": "application/json" });
            //结束相应并发送数据
            //转换为JSON字符串
            res.end(JSON.stringify({ status: "ok", uptime: Date.now() - startTime }));
            return;
        }
        res.writeHead(404); //其他路径返回404
        res.end();
    })

    //创建WebSocket服务器（附加到HTTP服务器）
    const wss = new WebSocketServer({ server: httpServer });

    //配置认证
    //从配置中认证令牌
    const authToken = resolveSecret(config.gateway.token, config.gateway.tokenEnv);
    //认证客户端存储
    const authenticatedClients = new WeakSet<WebSocket>();

    //跟踪连接的客户端
    const clients = new Set<WebSocket>();

    //网关服务器
    //新客户端成功建立网关连接时触发
    //ws参数表示当前连接的WebSocket客户端对象
    wss.on("connection", (ws) => {
        clients.add(ws); //添加客户端到集合
        //认证状态初始化
        const needsAuth = !!authToken; //判断是否需要认证，有token需要认证，反之不用
        if (!needsAuth) { //如果不需要，则自动认证
            authenticatedClients.add(ws);
        }
        if (verbose) { //详细日志
            console.log(chalk.dim(`[gateway] Client connected (total: ${clients.size})`));
        }

        //消息处理
        ws.on("message", async (data) => {
            let msg: GatewayMessage;
            try {
                msg = JSON.parse(data.toString()); //解析JSON消息
            } catch {
                send(ws, { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
                return;
            }

            // 检查其他消息的认证
            //这一段是网关的安全核心，负责验证客户端是否有访问权限
            //authenticatedClients.has(ws)  // 返回 true 或 false
            if (needsAuth && !authenticatedClients.has(ws)) {
                //未授权响应
                send(ws, {
                    type: "error",
                    code: "UNAUTHORIZED",
                    message: "Authenticate first"
                });
                return;
            }

            // 路由消息类型
            switch (msg.type) {
                case "ping": //心跳检测
                    send(ws, { type: "pong" });
                    break;
                case "status": {   //状态查询
                    const channelManager = createChannelManager(config);
                    send(ws, {
                        type: "status.response",
                        channels: channelManager.getStatus(),
                        sessions: sessions.size, //当前活跃的会话数量
                        uptime: Date.now() - startTime, //服务器运行时间
                    });
                    break;
                }
                    
                case "chat": { //聊天信息处理（核心功能）
                    //1.获取或创建对话
                    const chatMsg = msg as ChatMessage //显式断言
                    const session = sessions.getOrCreate(chatMsg.channelId, chatMsg.sessionId);

                    //2.将用户消息添加到会话历史
                    sessions.addMessage(session.id, "user", chatMsg.text);

                    try {
                        //3.将消息路由给Agent
                        const response = await router.route({
                            channelId: chatMsg.channelId,
                            sessionId: session.id,
                            text: chatMsg.text,
                            history: session.history.slice(0, -1), //排除刚刚添加的消息
                            //为什么是 slice(0, -1)？因为我们刚刚把 user 消息 push 进了 history，
                            //但 router 接收的 history 应该是"之前的"对话记录，
                            //当前消息已经通过 text 字段单独传递了。
                        });
                        //4.将Agent回复添加到会话历史
                        sessions.addMessage(session.id, "assistant", response);

                        //5.回复客户端
                        send(ws, {
                            type: "chat.response",
                            channelId: chatMsg.channelId,
                            sessionId: session.id,
                            text: response,
                            done: true,
                        });
                    } catch (err) {
                        //错误处理
                        const error = err as Error;
                        send(ws, {
                            type: "error",
                            code: "AGENT_ERROR",
                            message: error.message,
                        });
                    }
                    break;
                }  
                    
                case "channel.send": { //通道转发
                    if (verbose) {
                        console.log(chalk.dim(`[gateway] Send to channel '${msg.channelId}': ${msg.text}`));
                    }
                    break;
                }
                default: //未知消息类型
                    send(ws, {
                        type: "error",
                        code: "UNKNOWN_TYPE",
                        message: `Unknown message type: ${(msg as { type: string }).type}`,
                    });
            }
        });



        //连接关闭事件
        ws.on("close", () => {
            clients.delete(ws);
            if (verbose) {
                console.log(chalk.dim(`[gateway] Client disconnected (total: ${clients.size})`));
            }
        });

        //错误处理
        ws.on("error", (err) => {
            console.error(chalk.red(`[gateway] Websocket error: ${err.message}`));
        });

        //启动配置通道的管理器
        const channelManager = createChannelManager(config);
        await channelManager.startAll(router);

        //启动服务器
        return new Promise((resolve) => {
            //服务器启动逻辑
            //port	监听端口号 例如：3000, 8080, 8081
            //host	监听的主机地址	例如'localhost', '0.0.0.0', '127.0.0.1'
            httpServer.listen(port, host, () => {
                console.log(chalk.bold.cyan(`\n🦀 MyClaw Gateway`));
                //WebSocket 地址
                console.log(chalk.dim(`    WebSocket: ws://${host}:${port}`));
                //健康检查地址
                console.log(chalk.dim(`   Health:   http://${host}:${port}/health`));
                //认证状态
                // authToken 存在 → "enabled"（绿色或正常色）
                // authToken 不存在 → "disabled"（灰色或红色）    
                console.log(chalk.dim(`   Auth:      ${authToken ? "enabled" : "disabled"}`));
                //通道统计
                console.log(
                    chalk.dim(`Channel: ${config.channels.filter((c) => c.enabled).length} active`)
                );
                //默认提供商
                console.log(chalk.dim(`   Provider: ${config.defaultProvider}`));
                //详细日志
                if (verbose) {
                    console.log(chalk.dim("[gateway] Waiting for connections...\n"));
                }
            });
        });
    });
}

//辅助函数，发送消息到WebSocket客户端
function send(ws: WebSocket, msg: GatewayResponse): void {
    if (ws.readyState === WebSocket.OPEN) { //检查连接状态
        ws.send(JSON.stringify(msg)); //序列化并发送
    }
}