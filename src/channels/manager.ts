import chalk from "chalk";
import type { OpenClawConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import type { Router } from "../routing/router.js";
import type { Channel } from "./transport.js";
import { FeishuChannel } from "./feishu.js";
import { TelegramChannel } from "./telegram.js";
import { channel } from "node:diagnostics_channel";

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
                            feishu.setRouter(router); //将router对象注入飞书频道实例中，用于处理消息路由
                            channels.set(channelConfig.id, feishu);  //存入Map
                            await feishu.start();
                            break; //跳出switch语句
                        }

                        case "telegram": {
                            const botToken = resolveSecret(
                                channelConfig.botToken,
                                channelConfig.botTokenEnv
                            );

                            if (!botToken) {
                                console.warn(
                                    chalk.yellow(
                                        `[channels] Skipping '${channelConfig.id}': missing Bot Token`
                                    )
                                );
                                continue; //跳过该频道
                            }

                            const telegram = new TelegramChannel(channelConfig, botToken);
                            telegram.setRouter(router);
                            channels.set(channelConfig.id, telegram);
                            await telegram.start();
                            break;
                        }
                        default:
                            console.warn(
                                chalk.yellow(
                                    `[channels] Unknown channel type: ${channelConfig.type}`
                                )
                            );
                    }
                } catch (err) {
                    console.error(
                        chalk.red(
                            `[channels] Failed to start '${channelConfig.id}': ${(err as Error).message}`
                        )
                    );
                }
            }
        },

        async stopAll(): Promise<void> {
            for (const [id, channel] of channels) {
                try {
                    await channel.stop();
                } catch (err) {
                    console.error(
                        chalk.red(`[channels] Error stopping '${id}': ${(err as Error).message}`)
                    );
                }
            }
            //清空频道实例，释放内存
            channels.clear();
        },

        getChannel(id: string): Channel | undefined {
            return channels.get(id);
        },

        getStatus(): Array<{ id: string; type: string; connected: boolean }> {
            //将Map所有value对象转换为数组，然后使用map方法遍历
            return Array.from(channels.values()).map((ch) => ({
                //从每个频道对象中提取 id、type 和 connected（连接状态）属性，组成新对象。
                id: ch.id,
                type: ch.type,
                connected: ch.connected,
            }));
        },
    };
}