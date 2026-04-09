import type { ChannelConfig } from "../config/index.js";
import type { Router } from "../routing/router.js";
import { Channel, type OutgoingMessage } from "./transport.js";

export class TelegramChannel extends Channel {
    readonly id: string;
    readonly type = "telegram" as const;
    private _connected = false;

    constructor(
        config: ChannelConfig,
        private readonly botToken: string,
    ) {
        super();
        this.id = config.id;
    }

    get connected(): boolean {
        return this._connected;
    }

    setRouter(_router: Router): void {
        // Reserved for future Telegram routing support.
    }

    async start(): Promise<void> {
        if (!this.botToken) {
            throw new Error("Telegram bot token is required");
        }
        this._connected = true;
        this.emit("connected");
    }

    async stop(): Promise<void> {
        this._connected = false;
        this.emit("disconnected", "stopped");
    }

    async send(_message: OutgoingMessage): Promise<void> {
        throw new Error("Telegram channel send() is not implemented yet");
    }
}
