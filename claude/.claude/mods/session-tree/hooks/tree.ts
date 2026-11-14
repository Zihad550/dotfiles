import type { AgentInfo } from 'claude-code'

export function sessionRows(agents: AgentInfo[], hidden: string[]) {
  const visible = agents.filter(agent => !hidden.includes(agent.id))
  const ids = new Set(visible.map(agent => agent.id))
  const children = new Map<string, AgentInfo[]>()
  const roots: AgentInfo[] = []
  for (const agent of visible) {
    if (agent.parentId && ids.has(agent.parentId) && agent.parentId !== agent.id) {
      const siblings = children.get(agent.parentId) ?? []
      siblings.push(agent)
      children.set(agent.parentId, siblings)
    } else roots.push(agent)
  }
  const rows: { agent: AgentInfo; depth: number }[] = []
  const seen = new Set<string>()
  // Preserve every branch even if a parent disappeared or the host supplied a cycle.
  for (const root of [...roots, ...visible]) {
    const stack = [{ agent: root, depth: 0 }]
    while (stack.length) {
      const row = stack.pop()
      if (!row || seen.has(row.agent.id)) continue
      seen.add(row.agent.id)
      rows.push(row)
      const nested = children.get(row.agent.id) ?? []
      for (const agent of [...nested].reverse()) stack.push({ agent, depth: row.depth + 1 })
    }
  }
  return rows
}

export function isLive(agent: AgentInfo) {
  return ['pending', 'running', 'waiting', 'idle'].includes(agent.status)
}
