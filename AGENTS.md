# Agent Docs

Read [.agents/docs/index.md](./.agents/docs/index.md).

After a feature or change is complete, use the `ir-living-docs` skill to update the living documentation. Do this during verification or before a commit. Do not update the documentation before the change is complete.

## Run Validations Smartly

Validation command: `pnpm validate`

Scripty runs every `validate:*` script in `SCRIPTY` order and stops on the first failure. The command formats the frontend and Rust code, lints JavaScript and TypeScript, and checks TypeScript types.

Run `pnpm validate:format`, `pnpm validate:format:rust`, `pnpm validate:lint`, or `pnpm validate:typecheck` for an individual check.

Do not run full validation after every iteration. Run it at checkpoints such as:

- After a feature implementation is complete.
- Before staging or committing code changes.
- When asked by the user.
