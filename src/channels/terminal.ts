import readline from "node:readline";
import chalk from "chalk";
import type { OpenClawConfig, ChannelConfig } from "../config/index.js";
import type { Router } from "../routing/router.js";
import type { SkillEntry } from "../skills/workspace.js";
import { listUserInvocable } from "../skills/workspace.js";
import { Channel, type OutgoingMessage } from "./transport.js";

export class TerminalChannel extends Channel { //extends Channel表示继承Channel基类，表示一个特定频道实现
    //属性定义
    readonly id: string;
    readonly type = "terminal" as const;
    private rl: readline.Interface | null = null;
    private _connected = false;  //表示连接状态标志
    private router: Router;
    private config: ChannelConfig;
    private agentName: string;
    private chatId: string;
    private skills: SkillEntry[];

    //构造函数
    constructor(config: ChannelConfig, router: Router, agentName: string, skills?: SkillEntry[]) {
        super(); //调用父类Channel构造函数
        this.config = config;
        this.router = router;
        this.agentName = agentName;
        this.skills = skills ?? [];
        this.id = config.id;
        this.chatId = `${this.id}:cli`;  //构建聊天会话ID
    }

    //Getter属性
    //get connected()：定义 getter，使 channel.connected 可以像访问属性一样获取私有变量 _connected 的值
    get connected(): boolean {
        return this._connected;
    }

    //公共方法
    //1.start()方法
    async start(): Promise<void> {
        //创建readline接口
        this.rl = readline.createInterface({
            input: process.stdin, //从标准输入读取，键盘输入
            output: process.stdout,  //输出到标准输出，控制台
            prompt: chalk.green(`\n${this.agentName}`),
        });

        //设置连接状态
        this._connected = true;
        this.emit("connected"); //触发父类事件，通知监听者连接已建立

        //显示欢迎消息
        const greeting = this.config.greeting || `Hello! I am ${this.agentName}. How can I help you?`;
        console.log(chalk.cyan(`\n${greeting}`));

        //显示帮助提示
        console.log(chalk.dim("Type /help for available commands\n"));

        //显示提示符
        this.rl.prompt(); //rl.prompt(): 显示在 createInterface 中定义的提示符,这会显示：\nAgentName>并等待用户输入

        //监听输入行事件
        //监听“line”事件,用户按回车键触发，注意是事件监听器，不是立即执行
        //事件回调：接收用户输入的整行文本作为参数
        this.rl.on("line", async (line: string) => {
            //处理输入
            const trimmed = line.trim();
            if (!trimmed) {//如果用户输入空
                this.rl?.prompt(); //若rl存在，则调用prompt()
                return; //不处理空输入
            }
            //处理命令
            const isCommand = await this.handleCommand(trimmed);
            if (!isCommand) {
                const response = await this.routeMessage(this.router, this.chatId, "terminal-user", trimmed);
                await this.send({
                    channelId: this.id,
                    sessionId: `${this.id}:${this.chatId}`,
                    text: response,
                });
            }
            this.rl?.prompt(); //无论输入是命令还是普通消息，处理完后都重新显示提示符,准备接收下一个用户输入
        });
    }

    //stop（）方法
    async stop(): Promise<void> {
        this.rl?.close();
        this._connected = false;
        this.emit("disconnected", "stopped"); //触发断开事件
    }

    //send()方法
    async send(message: OutgoingMessage): Promise<void> {
        console.log(chalk.cyan(`${this.agentName}: ${message.text}`));
    }

    //私有方法 handleCommand，使用switch处理内置命令
    private async handleCommand(input: string): Promise<boolean> {
        const [cmd] = input.split(" ");
        switch (cmd) {
            case "/help":
                console.log(chalk.dim("\nAvailable commands:"));
                return true;
            case "/clear":
                this.clearSession(this.chatId); //清空会话历史
                console.log(chalk.dim("\nConversation history cleared. \n"));
                return true;
            case "/history": {
                const history = this.sessions.get(this.chatId) ?? [];
                //使用for of循环遍历历史消息
                for (const msg of history) {
                    // 根据角色选择不同的颜色和前缀
                    const prefix = msg.role === "user" ? "You" : this.agentName;
                    const color = msg.role === "user" ? chalk.green : chalk.cyan;
                    //用户消息 → 使用绿色 (chalk.green)
                    //AI消息 → 使用青色 (chalk.cyan)

                    //截断过长的消息
                    const truncated = msg.content.length > 100 //msg.content.length > 100：检查消息内容长度是否超过100字符
                        ? msg.content.slice(0, 100) + "..."  //如果超过：取前100字符加省略号
                        : msg.content;  //如果没超过，使用完整内容

                    console.log(color(`${prefix}:${truncated}`)); //color(...)：应用之前选择的颜色
                }
                return true;
            }
            case "/status": { //状态查看
                console.log(chalk.dim(`\n Channel: ${this.id} (${this.type})`));
                console.log(chalk.dim(`  Session: ${this.id}: ${this.chatId}`));
                console.log(chalk.dim(`  History:${(this.sessions.get(this.chatId) ?? []).length} message\n`));
                return true;
            }
            case "/skills": {
                const invocable = listUserInvocable(this.skills); //从所有技能中筛选出用户可以直接调用的技能
                //检查空结果
                if (invocable.length === 0) {
                    console.log(chalk.dim("\nNo -invocable skills available. \n"));
                } else {
                    console.log(chalk.dim("\nAvailable skills:"));
                    for (const entry of invocable) {
                        const prefix = entry.emoji ? `${entry.emoji}` : "";
                        //输出格式：/skill_name - [emoji]description
                        console.log(chalk.dim(`  /${entry.skill.name} - ${prefix}${entry.skill.description}`));
                    }
                    console.log(); //结束和空行
                }
                return true;
            }
            case "/quit":
            case "/exit":
                await this.stop();
                process.exit(0); //退出进程
            default:
                return false;
        }
       
    }
}



//查找配置中启用的terminal类型频道
//如果没找到就创建一个默认配置对象
//使用找到的配置以及传入的router,agent名称，skill实例化并返回一个TerminalChannel对象
export function createTerminalChannel(
    config: OpenClawConfig,
    router: Router,
    skills?: SkillEntry[]
): TerminalChannel {
    const channelConfig = config.channels.find(
        (c) => c.type === "terminal" && c.enabled) ?? { //??表示如果左侧的表达式结果为空或者undefined，就使用右侧表达式
        id: "terminal",
        type: "terminal" as const, //类型断言，识别只读字面量类型“terminal”
        enabled: true,
        greeting: `Hello！ I am ${config.agent.name}. How can I help you`,
    };
    return new TerminalChannel(channelConfig, router, config.agent.name, skills);
}
