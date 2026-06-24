import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardScreen,
})

function DashboardScreen() {
  return (
    <section className="grid min-h-full place-items-center">
      <div className="border-base-300 bg-base-200/70 grid w-full max-w-5xl gap-4 rounded-lg border p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <div className="bg-base-300/60 h-48 rounded-md" />
          <div className="grid gap-3">
            <div className="bg-base-300/70 h-14 rounded-md" />
            <div className="bg-base-300/60 h-14 rounded-md" />
            <div className="bg-base-300/50 h-14 rounded-md" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="bg-base-300/50 h-28 rounded-md" />
          <div className="bg-base-300/60 h-28 rounded-md" />
          <div className="bg-base-300/50 h-28 rounded-md" />
        </div>
      </div>
    </section>
  )
}
