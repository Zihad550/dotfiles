import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { ChangedFile, Snapshot } from '../types'
import { fileDiffs, git, parseStatus, visibleFiles } from './git'
import { fileIcon, folderIcons } from './icons'

const PANE = 'lazy-diff'
const snapshot = atom({ plugin: 'lazy-diff', key: 'snapshot' } as const, {
  root: '', files: [], diffs: [], error: '',
})
const filter = atom({ plugin: 'lazy-diff', key: 'filter' } as const, 'staged')
const expanded = atom({ plugin: 'lazy-diff', key: 'expanded' } as const, [])
const selected = atom({ plugin: 'lazy-diff', key: 'selected' } as const, null)
const sidebarOpen = atom({ plugin: 'lazy-diff', key: 'sidebarOpen' } as const, true)

// Serialize reads and index writes so an older refresh cannot replace a newer action.
let queue: Promise<unknown> = Promise.resolve()
function serial($: EngineInterface, action: () => Promise<unknown>) {
  const run = queue.then(action).catch(async (error: unknown) => {
    await update($, snapshot, before => ({
      ...before, error: error instanceof Error ? error.message : String(error),
    }))
  })
  queue = run
  return run
}

async function refresh($: EngineInterface) {
  const cwd = await $.session.root()
  const root = (await git($, { root: cwd, args: ['rev-parse', '--show-toplevel'] })).replace(/\r?\n$/, '')
  const files = parseStatus(await git($, { root, args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] }))
  const mode = await read($, filter)
  const visible = visibleFiles(files, mode)
  const pick = await read($, selected)
  const shown = visible.find(file => file.path === pick) ?? visible[0]
  const path = shown?.path ?? null
  await update($, selected, () => path)
  const next: Snapshot = { root, files, diffs: [], error: '' }
  await update($, snapshot, () => next)
  if (shown) {
    const diffs = await fileDiffs($, { root, file: shown, filter: mode })
    await update($, snapshot, () => ({ ...next, diffs }))
  }
}

function toggleStage($: EngineInterface, { root, file }: { root: string; file: ChangedFile }) {
  return serial($, async () => {
    await refresh($)
    const current = await read($, snapshot)
    const fresh = current.files.find(one => one.path === file.path)
    if (current.root !== root || !fresh) throw new Error('The repository changed. Select the file again.')
    if (fresh.conflicted) throw new Error('Resolve this file’s conflicts before staging it.')
    const paths = fresh.originalPath ? [fresh.originalPath, fresh.path] : [fresh.path]
    const args = fresh.staged ? ['reset', '--', ...paths] : ['add', '--all', '--', ...paths]
    await git($, { root, args })
    await refresh($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: PANE, description: 'Review and stage Git changes', immediate: true })
    return next(e)
  })

  on('command.run', { command: PANE }, async $ => {
    await serial($, async () => {
      await update($, filter, () => 'staged')
      await refresh($)
    })
    await $.ui.open({ id: PANE, title: 'Lazy Diff' })
    return { text: 'Lazy Diff opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (['Write', 'Edit', 'Bash'].includes(e.tool) && (await $.ui.panes()).some(pane => pane.id === PANE)) {
      await serial($, () => refresh($))
    }
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const state = await read($, snapshot)
    const mode = await read($, filter)
    const openDirs = await read($, expanded)
    const pick = await read($, selected)
    const showSidebar = await read($, sidebarOpen)
    const sidebarWidth = Math.min(32, Math.max(1, Math.floor(e.props.bodyColumns / 3)))
    const files = visibleFiles(state.files, mode)
    const canShowDiffs = state.diffs.reduce((total, diff) => total + diff.source.length, 0) <= 90000
    const renderedDirs = new Set<string>()
    const tree = files.map(file => {
      const parts = file.path.split('/')
      const folders = parts.slice(0, -1)
      const rows = []
      let parent = ''
      for (let depth = 0; depth < folders.length; depth += 1) {
        const name = folders[depth]
        parent = parent ? `${parent}/${name}` : `${name}`
        const dir = parent
        if (!renderedDirs.has(dir)) {
          renderedDirs.add(dir)
          const isExpanded = openDirs.includes(dir)
          rows.push(
            <Button key={`dir:${dir}`} plain onPress={() => update($, expanded, before =>
              before.includes(dir) ? before.filter(one => one !== dir) : [...before, dir],
            )}>
              {'  '.repeat(depth)}{isExpanded ? 'v' : '>'} {isExpanded ? folderIcons.open : folderIcons.closed} {name}/
            </Button>,
          )
        }
        if (!openDirs.includes(dir)) return <Box key={file.path} flexDirection="column">{rows}</Box>
      }
      rows.push(
        <Box key={`file:${file.path}`}>
          <Text>{'  '.repeat(folders.length)}</Text>
          <Button key={`stage:${file.path}`} plain onPress={() => toggleStage($, { root: state.root, file })}>
            {file.staged ? '[x]' : '[ ]'}
          </Button>
          <Text> </Text>
          <Button key={`view:${file.path}`} plain dimColor={pick !== file.path} onPress={() => serial($, async () => {
            await update($, selected, () => file.path)
            await refresh($)
          })}>
            {pick === file.path ? '> ' : ''}{fileIcon(file.path)} {parts.at(-1)} <Text dimColor>{file.status}</Text>
          </Button>
        </Box>,
      )
      return <Box key={file.path} flexDirection="column">{rows}</Box>
    })

    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap">
          <Button
            key="toggle-sidebar"
            label={showSidebar ? 'Hide files' : 'Show files'}
            hotkey="b"
            onPress={() => update($, sidebarOpen, before => !before)}
          />
          {(['staged', 'unstaged', 'all'] as const).map(value => (
            <Button key={`filter:${value}`} plain dimColor={mode !== value} onPress={() => serial($, async () => {
              await update($, filter, () => value)
              await refresh($)
            })}>{mode === value ? `[${value}]` : ` ${value} `}</Button>
          ))}
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => serial($, () => refresh($))} />
        </Box>
        <Text dimColor>[x] staged · checkbox stages/unstages · filename previews</Text>
        {state.error ? <Text color="red">{state.error}</Text> : null}
        <Box key="review-layout" flexDirection="row" gap={showSidebar ? 1 : 0}>
          <Box key="diff-preview" flexDirection="column" flexGrow={1} minWidth={0} overflow="hidden">
            {pick ? <Text bold>{pick}</Text> : <Text dimColor>No {mode === 'all' ? '' : `${mode} `}changes.</Text>}
            {state.diffs.map(diff => {
              let body
              if (!canShowDiffs) body = <Text>Diff is too large to display. Review this file in Git.</Text>
              else if (diff.source) body = <Code source={diff.source} path={pick ?? ''} format="diff" />
              else body = <Text dimColor>No textual diff (empty file or metadata change).</Text>
              return (
                <Box key={diff.title} marginTop={1} flexDirection="column">
                  <Text bold>{diff.title}</Text>
                  {body}
                </Box>
              )
            })}
          </Box>
          {showSidebar ? (
            <Box key="file-sidebar" flexDirection="column" width={sidebarWidth} flexShrink={0} overflow="hidden">
              <Text bold>Files ({files.length})</Text>
              {files.length === 0 ? <Text dimColor>No changes.</Text> : tree}
            </Box>
          ) : null}
        </Box>
      </Box>
    )
  })
}
