export type Draft = { path: string; name: string; mtimeMs: number; text: string }

declare module 'claude-code' {
  interface PluginState {
    drafts: { drafts: Draft[]; selected: string | null }
  }
}
