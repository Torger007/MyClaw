import chalk from "chalk";
import type { OpenClawConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import type { Router } from "../routing/router.js";
import type { Channel } from "./transport.js";
import { FeishuChannel } from "./feishu.js";
import { TelegramChannel } from "./telegram.js";

export interface ChannelManager {
    startAll(router: Router): Promise<void>;
    stopAll(): Promise<void>;
    getChannel(id: string): Channel | undefined; //按照ID查找对应的通道
    getStatus(): Array<{ id: string; type: string; connected: boolean }>; //获取所有通道的运行状态
}

//创建和管理多个频道
export function createChannelManager(config: OpenClawConfig): ChannelManager {
    //使用Map数据结构存储已启动的频道实例
    //集中管理所有频道实例，提供统一的访问接口
    const channels = new Map<string, Channel>();

    return {
        async startAll(router: Router): Promise<void> {
            for (const channelConfig of config.channels) {
                if (!channelConfig.enabled) continue;
                if (channelConfig.type === "terminal") continue;
                try {
                    switch (channelConfig.type) {
                        case "feishu": {
                            const appId = resolveSecret(
                                channelConfig.appId,
                                channelConfig.appIdEnv,
                            );
                            const appSecret = resolveSecret(
                                channelConfig.appSecret,
                                channelConfig.appSecretEnv,
                            );
                            //只要有一个不存在就进入条件
                            if (!appId || !appSecret) {
                                console.warn(
                                    chalk.yellow(
                                        `[channels] Skipping '${channelConfig.id}': missing App ID or App Secret`
                                    )
                                );
                                continue;
                            }
                            const feishu = new FeishuChannel(channelConfig, appId, appSecret);
                        }
                    }
                } catch {

                }
            }
        }
    }
}