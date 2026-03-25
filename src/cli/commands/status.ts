import type { Command } from "commander";
import chalk from "chalk";
import { getContext } from "../program.js";

export function registerStatusCommand(program: Command): void {
    program
        .command("status")
        .description("show current myclaw configuration summary")
        .action(async (_opts, cmd) => {
            const ctx = getContext(cmd);
            console.log(chalk.bold("\nMyClaw Status\n"));
            console.log(`  Providers: ${ctx.config.providers.length}`);
            console.log(`  Channels:  ${ctx.config.channels.length}`);
            console.log(`  Verbose:   ${ctx.verbose}`);
        });
}