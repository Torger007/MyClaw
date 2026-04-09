import type { Command } from "commander";
import chalk from "chalk";
import { startGatewayServer } from "../../gateway/server.js";
import { getContext } from "../program.js";

export function registerGatewayCommand(program: Command): void {
    program
        .command("gateway")
        .description("Start the MyClaw gateway")
        .action(async (_opts, cmd) => {
            const ctx = getContext(cmd);
            console.log(chalk.bold("\n myclaw gateway\n"));
            await startGatewayServer({
                config: ctx.config,
                host: ctx.config.gateway.host,
                port: ctx.config.gateway.port,
                verbose: ctx.verbose,
            });
        });
}
