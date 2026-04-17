import type { Plugin } from "@kilocode/plugin";
export const NotificationPlugin: Plugin = async ({
  project,
  client,
  $,
  directory,
  worktree,
}) => {
  return {
    event: async ({ event }) => {
      // Send notification on session completion
      if (event.type === "session.idle") {
        await $`notify-send "Kilo cli Session completed"`;
      } else if (event.type === "session.error") {
        event.properties.error?.data.message;
        if (event.properties.error?.data.message)
          await $`notify-send "Kilo cli ${event.properties.error?.data.message}"`;
        else await $`notify-send "Kilo cli. Something went wrong"`;
      }
    },
  };
};
