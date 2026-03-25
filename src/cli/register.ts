import type { Command } from "commander";
import { registerGatewayCommand } from "./commands/gateway.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerOnboardCommand } from "./commands/onboard.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerMessageCommand } from "./commands/message.js";
import { registerStatusCommand } from "./commands/status.js";

export function registerAllCommands(program: Command): void {
    registerGatewayCommand(program);   // myclaw gateway
    registerAgentCommand(program);     // myclaw agent
    registerOnboardCommand(program);   // myclaw onboard
    registerDoctorCommand(program);    // myclaw doctor
    registerMessageCommand(program);   // myclaw message send
    registerStatusCommand(program);
}