import type { Skill } from "@mariozechner/pi-coding-agent";

export interface SkillEntry {
    skill: Skill & {
        name: string;
        description?: string;
        prompt?: string;
    };
    emoji?: string;
    userInvocable?: boolean;
}

export function listUserInvocable(skills: SkillEntry[]): SkillEntry[] {
    return skills.filter((entry) => entry.userInvocable !== false);
}

export function resolveSkillCommand(
    input: string,
    skills: SkillEntry[],
): { entry: SkillEntry; args: string } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
        return null;
    }

    const [command, ...rest] = trimmed.slice(1).split(/\s+/);
    const entry = skills.find((item) => item.skill.name === command);
    if (!entry) {
        return null;
    }

    return {
        entry,
        args: rest.join(" ").trim(),
    };
}

export function getSkillPrompt(skill: SkillEntry["skill"]): string {
    return skill.prompt?.trim() || `You are executing the skill '${skill.name}'.`;
}
