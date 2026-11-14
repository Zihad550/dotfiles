import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On, RenderSurface } from 'claude-code'
import { sessionRows } from '../hooks/tree'

function branch(id: string, parentId?: string): AgentInfo {
  return { id, parentId, name: id, description: `Work on ${id}`, type: 'general-purpose', status: 'running' }
}

function pane(surface: RenderSurface, agentId?: string) {
  return {
    plugin: 'session-tree', component: 'Pane', requestId: 'session-tree', surface,
    props: {
      title: 'Sessions', isFocused: false, bodyColumns: 38, placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 }, view: agentId ? { agentId } : {},
    },
  } as const
}

const command = {
  command: 'sessions', args: '', origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 140 },
} as const

function host(on: On, initial: AgentInfo[]) {
  const clock = mock.clock(on)
  let agents = initial
  let stopError = ''
  let viewError = ''
  let listError = false
  let listCalls = 0
  let isOpen = false
  const switches: (string | undefined)[] = []
  const stops: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('command.run', () => ({ text: 'Native command ran.' }))
  on('agent.list', () => {
    listCalls += 1
    if (listError) return { deny: 'Agent list unavailable' }
    return { value: agents }
  })
  on('ui.open', () => { isOpen = true; return { value: { isPlaced: true } } })
  on('ui.close', () => { isOpen = false; return { value: undefined } })
  on('ui.panes', () => ({ value: isOpen ? [{ id: 'session-tree', title: 'Sessions', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.view', (_, e) => {
    if (viewError) return { value: { deny: viewError } }
    switches.push(e.agentId)
    return { value: {} }
  })
  on('tool.call', { tool: 'TaskStop' }, (_, e) => {
    if (stopError) return { deny: stopError }
    if (typeof e.task_id !== 'string') throw new Error('Expected a task ID')
    stops.push(e.task_id)
    agents = agents.map(agent => agent.id === e.task_id ? { ...agent, status: 'killed' } : agent)
    return { result: { message: 'Stopped', task_id: e.task_id, task_type: 'local_agent' } }
  })
  return {
    clock, switches, stops,
    listCalls: () => listCalls,
    isOpen: () => isOpen,
    agents: (value: AgentInfo[]) => { agents = value },
    denyStop: (value: string) => { stopError = value },
    denyView: (value: string) => { viewError = value },
    failList: (value: boolean) => { listError = value },
  }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: main first, nested branches, navigation leaves work running`, async ($, on) => {
    const fixture = host(on, [branch('child', 'fork'), branch('fork'), branch('other')])
    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    await $.command.run(command)
    const ui = await $.ui.mount(pane(surface))
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.filter(button => button.key === 'main' || button.key?.startsWith('view:')).map(button => button.key))
      .toEqual(['main', 'view:fork', 'view:child', 'view:other'])
    expect((await ui.find({ key: 'row:child' }))?.props.paddingLeft).toBe(4)
    await ui.press({ key: 'view:child' })
    await ui.press({ key: 'view:other' })
    await ui.press({ key: 'main' })
    expect(fixture.switches).toEqual(['child', 'other', undefined])
    expect(fixture.stops).toEqual([])
    await ui.unmount()
    await $.command.run({ ...command, args: 'close' })
  })

  test(`${surface}: closing the active branch stops only it and returns to main`, async ($, on) => {
    const fixture = host(on, [branch('fork'), branch('other')])
    await $.command.run(command)
    const ui = await $.ui.mount(pane(surface, 'fork'))
    expect((await ui.find({ key: 'view:fork' }))?.props.dimColor).toBe(false)
    expect((await ui.find({ key: 'close:fork' }))?.props.label).toBe('Stop & close')
    await ui.press({ key: 'close:fork' })
    expect(fixture.stops).toEqual(['fork'])
    expect(fixture.switches).toEqual([undefined])
    expect(await ui.find({ key: 'view:fork' })).toBeUndefined()
    expect(await ui.find({ key: 'view:other' })).toBeDefined()
    await ui.press({ key: 'show-hidden' })
    expect((await ui.find({ key: 'close:fork' }))?.props.label).toBe('Hide')
    expect(fixture.stops).toEqual(['fork'])
    await ui.unmount()
    await $.command.run({ ...command, args: 'close' })
  })

  test(`${surface}: hiding finished branches preserves their children and can be undone`, async ($, on) => {
    const fixture = host(on, [{ ...branch('fork'), status: 'completed' }, branch('child', 'fork')])
    await $.command.run(command)
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: 'close:fork' })
    expect(fixture.stops).toEqual([])
    expect(await ui.find({ key: 'view:fork' })).toBeUndefined()
    expect((await ui.find({ key: 'row:child' }))?.props.paddingLeft).toBe(2)
    await ui.press({ key: 'show-hidden' })
    expect(await ui.find({ key: 'view:fork' })).toBeDefined()
    expect((await ui.find({ key: 'row:child' }))?.props.paddingLeft).toBe(4)
    await ui.unmount()
    await $.command.run({ ...command, args: 'close' })
  })
}

test('stop and navigation refusals stay visible and never hide a running branch', async ($, on) => {
  const fixture = host(on, [branch('fork')])
  await $.command.run(command)
  const ui = await $.ui.mount(pane('terminal'))
  fixture.denyStop('Stopping is denied')
  await ui.press({ key: 'close:fork' })
  expect(await ui.find({ key: 'view:fork' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Stopping is denied' })).toBeDefined()
  await fixture.clock.advance(1000)
  expect(await ui.find({ type: 'Text', text: 'Stopping is denied' })).toBeDefined()
  expect(fixture.stops).toEqual([])
  fixture.denyView('That transcript is elsewhere')
  await ui.press({ key: 'view:fork' })
  expect(await ui.find({ type: 'Text', text: 'That transcript is elsewhere' })).toBeDefined()
  fixture.denyStop('')
  fixture.denyView('')
  fixture.agents([{ ...branch('fork'), status: 'completed' }])
  await ui.press({ key: 'close:fork' })
  expect(fixture.stops).toEqual([])
  expect(await ui.find({ key: 'view:fork' })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ ...command, args: 'close' })
})

test('native btw/fork commands still run and open the live pane; closing cancels polling', async ($, on) => {
  const fixture = host(on, [])
  expect((await $.command.run({ ...command, command: 'btw', args: 'A question' })).text).toBe('Native command ran.')
  expect(fixture.isOpen()).toBe(true)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ key: 'main' })).toBeDefined()
  expect(await ui.find({ key: 'view:fork' })).toBeUndefined()
  fixture.agents([branch('fork')])
  await fixture.clock.advance(1000)
  expect(await ui.find({ key: 'view:fork' })).toBeDefined()
  await $.command.run({ ...command, command: 'fork', args: 'Continue the question' })
  await ui.unmount()
  await $.command.run({ ...command, args: 'close' })
  const calls = fixture.listCalls()
  await fixture.clock.advance(3000)
  expect(fixture.listCalls()).toBe(calls)
})

test('polling failures preserve branches and clear on recovery with unchanged tasks', async ($, on) => {
  const fixture = host(on, [branch('fork')])
  await $.command.run(command)
  const ui = await $.ui.mount(pane('terminal'))
  fixture.failList(true)
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: 'Agent list unavailable' })).toBeDefined()
  expect(await ui.find({ key: 'view:fork' })).toBeDefined()
  fixture.failList(false)
  await fixture.clock.advance(1000)
  expect(await ui.find({ type: 'Text', text: 'Agent list unavailable' })).toBeUndefined()
  expect(await ui.find({ key: 'view:fork' })).toBeDefined()
  await ui.unmount()
  await $.command.run({ ...command, args: 'close' })
})

test('missing parents and cycles never lose or repeat a branch', () => {
  const rows = sessionRows([branch('orphan', 'gone'), branch('a', 'b'), branch('b', 'a'), branch('self', 'self')], [])
  expect(rows.map(row => row.agent.id)).toEqual(['orphan', 'self', 'a', 'b'])
  expect(rows.map(row => row.depth)).toEqual([0, 0, 0, 1])
})
