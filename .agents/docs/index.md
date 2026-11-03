# Documentation Registry

## How to Read

Read this registry to determine whether documentation applies to the current task. Read a registered document only when explicitly asked or when its description or tags relate to the work. Do not read documentation just because it is available, and do not read unrelated documents.

## How to Update

- Add an entry when a documentation file other than this registry is created.
- Update its entry when the file is renamed or its purpose changes.
- Remove its entry when the file is deleted.
- Use the exact relative file reference or path as the entry heading.
- Keep descriptions terse and limited to the document's purpose and contents. Do not include technical details.
- Use concise tags that are likely to appear in a related task.

### Entry Format

Add each document using this format:

```md
#### [file-name.md](./file-name.md)

- Description: Very brief description of the document's purpose and contents.
- Tags: `related-topic`, `another-topic`
```

## Registry

#### [project.md](./project.md)

- Description: Product purpose, vocabulary, and boundaries.
- Tags: `product`, `work-sources`

#### [time-tracking.md](./time-tracking.md)

- Description: Dashboard timer workflows, completed entries, and overlap review.
- Tags: `time-tracking`, `dashboard`, `overlap`

#### [quick-timers.md](./quick-timers.md)

- Description: Local presets, template values, and active timer associations.
- Tags: `quick-timers`, `presets`

#### [architecture.md](./architecture.md)

- Description: Application ownership, shared conventions, and development model.
- Tags: `architecture`, `development`

#### [tauri.md](./tauri.md)

- Description: Native state, window lifetime, file access, and update experience.
- Tags: `tauri`, `window`, `themes`, `updater`

#### [logging.md](./logging.md)

- Description: Diagnostic ownership, content boundaries, and the log viewer.
- Tags: `logging`

#### [mcp-server.md](./mcp-server.md)

- Description: Local agent capabilities, command ownership, and trust boundaries.
- Tags: `mcp`

#### [storage.md](./storage.md)

- Description: Persistence ownership, settings transfer, and cache lifecycles.
- Tags: `storage`, `backups`, `cache`

#### [authentication.md](./authentication.md)

- Description: Provider authorization, credentials, startup validation, and disconnect.
- Tags: `authentication`, `credentials`

#### [telegram.md](./telegram.md)

- Description: Selected-group connections, persistent notifications, images, and agent sends.
- Tags: `telegram`, `notifications`

#### [linear.md](./linear.md)

- Description: Assigned-issue sync, dashboard filtering, ordering, and time-entry context.
- Tags: `linear`

#### [github.md](./github.md)

- Description: Repository sync, dashboard filters, pagination, and time-entry context.
- Tags: `github`

#### [clockify.md](./clockify.md)

- Description: Time-entry ownership, synchronization, reports, and source matching.
- Tags: `clockify`, `time-tracking`, `matching`

#### [distribution.md](./distribution.md)

- Description: Local macOS releases, signing, publishing, and updater artifacts.
- Tags: `distribution`, `release`, `signing`
