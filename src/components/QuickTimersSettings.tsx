import { useStorage } from '../services/storage/useStorage'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

export function QuickTimersSettings() {
  const [quickTimersEnabled, setQuickTimersEnabled] = useStorage('quickTimersEnabled')
  const [quickTimersColumns, setQuickTimersColumns] = useStorage('quickTimersColumns')

  return (
    <SettingsSection title="Quick Timers">
      <SettingsRow label="Enabled" description="Show Quick Timers for starting reusable Clockify timers.">
        <input
          aria-label="Enable Quick Timers"
          checked={quickTimersEnabled}
          className="toggle toggle-primary"
          type="checkbox"
          onChange={event => void setQuickTimersEnabled(event.currentTarget.checked)}
        />
      </SettingsRow>

      <SettingsRow label="Columns" description="Number of Quick Timer columns shown on the dashboard.">
        <label className="input input-primary w-full max-w-32">
          <input
            aria-label="Quick Timer columns"
            className="min-w-0 grow text-sm"
            max={12}
            min={1}
            step={1}
            type="number"
            value={quickTimersColumns}
            onChange={event => void setQuickTimersColumns(normalizeBoundedInteger(event.currentTarget.value, 6, 1, 12))}
          />
        </label>
      </SettingsRow>
    </SettingsSection>
  )
}

function normalizeBoundedInteger(value: string, fallback: number, min: number, max: number) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(parsedValue)))
}
