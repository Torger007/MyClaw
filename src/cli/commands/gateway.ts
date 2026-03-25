import type { Command } from "commander";
import chalk from "chalk";
import { getContext } from "../program.js";

export function registerGatewayCommand(program: Command): void {
    program
        .command("gateway")
        .description("gateway")
        .action(async (_opts, cmd) => {
            //具体gateway流程
            const ctx = getContext(cmd);
            let allOk = true; //allOk 变量用于追踪所有检查是否通过，最后输出总结信息。
            console.log(chalk.bold("\n myclaw gateway\n"));
        });
}