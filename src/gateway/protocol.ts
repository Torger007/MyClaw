//入站消息 客户端到网关

//客户端认证
export interface AuthMessage {
    type: "auth";
    token: string;
}

//发送用户消息给agent
export interface ChatMessage {
    type: "chat";
    channelId: string; //消息来源通道的唯一标识
    sessionId?: string; //可选会话ID，不传则使用默认会话（说明这个属性是可有可无的）
    text: string; //用户输入的文本
    metadata?: Record<string, unknown>; //可拓展的元数据
}

//通过网关向指定通道发送消息
export interface ChannelSendMessage {
    type: "channel.send";
    channelId: string; //目标通道
    text: string;  //要发送的文本
}

//心跳,检测连接是否存活
export interface PingMessage {
    type: "ping";
}

//获取网关运行状态
export interface StatusRequest {
    type: "status"; //请求网关状态
}

//返回工具调用的执行结果
export interface ToolResultMessage {
    type: "tool.result";
    toolCallId: string; //对应tool.call的ID
    result: string; //工具执行结果
    approved: boolean; //用户是否批准执行
}

//出站消息 网关到客户端
//认证结果，告知认证是否通过
export interface AuthResultMessage {
    type: "auth.result";
    success: boolean; //认证是否成功
    error?: string; //失败时错误的消息
}

//完整的agent回复
export interface ChatResponseMessage {
    type: "chat.response";
    channelId: string; 
    sessionId: string; //使用的会话ID
    text: string; //agent的完整回复
    done: boolean; //是否是最终回复
}

//流式传输的部分回复
export interface ChatStreamMessage {
    type: "chat.stream";
    channelId: string;
    sessionId: string;
    delta: string; //增量文本片段
}

//心跳响应
export interface PongMessage {
    type: "pong";
}

//网关运行状态详情
export interface StatusResponse {
    type: "status.response";
    //定义一个名为 channels的数组属性
    channels: Array<{
        id: string;
        type: string;
        connected: boolean;
    }>;
    sessions: number;
    uptime: number;
}

//错误返回
export interface ErrorMessage {
    type: "error";
    code: string; //错误码，如 "PARSE_ERROR"、"UNAUTHORIZED"
    message: string; //人类可读的错误描述
}

//agent 请求调用工具
export interface ToolCallMessage {
    type: "tool.call";
    toolCallId: string;
    name: string;
    args: Record<string, unknown>; //工具参数是一个键值对对象
    requiresApproval: boolean;  //是否需要人工批准
}

//联合类型 可以接受多种类型的变量
export type GatewayMessage =
    | AuthMessage
    | ChatMessage
    | ChannelSendMessage
    | PingMessage
    | StatusRequest
    | ToolResultMessage;

export type GatewayResponse =
    | AuthResultMessage
    | ChatResponseMessage
    | ChatStreamMessage
    | PingMessage
    | StatusResponse
    | ErrorMessage
    | ToolCallMessage;

//会话管理（记忆中枢）
export interface Session {
    id: string; //唯一标识 "channelId:sessionId" 或 "channelId:default"
    channelId: string; //所属通道
    createdAt: number; //创建时间戳
    lastActiveAt: number; //最后活跃时间戳
    history: Array<{    //对话历史
        role: "user" | "assistant";
        content: string;
    }>;
}