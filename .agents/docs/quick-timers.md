# Quick Timers

Quick Timers are local presets for repeatable ad hoc Clockify work. They need no Linear or GitHub data.

A preset has a stable identity, name, description template, and optional SVG icon. Presets do not own Clockify workspace or project choices. Entry creation uses the shared selected project and billable preference.

## Dashboard workflow

Settings control visibility and grid columns. The enabled widget provides preset creation and editing. Edit mode opens the selected preset's saved configuration.

Clicking a preset opens a start form with fields derived from its template variables. The last submitted values prefill later uses of that preset.

Right-clicking opens completed-time entry with the same variables. Saving completed time does not change a running timer or its active preset association.

## State ownership

Presets and saved template values are application settings in the native Tauri store. SVG data does not consume browser localStorage capacity. Settings backup and import support presets and their form values.

The active association links one preset to one Clockify entry. A preset appears active only when that entry matches the current running response. When the user stops or deletes the matching entry, the app clears the association. When Clockify disconnects, the app also clears the association.

Saved form values and the active association serve different purposes. Neither is a history of time entries. Clockify owns that history, and the local Clockify cache supplies entry views.
