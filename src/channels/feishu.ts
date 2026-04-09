import * as lark from "@larksuiteoapi/node-sdk";
import chalk from "chalk";
import type { ChannelConfig } from "../config/index.js";
import type { Router } from "../routing/router.js";
import { Channel, type OutgoingMessage } from "./transport.js";

//继承自 Channel 的飞书（Feishu/Lark）机器人通道
//负责通过 WebSocket 接收飞书消息
//通过 REST API 发送消息，并与一个 Router 路由模块对接，实现消息处理和回复。
export class FeishuChannel extends Channel {
    readonly id: string;
    readonly type = "feishu" as const;
    private client: lark.Client; //飞书SDK的HTTP客户端，用于调用飞书开放平台的REST API
    private wsClient: lark.WSClient | null = null; //飞书 WebSocket 客户端，用于接收实时消息事件。初始为 null，start 时创建。
    private _connected = false;
    private router: Router | null = null; //消息路由对象，用来根据消息内容决定如何生成回复（例如调用 LLM 或其他业务逻辑）。
    private config: ChannelConfig;
    private appId: string;
    private appSecret: string;
    private processedMsgIds = new Set<string>(); //用于消息去重
    private messageQueue: Array<() => Promise<void>> = []; //消息队列，存储待执行的任务函数
    private isProcessing = false;  //防止并发执行多个队列任务

    constructor(config: ChannelConfig, appId: string, appSecret: string) {
        super();
        this.id = config.id;
        this.config = config;
        this.appId = appId;
        this.appSecret = appSecret;
        //初始化lark.Client，使用自建应用类型（SelfBuild）
        this.client = new lark.Client({
            appId,
            appSecret,
            appType: lark.AppType.SelfBuild,
        });
    }

    //检查连接状态的getter
    get connected(): boolean {
        return this._connected;
    }

    setRouter(router: Router): void {
        this.router = router;
    }

    //启动通道
    async start(): Promise<void> {
        if (!this.router) {
            throw new Error("Router must be set before starting Feishu channel");
        }
        const router = this.router;

        //创建飞书SDK的事件分发器
        //注册对 im.message.receive_v1 事件的监听（收到新消息时触发）
        const eventDispatcher = new lark.EventDispatcher({}).register({
            "im.message.receive_v1": async (data: any) => {
                try {
                    await this.handleMessage(data, router);
                } catch (err) {
                    console.error(
                        chalk.red(
                            `[feishu] Error processing message: ${(err as Error).message}`
                        )
                    );
                }
            },
        });

        console.log(chalk.dim(`[feishu] Starting WebSocket client...`));

        //初始化WebSocket客户端
        this.wsClient = new lark.WSClient({
            appId: this.appId,
            appSecret: this.appSecret,
            loggerLevel: lark.LoggerLevel.warn,
        });

        await this.wsClient.start({ eventDispatcher });

        this._connected = true;
        this.emit("connected");
        console.log(chalk.green(`[feishu] WebSocket connected and listening`));
    }

    //停止通道
    async stop(): Promise<void> {
        (this.wsClient as { close?: (params?: { force?: boolean }) => void } | null)?.close?.({
            force: true,
        });
        this.wsClient = null;
        this._connected = false;
        this.emit("disconnected", "stopped");
    }

    //发送消息
    async send(message: OutgoingMessage): Promise<void> {
        //sessionId 的格式是 "channelId:chatId"，这里取冒号后面的部分作为飞书的聊天 ID（群聊或个人聊天 ID）。
        const chatId = message.sessionId.split(":")[1];
        if (!chatId) {
            console.error(`[feishu] Invalid session ID: ${message.sessionId}`);
            return;
        }

        //调用飞书 API 的 im.message.create 发送文本消息。
        await this.client.im.message.create({
            params: { receive_id_type: "chat_id" },
            data: {
                receive_id: chatId,
                msg_type: "text",
                content: JSON.stringify({ text: message.text }),
            },
        });
    }

    //队列处理逻辑
    private async processQueue(): Promise<void> {
        //防并发处理：锁机制
        //this.isProcessing：布尔标志，表示队列是否正在处理中。如果为 true，则直接返回，防止多个processQueue同时执行（避免并发问题）。
        //this.messageQueue.length === 0：如果队列为空，直接返回，避免无意义的处理。
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        while (this.messageQueue.length > 0) {
            //从队列头部取出第一个任务
            const task = this.messageQueue.shift();
            if (task) {
                try {
                    await task();
                } catch (err) {
                    console.error(
                        chalk.red(
                            `[feishu] Error processing queued message: ${(err as Error).message}`
                        )
                    );
                }
            }
        }

        this.isProcessing = false;
    }

    //核心消息处理
    private async handleMessage(data: any, router: Router): Promise<void> {
        const message = data.message;
        if (!message) return;
        //获取消息ID
        //若已在 processedMsgIds 集合中则跳过（去重）。
        //否则添加进去，并控制集合大小不超过 1000，防止内存无限增长。
        const messageId = message.message_id as string;
        console.log(chalk.dim(`[feishu] Received message_id=${messageId}, keys=${Object.keys(message).join(",")}`));
        if (messageId) {
            if (this.processedMsgIds.has(messageId)) return;
            this.processedMsgIds.add(messageId);

            if (this.processedMsgIds.size > 1000) {
                const first = this.processedMsgIds.values().next().value;
                if (first) this.processedMsgIds.delete(first);
            }
        }

        //只处理文本消息，其他类型（图片、富文本等）忽略。
        const msgType = message.message_type;
        if (msgType !== "text") return;

        const chatId = message.chat_id as string;
        const senderId = (data.sender?.sender_id?.open_id as string) ?? "unknown";

        //消息的 content 是 JSON 字符串，解析后取出 text 字段作为用户输入
        let text: string;
        try {
            const content = JSON.parse(message.content);
            text = content.text;
        } catch {
            return;
        }

        if (!text) return;

        //处理/clear命令
        if (text.trim() === "/clear") {
            this.clearSession(chatId);
            await this.client.im.message.create({
                params: { receive_id_type: "chat_id" },
                data: {
                    receive_id: chatId,
                    msg_type: "text",
                    content: JSON.stringify({ text: "Conversation history cleared." }),
                },
            });
            return;
        }

        //将消息处理加入队列
        this.messageQueue.push(async () => {
            try {
                const response = await this.routeMessage(router, chatId, senderId, text);
                await this.client.im.message.create({
                    params: { receive_id_type: "chat_id" },
                    data: {
                        receive_id: chatId,
                        msg_type: "text",
                        content: JSON.stringify({text: response}),
                    },
                });

            } catch (err) {
                console.error(
                    chalk.red(
                        `[feishu] Error processing message: ${(err as Error).message}`
                    )
                );
                await this.client.im.message.create({
                    params: { receive_id_type: "chat_id" },
                    data: {
                        receive_id: chatId,
                        msg_type: "text",
                        content: JSON.stringify({
                            text: "Sorry, I encountered an error. Please try again.",
                        }),
                    },
                });
            }
        });
        this.processQueue();
    }
}
