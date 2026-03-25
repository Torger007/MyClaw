import type { Command } from "commander";
import fs from "node:fs"; //检查文件/目录是否存在
import chalk from "chalk"; //终端输出着色，让诊断结果一目了然
import { getContext } from "../program.js";
import { getConfigPath, getStateDir, resolveSecret } from "../../config/index.js"; //获取myclaw配置路径和状态目录路径，并解析密钥
import { ALL } from "node:dns";
import { error } from "node:console";

//命令注册
export function registerDoctorCommand(program: Command): void {
    program
        .command("doctor")
        .description("Run diagnostics on your MyClaw installation")
        .action(async (_opts, cmd) => {
            //命令逻辑
            //获取上下文
            const ctx = getContext(cmd);
            let allOk = true; //allOk 变量用于追踪所有检查是否通过，最后输出总结信息。
            console.log(chalk.bold("\n myclaw doctor\n"));

            //诊断检查逻辑
            //检查1.Node.js版本
            const nodeVersion = process.versions.node;
            const major = parseInt(nodeVersion.split(".")[0], 10);
            if (major >= 20) {
                console.log(chalk.green(` ✓ Node.js ${nodeVersion}`));
            } else {
                console.log(chalk.red(`  ✗ Node.js ${nodeVersion} (need >= 20)`));
                allOk = false;
            }

            //检查2.状态目录 默认（~/.myclaw/）存储配置文件和运行时的数据，如果确实则警告，并提示用户运行myclaw onboard创建
            if (fs.existsSync(getStateDir())) {
                console.log(chalk.green(`  ✓ State dir: ${getStateDir()}`));
            } else {
                console.log(chalk.yellow(`  ⚠ State dir missing: ${getStateDir()}`));
                console.log(chalk.dim(`    Run 'myclaw onboard' to create it`));
            }

            //检查3：配置文件 
            if (fs.existsSync(getConfigPath())) {
                console.log(chalk.green(`  ✓ Config: ${getConfigPath()}`));
            } else {
                console.log(chalk.yellow(`  ⚠ Config missing: ${getConfigPath()}`));
                console.log(chalk.dim(`    Run 'myclaw onboard' to create it`));
            }

            //检查4：provider（LLM供应商）
            //resolveSecret() 函数会尝试两种方式解析密钥：直接从配置中读取 apiKey 字段，或者从环境变量 apiKeyEnv 中读取。如果两者都没有，说明 Provider 配置不完整。
            for (const provider of ctx.config.providers) {
                const key = resolveSecret(provider.apiKey, provider.apiKeyEnv);
                if (key) {
                    console.log(
                        chalk.green(`✓ Provider '${provider.id}':${provider.type}/${provider.model}`)
                    );
                } else {
                    console.log(chalk.red(`  ✗ Provider '${provider.id}': No API key found`));
                    console.log(chalk.dim(`    Set ${provider.apiKeyEnv ?? "apiKey in config"}`));
                    allOk = false;
                }
            }

            //检查5：消息通道
            //Channel 检查更加复杂：先跳过被禁用的通道，然后根据通道类型做不同的检查。Terminal 通道不需要额外凭证，飞书通道则需要 App ID 和 App Secret。
            for (const channel of ctx.config.channels) {
                if (!channel.enabled) {
                    console.log(chalk.dim(`  -Channel '${channel.id}':disabled`));
                    continue;
                }
                if (channel.type === "terminal") {
                    console.log(chalk.green(`  ✓ Channel '${channel.id}': terminal`));
                } else if (channel.type === "feishu") {
                    const appId = resolveSecret(channel.appId, channel.appIdEnv);
                    const appSecret = resolveSecret(channel.appSecret, channel.appSecretEnv);
                    if (appId && appSecret) {
                        console.log(chalk.green(`  ✓ Channel '${channel.id}': feishu`));
                    } else {
                        const missing = !appId ? "App ID" : "App Secret";
                        console.log(chalk.red(`  ✗ Channel '${channel.id}': No ${missing}`));
                        allOk = false;
                    }
                }
            }

            //输出总结
            console.log();
            if (allOk) {
                console.log(chalk.green.bold("  All checks passed! ✓\n"));
            } else {
                console.log(chalk.yellow.bold("  Some checks failed. See above for details.\n"));
            }

        });
}