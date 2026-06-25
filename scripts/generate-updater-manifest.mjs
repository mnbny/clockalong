#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const tauriConfig = JSON.parse(await readFile(path.join(rootDir, 'src-tauri/tauri.conf.json'), 'utf8'))
const version = tauriConfig.version

if (!version) {
  fail('Missing version in src-tauri/tauri.conf.json')
}
const tag = `v${version}`
const repo = process.env.GITHUB_REPOSITORY || 'mnbny/clinear'
const macosBundleDir = path.join(rootDir, 'src-tauri/target/aarch64-apple-darwin/release/bundle/macos')
const files = await readdir(macosBundleDir)
const updateBundle = files.find(file => file.endsWith('.app.tar.gz'))

if (!updateBundle) {
  fail(`No macOS updater bundle found in ${macosBundleDir}`)
}

const signaturePath = path.join(macosBundleDir, `${updateBundle}.sig`)
const signature = (await readFile(signaturePath, 'utf8')).trim()
const assetUrl = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(updateBundle)}`
const manifest = {
  version,
  notes: process.env.RELEASE_NOTES ?? '',
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature,
      url: assetUrl,
    },
  },
}

const outputPath = path.join(rootDir, 'src-tauri/target/aarch64-apple-darwin/release/bundle/latest.json')

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(outputPath)

function fail(message) {
  console.error(message)
  process.exit(1)
}
