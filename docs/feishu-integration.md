# 飞书接入说明

本文档记录 MyClaw 当前飞书通道的接入方式、配置要求、联调步骤和常见问题。

## 一、当前接入方式

MyClaw 当前使用的是飞书开放平台的自建应用 + 长连接模式。

技术实现位于：

- `src/channels/feishu.ts`
- `src/channels/manager.ts`
- `src/gateway/server.ts`

核心特点：

- 不依赖公网回调地址
- 使用飞书 SDK 的 `WSClient`
- 通过 `im.message.receive_v1` 接收消息
- 通过 `im.message.create` 发送文本回复

## 二、飞书开放平台侧需要完成的配置

### 1. 创建自建应用

在飞书开放平台中创建一个企业自建应用。

### 2. 开启机器人能力

必须开启机器人相关能力，否则应用无法作为聊天机器人参与会话。

### 3. 开启事件订阅

事件订阅建议使用长连接模式。

当前 MyClaw 代码就是按长连接模式实现的，不是按 Webhook 模式实现的。

### 4. 订阅消息事件

至少需要订阅：

- `im.message.receive_v1`

这是当前飞书文本消息进入 MyClaw 的核心事件。

### 5. 开通相关权限

至少需要开通以下方向的权限：

- 接收消息事件相关权限
- 发送消息到会话相关权限

如果权限不完整，常见现象是：

- 能连接但收不到消息
- 能收到消息但发不出去

### 6. 发布应用

仅在开发后台保存配置通常不够，还需要发布为企业内可用版本。

### 7. 将机器人加入会话

可以是：

- 单聊机器人
- 将机器人加入群聊

如果机器人不在目标会话中，MyClaw 不会收到对应消息。

## 三、MyClaw 侧配置

当前项目示例配置位于：

- `myclaw.yaml`

示例：

```yaml
providers:
  - id: free-model
    type: openrouter
    apiKeyEnv: OPENROUTER_API_KEY
    baseUrl: https://openrouter.ai/api/v1
    model: openrouter/free

defaultProvider: free-model

routing:
  - channel: my-feishu
    agent: free-model
  - channel: "*"
    agent: free-model

channels:
  - id: "my-feishu"
    type: "feishu"
    enabled: true
    appIdEnv: "FEISHU_APP_ID"
    appSecretEnv: "FEISHU_APP_SECRET"
```

## 四、必须配置的环境变量

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
OPENROUTER_API_KEY=xxx
```

如果你不用 OpenRouter，也可以改成：

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

并同步修改 `myclaw.yaml` 中的 provider。

## 五、配置文件加载顺序

MyClaw 当前会按如下顺序找配置：

1. `MYCLAW_CONFIG_PATH`
2. `~/.myclaw/myclaw.yaml`
3. 当前项目目录下的 `myclaw.yaml`

这意味着开发阶段可以直接使用项目根目录里的 `myclaw.yaml`。

## 六、启动方式

### 开发阶段

```bash
npm run gateway
```

### 如果当前环境不适合跑 `tsx`

```bash
npm run build
node dist/entry.js gateway
```

## 七、联调时应该看到什么

启动成功时，终端通常会看到类似输出：

```text
[feishu] Starting WebSocket client...
[feishu] WebSocket connected and listening

MyClaw Gateway
WebSocket: ws://127.0.0.1:18789
Health: http://127.0.0.1:18789/health
```

收到飞书消息时，终端会打印：

```text
[feishu] Received message_id=...
```

这说明飞书消息已经进到 MyClaw 了。

## 八、当前飞书通道的工具策略

飞书通道当前启用的是只读工具：

- `read`
- `grep`
- `find`
- `ls`

这样做的原因是：

- 飞书是非交互消息通道
- 当前还没有“工具审批回传”机制
- 如果开放写入、命令执行类工具，模型有可能在等待审批时卡住

因此当前飞书更适合做：

- 项目检索
- 文件阅读
- 架构说明
- 开发问答
- 文案与内容生成

## 九、常见问题

### 1. 飞书里发消息没有任何反应

优先检查：

- 飞书应用是否已发布
- 机器人是否已加入当前聊天
- `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 是否正确
- 是否已订阅 `im.message.receive_v1`
- 通道 ID 与路由配置是否一致

### 2. 启动时提示飞书连接失败

优先检查：

- 飞书后台是否开启长连接模式
- App ID / App Secret 是否填写错误
- 当前网络是否能访问飞书开放平台

### 3. 模型返回 `No endpoints found`

这通常是 OpenRouter 某个具体免费模型没有可用端点导致的。

当前建议使用：

```yaml
model: openrouter/free
```

而不是固定写某个临时免费模型。

### 4. 回复 `(No response)`

这通常说明：

- 模型流式输出没有被正确提取
- 或 provider 兼容层返回结构不完整

当前项目已经做过一轮回复提取修复，但如果后续继续更换 provider，仍然建议关注运行时日志。

### 5. 提问后一直卡住

高概率原因：

- 模型尝试调用工具
- 工具需要审批
- 飞书通道没有审批回传

当前项目已经通过“只读工具模式”尽量降低了这个风险。

## 十、后续建议

如果后面要继续增强飞书通道，建议按这个顺序做：

1. 做飞书通道的工具审批回传机制
2. 在只读工具基础上逐步开放更强能力
3. 为飞书增加更清晰的错误提示和状态提示
4. 增加消息格式支持，例如卡片消息或富文本消息
