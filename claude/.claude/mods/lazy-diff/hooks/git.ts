import type { EngineInterface } from 'claude-code'
import type { ChangedFile, Diff, Filter } from '../types'

export function parseStatus(output: string): ChangedFile[] {
  const records = output.split('\0')
  const files: ChangedFile[] = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record || record.length < 4) continue
    const status = record.slice(0, 2)
    if (status === '!!') continue
    const originalPath = /[RC]/.test(status) ? (records[++index] ?? null) : null
    const untracked = status === '??'
    const conflicted = status.includes('U') || status === 'AA' || status === 'DD'
    files.push({
      path: record.slice(3),
      originalPath,
      status,
      untracked,
      conflicted,
      staged: !untracked && !conflicted && status[0] !== ' ',
      unstaged: untracked || conflicted || status[1] !== ' ',
    })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export const visibleFiles = (files: ChangedFile[], filter: Filter) =>
  files.filter(file => filter === 'all' || (filter === 'staged' ? file.staged : file.unstaged))

export async function git($: EngineInterface, { root, args, allowDiffExitCode = false, allowTruncatedOutput = false }: {
  root: string
  args: string[]
  allowDiffExitCode?: boolean
  allowTruncatedOutput?: boolean
}) {
  const result = await $.process.run(['git', '--literal-pathspecs', ...args], { cwd: root })
  if ((result.exitCode !== 0 && !(allowDiffExitCode && result.exitCode === 1)) || (result.isStdoutTruncated && !allowTruncatedOutput)) {
    throw new Error(result.isStdoutTruncated ? 'Git output is too large to review.' : result.stderr.trim() || 'Git command failed.')
  }
  return result.stdout
}

export async function fileDiffs($: EngineInterface, { root, file, filter }: {
  root: string
  file: ChangedFile
  filter: Filter
}) {
  const diffs: Diff[] = []
  const paths = file.originalPath ? [file.originalPath, file.path] : [file.path]
  const options = ['--no-ext-diff', '--no-textconv', '--color=never']
  if (file.staged && filter !== 'unstaged') {
    diffs.push({ title: 'Staged', source: await git($, { root, args: ['diff', ...options, '--cached', '--', ...paths], allowTruncatedOutput: true }) })
  }
  if (file.unstaged && filter !== 'staged') {
    const args = file.untracked
      ? ['diff', ...options, '--no-index', '--', '/dev/null', file.path]
      : ['diff', ...options, '--', ...paths]
    diffs.push({ title: file.untracked ? 'Untracked' : 'Unstaged', source: await git($, { root, args, allowDiffExitCode: file.untracked, allowTruncatedOutput: true }) })
  }
  return diffs
}
