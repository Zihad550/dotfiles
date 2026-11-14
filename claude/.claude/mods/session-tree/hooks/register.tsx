import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import { isLive, sessionRows } from './tree'

const PANE = 'session-tree'
const snapshot = atom({ plugin: 'session-tree', key: 'snapshot' } as const, { agents: [], error: '', refreshError: '' })
const hidden = atom({ plugin: 'session-tree', key: 'hidden' } as const, [])
let timer: Timer | undefined
let refreshing = false
let acting = false

async function refresh($: EngineInterface) {
  if (refreshing) return
  refreshing = true
  try {
    const agents = await $.agent.list()
    const before = await read($, snapshot)
    if (before.refreshError || JSON.stringify(before.agents) !== JSON.stringify(agents)) {
      await update($, snapshot, state => ({ ...state, agents, refreshError: '' }))
    }
  } catch (error: unknown) {
    await update($, snapshot, state => ({ ...state, refreshError: messageOf(error) }))
  } finally {
    refreshing = false
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function act($: EngineInterface, action: () => Promise<unknown>) {
  if (acting) return
  acting = true
  try {
    await update($, snapshot, before => ({ ...before, error: '' }))
    await action()
  } catch (error: unknown) {
    await update($, snapshot, before => ({ ...before, error: messageOf(error) }))
  } finally {
    acting = false
  }
}

async function view($: EngineInterface, agentId?: string) {
  const result = await $.ui.view(agentId ? { agentId } : {})
  if (result.deny) throw new Error(result.deny)
}

async function open($: EngineInterface) {
  await refresh($)
  await $.ui.open({ id: PANE, title: 'Sessions' })
  if (!timer) timer = $.clock.every(1000, () => {
    void refresh($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sessions', description: 'Show the conversation tree', immediate: true })
    return next(e)
  })

  on('command.run', { command: 'sessions' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Sessions closed.' }
    }
    await act($, () => open($))
    return { text: 'Sessions opened.' }
  })

  on('command.run', async ($, e, next) => {
    const result = await next(e)
    if (['btw', 'fork'].includes(e.command)) await act($, () => open($))
    return result
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && !(await $.ui.panes()).some(pane => pane.id === PANE)) {
      timer?.cancel()
      timer = undefined
    }
    return result
  })

  on('session.end', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const state = await read($, snapshot)
    const hiddenIds = await read($, hidden)
    const rows = sessionRows(state.agents, hiddenIds)
    const activeId = e.props.view.agentId
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text bold>Sessions</Text>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => act($, () => refresh($))} />
          {hiddenIds.length ? <Button key="show-hidden" label="Show hidden" onPress={() => update($, hidden, () => [])} /> : null}
        </Box>
        {state.error ? <Text color="red">{state.error}</Text> : null}
        {state.refreshError ? <Text color="red">{state.refreshError}</Text> : null}
        <Button key="main" plain dimColor={!!activeId} onPress={() => act($, () => view($))}>
          {activeId ? '  ' : '> '}Main session
        </Button>
        {rows.map(({ agent, depth }) => (
          <Box key={`row:${agent.id}`} flexDirection="column" paddingLeft={Math.min(depth + 1, 6) * 2}>
            <Button key={`view:${agent.id}`} plain dimColor={activeId !== agent.id}
              onPress={() => act($, () => view($, agent.id))}>
              {activeId === agent.id ? '> ' : ''}{agent.name || agent.description || agent.id}
            </Button>
            <Box gap={1}>
              <Text dimColor>{agent.status}</Text>
              <Button key={`close:${agent.id}`} plain label={isLive(agent) ? 'Stop & close' : 'Hide'}
                onPress={() => act($, async () => {
                  const current = (await $.agent.list()).find(one => one.id === agent.id)
                  if (current && isLive(current)) {
                    const stopped = await $.tool.call({ tool: 'TaskStop', task_id: current.id })
                    if (stopped.deny) throw new Error(stopped.deny)
                    if (stopped.isError) throw new Error(stopped.text ?? 'Claude could not stop this branch.')
                  }
                  if (activeId === agent.id) await view($)
                  await update($, hidden, before => before.includes(agent.id) ? before : [...before, agent.id])
                  await refresh($)
                })} />
            </Box>
          </Box>
        ))}
        {!rows.length ? <Text dimColor>No branches. Create one with /fork or fork a /btw question.</Text> : null}
        <Text dimColor>Hide removes a row; Stop & close also stops that branch.</Text>
      </Box>
    )
  })
}
