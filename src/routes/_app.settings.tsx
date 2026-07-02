import { IconX } from '@tabler/icons-react'
import { createFileRoute, Link } from '@tanstack/react-router'

import { AppSettings } from '../components/AppSettings'
import { ClockifySettings } from '../components/ClockifySettings'
import { LinearSettings } from '../components/LinearSettings'
import { PageHeader } from '../components/PageHeader'
import { QuickTimersSettings } from '../components/QuickTimersSettings'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsScreen,
})

function SettingsScreen() {
  return (
    <section className="flex w-full flex-col gap-8">
      <PageHeader
        title="Settings"
        actions={
          <Link to="/dashboard" className="btn btn-square btn-ghost" aria-label="Close settings">
            <IconX className="size-5" />
          </Link>
        }
      />

      <div className="flex w-full flex-col gap-10">
        <QuickTimersSettings />
        <LinearSettings />
        <ClockifySettings />
        <AppSettings />
      </div>
    </section>
  )
}
