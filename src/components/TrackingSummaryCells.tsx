import { formatCurrency } from '@automattic/format-currency'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import humanizeDuration from 'humanize-duration'

dayjs.extend(relativeTime)

const formatTrackedDuration = humanizeDuration.humanizer({
  delimiter: ' ',
  language: 'shortEn',
  languages: {
    shortEn: {
      h: () => 'h',
      m: () => 'm',
      s: () => 's',
    },
  },
  largest: 3,
  round: true,
  spacer: '',
  units: ['h', 'm', 's'],
})

export function LastTrackedCell({ lastTrackedAt }: { lastTrackedAt: string | null }) {
  if (!lastTrackedAt) {
    return <TrackingPlaceholder />
  }

  return <span className="font-medium whitespace-nowrap">{dayjs(lastTrackedAt).fromNow()}</span>
}

export function TotalTrackedCell({ totalTrackedSeconds }: { totalTrackedSeconds: number | null }) {
  if (totalTrackedSeconds === null) {
    return <TrackingPlaceholder />
  }

  return <span className="font-medium whitespace-nowrap">{formatTrackedDuration(totalTrackedSeconds * 1000)}</span>
}

export function TotalTrackedAmountCell({
  totalTrackedAmount,
  totalTrackedAmountCurrency,
}: {
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
}) {
  if (totalTrackedAmount === null || !totalTrackedAmountCurrency) {
    return <TrackingPlaceholder />
  }

  return (
    <span className="font-medium whitespace-nowrap">
      {formatCurrency(totalTrackedAmount, totalTrackedAmountCurrency)}
    </span>
  )
}

function TrackingPlaceholder() {
  return <span className="text-base-content/40 font-medium">Not tracked</span>
}
