import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const targets = {
  api: {
    input: 'src/services/clockify/specs/clockify-openapi.json',
    output: 'src/services/clockify/generated/clockify.ts',
  },
  reports: {
    input: 'src/services/clockify/specs/clockify-reports-openapi.json',
    mediaTypeExpr: "mediaType === '*/*' || mediaType === 'application/json'",
    output: 'src/services/clockify/generated/reports.ts',
  },
}

const targetName = process.argv[2]

if (!targetName || !(targetName in targets)) {
  throw new Error(`Usage: node scripts/generate-clockify-client.mjs ${Object.keys(targets).join('|')}`)
}

const target = targets[targetName]
const generatorArgs = ['exec', 'openapi-zod-client', target.input, '-o', target.output, '--export-types']

if (target.mediaTypeExpr) {
  generatorArgs.push('--media-type-expr', target.mediaTypeExpr)
}

await run('pnpm', generatorArgs)

const generated = await readFile(target.output, 'utf8')
const postProcessed = generated
  .replace(/^\/\/ @ts-nocheck\n/, '')
  .replace(/^type /gm, 'export type ')
  .replace(/[ \t]+$/gm, '')

await writeFile(target.output, `// @ts-nocheck\n${postProcessed}`)
await run('pnpm', ['exec', 'prettier', '--write', target.output, '--log-level=error'])

async function run(command, args) {
  const { stderr, stdout } = await execFileAsync(command, args)

  if (stdout) {
    process.stdout.write(stdout)
  }

  if (stderr) {
    process.stderr.write(stderr)
  }
}
