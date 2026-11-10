import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { parseStatus } from '../hooks/git'

const PANE = {
  plugin: 'lazy-diff', component: 'Pane', requestId: 'lazy-diff', surface: 'terminal',
  props: {
    title: 'Lazy Diff', isFocused: false, bodyColumns: 100, placement: 'dock',
    scroll: { offset: 0, bodyRows: 50 }, view: {},
  },
} as const

function host(on: On, initial: string) {
  let status = initial
  let failWrite = false
  let largeDiff = false
  let root = '/repo'
  const commands: string[][] = []
  on('command.register', () => ({ value: { command: 'lazy-diff' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: root }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    commands.push(argv)
    let stdout = ''
    let stderr = ''
    let exitCode = 0
    const command = argv[2]
    if (command === 'rev-parse') stdout = `${root}\n`
    else if (command === 'status') stdout = status
    else if (command === 'diff') {
      stdout = 'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n'
      if (argv.includes('--no-index')) exitCode = 1
    } else if (command === 'add' || command === 'reset') {
      if (failWrite) { exitCode = 128; stderr = 'index.lock exists' }
      else status = command === 'add' ? 'M  src/app.ts\0' : ' M src/app.ts\0'
    } else throw new Error(`Unexpected Git call: ${argv.join(' ')}`)
    if (command === 'diff' && largeDiff) stdout = '+large diff\n'.repeat(10000)
    return { value: { exitCode, stdout, stderr, isStdoutTruncated: command === 'diff' && largeDiff, isStderrTruncated: false } }
  })
  return {
    commands,
    status: (value: string) => { status = value },
    root: (value: string) => { root = value },
    failWrites: () => { failWrite = true },
    largeDiffs: () => { largeDiff = true },
  }
}

test('opens staged by default; folders expand and collapse; diffs use Code', async ($, on) => {
  const fixture = host(on, 'M  src/app.ts\0 M unstaged.ts\0?? new.ts\0')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })).text).toBe('Lazy Diff opened.')
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'dir:src' })).toBeDefined()
  expect(await ui.find({ key: 'view:src/app.ts' })).toBeUndefined()
  expect(await ui.find({ key: 'view:unstaged.ts' })).toBeUndefined()
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ key: 'view:src/app.ts' })).toBeDefined()
  const code = await ui.find({ type: 'Code' })
  expect(code?.props.format).toBe('diff')
  expect(code?.props.path).toBe('src/app.ts')
  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ key: 'view:src/app.ts' })).toBeUndefined()
  expect(fixture.commands.some(argv => argv.includes('--cached'))).toBe(true)
  await ui.unmount()
})

test('filters switch and previewing leaves the index alone; checkboxes stage and unstage', async ($, on) => {
  const fixture = host(on, ' M src/app.ts\0')
  await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'filter:unstaged' })
  await ui.press({ key: 'dir:src' })
  await ui.press({ key: 'view:src/app.ts' })
  expect(fixture.commands.some(argv => argv[2] === 'add')).toBe(false)
  await ui.press({ key: 'stage:src/app.ts' })
  expect(fixture.commands.some(argv => argv.join('|') === 'git|--literal-pathspecs|add|--all|--|src/app.ts')).toBe(true)
  expect(await ui.find({ key: 'view:src/app.ts' })).toBeUndefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'filter:staged' })
  expect(await ui.find({ key: 'view:src/app.ts' })).toBeDefined()
  await ui.press({ key: 'filter:all' })
  await ui.press({ key: 'stage:src/app.ts' })
  expect(fixture.commands.some(argv => argv.join('|') === 'git|--literal-pathspecs|reset|--|src/app.ts')).toBe(true)
  expect(await ui.find({ key: 'view:src/app.ts' })).toBeDefined()
  await ui.unmount()
})

test('all shows both sides of a partially staged file; untracked uses no-index', async ($, on) => {
  const fixture = host(on, 'MM src/app.ts\0?? new file.ts\0')
  await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'filter:all' })
  expect(await ui.findAll({ type: 'Code' })).toHaveLength(2)
  await ui.press({ key: 'view:new file.ts' })
  expect(fixture.commands.some(argv => argv.includes('--no-index') && argv.at(-1) === 'new file.ts')).toBe(true)
  expect((await ui.find({ type: 'Code' }))?.props.path).toBe('new file.ts')
  await ui.unmount()
})

test('reports staging errors and refuses unresolved conflicts', async ($, on) => {
  const fixture = host(on, ' M src/app.ts\0')
  await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'filter:all' })
  await ui.press({ key: 'dir:src' })
  fixture.failWrites()
  await ui.press({ key: 'stage:src/app.ts' })
  expect(await ui.find({ type: 'Text', text: /index.lock exists/ })).toBeDefined()
  fixture.status('UU src/app.ts\0')
  await ui.press({ key: 'refresh' })
  const writes = fixture.commands.filter(argv => argv[2] === 'add').length
  await ui.press({ key: 'stage:src/app.ts' })
  expect(await ui.find({ type: 'Text', text: /Resolve this file/ })).toBeDefined()
  expect(fixture.commands.filter(argv => argv[2] === 'add')).toHaveLength(writes)
  await ui.unmount()
})

