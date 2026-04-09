import chalk from "chalk";
import {
    createAgentSession,
    createReadOnlyTools,
    SettingsManager,
    SessionManager,
    type Skill,
} from "@mariozechner/pi-coding-agent";
import { OpenClawConfig, ProviderConfig } from "../config/index.js";
import { createAuthStorage, createModelRegistry, resolveModel } from "./model.js";

//定义聊天消息接口
export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

interface AgentSessionLike {
    prompt(text: string): Promise<void>;
    subscribe(listener: (event: unknown) => void): () => void;
    messages: unknown[];
    agent: {
        setSystemPrompt(prompt: string): void;
        waitForIdle(): Promise<void>;
        replaceMessages(messages: Array<{ role: "user"; content: string; timestamp: number }>): void;
    };
}

type SessionHistoryMessage = { role: "user"; content: string; timestamp: number };
type AssistantStateMessage = {
    role?: string;
    content?: unknown;
    stopReason?: string;
    errorMessage?: string;
};

//定义智能体运行时的接口
export interface AgentRuntime {
    chat(request: { providerId?: string; message: ChatMessage[] }): Promise<string>;
    chatWithSkill(request: {
        providerId?: string;
        message: ChatMessage[];
        skillPrompt: string;
    }): Promise<string>;
}

//运行时选项接口
export interface AgentRuntimeOptions {
    providerId?: string;
    modelOverride?: string;
    skills?: Skill[];
    skillsPrompt?: string;
}

export async function createAgentRuntime(
    config: OpenClawConfig,
    options: AgentRuntimeOptions,
): Promise<AgentRuntime> {
    const authStorage = createAuthStorage(config.providers);
    const modelRegistry = createModelRegistry(authStorage);

    const providerId = options?.providerId ?? config.defaultProvider;
    const providerConfig = config.providers.find((p) => p.id === providerId);
    if (!providerConfig) {
        throw new Error(
            `Provider '${providerId }' not found in config. ` +
            `Available: ${config.providers.map((p) => p.id).join(",")}`,
        );
    }

    const model = resolveModel(providerConfig, modelRegistry, options?.modelOverride);
    console.log(chalk.dim(`[agent] Using model: ${model.provider}/${model.id}`));

    const sessionManager = SessionManager.inMemory(process.cwd());
    const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: false },
    });
    const { session } = await createAgentSession({
        cwd: process.cwd(),
        authStorage,
        modelRegistry,
        model,
        sessionManager,
        settingsManager,
        tools: createReadOnlyTools(process.cwd()),
    });

    const runtimeSession = session as AgentSessionLike;
    const baseSystemPrompt = buildSystemPrompt(config, providerConfig, options?.skillsPrompt);
    runtimeSession.agent.setSystemPrompt(baseSystemPrompt);

    return {
        async chat(request): Promise<string> {
            const lastMsg = request.message[request.message.length - 1];
            if (!lastMsg || lastMsg.role !== "user") {
                return "(No user message)";
            }

            syncSessionMessages(runtimeSession, request.message);
            return promptAndExtract(runtimeSession, lastMsg.content);
        },

        async chatWithSkill(request): Promise<string> {
            const lastMsg = request.message[request.message.length - 1];
            if (!lastMsg || lastMsg.role !== "user") {
                return "(No user message)";
            }

            runtimeSession.agent.setSystemPrompt(request.skillPrompt);
            try {
                syncSessionMessages(runtimeSession, request.message);
                return await promptAndExtract(runtimeSession, lastMsg.content);
            } finally {
                runtimeSession.agent.setSystemPrompt(baseSystemPrompt);
            }
        },
    };
}

function syncSessionMessages(session: AgentSessionLike, messages: ChatMessage[]): void {
    const history: SessionHistoryMessage[] = [];
    for (const [index, msg] of messages.slice(0, -1).entries()) {
        if (msg.role !== "user") {
            continue;
        }
        history.push({
            role: msg.role,
            content: msg.content,
            timestamp: Date.now() + index,
        });
    }

    session.agent.replaceMessages(history);
}

async function promptAndExtract(session: AgentSessionLike, userText: string): Promise<string> {
    const deltas: string[] = [];
    const unsubscribe = session.subscribe((event: any) => {
        if (
            event?.type === "message_update" &&
            event?.assistantMessageEvent?.type === "text_delta" &&
            typeof event.assistantMessageEvent.delta === "string"
        ) {
            deltas.push(event.assistantMessageEvent.delta);
        }
    });

    await session.prompt(userText);
    await session.agent.waitForIdle();
    unsubscribe();

    const streamedText = deltas.join("").trim();
    if (streamedText) {
        return streamedText;
    }

    const allMessages = Array.isArray(session.messages) ? session.messages : [];
    const assistantMessages = allMessages.filter(
        (msg): msg is AssistantStateMessage => !!msg && typeof msg === "object" && (msg as { role?: string }).role === "assistant",
    );
    const latestAssistant = assistantMessages[assistantMessages.length - 1];
    const textParts: string[] = [];

    if (latestAssistant) {
        extractText(latestAssistant.content, textParts);
        if (latestAssistant.stopReason === "error" && typeof latestAssistant.errorMessage === "string") {
            textParts.push(latestAssistant.errorMessage);
        }
    }

    return textParts.join("\n").trim() || "(No response)";
}

function extractText(content: unknown, out: string[]): void {
    if (typeof content === "string") {
        if (content.trim()) out.push(content);
        return;
    }

    if (!Array.isArray(content)) return;

    for (const block of content) {
        if (typeof block === "string") {
            if (block.trim()) out.push(block);
            continue;
        }

        if (!block || typeof block !== "object") continue;
        const b = block as { type?: string; text?: string };
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
            out.push(b.text);
        }
    }
}

export function buildSystemPrompt(
    config: OpenClawConfig,
    providerConfig: ProviderConfig,
    skillsPrompt?: string,
): string {
    const botName = config.agent?.name ?? "MyClaw";
    const lines = [
        `You are a personal assistant running inside ${botName}.`,
        "",
        "## Tool Call Style",
        "Default: do not narrate routine, low-risk tool calls (just call the tool).",
        "Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
        "Keep narration brief and value-dense; avoid repeating obvious steps.",
        "Use plain human language for narration unless in a technical context.",
        "",
        "## Safety",
        "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
        "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
        "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
        "",
        "## Guidelines",
        "- Respond in the user's language",
        "- Be helpful, accurate, and concise",
        "- Ask for clarification when the request is ambiguous",
    ];

    const trimmedSkills = skillsPrompt?.trim();
    if (trimmedSkills) {
        lines.push(
            "",
            "## Skills",
            "Before replying: scan available skills and their descriptions.",
            "- If exactly one skill clearly applies: follow its instructions.",
            "- If multiple could apply: choose the most specific one.",
            "- If none clearly apply: proceed with normal assistance.",
            "",
            trimmedSkills,
        );
    }

    if (providerConfig.systemPrompt?.trim()) {
        lines.push("", "## Custom Instructions", providerConfig.systemPrompt.trim());
    }

    return lines.join("\n");
}
