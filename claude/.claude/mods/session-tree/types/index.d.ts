export type SessionTreeHidden = string[]

declare module 'claude-code' {
  interface PluginState {
    'session-tree': {
      snapshot: { agents: AgentInfo[]; error: string; refreshError: string }
      hidden: SessionTreeHidden
    }
  }
}
