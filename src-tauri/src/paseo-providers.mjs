import { pathToFileURL } from 'node:url'

// The CLI's provider list formats modes as labels and drops their IDs.
// Use its installed client to read the same snapshot without that formatting.
const [clientPath, home] = process.argv.slice(1)
const { connectToDaemon } = await import(pathToFileURL(clientPath).href)
const client = await connectToDaemon({ target: { kind: 'instance', home } })
try {
  const snapshot = await client.getProvidersSnapshot()
  const providers = snapshot.entries
    .filter(entry => entry.enabled && entry.status === 'ready')
    .map(entry => ({
      id: entry.provider,
      label: entry.label ?? entry.provider,
      defaultModeId: entry.defaultModeId ?? null,
      modes: (entry.modes ?? []).map(({ id, label, description }) => ({ id, label, description })),
    }))
  process.stdout.write(JSON.stringify(providers))
} finally {
  await client.close()
}
