# Quick Timers

Quick Timers are reusable ad hoc Clockify timer presets that live on the dashboard. They are separate from Linear tickets and should not depend on Linear data.

## Dashboard behavior

`src/components/QuickTimersWidget.tsx` owns the Quick Timers dashboard surface.

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

Do not store Clockify workspace or project data on the preset. Quick Timers use the global `clockifyDefaultProject` and `clockifyBillable` settings when starting timers.

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

## Clockify entry links

`clockifyQuickTimerEntryLinks` maps Clockify time entry ids to Quick Timer ownership.

The registry value stays small:

```ts
{
  quickTimerId: string
  values: Record<string, string>
}
```

Do not duplicate the Clockify description, project, task, duration, or timestamps in this registry. Clockify owns the actual time entry data. The registry only answers which preset created a Clockify entry and which template values were submitted.

The dashboard derives the active Quick Timer from the current running Clockify entry id. Active preset cells use the same accent pulse treatment as active Linear rows.

## Clockify start and stop

Starting a Quick Timer calls `clockify.createTimeEntry` directly from the mutation function. The mutation function should only perform that Clockify write.

Mutation side effects belong in callbacks:

- `onMutate`: persist `quickTimersCache`.
- `onSuccess`: save `clockifyQuickTimerEntryLinks`, invalidate Clockify queries, close the dialog, and show success feedback.
- `onError`: show error feedback.

The Clockify dashboard widget owns the generic running-timer stop control. When any Clockify timer is running, it shows a red square stop button opposite the running timer text, visually matching the active Linear row stop button.
