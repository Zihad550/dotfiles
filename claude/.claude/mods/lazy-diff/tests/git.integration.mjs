import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileDiffs, git, parseStatus } from '../hooks/git.ts'

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'lazy-diff-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const run = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  run('init', '-q')
  run('config', 'user.email', 'test@example.com')
  run('config', 'user.name', 'Test')
  const $ = { process: { run: async (argv, init) => {
    const result = spawnSync(argv[0], argv.slice(1), { cwd: init.cwd, encoding: 'utf8' })
    return {
      exitCode: result.status, stdout: result.stdout, stderr: result.stderr,
      isStdoutTruncated: false, isStderrTruncated: false,
    }
  } } }
  const status = async () => parseStatus(await git($, { root, args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] }))
  return { root, run, $, status }
}

test('real Git handles partial staging, literal pathspecs, deletion, rename and untracked diffs', async t => {
  const { root, run, $, status } = repository(t)
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/app.ts'), 'const value = 1\n')
  writeFileSync(join(root, 'remove.ts'), 'remove me\n')
  run('add', '.')
  run('commit', '-qm', 'initial')
  writeFileSync(join(root, 'src/app.ts'), 'const value = 2\n')
  await git($, { root, args: ['add', '--all', '--', 'src/app.ts'] })
  writeFileSync(join(root, 'src/app.ts'), 'const value = 3\n')
  const partial = (await status()).find(file => file.path === 'src/app.ts')
  assert.ok(partial.staged && partial.unstaged)
  const diffs = await fileDiffs($, { root, file: partial, filter: 'all' })
  assert.match(diffs[0].source, /\+const value = 2/)
  assert.match(diffs[1].source, /\+const value = 3/)
  await git($, { root, args: ['reset', '--', partial.path] })
  assert.equal(readFileSync(join(root, partial.path), 'utf8'), 'const value = 3\n')

  writeFileSync(join(root, ':(glob)*.ts'), 'literal file\n')
  writeFileSync(join(root, 'other.ts'), 'other\n')
  const untracked = (await status()).find(file => file.path === ':(glob)*.ts')
  assert.match((await fileDiffs($, { root, file: untracked, filter: 'all' }))[0].source, /\+literal file/)
  await git($, { root, args: ['add', '--all', '--', untracked.path] })
  assert.equal((await status()).find(file => file.path === 'other.ts').staged, false)

  run('mv', 'remove.ts', 'renamed file.ts')
  const rename = (await status()).find(file => file.path === 'renamed file.ts')
  assert.equal(rename.originalPath, 'remove.ts')
  assert.match((await fileDiffs($, { root, file: rename, filter: 'staged' }))[0].source, /rename from remove.ts/)
  await git($, { root, args: ['reset', '--', rename.originalPath, rename.path] })
  assert.ok((await status()).find(file => file.path === 'remove.ts').unstaged)
  await git($, { root, args: ['add', '--all', '--', 'remove.ts'] })
  assert.ok((await status()).find(file => file.path === 'remove.ts').staged)
})

test('path-only reset unstages before the first commit and preserves the file', async t => {
  const { root, $, status } = repository(t)
  writeFileSync(join(root, 'new.ts'), 'new\n')
  await git($, { root, args: ['add', '--all', '--', 'new.ts'] })
  assert.equal((await status())[0].staged, true)
  await git($, { root, args: ['reset', '--', 'new.ts'] })
  assert.equal((await status())[0].untracked, true)
  assert.equal(readFileSync(join(root, 'new.ts'), 'utf8'), 'new\n')
})
