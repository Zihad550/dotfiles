import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Draft } from '../types'

const PANE = 'drafts'
const DIR = '/tmp'
// Where draft-gt-command-for-issue-create and work-draft-reply write drafts.
const DRAFT = /^(gt-(issue|comment)|draft)-.+\.md$/
const WRITERS = new Set(['Write', 'Edit', 'Bash'])
const ENABLED = 'enabled'

const drafts = atom({ plugin: 'drafts', key: 'drafts' } as const, [])
const selected = atom({ plugin: 'drafts', key: 'selected' } as const, null)

const age = (now: number, ms: number) => {
  const minutes = Math.round((now - ms) / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

// Scans run one at a time, so a slow scan never overwrites a newer one's result.
let queue: Promise<unknown> = Promise.resolve()

function refresh($: EngineInterface) {
  const run = queue.then(() => scan($))
  queue = run.catch(() => undefined)
  return run
}

async function scan($: EngineInterface) {
  const entries = await $.fs.list(DIR).catch(() => [])
  const found = entries
    .filter(entry => entry.kind === 'file' && !entry.isLink && DRAFT.test(entry.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 20)
  const list: Draft[] = await Promise.all(
    found.map(async entry => {
      const path = `${DIR}/${entry.name}`
      const text = await $.fs.read(path).catch(() => '')
      return { path, name: entry.name, mtimeMs: entry.mtimeMs, text }
    }),
  )
  const before = await read($, drafts)
  const seen = new Map(before.map(one => [one.path, one.mtimeMs]))
  const isChanged =
    list.length !== before.length || list.some(one => seen.get(one.path) !== one.mtimeMs)
  if (!isChanged) return false
  await update($, drafts, () => list)
  // A fresh write takes the view, so the draft just made is the one shown.
  const newest = list[0]
  if (newest && seen.get(newest.path) !== newest.mtimeMs) {
    await update($, selected, () => newest.path)
  }
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'drafts',
      description: 'Toggle the drafts pane beside the chat',
      immediate: true,
    })
    await refresh($)
    if ((await $.store.get(ENABLED)) === true) {
      void $.ui.open({ id: PANE, title: 'Drafts' })
    }
    return next(e)
  })

  on('command.run', { command: 'drafts' }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'Drafts pane disabled.' }
    }
    await $.store.set(ENABLED, true)
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Drafts' })
    return { text: 'Drafts pane enabled.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind !== 'unload') await $.store.set(ENABLED, false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WRITERS.has(e.tool)) await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, drafts)
    const pick = await read($, selected)
    const now = await $.clock.now()

    const shown = list.find(one => one.path === pick) ?? list[0]

    if (shown === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No drafts yet.</Text>
          <Text dimColor>Drafts written to {DIR}/gt-*.md show here.</Text>
          <Box marginTop={1}>
            <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($)} />
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {list.map(one => (
          <Button
            key={one.path}
            plain
            dimColor={one.path !== shown.path}
            onPress={() => update($, selected, () => one.path)}
          >
            {one.path === shown.path ? '> ' : '  '}
            {one.name} <Text dimColor>{age(now, one.mtimeMs)}</Text>
          </Button>
        ))}
        <Box marginTop={1}>
          <Button
            key="copy"
            label="Copy"
            hotkey="c"
            onPress={async press => {
              const done = await $.ui.copy({ text: shown.text, surface: press.surface })
              $.ui.toast(done.isCopied ? `Copied ${shown.name}` : `Copy failed: ${done.reason}`)
            }}
          />
          <Text> </Text>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($)} />
        </Box>
        <Text dimColor>{shown.path}</Text>
        <Box marginTop={1} flexDirection="column">
          {shown.text.split('\n').map(line => (
            <Text>{line === '' ? ' ' : line}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
