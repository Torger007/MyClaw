import { EventEmitter } from "node:events";
import type { Router, RouterRequest } from "../routing/router.js";

export type HistoryEntry = { role: "user" | "assistant"; content: string };
export type SessionMap = Map<string, HistoryEntry[]>;

/**
 *传入消息 - 从通道内接收到的用户信息
 */
export interface IncomingMessage {
    channelId: string; //通道标识符，如“terminal”“feishu”
    sessionId: string; //会话ID，用于维持对话上下文
    senderId: string; //发送者标识
    text: string; 
    timestamp: number;
    metadata?: Record<string, unknown>;  //可拓展的元数据 Record<string, unknown>	最灵活，值可以是任意类型
}

/**
 * 传出消息 - 要发送回通道的回复
 */
export interface OutgoingMessage {
    channelId: string;
    sessionId: string;
    text: string;
    metadata?: Record<string, unknown>;
}

/**
 * 通道事件定义
 * 它描述了一个事件监听器映射对象的结构，
 * 通常用于定义事件驱动的系统中（例如 WebSocket 连接、消息通道等）
 * 可以监听的事件及其对应的回调函数格式。
 */
export interface ChannelEvents {
    message: (msg: IncomingMessage) => void; //收到用户消息
    connected: () => void;   //通道连接成功
    disconnected: (reason?: string) => void; //通道断开连接
    error: (error: Error) => void;
}

/**
 * Channel 抽象类 —— 每个消息平台都要实现它
 */
export abstract class Channel extends EventEmitter {
    //抽象类成员定义
    abstract readonly id: string;
    abstract readonly type: string;
    abstract readonly connected: boolean;

    //共享会话存储 chatId -> 对话历史
    //protected 可以在本类和子类内部访问，不能通过实例外部访问
    //默认初始化一个空的Map对象
    protected sessions: SessionMap = new Map();

    //抽象方法
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract send(message: OutgoingMessage): Promise<void>;

    //通用路由逻辑，构建RouteRequest，管理历史，调用router
    protected async routeMessage(
        router: Router, //路由处理实例
        chatId: string,
        senderId: string, //发送者ID
        text: string,
    ): Promise<string> {
        //生成会话ID
        const sessionId = `${this.id}:${chatId}`; //结果示例："feishu-001:user_12345"
        //初始化会话历史
        //this.sessions：受保护的 Map 对象
        if (!this.sessions.has(chatId)) {
            this.sessions.set(chatId, []); //.set(chatId, [])：Map 方法，设置键值对，值为空数组
        }
        //第三步：获取历史记录
        const history = this.sessions.get(chatId)!;
        //.get(chatId)：Map 方法，获取指定键的值
        //!：非空断言操作符
        /**
         *告诉 TypeScript："我确信这个值不是 null 或 undefined"
         *因为上面已经检查并初始化，所以这里安全
         *如果不加 !，TypeScript 会报错：可能返回 undefined
         */

        //第四步：构建路由请求对象
        const request: RouterRequest = {
            channelId: this.id,
            sessionId,
            text,
            history: [...history],
        };

        //第五步：添加用户消息到历史
        history.push({ role: "user", content: text }); //.push()：数组方法，在末尾添加元素

        //第六步 调用路由处理器
        const response = await router.route(request); //response 是字符串类型（AI 的回复）

        //第七步 添加助手回复到历史
        history.push({ role: "assistant", content: response });

        //第八步 触发事件
        //this.emit()：继承自 EventEmitter 的方法
        //第一个参数："message" - 事件名称
        //第二个参数：事件数据对象
        this.emit("message", {
            channelId: this.id,
            sessionId,
            senderId,
            text,
            timestamp: Date.now(),
        });

        return response;
    }

    //清除指定 chatId的会话历史
    protected clearSession(chatId: string): void {
        this.sessions.delete(chatId);
    }
}
