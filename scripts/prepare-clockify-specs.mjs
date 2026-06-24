import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const sourcePath = resolve('src/services/clockify/specs/clockify-openapi.json')
const reportsPath = resolve('src/services/clockify/specs/clockify-reports-openapi.json')
const reportsBaseUrl = 'https://reports.api.clockify.me'

const spec = JSON.parse(await readFile(sourcePath, 'utf8'))

const reportsSpec = {
  ...spec,
  paths: Object.fromEntries(
    Object.entries(spec.paths ?? {})
      .filter(([, pathItem]) => hasReportsServer(pathItem))
      .map(([path, pathItem]) => [path, normalizeWildcardJsonContent(pathItem)]),
  ),
  servers: [{ url: reportsBaseUrl }],
}

await mkdir(dirname(reportsPath), { recursive: true })
await writeFile(reportsPath, `${JSON.stringify(reportsSpec, null, 2)}\n`)

function hasReportsServer(pathItem) {
  return (pathItem.servers ?? []).some(server => server.url === reportsBaseUrl)
}

function normalizeWildcardJsonContent(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeWildcardJsonContent)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const next = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizeWildcardJsonContent(child)]),
  )

  if (next.content?.['*/*'] && !next.content['application/json']) {
    next.content = {
      ...next.content,
      'application/json': next.content['*/*'],
    }
    delete next.content['*/*']
  }

  return next
}
