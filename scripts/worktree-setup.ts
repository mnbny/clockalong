import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $ } from 'zx'

import { copyLocalFilesFromPrimaryWorktree, createLogger, findRepoRoot } from './worktree-utils'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = await findRepoRoot(scriptDirectory)

process.env.LANG = 'en_US.UTF-8'
process.env.LC_ALL = 'en_US.UTF-8'

const shell = $({ cwd: repoRoot, stdio: 'inherit' })
const log = createLogger('clockalong setup')

const filesToCopyFromPrimaryWorktree = ['.env', '.env.local'] as const

log.info('Copying local files from primary worktree')
await copyLocalFilesFromPrimaryWorktree(repoRoot, filesToCopyFromPrimaryWorktree, log)

log.info('Prebuilding native Tauri project')
await shell`pnpm run tauri:prebuild`
