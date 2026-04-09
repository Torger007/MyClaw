# MyClaw

MyClaw 是一个基于 Node.js + TypeScript 开发的个人智能助手项目，整体思路参考了 OpenClaw。  
当前项目已经具备可用的本地 CLI、配置系统、Gateway 运行时、消息路由层，以及可收发消息的飞书通道。

## 当前状态

MyClaw 已经不只是一个原型骨架，而是具备了一条可以实际跑通的消息主链路：

- 从环境变量和 YAML 加载配置
- 启动 Gateway 服务
- 通过飞书长连接模式建立 WebSocket 连接
- 接收飞书文本消息
- 按通道规则进行消息路由
- 调用大模型提供商生成回复
- 将最终回复发送回飞书

## 目前已完成的成果

### 1. 基础运行时能力

- 基于 Node.js + TypeScript 的工程结构
- 通过 `myclaw.mjs` 作为 CLI 入口
- 基于 `commander` 的命令行框架
- 基于 YAML + Zod 的配置校验体系
- 支持 `.env` 环境变量加载
- 已接入多种 Provider 抽象：
  - `anthropic`
  - `openai`
  - `openrouter`

### 2. CLI 命令能力

- `myclaw agent`
  - 启动本地交互式智能体会话
- `myclaw onboard`
  - 生成初始配置
- `myclaw doctor`
  - 检查本地环境和配置状态
- `myclaw status`
  - 输出当前配置摘要
- `myclaw gateway`
  - 启动 Gateway 和已启用的消息通道

### 3. 路由能力

- 中央路由器位于 `src/routing/router.ts`
- 支持基于 `config.routing` 的通道路由规则
- 支持通道 ID 精确匹配
- 支持 `*` 通配符兜底路由
- 已接入技能式斜杠命令解析入口

### 4. Gateway 能力

- HTTP 健康检查接口
- WebSocket Gateway 服务
- 会话管理器
- Gateway 启动时统一拉起 ChannelManager

### 5. 飞书通道能力

- 基于 `@larksuiteoapi/node-sdk` 接入飞书自建应用
- 支持飞书长连接事件订阅模式
- 已接入 `im.message.receive_v1`
- 支持文本消息解析与文本回复发送
- 支持消息去重
- 支持串行消息队列，避免并发回复混乱
- 支持 `/clear` 清空当前会话历史

### 6. Agent 运行时能力

- 基于 `pi-coding-agent` 的运行时封装
- 使用 session 模式进行消息处理，而不是直接操作底层 agent 状态
- 支持从 `message_update` 中提取流式文本
- 支持从最终 assistant 消息中兜底提取文本
- 消息通道当前启用了只读工具集

## 飞书接入现状

目前飞书绑定已经基本可用。

### 已经可以工作的部分

- 可从环境变量加载飞书应用凭证
- 可成功启动飞书长连接
- 可正常接收飞书文本消息
- 可生成回复并发送回飞书

### 当前飞书通道的工具策略

飞书消息通道当前启用的是只读工具：

- `read`
- `grep`
- `find`
- `ls`

这让助手比纯聊天模式更聪明，能够查看项目、查找代码、总结结构，同时避免在非交互通道里因为写操作或命令执行而卡住。

### 当前的重要限制

配置里虽然仍然保留了 `toolApproval`，但飞书通道目前还没有实现“工具审批回传”这一整套交互闭环。  
因此，飞书通道现阶段不适合直接启用高风险工具，否则容易进入等待审批但无人响应的卡住状态。

## 配置说明

### 配置文件查找顺序

MyClaw 现在按以下顺序查找配置：

1. `MYCLAW_CONFIG_PATH`
2. `~/.myclaw/myclaw.yaml`
3. 当前项目目录下的 `./myclaw.yaml`

这意味着开发时可以直接使用项目根目录里的 `myclaw.yaml`。

### 配置示例

参考文件：

- `myclaw.yaml`

配置中最重要的几个字段：

- `defaultProvider`
- `providers`
- `channels`
- `routing`
- `agent`

### 常用环境变量

常见环境变量如下：

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
OPENROUTER_API_KEY=xxx
OPENAI_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 启动 Gateway

