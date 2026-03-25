import type { Session } from "./protocol.js";

//作用：存储所有会话的容器，用会话ID（string）快速查找对应的会话对象（Session）
export class SessionManager {
    //键为字符串，值为session类型的映射
    private sessions = new Map<string, Session>();//初始化值,创建一个新的空Map
    private maxHistory: number;

    //构造函数，在创建类实例时自动调用
    constructor(maxHistory: number = 50) {
        this.maxHistory = maxHistory; //将传入的 maxHistory参数值赋给类的 this.maxHistory属性
    }

    //获取或创建会话
    getOrCreate(channelId: string, sessionId?: string): Session {
        //空值合并运算符 ??
        //如果 sessionId有值（不是 null或 undefined），就使用 sessionId
        //如果 sessionId是 null或 undefined，就使用 ${channelId}:default
        const id = sessionId ?? `${channelId}:default`;
        //获取当前现有会话
        let session = this.sessions.get(id);//从 this.sessions（Map）中根据 id查找会话,如果找到，返回 Session对象；如果没找到，返回 undefined
        if (!session) {
            session = {
                id,
                channelId,
                createdAt: Date.now(),
                lastActiveAt: Date.now(),
                history: [],
            };
            this.sessions.set(id, session); //存储到 Map：this.sessions.set(id, session)
        }
        //最后活跃时间
        session.lastActiveAt = Date.now();
        return session;
    }

    //添加消息和历史裁剪
    addMessage(sessionId: string, role: "user" | "assistant", content: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) return; //防御性编程：会话不存在就静默返回

        session.history.push({ role, content });

        //关键：历史裁剪
        if (session.history.length > this.maxHistory) {
            session.history = session.history.slice(-this.maxHistory);
            //slice(-N) 保留最后 N 条消息，丢弃最早的消息
            //这防止历史无限增长导致 token 超限或内存溢出
        }
    }

    //其他辅助方法
    //获取所有会话数组
    getAll(): Session[] {
        return Array.from(this.sessions.values());
    }
    //获取当前活跃会话的数量
    get size(): number {
        return this.sessions.size; //this.sessions.size：Map 的 size属性返回 Map 中键值对的数量
        //用法： console.log(`当前有 ${sessionManager.size} 个活跃会话`);
    }
    //清空指定会话历史记录
    clearHistory(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.history = []; 
        }
    }
    //删除指定会话
    delete(sessionId: string): void {
        this.sessions.delete(sessionId); //直接删除map键值对
    }
}