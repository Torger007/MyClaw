import type { Command } from "commander";
import chalk from "chalk";
import { getContext } from "../program.js";

export function registerMessageCommand(program: Command): void {
    program
        .command("message")
        .description("message")
        .action(async (_opts, cmd) => {
            //具体message流程
            const ctx = getContext(cmd);
            let allOk = true; //allOk 变量用于追踪所有检查是否通过，最后输出总结信息。
            console.log(chalk.bold("\n myclaw message\n"));
        });
}