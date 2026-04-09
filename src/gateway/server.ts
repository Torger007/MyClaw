import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import chalk from "chalk";
import type { OpenClawConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import { SessionManager } from "./session.js";
import { createAgentRuntime } from "../agent/runtime.js";
import { createRouter } from "../routing/router.js";
import { createChannelManager } from "../channels/manager.js";
import type { SkillEntry } from "../skills/workspace.js";
import type {
    ChatMessage,
    GatewayMessage,
    GatewayResponse,
} from "./protocol.js";

export interface GatewayOptions {
    config: OpenClawConfig;
    host: string;
    port: number;
    verbose: boolean;
    skills?: SkillEntry[];
    skillsPrompt?: string;
}

export async function startGatewayServer(opts: GatewayOptions): Promise<void> {
    const { config, host, port, verbose, skills, skillsPrompt } = opts;
    const startTime = Date.now();

    const sessions = new SessionManager(config.agent.maxHistoryMessages);
    const agent = await createAgentRuntime(config, {
        skills: skills?.map((s) => s.skill),
        skillsPrompt,
    });
    const router = createRouter(config, agent, { skills });
    const channelManager = createChannelManager(config);

    const httpServer = http.createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ status: "ok", uptime: Date.now() - startTime }));
            return;
        }

        res.writeHead(404);
        res.end();
    });

    const wss = new WebSocketServer({ server: httpServer });
    const authToken = resolveSecret(config.gateway.token, config.gateway.tokenEnv);
    const authenticatedClients = new WeakSet<WebSocket>();
    const clients = new Set<WebSocket>();

    wss.on("connection", (ws) => {
        clients.add(ws);
        const needsAuth = !!authToken;
        if (!needsAuth) {
            authenticatedClients.add(ws);
        }

        if (verbose) {
            console.log(chalk.dim(`[gateway] Client connected (total: ${clients.size})`));
        }

        ws.on("message", async (data) => {
            let msg: GatewayMessage;
            try {
                msg = JSON.parse(data.toString()) as GatewayMessage;
            } catch {
                send(ws, { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
                return;
            }

            if (msg.type === "auth") {
                if (!authToken || msg.token === authToken) {
                    authenticatedClients.add(ws);
                    send(ws, { type: "auth.result", success: true });
                } else {
                    send(ws, {
                        type: "auth.result",
                        success: false,
                        error: "Invalid token",
                    });
                }
                return;
            }

            if (needsAuth && !authenticatedClients.has(ws)) {
                send(ws, {
                    type: "error",
                    code: "UNAUTHORIZED",
                    message: "Authenticate first",
                });
                return;
            }

            switch (msg.type) {
                case "ping":
                    send(ws, { type: "pong" });
                    break;
                case "status":
                    send(ws, {
                        type: "status.response",
                        channels: channelManager.getStatus(),
                        sessions: sessions.size,
                        uptime: Date.now() - startTime,
                    });
                    break;
                case "chat": {
                    const chatMsg = msg as ChatMessage;
                    const session = sessions.getOrCreate(chatMsg.channelId, chatMsg.sessionId);
                    sessions.addMessage(session.id, "user", chatMsg.text);

                    try {
                        const response = await router.route({
                            channelId: chatMsg.channelId,
                            sessionId: session.id,
                            text: chatMsg.text,
                            history: session.history.slice(0, -1),
                        });

                        sessions.addMessage(session.id, "assistant", response);
                        send(ws, {
                            type: "chat.response",
                            channelId: chatMsg.channelId,
                            sessionId: session.id,
                            text: response,
                            done: true,
                        });
                    } catch (err) {
                        const error = err as Error;
                        send(ws, {
                            type: "error",
                            code: "AGENT_ERROR",
                            message: error.message,
                        });
                    }
                    break;
                }
                case "channel.send":
                    if (verbose) {
                        console.log(chalk.dim(`[gateway] Send to channel '${msg.channelId}': ${msg.text}`));
                    }
                    break;
                default:
                    send(ws, {
                        type: "error",
                        code: "UNKNOWN_TYPE",
                        message: `Unknown message type: ${(msg as { type: string }).type}`,
                    });
            }
        });

        ws.on("close", () => {
            clients.delete(ws);
            if (verbose) {
                console.log(chalk.dim(`[gateway] Client disconnected (total: ${clients.size})`));
            }
        });

        ws.on("error", (err) => {
            console.error(chalk.red(`[gateway] Websocket error: ${err.message}`));
        });
    });

    await channelManager.startAll(router);

    await new Promise<void>((resolve) => {
        httpServer.listen(port, host, () => {
            console.log(chalk.bold.cyan(`\n🦀 MyClaw Gateway`));
            console.log(chalk.dim(`    WebSocket: ws://${host}:${port}`));
            console.log(chalk.dim(`   Health:   http://${host}:${port}/health`));
            console.log(chalk.dim(`   Auth:      ${authToken ? "enabled" : "disabled"}`));
            console.log(
                chalk.dim(`Channel: ${config.channels.filter((c) => c.enabled).length} active`),
            );
            console.log(chalk.dim(`   Provider: ${config.defaultProvider}`));
            if (verbose) {
                console.log(chalk.dim("[gateway] Waiting for connections...\n"));
            }
            resolve();
        });
    });
}

function send(ws: WebSocket, msg: GatewayResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
