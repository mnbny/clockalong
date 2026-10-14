# Agent Docs

Read [.agents/docs/index.md](./.agents/docs/index.md).

After a feature or change is complete, use the `ir-living-docs` skill to update the living documentation. Do this during verification or before a commit. Do not update the documentation before the change is complete.

Keep research documents in `.agents/research/`. This directory is gitignored. Never stage or commit research documents.

## Run Validations Smartly

Validation command: `pnpm validate`

Scripty runs every `validate:*` script in `SCRIPTY` order and stops on the first failure. The command formats the frontend and Rust code, lints JavaScript and TypeScript, and checks TypeScript types.

Run `pnpm validate:format`, `pnpm validate:format:rust`, `pnpm validate:lint`, or `pnpm validate:typecheck` for an individual check.

Do not run full validation after every iteration. Run it at checkpoints such as:

- After a feature implementation is complete.
- Before staging or committing code changes.
- When asked by the user.

## Tests

Tests are deliberately separate from `pnpm validate`. Run `pnpm test` for JavaScript and TypeScript tests, and `pnpm test:rust` for Rust tests.

Run tests at these checkpoints:

- Pre-commit batch.
- After adding, removing, or refactoring tests.
- When asked by the user.

### Test Authoring

Apply these criteria before adding a JavaScript, TypeScript, or Rust test:

- Write tests only when they provide worthwhile protection against mistakes or regressions.
- Protect meaningful behavior that is easy to get wrong or break.
- Add protection that existing tests do not already provide.
- Skip trivial or low-value tests, even if they cover something new.
- Do not add tests just to increase test count or coverage.

Keep JavaScript and TypeScript tests in `.tools/tests/`, grouped by feature. Use Vitest for the runner, assertions, mocks, and cleanup. Keep Rust tests on Cargo; private unit tests can stay beside their modules.
