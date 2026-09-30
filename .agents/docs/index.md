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

- Description: Clockalong's purpose, boundaries, vocabulary, and direction.
- Tags: `purpose`, `scope`, `work-sources`, `billing`, `product`

#### [time-tracking.md](./time-tracking.md)

- Description: Dashboard workflows, work-item ordering, timer control, and tracked summaries.
- Tags: `dashboard`, `time-tracking`, `sorting`, `matching`, `overlap`, `review`, `reports`

#### [quick-timers.md](./quick-timers.md)

- Description: Local timer presets, templates, saved values, and active timer links.
- Tags: `quick-timers`, `presets`, `templates`, `ad-hoc`, `cache`

#### [architecture.md](./architecture.md)

- Description: Application structure, ownership boundaries, and development conventions.
- Tags: `architecture`, `frontend`, `backend`, `routing`, `providers`, `queries`, `worktrees`, `scripts`, `validation`, `scripty`

#### [tauri.md](./tauri.md)

- Description: Native application state, frontend integration, updates, and menu bar behavior.
- Tags: `tauri`, `rust`, `native`, `events`, `reactivity`, `updater`, `menu-bar`

#### [logging.md](./logging.md)

- Description: Diagnostic ownership, log content, and the settings log viewer.
- Tags: `logging`, `diagnostics`, `console`, `errors`, `secrets`

#### [mcp-server.md](./mcp-server.md)

- Description: Local agent tools, command ownership, lifecycle, and trust boundaries.
- Tags: `mcp`, `agents`, `tools`, `snapshots`, `timers`, `security`, `loopback`

#### [storage.md](./storage.md)

- Description: Settings, backup boundaries, credential storage, and provider caches.
- Tags: `storage`, `settings`, `backups`, `cache`, `sync`, `quota`, `credentials`

#### [authentication.md](./authentication.md)

- Description: Provider connections, credential ownership, startup checks, and disconnect behavior.
- Tags: `authentication`, `clockify`, `linear`, `github`, `oauth`, `pkce`, `stronghold`

#### [linear.md](./linear.md)

- Description: Assigned issue tracking, authorization, and Linear integration boundaries.
- Tags: `linear`, `issues`, `assigned`, `tickets`, `sdk`, `graphql`, `oauth`, `sync`

#### [github.md](./github.md)

- Description: Repository work items, access tokens, dashboard filters, and source matching.
- Tags: `github`, `issues`, `pull-requests`, `pat`, `repositories`, `filters`, `mentions`, `sync`

#### [clockify.md](./clockify.md)

- Description: Time entries, reports, source matching, and Clockify integration boundaries.
- Tags: `clockify`, `timers`, `entries`, `reports`, `templates`, `sync`, `api`

#### [distribution.md](./distribution.md)

- Description: macOS distribution, release ownership, signing, and updates.
- Tags: `macos`, `distribution`, `release`, `signing`, `notarization`, `updater`
