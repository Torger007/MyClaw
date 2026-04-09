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

//路径常量与环境变量覆盖
const STATE_DIR =
    process.env.MYCLAW_STATE_DIR || path.join(os.homedir(), ".myclaw");

function resolveConfigPath(): string {
    if (process.env.MYCLAW_CONFIG_PATH) {
        return process.env.MYCLAW_CONFIG_PATH;
    }

    const stateConfigPath = path.join(STATE_DIR, "myclaw.yaml");
    if (fs.existsSync(stateConfigPath)) {
        return stateConfigPath;
    }

    const localConfigPath = path.join(process.cwd(), "myclaw.yaml");
    if (fs.existsSync(localConfigPath)) {
        return localConfigPath;
    }

    return stateConfigPath;
}

export function getStateDir(): string {
    return STATE_DIR;
}

export function getConfigPath(): string {
    return resolveConfigPath();
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
    const configPath = resolveConfigPath();
    if (!fs.existsSync(configPath)) {
        return createDefaultConfig();
    }

    //第三步，读取并解析YAML
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw);

    //第四步 Zod验证
    //safeParse不会抛异常，而是返回 {success，data，error}
    const result = OpenClawConfigSchema.safeParse(parsed);
    if (!result.success) {
        console.error("Configuration validation errors:");
        for (const issue of result.error.issues) {
            console.error(`  -${issue.path.join(".")}：${issue.message}`);
        }
        throw new Error("Invalid configuration.Please fix the errors above.");
    }

    return result.data;
}

//通过交互式向导生成的配置写入磁盘
export function writeConfig(config: OpenClawConfig): void {
    const configPath = resolveConfigPath();
    ensureStateDir();
    const yaml = stringifyYaml(config, { indent: 2 });
    fs.writeFileSync(configPath, yaml, "utf-8");
}

//按照优先级解析密钥，多层级获取密钥
export function resolveSecret(
    value?: string,
    envVar?: string,
): string | undefined {
    if (value) return value;
    if (envVar) return process.env[envVar];
    return undefined;
}

//创建配置快照的函数，作用加载配置并返回一个深度不可变的只读副本，确保配置在运行时不被修改
export function loadConfigSnapshot(): Readonly<OpenClawConfig> {
    return Object.freeze(loadConfig());
}
