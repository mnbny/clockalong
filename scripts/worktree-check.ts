import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLogger, findRepoRoot, findWorktreePort, isValidPort } from './worktree-utils'

const repoRoot = await findRepoRoot(fileURLToPath(new URL('.', import.meta.url)))
const temporaryRoot = realpathSync(mkdtempSync(join(tmpdir(), 'clockalong-worktree-')))
const portVariables = ['WORKTREE_PORT', 'PASEO_PORT', 'CONDUCTOR_PORT', 'PASEO_WORKTREE_PORT', 'PORT']
const log = {
  ...createLogger('worktree check'),
  fail(message: string): never {
    throw new Error(message)
  },
}

try {
  assert.equal(findWorktreePort(log, {}), undefined)
  for (const port of ['1', '1420', '65535']) assert.ok(isValidPort(port))
  for (const port of ['', '0', '65536', '-1', '1.5', ' 1420', '1420; echo invalid']) {
    assert.equal(isValidPort(port), false)
    if (port) assert.throws(() => findWorktreePort(log, { WORKTREE_PORT: port, PORT: '1420' }))
  }
  const ports = Object.fromEntries(portVariables.map(source => [source, '4321']))
  for (const source of portVariables) {
    assert.deepEqual(findWorktreePort(log, ports), { source, port: '4321' })
    ports[source] = ''
  }

  const primaryRoot = join(temporaryRoot, 'primary repo')
  const worktreeRoot = join(temporaryRoot, 'linked worktree')
  const binRoot = join(temporaryRoot, 'bin')
  const commandLog = join(temporaryRoot, 'commands.jsonl')
  mkdirSync(primaryRoot)
  mkdirSync(binRoot)
  execFileSync('git', ['init', '--quiet', primaryRoot])
  execFileSync('git', [
    '-C',
    primaryRoot,
    '-c',
    'user.name=Worktree Check',
    '-c',
    'user.email=check@example.test',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'check',
  ])
  execFileSync('git', ['-C', primaryRoot, 'worktree', 'add', '--quiet', '--detach', worktreeRoot])
  mkdirSync(join(worktreeRoot, 'scripts'))
  for (const file of ['worktree-setup.sh', 'worktree-setup.ts', 'worktree-run.ts', 'worktree-utils.ts']) {
    cpSync(join(repoRoot, 'scripts', file), join(worktreeRoot, 'scripts', file))
  }
  writeFileSync(join(worktreeRoot, 'package.json'), '{"type":"module"}')
  writeFileSync(join(primaryRoot, '.env'), 'WORKTREE_CHECK=primary\n')

  const stubPath = join(temporaryRoot, 'command.mjs')
  writeFileSync(
    stubPath,
    `
import { appendFileSync, existsSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
const [command, ...args] = process.argv.slice(2)
appendFileSync(process.env.WORKTREE_CHECK_LOG, JSON.stringify({ command, args, cwd: process.cwd(), port: process.env.WORKTREE_PORT }) + '\\n')
if (command === 'pnpm' && args[0] === 'install' && !existsSync('node_modules')) {
  symlinkSync(process.env.WORKTREE_CHECK_MODULES, join(process.cwd(), 'node_modules'), 'dir')
}
if (command === 'pnpm' && args[0] === 'exec') {
  const child = spawnSync(process.execPath, [process.env.WORKTREE_CHECK_TSX, ...args.slice(2)], { stdio: 'inherit' })
  process.exit(child.status ?? 1)
}
process.exit(Number(process.env.WORKTREE_CHECK_EXIT_CODE ?? 0))
`,
  )
  for (const command of ['asdf', 'pnpm']) {
    writeFileSync(
      join(binRoot, command),
      `#!/bin/sh\nexec "$WORKTREE_CHECK_NODE" "$WORKTREE_CHECK_STUB" ${command} "$@"\n`,
      { mode: 0o755 },
    )
  }
  const environment = { ...process.env }
  for (const source of portVariables) delete environment[source]
  Object.assign(environment, {
    PATH: `${binRoot}:${process.env.PATH}`,
    WORKTREE_CHECK_NODE: process.execPath,
    WORKTREE_CHECK_STUB: stubPath,
    WORKTREE_CHECK_LOG: commandLog,
    WORKTREE_CHECK_MODULES: join(repoRoot, 'node_modules'),
    WORKTREE_CHECK_TSX: fileURLToPath(import.meta.resolve('tsx/cli')),
  })
  const options = { cwd: temporaryRoot, env: environment, encoding: 'utf8' as const }
  const readCommands = () =>
    readFileSync(commandLog, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))

  assert.equal(existsSync(join(worktreeRoot, 'node_modules')), false)
  execFileSync(join(worktreeRoot, 'scripts/worktree-setup.sh'), [], options)
  assert.deepEqual(
    readCommands().map(({ command, args }) => [command, ...args]),
    [
      ['asdf', 'install'],
      ['pnpm', 'install', '--config.confirmModulesPurge=false'],
      ['pnpm', 'exec', 'tsx', 'scripts/worktree-setup.ts'],
      ['pnpm', 'run', 'tauri:prebuild'],
    ],
  )
  assert.ok(readCommands().every(({ cwd }) => cwd === worktreeRoot))
  assert.equal(readFileSync(join(worktreeRoot, '.env'), 'utf8'), 'WORKTREE_CHECK=primary\n')
  assert.equal(existsSync(join(worktreeRoot, '.env.local')), false)
  writeFileSync(join(worktreeRoot, '.env'), 'WORKTREE_CHECK=local\n')
  writeFileSync(join(primaryRoot, '.env.local'), 'WORKTREE_CHECK=optional\n')
  execFileSync(join(worktreeRoot, 'scripts/worktree-setup.sh'), [], options)
  assert.equal(readFileSync(join(worktreeRoot, '.env'), 'utf8'), 'WORKTREE_CHECK=local\n')
  assert.equal(readFileSync(join(worktreeRoot, '.env.local'), 'utf8'), 'WORKTREE_CHECK=optional\n')

  const runArguments = [
    environment.WORKTREE_CHECK_TSX!,
    join(worktreeRoot, 'scripts/worktree-run.ts'),
    '--features',
    'one two',
  ]
  for (const source of ['', ...portVariables]) {
    const port = source ? '4321' : '1420'
    execFileSync(process.execPath, runArguments, {
      ...options,
      env: { ...environment, ...(source ? { [source]: port } : {}) },
    })
    const commands = readCommands()
    const command = commands[commands.length - 1]
    assert.equal(command.cwd, worktreeRoot)
    assert.equal(command.port, port)
    assert.deepEqual(command.args.slice(0, 3), ['tauri', 'dev', '--config'])
    assert.deepEqual(JSON.parse(command.args[3]), {
      build: { devUrl: `http://localhost:${port}`, beforeDevCommand: `pnpm dev --port ${port} --strictPort` },
    })
    assert.deepEqual(command.args.slice(4), ['--features', 'one two'])
  }
  const failure = spawnSync(process.execPath, runArguments, {
    ...options,
    env: { ...environment, WORKTREE_CHECK_EXIT_CODE: '23' },
  })
  assert.equal(failure.status, 23)
  const commandCount = readCommands().length
  const invalid = spawnSync(process.execPath, runArguments, {
    ...options,
    env: { ...environment, PASEO_PORT: '65536' },
  })
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /PASEO_PORT must be an integer between 1 and 65535/)
  assert.equal(readCommands().length, commandCount)
  console.log('Worktree checks passed')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
