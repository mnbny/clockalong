# Architecture

Clockalong combines a React and TypeScript frontend with a Tauri desktop host in Rust. Vite builds the frontend. TanStack Router owns navigation; TanStack Query owns remote request execution and memory caches.

## Ownership

Routes compose domain widgets and settings sections. Widgets own their display controls and domain interactions. Provider services own API behavior and compact data contracts. Typed native clients isolate frontend calls to Rust.

Rust owns durable credentials, public authentication state, native files, and the local MCP listener. Provider API traffic stays in frontend services. Telegram's MTProto client also lives in the frontend.

A shared Dexie database owns durable bulk data and reactive reads. Settings use the native Tauri store. These stores have distinct purposes from Query's request cache and Stronghold's secret storage.

Providers mount above routes, with dependencies ordered explicitly. Tracking sync providers depend on Query. Telegram's provider owns its connection and notification collector independently of dashboard routes and Clockify authentication.

The root shell owns window layout, the header, ordinary toasts, Telegram notification placement, menu-bar integration, and update checks. Theme initialization precedes rendering.

## Data flow

Background sync writes compact Clockify, Linear, and GitHub records to Dexie. Widgets read that database instead of fetching broad provider lists. Local queries retain results during display changes but clear them when their account or data scope changes.

The header and MCP share one full tracking sync. Concurrent callers share the operation. It refreshes enabled work sources, Clockify entries, the running timer, and reports. Failures and offline pauses remain explicit errors. Telegram uses separate scoped operations.

Query keys have one shared owner. Request parameters and cache identity remain distinct. Services export operations and data types rather than competing key definitions.

Source-specific authentication, settings, and synchronization remain with each provider. Shared abstractions require actual common callers.

## UI conventions

Tailwind and daisyUI supply styling; daisyUI supplies classes rather than React components. Shared widget shells and settings rows keep layout consistent. Navigation uses TanStack links.

Settings sections appear in this order: Quick Timers, Clockify, Linear, GitHub, Telegram, Paseo, App. Provider-specific description templates belong with their source's settings.

Ordinary feedback uses Sonner. Persistent Telegram cards have their own surface. The shared image lightbox uses a dark backdrop and controls styled with the active theme.

## Engineering conventions

Import directly from source modules. Keep simple logic near its use; extract helpers for reuse or a separate responsibility. Comments explain constraints that code does not express. TypeScript infers obvious return types while public contracts remain explicit.

Use boolean conditions for JSX branches that otherwise render nothing. Keep ternaries when both branches render content.

Local development flags have a shared owner and require a development build. Generated route and API code are maintained through their generators.

Validation orders formatting, linting, and type checks through Scripty. Tests run separately: Vitest for frontend behavior and Cargo for Rust. Repository agent instructions own validation timing and test-authoring rules.

## Development environment

The project pins Node.js, pnpm, and Rust. Worktree setup installs dependencies, copies missing local configuration from the primary checkout, and prebuilds Rust. Existing local configuration is preserved; changes are not copied back.

The worktree launcher selects a development port and loads Vite development configuration for the native child. Exported environment values take precedence. Direct Tauri invocation bypasses this configuration loading.

Release tooling uses production configuration separately. Signing and publishing belong to the distribution domain.
