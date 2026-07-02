import { createFileRoute } from '@tanstack/react-router'

import { ClockifyWidget } from '../components/ClockifyWidget'
import { LinearWidget } from '../components/LinearWidget'
import { QuickTimersWidget } from '../components/QuickTimersWidget'

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardScreen,
})

function DashboardScreen() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4">
      <ClockifyWidget />
      <QuickTimersWidget />
      <LinearWidget />
    </section>
  )
}
