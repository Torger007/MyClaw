import type { Command } from "commander";
import readline from "node:readline";
import chalk from "chalk";
import {
    createDefaultConfig,
    writeConfig,
    getConfigPath,
    ensureStateDir,
} from "../../config/index.js";
import { read } from "node:fs";
import { resolve } from "node:path/win32";

//辅助函数，用于处理用户交互式问答
//rl: readline.Interface- 一个 readline接口实例，用于处理命令行输入输出。
//question: string- 要向用户显示的提示问题字符串。
// Promise<string>类型的值。这意味着它是一个异步函数，最终会解析（resolve）为一个字符串（用户输入的答案）。
function ask(rl: readline.Interface, question: string): Promise<string> {
    //Promise 的构造函数接收一个执行器函数 (resolve) => { ... }，这个函数会立即执行。
    //resolve是一个函数，当异步操作完成时，调用它并将结果传递出去。
    return new Promise((resolve) => {
        //调用 readline接口的 question方法。
        //第一个参数 question：要显示给用户的提示文本。
        //第二个参数是一个回调函数 (answer) => resolve(answer.trim())
        // answer调用 .trim()方法，这会去除用户输入字符串首尾的空白字符,然后再传回resolve
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

//onboard 命令提供了一个交互式的初始化向导，引导用户一步步生成配置文件。
export function registerOnboardCommand(program: Command): void {
    program
        .command("onboard")
        .description("Interactive setup wizard for MyClaw")
        .action(async () => {
            // 创建readline接口用于交互式问答
            //创建一个 Node.js 的 readline接口实例 rl。
            //它将从标准输入（键盘）读取数据，并将输出打印到标准输出（终端屏幕）。
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            console.log(chalk.bold.cyan("\n🦀 Welcome to MyClaw Setup!\n"));

            //从默认配置开始逐步覆盖用户选择
            const config = createDefaultConfig();

            //第一步选择LLM提供商
            const providerType = await ask(
                rl,
                //[anthropic]表示默认值（直接按回车则选择此项）
                `LLM Provider (anthropic/openai) [anthropic]:`
            );
            if (providerType === "openai") {
                //如果是openai，则将配置对象 config中 providers数组的第一个元素的 type属性修改为 "openai"
                config.providers[0].type = "openai";
                //同理配置apienv
                config.providers[0].apiKeyEnv = "OPENAI_API_KEY";
                config.providers[0].model = "gpt-4o";
            }

            //第二步API KEY
            const apiKeyEnvName = config.providers[0].apiKeyEnv!;//!表示断言此值不为null或undefined
            //将apiKeyEnvName作为键，从Node.js的process.env对象查找对应值
            //赋值给existingKey对象，如果环境变量不存在，则会是undefined
            const existingKey = process.env[apiKeyEnvName];
            if (existingKey) {
                console.log(chalk.green(`✓ Found ${apiKeyEnvName} in environment`));
            } else {
                const apiKey = await ask(rl, `Enter your API key`);
                if (apiKey) {
                    config.providers[0].apiKey = apiKey;
                    //将 apiKeyEnv属性设置为 undefined，这意味着配置将不再尝试从环境变量读取密钥
                    config.providers[0].apiKeyEnv = undefined;
                }
            }

            //第三步 模型选择
            const model = await ask(rl, `Model[${config.providers[0].model}]:`);
            //如果用户输入了内容（即 model变量不是空字符串），则用用户输入的内容覆盖配置中当前的模型名称
            if (model) config.providers[0].model = model;

            //第四步：网关端口
            const port = await ask(rl, `Gateway port [18789]`);
            //如果用户输入了内容，则将其从字符串转换为十进制整数（parseInt(port, 10)），并赋值给配置的 config.gateway.port属性。
            if (port) config.gateway.port = parseInt(port, 10);

            //第五步 bot名称
            const name = await ask(rl, `Bot name [MyClaw]`);
            if (name) config.agent.name = name;

            //(可选)第六步 ：飞书通道
            const useFeishu = await ask(rl, `Enable Feishu channel? (y/N):`);
            //toLowerCase()转换为小写
            if (useFeishu.toLowerCase() === "y") {
                const appId = await ask(rl, `Feishu App ID:`);
                const appSecret = await ask(rl, `Feishu App Secret:`);
                config.channels.push({
                    id: "feishu",
                    type: "feishu",
                    enabled: true,
                    //设置 appId属性：如果用户输入了 appId（非空），则使用该值；否则设为 undefined。
                    appId: appId || undefined,
                    //如果用户输入appID则整个appIDEnv属性为undefined
                    //否则则将其设为环境变量名“FEISHU_APP_ID”
                    appIdEnv: appId ? undefined : "FEISHU_APP_ID",
                    appSecret: appSecret || undefined,
                    appSecretEnv: appSecret ? undefined : "FEISHU_APP_SECRET",
                });
            }

            //写入配置文件，保存配置文件
            ensureStateDir();
            writeConfig(config);
            //${ getConfigPath() } 会调用一个函数来获取配置文件的完整路径并插入到信息中。
            console.log(chalk.green(`\n✓ Configuration saved to ${getConfigPath()}`));
            console.log(`\nNext steps:`);
            console.log(`  myclaw agent    - Start chatting`);
            console.log(`  myclaw gateway  - Start the gateway server`);
            console.log(`  myclaw doctor   - Run diagnostics\n`);
            //关闭创建的readline接口，结束交互
            rl.close();
        });
}