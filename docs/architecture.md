# 系统架构说明

本文档说明 MyClaw 当前的整体架构、主要模块和消息流转过程。

## 一、整体分层

当前项目大体可以分成以下几层：

1. CLI 层
2. 配置层
3. Gateway 层
4. Channel 层
5. Routing 层
6. Agent Runtime 层
7. Provider / Model 层

## 二、各模块职责

### 1. CLI 层

目录：

- `src/entry.ts`
- `src/cli/`

职责：

- 注册命令
- 解析命令行参数
- 加载上下文
- 启动对应能力，例如 `agent`、`gateway`、`doctor`

### 2. 配置层

目录：

- `src/config/schema.ts`
- `src/config/loader.ts`
- `src/config/index.ts`

职责：

- 定义配置结构
- 校验配置
- 加载 YAML 与环境变量
- 统一提供配置访问入口

### 3. Gateway 层

目录：

- `src/gateway/server.ts`
- `src/gateway/session.ts`
- `src/gateway/protocol.ts`

职责：

- 启动网关服务
- 提供健康检查
- 管理 Gateway 会话
- 为通道和路由提供运行容器

### 4. Channel 层

目录：

- `src/channels/transport.ts`
- `src/channels/manager.ts`
- `src/channels/feishu.ts`
- `src/channels/terminal.ts`
- `src/channels/telegram.ts`

职责：

- 抽象不同消息通道
- 统一处理通道生命周期
- 接收用户消息
- 将消息交给 Router
- 把最终回复发送回目标平台

其中：

- `transport.ts`
  - 通道抽象基类
- `manager.ts`
  - 管理所有启用的通道
- `feishu.ts`
  - 飞书通道实现
- `terminal.ts`
  - 本地终端通道实现
- `telegram.ts`
  - Telegram 脚手架实现，当前还未完成

### 5. Routing 层

目录：

- `src/routing/router.ts`

职责：

- 根据 `channelId` 选择目标 provider
- 处理普通消息路由
- 处理技能命令入口

它的核心作用是把“消息从哪个通道来”转换成“应该交给哪个能力处理”。

### 6. Agent Runtime 层

目录：

- `src/agent/runtime.ts`

职责：

- 创建 `pi-coding-agent` session
- 同步历史消息到 session
- 调用模型生成回复
- 从流式事件或最终消息中提取文本

这是当前项目里最核心的“智能体执行层”。

### 7. Provider / Model 层

目录：

- `src/agent/model.ts`

职责：

- 根据配置解析具体模型
- 处理 Provider 与模型注册表的适配
- 兼容 OpenRouter / OpenAI / Anthropic 的差异

## 三、当前消息流转过程

以飞书消息为例，当前链路如下：

1. 用户在飞书里发送一条文本消息
2. 飞书开放平台通过长连接把事件推送给 MyClaw
3. `src/channels/feishu.ts` 收到 `im.message.receive_v1`
4. 飞书通道解析消息内容
5. 飞书通道调用 `routeMessage()`
6. `routeMessage()` 构造统一的 RouterRequest
7. `src/routing/router.ts` 根据通道规则选择 provider
8. `src/agent/runtime.ts` 调用 session 和模型生成回复
9. 运行时提取最终文本
10. 飞书通道调用发送接口把文本发回飞书

## 四、当前会话机制

### 通道内会话

在 `transport.ts` 中，每个 Channel 自己维护一份会话历史：

- key: `chatId`
- value: 历史消息数组

这保证了同一飞书会话中的上下文连续性。

### Gateway 会话

在 `gateway/session.ts` 中，还实现了一套 Gateway 侧会话管理：

- 主要服务于 Gateway WebSocket 客户端
- 与具体 Channel 的内部历史并不完全等价

## 五、当前工具策略

消息通道现在不是完全无工具，也不是全工具，而是：

- 只开放只读工具

当前使用的是：

- `read`
- `grep`
- `find`
- `ls`

这样设计的目的是平衡：

- 能力
- 安全性
- 非交互通道的可控性

## 六、为什么没有直接开放全部工具

主要原因有三个：

1. 飞书是非交互通道
2. 当前没有工具审批回传机制
3. 一旦模型进入高风险工具审批流程，容易卡住

所以当前项目采用的方案是：

- 本地 `agent` 模式适合更强能力
- 飞书通道先使用只读工具模式

## 七、当前架构的优点

- 模块分层已经比较清晰
- 配置与运行时解耦
- 通道接入方式统一
- Router 作为中间层，后续扩展多通道更自然
- Agent Runtime 已经从“直接拼字符串调用”进化为 session 驱动

## 八、当前架构的不足

- Channel 与 Gateway 的边界还可以进一步收敛
- 工具审批机制没有在消息通道中闭环
- Telegram 通道尚未完成
- `message` 命令还没有实装
- 文档和代码注释目前仍然存在一些历史残留风格不统一的问题

## 九、推荐的下一步演进方向

建议按以下优先级演进：

1. 完成飞书工具审批闭环
2. 将读写工具策略从“全局”升级为“按通道配置”
3. 实现 Telegram 通道
4. 补全 `message` 命令
5. 为 Gateway 增加更清晰的状态与监控输出
