import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { config as loadDotenv } from "dotenv";
import {
    OpenClawConfigSchema,
    createDefaultConfig,
    type OpenClawConfig,
} from "./schema.js";
import { parse } from "path/win32";

//路径常量与环境变量覆盖
const STATE_DIR =
    process.env.MYCLAW_STATE_DIR || path.join(os.homedir(), ".myclaw");

const CONFIG_PATH =
    process.env.MYCLAW_CONFIG_PATH || path.join(STATE_DIR, "myclaw.yaml");

export function getStateDir(): string {
    return STATE_DIR;
}

export function getConfigPath(): string {
    return CONFIG_PATH;
}

//确保状态目录存在的工具函数
export function ensureStateDir(): void {
    if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
    }
}



export function loadConfig(): OpenClawConfig {
    //第一步加载.env文件
    //如果项目根目录存在.env文件，将其中变量注入process.env,这样apiKeyEnv引用的环境变量也会被正确解析
    loadDotenv();

    //第二步检查配置文件是否存在，若不存在则返回默认配置
    if (!fs.existsSync(CONFIG_PATH)) {
        return createDefaultConfig();
    }

    //第三步，读取并解析YAML
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = parseYaml(raw);

    //第四步 Zod验证
    //safeParse不会抛异常，而是返回 {success，data，error}
    const result = OpenClawConfigSchema.safeParse(parsed);
    if (!result.success) {
        // 遍历所有验证错误，逐条输出
        console.error("Configuration validation errors:");
        for (const issue of result.error.issues) {
            //issue.path是数组，如["providers",0,"model"]
            //join("."),变成providers.o.model
            console.error(`  -${issue.path.join(".")}：${issue.message}`);
        }
        throw new Error("Invalid configuration.Please fix the errors above.");
    }

    //第五步，返回经过验证的配置对象
    //result.data类型就是OpenClawConfig,类型非常安全
    return result.data;
}

//通过交互式向导生成的配置写入磁盘
export function writeConfig(config: OpenClawConfig): void {
    ensureStateDir(); // 确保 ~/.myclaw/ 目录存在
    const yaml = stringifyYaml(config, { indent: 2 }); //将JavaScript对象转换为YAML字符串，后面indent：2 是格式化选项，使用2个空格缩进
    fs.writeFileSync(CONFIG_PATH, yaml, "utf-8"); //写入磁盘
}

//按照优先级解析密钥，多层级获取密钥
export function resolveSecret(
    value?: string, //直接值：apikey：...
    envVar?: string //环境变量名：apiKeyEnv: "ANTHROPIC_API_KEY"
):string | undefined {
    if (value) return value;
    if (envVar) return process.env[envVar]; //其次查找环境变量 process.env[envVar]：从 Node.js 环境变量中获取值
    return undefined; //如果都没找到返回undefined
}

//创建配置快照的函数，作用加载配置并返回一个深度不可变的只读副本，确保配置在运行时不被修改
//返回类型是配置对象类型，所有属性变为只读
export function loadConfigSnapshot(): Readonly<OpenClawConfig> { 
    //loadConfig()：调用加载配置的函数，返回普通对象
    //Object.freeze()：JavaScript 内置方法，冻结对象，使其不可修改
    return Object.freeze(loadConfig()); 
}