/**
 * 导入依赖
 * 作用分析：

Command: 来自 commander库，是最流行的 Node.js CLI 框架，用于构建命令行程序

loadConfig: 一个函数，用于加载配置文件（通常读取 openclaw.config.js等）

type OpenClawConfig: 导入 OpenClawConfig类型定义（注意 type关键字表示纯类型导入，不会引入运行时代码）

路径说明：

"../config/index.js"→ 从当前目录向上，进入 config目录，导入 index.js

虽然是 .ts文件，但导入时写 .js→ 这是 TypeScript 的输出映射约定
 */
import { Command } from "commander";
import { loadConfig, type OpenClawConfig } from "../config/index.js";

//核心接口定义
export interface ProgramContext {
    config: OpenClawConfig; //项目配置：包含所有用户定义的设置（如目标 URL、爬取规则、输出目录等）
    verbose: boolean; //控制是否输出详细日志信息
}

export function buildProgram(): Command {
    //创建并返回一个配置好的command实例
    const program = new Command();

    program
        .name("myclaw")
        .description("myClaw - your persional ai assistant")//程序描述
        .version("1.0.0")
        .option("-v, --verbose", "Enable version logging", false);//定义全局选项
        /**
         -v, --verbose：短选项和长选项
         Enable verbose logging"：选项描述
         false：默认值（不开启详细日志）
         */

    //核心
    program.hook("preAction", (thisCommand) => {
        //在每个命令执行前运行的钩子
        //获取当前命令选项
        const opts = thisCommand.opts(); //返回verbose：true/false or ...

        //加载配置文件
        const config = loadConfig(); //调用这个函数读取用户配置

        //创建并挂载上下文对象
        thisCommand.setOptionValue("_ctx", {
            config,
            verbose: opts.verbose ?? false,
        } satisfies ProgramContext); //类型断言：符合programcontext接口
    });
    return program;
}

/**
导出函数：export表示这个函数可以被其他模块导入使用
函数名：getContext→ 清晰地表明功能是"获取上下文"
参数：cmd: Command→ 接收一个 Commander 命令对象
返回类型：: ProgramContext→ 返回前面定义的上下文接口类型
 */
export function getContext(cmd: Command): ProgramContext {
    const root = cmd.parent ?? cmd; //Command中每个命令都有parent属性，指向父命令，如果cmd,parent是null或者undefined就用cmd本身
    return root.opts()._ctx as ProgramContext;
    /**
     root.opts()：获取根命令的所有选项（包含我们设置的 _ctx）
     ._ctx：访问我们之前通过 setOptionValue("_ctx", ...)设置的上下文对象
     as ProgramContext：TypeScript 的类型断言，告诉编译器"我知道这是 ProgramContext 类型"
     */
}