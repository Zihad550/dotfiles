import type { Plugin } from "@opencode-ai/plugin";

export const pnpmNotifier: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const command = output.args?.command?.trim() || "";

        // Check if the command starts with npm
        if (command.match(/^npm\s/)) {
          // Replace npm with pnpm
          output.args.command = command.replace(/^npm\s/, "pnpm ");
        }
      }
    },
  };
};
