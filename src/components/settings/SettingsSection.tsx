import type { ReactNode } from 'react'

import { cx } from '../../utils/cx'

type SettingsSectionProps = {
  allowOverflow?: boolean
  title: string
  children: ReactNode
}

export function SettingsSection({ allowOverflow = false, title, children }: SettingsSectionProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      <h2 className="text-sm leading-6 font-semibold tracking-normal">{title}</h2>
      <div className="card card-border bg-base-200/10 dark:bg-base-200/40">
        <div
          className={cx(
            'card-body divide-base-content/5 divide-y p-0',
            allowOverflow ? 'overflow-visible' : 'overflow-hidden',
          )}>
          {children}
        </div>
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
