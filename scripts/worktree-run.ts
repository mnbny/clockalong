import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createLogger, findRepoRoot, findWorktreePort } from './worktree-utils'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = await findRepoRoot(scriptDirectory)
const log = createLogger('clockalong run')

process.env.LANG = 'en_US.UTF-8'
process.env.LC_ALL = 'en_US.UTF-8'

const worktreePort = findWorktreePort(log)
const selectedPort = worktreePort?.port ?? '1420'

process.env.WORKTREE_PORT = selectedPort

if (worktreePort) {
  log.info(`Using Tauri dev port ${selectedPort} from ${worktreePort.source}`)
} else {
  log.info(`Using Tauri's default dev port ${selectedPort}`)
}

const tauriConfig = {
  build: {
    devUrl: `http://localhost:${selectedPort}`,
    beforeDevCommand: `pnpm dev --port ${selectedPort} --strictPort`,
  },
}

log.info('Starting Tauri app')
const subprocess = spawn('pnpm', ['tauri', 'dev', '--config', JSON.stringify(tauriConfig), ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
})

const exitCode = await new Promise<number>((resolve, reject) => {
  subprocess.once('error', reject)
  subprocess.once('close', exitCode => resolve(exitCode ?? 1))
})

process.exit(exitCode)