开发模式：

```bash
npm run gateway
```

如果当前环境对 `tsx` 有限制，可以直接运行编译后的输出：

```bash
node dist/entry.js gateway
```

### 4. 测试飞书通道

- 打开飞书机器人会话或目标群聊
- 发送一条文本消息，例如：`你好`
- 确认 MyClaw 可以正常回复

## 飞书接入指引

### 1. 在飞书开放平台中完成以下配置

创建自建应用后，需要完成这些步骤：

1. 开启机器人能力
2. 开启事件订阅
3. 使用长连接模式
4. 订阅 `im.message.receive_v1`
5. 开通消息相关权限
6. 发布为企业内可用版本
7. 将机器人加入目标群聊，或允许成员单聊机器人

### 2. 在 MyClaw 中配置通道与路由

确保路由中的通道名和真实通道 ID 一致：

```yaml
routing:
  - channel: my-feishu
    agent: free-model
  - channel: "*"
    agent: free-model
```

飞书通道配置示例：

```yaml
channels:
  - id: "my-feishu"
    type: "feishu"
    enabled: true
    appIdEnv: "FEISHU_APP_ID"
    appSecretEnv: "FEISHU_APP_SECRET"
```

## Provider 说明

### OpenRouter

当前项目默认使用：

```yaml
model: openrouter/free
```

这样做比固定写某一个临时免费模型更稳，因为 OpenRouter 上某些 `:free` 模型可能会在某段时间没有可用端点。

## 项目结构

```text
myclaw/
├─ myclaw.mjs
├─ myclaw.yaml
├─ src/
│  ├─ entry.ts
│  ├─ cli/
│  ├─ config/
│  ├─ agent/
│  ├─ routing/
│  ├─ gateway/
│  ├─ channels/
│  └─ skills/
├─ dist/
└─ package.json
```

## 关键文件说明

- `src/channels/feishu.ts`
  - 飞书消息接收、解析与回复发送逻辑
- `src/gateway/server.ts`
  - Gateway 启动与通道拉起逻辑
- `src/agent/runtime.ts`
  - Agent session 创建、上下文同步与回复提取逻辑
- `src/agent/model.ts`
  - 模型解析与 Provider 兼容处理
- `src/config/loader.ts`
  - 配置加载和配置文件查找逻辑
- `myclaw.yaml`
  - 项目本地运行配置

## 文档目录

更多细节请查看 `docs/` 目录：

- [docs/README.md](./docs/README.md)
  - 文档总览
- [docs/feishu-integration.md](./docs/feishu-integration.md)
  - 飞书接入、配置与排障
- [docs/architecture.md](./docs/architecture.md)
  - 当前系统架构与模块职责
- [docs/progress-and-limitations.md](./docs/progress-and-limitations.md)
  - 当前成果、能力边界与后续方向

## 当前已知限制

- `message` 命令仍然是占位状态
- Telegram 通道目前只有脚手架，尚未完整实现
- 飞书通道目前没有审批型工具调用闭环
- 飞书消息通道更适合问答、代码阅读、项目检索、架构总结，不适合高风险自动改代码

## 当前推荐使用方式

### 适合的场景

- 让助手解释项目代码
- 检索项目中的某段逻辑
- 总结配置结构和系统架构
- 在飞书里回答研发问题
- 在本地使用 `agent` 模式完成更深入的开发任务

### 当前不建议直接在飞书里做的事情

- 文件写入
- Shell 命令执行
- 需要人工确认的多步自动化改动

## 阶段性总结

到目前为止，MyClaw 已经具备了一条可以实际使用的飞书消息助手链路。

本阶段最核心的成果包括：

- 飞书通道已经真正接入项目
- `gateway` 命令已经可运行
- 配置加载逻辑已经支持项目本地配置
- Agent 回复提取逻辑已经稳定下来
- OpenRouter 兼容问题已经处理
- 消息通道已经从纯聊天模式升级为只读工具辅助模式

当前项目已经适合继续往这些方向迭代：

- 更丰富的工具能力
- 更安全的审批机制
- 更完整的多通道支持
- 更强的项目理解与助手行为设计