test('parses NUL-delimited renames, unusual names, deletions and conflicts', () => {
  const files = parseStatus('R  new name.ts\0old name.ts\0 D gone.ts\0?? odd\nname.ts\0UU conflict.ts\0')
  expect(files.find(file => file.path === 'new name.ts')?.originalPath).toBe('old name.ts')
  expect(files.find(file => file.path === 'gone.ts')?.unstaged).toBe(true)
  expect(files.find(file => file.path === 'odd\nname.ts')?.untracked).toBe(true)
  expect(files.find(file => file.path === 'conflict.ts')?.conflicted).toBe(true)
})

test('a truncated large preview does not block staging or unstaging', async ($, on) => {
  const fixture = host(on, ' M src/app.ts\0')
  fixture.largeDiffs()
  await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'filter:all' })
  expect(await ui.find({ type: 'Text', text: /too large to display/ })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'dir:src' })
  await ui.press({ key: 'stage:src/app.ts' })
  expect(fixture.commands.some(argv => argv[2] === 'add')).toBe(true)
  await ui.press({ key: 'stage:src/app.ts' })
  expect(fixture.commands.some(argv => argv[2] === 'reset')).toBe(true)
  await ui.unmount()
})

test('file sidebar collapses without losing selection, folder expansion, or diff', async ($, on) => {
  const fixture = host(on, 'M  src/app.ts\0M  src/other.ts\0')
  await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'review-layout' }))?.props.flexDirection).toBe('row')
  expect((await ui.find({ key: 'file-sidebar' }))?.props.width).toBe(32)
  expect((await ui.find({ key: 'toggle-sidebar' }))?.props.hotkey).toBe('b')
  await ui.press({ key: 'dir:src' })
  await ui.press({ key: 'view:src/other.ts' })
  const commandsBeforeToggle = fixture.commands.length
  await ui.press({ key: 'toggle-sidebar' })
  expect(await ui.find({ key: 'file-sidebar' })).toBeUndefined()
  expect(await ui.find({ key: 'view:src/other.ts' })).toBeUndefined()
  expect((await ui.find({ key: 'review-layout' }))?.props.gap).toBe(0)
  expect((await ui.find({ key: 'diff-preview' }))?.props.flexGrow).toBe(1)
  expect((await ui.find({ type: 'Code' }))?.props.path).toBe('src/other.ts')
  await ui.press({ key: 'toggle-sidebar' })
  expect(await ui.find({ key: 'view:src/other.ts' })).toBeDefined()
  expect((await ui.find({ type: 'Code' }))?.props.path).toBe('src/other.ts')
  expect(fixture.commands).toHaveLength(commandsBeforeToggle)
  await ui.unmount()
  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 48 } })
  expect((await narrow.find({ key: 'file-sidebar' }))?.props.width).toBe(16)
  await narrow.press({ key: 'toggle-sidebar' })
  expect(await narrow.find({ type: 'Code' })).toBeDefined()
  expect(await narrow.find({ key: 'file-sidebar' })).toBeUndefined()
  await narrow.unmount()
})

test('sidebar renders folder and file icons while preview and staging remain usable', async ($, on) => {
  const fixture = host(on, 'M  src/app.ts\0M  src/Dockerfile\0M  config.json\0M  README.md\0M  file.unknown\0')
  await $.command.run({ command: 'lazy-diff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'dir:src' }))?.text).toContain('\uf07b')
  expect((await ui.find({ key: 'view:config.json' }))?.text).toContain('\ue60b')
  expect((await ui.find({ key: 'view:README.md' }))?.text).toContain('\ue73e')
  expect((await ui.find({ key: 'view:file.unknown' }))?.text).toContain('\uf15b')
  await ui.press({ key: 'dir:src' })
  expect((await ui.find({ key: 'dir:src' }))?.text).toContain('\uf07c')
  expect((await ui.find({ key: 'view:src/app.ts' }))?.text).toContain('\ue628')
  expect((await ui.find({ key: 'view:src/Dockerfile' }))?.text).toContain('\ue7b0')
  await ui.press({ key: 'view:src/app.ts' })
  expect((await ui.find({ type: 'Code' }))?.props.path).toBe('src/app.ts')
  await ui.press({ key: 'dir:src' })
  expect((await ui.find({ key: 'dir:src' }))?.text).toContain('\uf07b')
  await ui.press({ key: 'dir:src' })
  await ui.press({ key: 'stage:src/app.ts' })
  expect(fixture.commands.some(argv => argv.join('|') === 'git|--literal-pathspecs|reset|--|src/app.ts')).toBe(true)
  await ui.unmount()
})
