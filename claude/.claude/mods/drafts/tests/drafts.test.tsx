import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'drafts',
  component: 'Pane',
  requestId: 'drafts',
  props: {
    title: 'Drafts',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('/drafts toggles the pane and it shows the newest draft', async ($, on) => {
  let isOpen = false
  const reads: string[] = []
  const store: Record<string, unknown> = {}
  on('command.register', () => ({ value: { command: 'drafts' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: 120_000 }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  const listed: string[] = []
  on('fs.list', (_, e) => {
    listed.push(e.path)
    return {
      value: [
        { name: 'gt-issue-old.md', kind: 'file', size: 3, mtimeMs: 0, isLink: false },
        { name: 'gt-comment-42.md', kind: 'file', size: 5, mtimeMs: 60_000, isLink: false },
        { name: 'draft-secret.md', kind: 'file', size: 10, mtimeMs: 120_000, isLink: true },
        { name: 'notes.md', kind: 'file', size: 1, mtimeMs: 90_000, isLink: false },
      ],
    }
  })
  on('fs.read', (_, e) => {
    reads.push(e.path)
    return { value: e.path.endsWith('42.md') ? 'Looks good.' : 'old' }
  })
  on('ui.panes', () => ({
    value: isOpen ? [{ id: 'drafts', title: 'Drafts', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.open', () => {
    isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    isOpen = false
    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(isOpen).toBe(false)

  expect((await $.command.run({ command: 'drafts', args: '' })).text).toBe('Drafts pane enabled.')
  expect(isOpen).toBe(true)
  expect(store.enabled).toBe(true)
  expect(listed.length).toBeGreaterThan(0)
  expect(listed.every(path => path === '/repo/tmp')).toBe(true)
  expect(reads.includes('/repo/tmp/gt-comment-42.md')).toBe(true)
  expect(reads.includes('/repo/tmp/draft-secret.md')).toBe(false)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Looks good/ }))?.text).toBe('Looks good.')
  expect(await ui.find({ type: 'Text', text: /notes\.md/ })).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run({ command: 'drafts', args: '' })).text).toBe('Drafts pane disabled.')
  expect(isOpen).toBe(false)
  expect(store.enabled).toBe(false)
})
