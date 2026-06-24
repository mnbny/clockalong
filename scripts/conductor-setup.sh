#!/bin/sh
set -eu

asdf install
pnpm install --config.confirmModulesPurge=false
pnpm run tauri:prebuild
