#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

asdf install
pnpm install --config.confirmModulesPurge=false
exec pnpm exec tsx scripts/worktree-setup.ts
