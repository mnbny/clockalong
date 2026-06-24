import type { ReactNode } from 'react'

import { cx } from '../utils/cx'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  topPaddingClassName?: string
}

export function PageHeader({ title, description, actions, topPaddingClassName }: PageHeaderProps) {
  return (
    <header
      className={cx(
        'flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        topPaddingClassName,
      )}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl leading-tight font-semibold tracking-normal sm:text-3xl">{title}</h1>
        {description ? <p className="text-base-content/65 max-w-2xl text-sm leading-6">{description}</p> : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
