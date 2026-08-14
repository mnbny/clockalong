# Quick Timers

Quick Timers are a first-class local work source made of reusable ad hoc Clockify timer presets. They live on the dashboard, are separate from external providers such as Linear or GitHub, and should not depend on provider data.

## Dashboard behavior

`src/components/QuickTimersWidget.tsx` owns the Quick Timers dashboard surface, including the `quickTimersEnabled` gate. The dashboard route should render the widget unconditionally and let the widget return `null` when the feature is disabled.

The widget header stays visible when the feature is enabled. The body grid renders only when saved presets exist. Presets render as compact rectangular controls with an icon and label. `quickTimersColumns` controls the grid column count.

The pencil button enters edit mode and only appears when at least one preset exists. In edit mode, preset cells pulse and use warning colors. Clicking a preset while editing exits edit mode and opens the preset form with the saved values.

Clicking a preset outside edit mode opens the start form. That form parses the preset description template and creates one input per template variable.

## Preset storage

Quick Timer presets are stored in the Tauri store under `quickTimers`.

Each preset stores:

- `id`: stable local preset id.
- `name`: label shown under the dashboard control.
- `descriptionTemplate`: Clockify description template used when starting the timer.
- `icon`: optional SVG string rendered in the preset control, with the Bolt icon as fallback.

Do not store Clockify workspace or project data on the preset. Quick Timers use the dashboard `clockifyOverrideProject` when present, otherwise the global `clockifyDefaultProject`, plus the `clockifyBillable` setting when starting timers.

Settings backups preserve Quick Timer presets and their cached form values. They do not restore `quickTimersActiveEntry`, because it refers to an entry in a particular Clockify workspace.

## Template variables

Quick Timer description templates use the shared template utility in `src/utils/templates.ts`.

Variables use single braces, such as `{name}` or `{clientName}`. The start form parses variables with `parseTemplateTokens` and formats the final Clockify description with `formatTemplate`.

Use `capitalCase` from `change-case` for field labels at the render site.

## Start value cache

`quickTimersCache` stores the last submitted template values per preset so the next start form opens prefilled.

Each cache entry has the preset id plus dynamic template variable keys:

```ts
{ id: quickTimerId, [templateVar]: value }
```

The cache is not an active-timer registry. It only remembers form values.

## Active Quick Timer

`quickTimersActiveEntry` stores the one Quick Timer currently associated with a Clockify entry.

Its value stays small:

```ts
{
  entryId: string
  quickTimerId: string
}
```

The dashboard treats a preset as active only when its saved `entryId` matches the current running Clockify entry. Do not store historical links or template values here; Clockify owns the time entry data and `quickTimersCache` owns saved form values.

Active preset cells use the same accent pulse treatment as active provider-backed rows. Clear this setting when its matching timer stops or Clockify disconnects.

## Clockify start and stop

Starting a Quick Timer calls `clockify.createTimeEntry` directly from the mutation function. The mutation function should only perform that Clockify write.

Mutation side effects belong in callbacks:

- `onMutate`: persist `quickTimersCache`.
- `onSuccess`: save `quickTimersActiveEntry`, invalidate Clockify queries, close the dialog, and show success feedback.
- `onError`: show error feedback.

The Clockify dashboard widget owns the generic running-timer stop control. When any Clockify timer is running, it shows a red square stop button opposite the running timer text, visually matching the active Linear row stop button.

## Settings

`src/components/QuickTimersSettings.tsx` owns Quick Timer settings such as enablement and dashboard column count. Keep Quick Timer storage hooks out of `src/routes/_app.settings.tsx`; the route should only compose scoped settings sections.
