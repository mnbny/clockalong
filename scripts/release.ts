import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

import { createLogger, findRepoRoot } from './worktree-utils'

const log = createLogger('clockalong release')
const command = process.argv[2]
const script = command === 'mac' ? 'release-mac.sh' : command === 'github' ? 'publish-github-release.sh' : null
if (!script) log.fail('Choose a release command: mac or github.')

const repoRoot = await findRepoRoot(fileURLToPath(new URL('.', import.meta.url)))
const productionEnv = loadEnv('production', repoRoot, ['CLOCKALONG_', 'APPLE_', 'TAURI_SIGNING_'])
const subprocess = spawn('bash', [`scripts/${script}`, ...process.argv.slice(3)], {
  cwd: repoRoot,
  env: { ...productionEnv, ...process.env },
  stdio: 'inherit',
})

const exitCode = await new Promise<number>((resolve, reject) => {
  subprocess.once('error', reject)
  subprocess.once('close', code => resolve(code ?? 1))
})
process.exit(exitCode)
