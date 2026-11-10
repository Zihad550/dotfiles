export type Filter = 'staged' | 'unstaged' | 'all'
export type ChangedFile = {
  path: string
  originalPath: string | null
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
  status: string
}
export type Diff = { title: string; source: string }
export type Snapshot = { root: string; files: ChangedFile[]; diffs: Diff[]; error: string }

declare module 'claude-code' {
  interface PluginState {
    'lazy-diff': {
      snapshot: Snapshot
      filter: Filter
      expanded: string[]
      selected: string | null
      sidebarOpen: boolean
    }
  }
}
