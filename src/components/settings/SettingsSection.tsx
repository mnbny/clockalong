import type { ReactNode } from 'react'

type SettingsSectionProps = {
  title: string
  children: ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      <h2 className="text-sm leading-6 font-semibold tracking-normal">{title}</h2>
      <div className="rounded-box divide-base-content/5 bg-base-100 border-base-content/5 divide-y overflow-hidden border">
        {children}
      </div>
    </section>
  )
}

type SettingsRowProps = {
  label: string
  description: string
  children: ReactNode
}

export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:items-center sm:gap-10">
      <div className="min-w-0 sm:text-right">
        <div className="text-sm leading-6 font-medium">{label}</div>
        <p className="text-xs leading-5">{description}</p>
      </div>

      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  )
}
