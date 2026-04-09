/**
 * Chapter 1 - Entry Point
 *
 * The main entry point for OpenClaw. Builds the CLI program,
 * registers all commands, and parses the command line.
 */

/**从本地导入两个函数
*buildProgram(): 创建并配置基础的 CLI 程序实例
*registerAllCommands(): 注册所有可用的命令
*/
import { register } from "module";
import { buildProgram } from "./cli/program.js";
import { registerAllCommands } from "./cli/register.js";

async function main() {
    const program = buildProgram();//创建程序实例
    registerAllCommands(program); //注册命令
    await program.parseAsync(process.argv); //解析参数并执行
}

/** 
捕获 main()函数中可能抛出的任何错误
始终输出简明的错误信息
仅在调试模式下输出完整的错误堆栈
以错误码 1 退出进程
 */
main().catch((err) => {
    console.error("Fatal error:", err.message);
    if (process.env.MYCLAW_DEBUG) {
        console.error(err.stack);
    }
    process.exit(1);
}
);