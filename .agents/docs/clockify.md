# Clockify

Clockify owns time entries, projects, workspaces, rates, and reports. Clockalong reads and writes through frontend clients using a validated native credential.

Generated Zodios clients cover the regular API and the separate reports host. Generation owns request types and schemas; app services own authentication, request timeouts, and domain behavior.

## Tracking context

The read workspace follows the user's active workspace, then the default workspace, then the first available workspace. New source entries use the selected dashboard project override or default project and the saved billable preference.

Provider services create both running and completed entries. Completed intervals require valid dates and positive duration. They do not replace a running timer, and overlaps are allowed.

Resuming an entry preserves its trackable fields in a new entry. Editing and overlap repair update Clockify-owned records. Clockalong does not create a separate authoritative time ledger.

## Synchronization and reports

Entry sync fetches the configured recent window before changing the local cache. Only a complete fetch reconciles entries and missing records within that window. Entries outside it remain as last-known data; their edits and deletions remain unknown until fetched.

The cache is scoped by user and workspace. Direct writes and newer syncs take precedence over older in-flight results. Disconnect prevents stale results from restoring a previous session.

The lookback and background interval are performance settings. Manual interval mode still permits the initial fetch and explicit refresh. Small direct reads retrieve the running timer; completed-entry views read the local cache.

Today, week, and month totals come from Clockify summary reports. Work-item totals instead combine retained matching entries with the current running response. These totals can cover different periods.

## Source matching

Linear and GitHub templates include a stable internal reference in the Clockify description. Linear references identify workspace and issue; GitHub references identify repository, item type, and number.

Shared parsing and matching keep widgets and agent tools consistent. Entries without supported references remain unlinked. Matching uses the first known reference within the applicable source scope.

Work-item summaries provide last tracked time, duration, and rate-derived value. Cached open entries do not accrue time unless they match the current running timer. Currency and hourly-rate availability govern monetary summaries.

Quick Timers use a local association only for the active preset. Clockify remains the owner of their historical entries.

Template variables and missing-value fallbacks belong to each work source. The shared entry path preserves these descriptions for both running and completed time.
