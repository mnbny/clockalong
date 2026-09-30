import { dirname, join } from 'node:path'
import { $, fs } from 'zx'

const quietShell = $({ quiet: true })
const integerPattern = /^\d+$/
const worktreePortVariables = ['WORKTREE_PORT', 'PASEO_PORT', 'CONDUCTOR_PORT', 'PASEO_WORKTREE_PORT', 'PORT'] as const

type Logger = ReturnType<typeof createLogger>

export function createLogger(scope: string) {
  const prefix = `[${scope}]`
  const error = (message: string) => console.error(`❌ ${prefix} ${message}`)

  return {
    check(message: string) {
      console.log(`✅ ${prefix} ${message}`)
    },
    error,
    fail(message: string): never {
      error(message)
      process.exit(1)
    },
    info(message: string) {
      console.info(`ℹ️ ${prefix} ${message}`)
    },
    warning(message: string) {
      console.warn(`⚠️ ${prefix} ${message}`)
    },
  }
}

export function findWorktreePort(log: Logger, environment = process.env) {
  const source = worktreePortVariables.find(variable => environment[variable])

  if (!source) {
    return
  }

  const port = environment[source]

  if (!isValidPort(port)) {
    log.fail(`${source} must be an integer between 1 and 65535.`)
  }

  return { port, source }
}

export function isValidPort(value: string | undefined): value is string {
  if (!value || !integerPattern.test(value)) {
    return false
  }

  const port = Number(value)
  return port >= 1 && port <= 65_535
}

export async function findRepoRoot(directory: string) {
  return (await quietShell`git -C ${directory} rev-parse --show-toplevel`).stdout.trim()
}

async function findPrimaryWorktreeRoot(repoRoot: string) {
  const output = (await quietShell`git -C ${repoRoot} worktree list --porcelain -z`).stdout
  const worktreeEntry = output.split('\0').find(entry => entry.startsWith('worktree '))
  const primaryWorktreeRoot = worktreeEntry?.slice('worktree '.length)

  if (!primaryWorktreeRoot) {
    throw new Error('Unable to find the primary Git worktree')
  }

  return primaryWorktreeRoot
}

async function copyLocalFile(sourceRoot: string, targetRoot: string, relativePath: string, log: Logger) {
  const sourcePath = join(sourceRoot, relativePath)
  const targetPath = join(targetRoot, relativePath)

  if (!(await fs.pathExists(sourcePath))) {
    log.warning(`Local file not found, skipping: ${relativePath}`)
    return
  }

  if (await fs.pathExists(targetPath)) {
    log.info(`Local file already exists, skipping: ${relativePath}`)
    return
  }

  await fs.ensureDir(dirname(targetPath))
  await fs.copy(sourcePath, targetPath, { overwrite: false })
  log.check(`Copied local file: ${relativePath}`)
}

export async function copyLocalFilesFromPrimaryWorktree(
  targetRoot: string,
  relativePaths: ReadonlyArray<string>,
  log: Logger,
) {
  const sourceRoot = await findPrimaryWorktreeRoot(targetRoot)

  if (sourceRoot === targetRoot) {
    log.info('Local files are already in the primary worktree')
    return
  }

  for (const relativePath of relativePaths) {
    await copyLocalFile(sourceRoot, targetRoot, relativePath, log)
  }
}
