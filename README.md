# MyClaw

MyClaw 是一个基于 OpenClaw 整体结构逐步构建的个人智能助手项目。当前阶段的重点，是先把本地 CLI、配置体系、Agent 会话能力，以及消息路由主链路搭建起来，在 OpenClaw 风格的基础上实现属于自己的 `myclaw`。

这份 README 只描述目前代码里已经落地的内容，不提前描述尚未完成的规划能力。

## 当前已实现

- 基于 Node.js + TypeScript 的 CLI 工程结构
- `myclaw` 可执行入口，支持优先加载 `dist/entry.js`，未构建时可回退到 `src/entry.ts`
- 基于 `commander` 的命令行框架
- 基于 YAML + Zod 的配置加载、默认配置生成与校验
- 支持通过 `.env` 或环境变量解析密钥
- 已接入 provider 配置模型，当前代码中支持：
  - `anthropic`
  - `openai`
  - `openrouter`
- 已实现交互式 `agent` 命令，底层基于 `@mariozechner/pi-coding-agent`
- 已实现 `onboard` 初始化向导，可生成本地配置
- 已实现 `doctor` 诊断命令，可检查 Node 版本、状态目录、配置文件、Provider 密钥和部分 Channel 配置
- 已实现 `status` 命令，用于输出当前配置摘要
- 已实现独立的路由模块 `src/routing/router.ts`
- 已支持基于 `config.routing` 的通道路由规则
- 已支持按 `channelId` 精确匹配规则，并支持 `*` 通配默认路由
- 当用户输入以 `/` 开头时，已支持先走技能命令解析，再进入对应的技能 Prompt 流程

## 当前命令状态

目前项目里注册了以下命令：

- `myclaw agent`
  - 已可用
  - 用于启动交互式智能助手会话
- `myclaw onboard`
  - 已可用
  - 用于通过命令行问答生成配置
- `myclaw doctor`
  - 已可用
  - 用于检查本地安装和配置状态
- `myclaw status`
  - 已可用
  - 用于查看当前 Provider、Channel 和 verbose 配置摘要
- `myclaw gateway`
  - 已注册
  - 网关相关代码已开始接入路由与 Agent 运行时，但命令本身仍未完成
- `myclaw message`
  - 已注册，但当前仍是占位状态

## 当前路由能力

目前 MyClaw 已经具备基础消息路由能力：

- 路由入口位于 `src/routing/router.ts`
- 路由器接收统一的请求结构：`channelId`、`sessionId`、`text`、`history`
- 普通消息会根据 `config.routing` 选择目标 Provider
- 如果规则中的 `agent` 为 `default`，则会回退到 `defaultProvider`
- 如果用户输入是 `/xxx` 形式的技能命令，会先尝试解析技能命令
- 命中技能命令后，会通过 `chatWithSkill()` 走单独的技能 Prompt

这意味着项目现在已经不只是“能启动一个 Agent”，而是已经开始形成“消息进入后，按规则决定交给哪个能力处理”的主链路。

## 当前配置方式

项目运行时会优先读取本地环境变量，并从默认状态目录加载配置：

- 状态目录：`~/.myclaw`
- 默认配置文件：`~/.myclaw/myclaw.yaml`

如果项目根目录存在 `.env`，启动时也会自动加载。当前默认配置会生成：

- 一个默认 Provider
- 一个默认终端 Channel
- 一条默认路由规则

默认 Provider 当前偏向 `openrouter`，默认模型为：

`stepfun/step-3.5-flash:free`

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 运行初始化向导

```bash
npm run onboard
```

或：

```bash
node myclaw.mjs onboard
```

### 3. 启动交互式助手

```bash
npm run agent
```

### 4. 运行诊断

```bash
npm run dev -- doctor
```

## 当前项目结构

```text
myclaw/
├─ myclaw.mjs            # CLI 启动入口
├─ src/
│  ├─ entry.ts           # 主入口
│  ├─ cli/               # 命令注册与命令实现
│  ├─ config/            # 配置 schema、加载与写入
│  ├─ agent/             # Agent 运行时、模型解析
│  ├─ routing/           # 路由模块
│  ├─ gateway/           # 网关相关代码
│  ├─ channels/          # 通道抽象与实现
│  └─ skills/            # 技能相关结构
└─ package.json
```

## 当前实现边界

基于现有代码，项目目前更适合被理解为：

- 一个已经具备基础 CLI 形态的 MyClaw 原型
- 一个已经能启动交互式 Agent 的最小可运行版本
- 一个已经具备基础消息路由能力的工程骨架
- 一个正在继续补全网关、多通道和更完整助手能力的项目

从当前代码现状看，以下部分还不能算完整可用：

- `gateway` 命令本身仍未完成
- Channel 管理虽然已经开始接入，但整体链路还在开发中
- `message` 命令尚未实现实际消息发送逻辑
- 多通道联动和外部平台接入仍处于早期阶段

## 技术栈

- Node.js 20+
- TypeScript
- Commander
- Zod
- YAML
- dotenv
- WebSocket (`ws`)
- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

## 项目定位

这个项目的目标不是直接复刻 OpenClaw，而是沿用它的整体组织方式，逐步构建自己的 `MyClaw` 智能助手。到目前为止，已经真正落地的重点包括：

- 自定义 CLI 入口
- 本地配置管理
- Provider 抽象
- 交互式 Agent 会话能力
- 基于规则的消息路由能力

后续能力仍需要在现有骨架上继续补全。
